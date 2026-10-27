import { Response } from "express";
import { prisma } from "../../config/database";
import { asyncHandler } from "../../shared/middlewares";
import {
  NotFoundError,
  AuthorizationError,
  ConflictError,
  Loterror,
  BidError,
} from "../../shared/errors";
import { RequestWithUser } from "../../shared/types";
import {
  parsePaginationParams,
  buildPaginatedResponse,
  formatDecimal,
  validateBidAmount,
  getBatchTiming,
} from "../../shared/utils";
import { appendBidAudit } from "../../shared/utils/audit";
import { auctionSocket } from "../../sockets/auction.socket";
import {
  createSettlementForBatch,
  releaseBatchReservations,
} from "../settlements/settlements.service";

const batchInclude = {
  seller: { select: { id: true, name: true, email: true } },
  bids: {
    orderBy: { amount: "desc" as const },
    take: 1,
    select: { id: true, amount: true, createdAt: true },
  },
  _count: { select: { bids: true } },
};

function serializeBatch(batch: any) {
  const highestBid = batch.bids?.[0];

  return {
    ...batch,
    currentPrice: highestBid
      ? formatDecimal(highestBid.amount)
      : formatDecimal(batch.startingPrice),
    bidCount: batch._count?.bids ?? 0,
    timing: getBatchTiming(batch.startsAt, batch.endsAt),
  };
}

async function findBatchOrFail(id: string) {
  const batch = await prisma.batch.findUnique({ where: { id } });

  if (!batch) {
    throw new NotFoundError("Batch");
  }

  return batch;
}

function assertCanManageBatch(
  user: RequestWithUser["user"],
  sellerId: string,
  action: string,
) {
  if (!user) {
    throw new AuthorizationError("Authentication required");
  }

  if (user.role !== "ADMIN" && sellerId !== user.id) {
    throw new AuthorizationError(`You can only ${action} your own batchs`);
  }
}

export const listAuctions = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const {
      page = 1,
      limit = 20,
      status,
      sellerId,
      search,
      sortBy = "startsAt",
      sortOrder = "asc",
    } = req.query;

    const {
      page: pageNum,
      limit: limitNum,
      skip,
    } = parsePaginationParams(page, limit);

    const where: any = status
      ? { status }
      : { status: { notIn: ["DRAFT", "CANCELLED"] } };

    if (sellerId) where.sellerId = sellerId;
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [batchs, total] = await Promise.all([
      prisma.batch.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy as string]: sortOrder },
        include: batchInclude,
      }),
      prisma.batch.count({ where }),
    ]);

    res.json({
      success: true,
      data: batchs.map(serializeBatch),
      meta: buildPaginatedResponse(batchs, total, pageNum, limitNum).meta,
    });
  },
);

export const getAuctionById = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;

    const batch = await prisma.batch.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, name: true, email: true } },
        bids: {
          orderBy: { amount: "desc" },
          take: 10,
          include: { bidder: { select: { id: true, name: true } } },
        },
        settlement: {
          select: {
            id: true,
            status: true,
            amount: true,
            receiptNumber: true,
            publicToken: true,
            completedAt: true,
          },
        },
        _count: { select: { bids: true, auditEntries: true } },
      },
    });

    if (!batch) {
      throw new NotFoundError("Batch");
    }

    res.json({
      success: true,
      data: serializeBatch(batch),
    });
  },
);

export const publishAuction = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    const batch = await findBatchOrFail(id);
    assertCanManageBatch(user, batch.sellerId, "publish");

    if (batch.status !== "DRAFT" && batch.status !== "SCHEDULED") {
      throw new ConflictError(
        "Only draft or scheduled batchs can be published",
      );
    }

    const now = new Date();

    if (batch.endsAt <= now) {
      throw new Loterror("Batch end date is in the past", "INVALID_DATE_RANGE");
    }

    const status = batch.startsAt <= now ? "ACTIVE" : "SCHEDULED";

    const updatedBatch = await prisma.batch.update({
      where: { id },
      data: { status },
      include: batchInclude,
    });

    auctionSocket.emitAuctionStatusChange(updatedBatch);

    res.json({
      success: true,
      message: status === "ACTIVE" ? "Batch is now active" : "Batch scheduled",
      data: serializeBatch(updatedBatch),
    });
  },
);

export const cancelAuction = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    const batch = await findBatchOrFail(id);
    assertCanManageBatch(user, batch.sellerId, "cancel");

    if (["ENDED", "SETTLED", "CANCELLED"].includes(batch.status)) {
      throw new ConflictError("Cannot cancel a finished batch");
    }

    const updatedBatch = await prisma.$transaction(async (tx) => {
      await releaseBatchReservations(tx, id);

      return tx.batch.update({
        where: { id },
        data: { status: "CANCELLED" },
        include: batchInclude,
      });
    });

    auctionSocket.emitAuctionStatusChange(updatedBatch);

    res.json({
      success: true,
      message: "Batch cancelled successfully",
      data: serializeBatch(updatedBatch),
    });
  },
);

export const endAuction = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    const batch = await findBatchOrFail(id);
    assertCanManageBatch(user, batch.sellerId, "end");

    if (batch.status !== "ACTIVE") {
      throw new ConflictError("Only active batchs can be ended");
    }

    const settlement = await createSettlementForBatch(id);

    const updatedBatch = await prisma.batch.findUnique({
      where: { id },
      include: {
        ...batchInclude,
        bids: {
          orderBy: { amount: "desc" },
          take: 1,
          include: { bidder: { select: { id: true, name: true } } },
        },
      },
    });

    auctionSocket.emitAuctionEnded(updatedBatch);

    res.json({
      success: true,
      message: settlement
        ? "Batch ended and settlement created"
        : "Batch ended without bids",
      data: {
        batch: updatedBatch ? serializeBatch(updatedBatch) : null,
        settlement,
      },
    });
  },
);

const MAX_BID_ATTEMPTS = 3;

export const placeBid = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { id } = req.params;
    const amount = Number(Number(req.body.amount).toFixed(2));

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_BID_ATTEMPTS; attempt += 1) {
      try {
        const bid = await prisma.$transaction(async (tx) => {
          const batch = await tx.batch.findUnique({
            where: { id },
            include: { bids: { orderBy: { amount: "desc" }, take: 1 } },
          });

          if (!batch) {
            throw new NotFoundError("Batch");
          }

          if (batch.sellerId === user.id) {
            throw new BidError(
              "Cannot bid on your own batch",
              "CANNOT_BID_OWN_BATCH",
            );
          }

          if (batch.status !== "ACTIVE") {
            throw new BidError("Batch is not active", "BATCH_NOT_ACTIVE");
          }

          const now = new Date();
          if (now < batch.startsAt || now > batch.endsAt) {
            throw new BidError(
              "Batch is outside the bidding window",
              "BATCH_NOT_OPEN",
            );
          }

          const highestBid = batch.bids[0];
          const highestAmount = highestBid
            ? formatDecimal(highestBid.amount)
            : null;

          const validation = validateBidAmount(amount, {
            startingPrice: formatDecimal(batch.startingPrice),
            minimumIncrement: formatDecimal(batch.minimumIncrement),
            highestBid: highestAmount,
          });

          if (!validation.valid) {
            throw new BidError(validation.error!, "INVALID_BID_AMOUNT");
          }

          const wallet = await tx.wallet.findUnique({
            where: { userId: user.id },
            include: { reservations: { where: { status: "ACTIVE" } } },
          });

          if (!wallet) {
            throw new BidError("Wallet not found", "WALLET_NOT_FOUND");
          }

          const reservedElsewhere = wallet.reservations
            .filter((reservation) => reservation.batchId !== batch.id)
            .reduce(
              (total, reservation) => total + formatDecimal(reservation.amount),
              0,
            );

          const availableAmount =
            formatDecimal(wallet.balance) - reservedElsewhere;

          if (availableAmount < amount) {
            throw new BidError(
              "Insufficient available balance",
              "INSUFFICIENT_FUNDS",
            );
          }

          const createdBid = await tx.bid.create({
            data: {
              batchId: batch.id,
              bidderId: user.id,
              amount,
            },
            include: {
              bidder: { select: { id: true, name: true } },
            },
          });

          await appendBidAudit(tx, createdBid);

          const currentReservation = wallet.reservations.find(
            (reservation) => reservation.batchId === batch.id,
          );

          if (currentReservation) {
            await tx.walletReservation.update({
              where: { id: currentReservation.id },
              data: {
                bidId: createdBid.id,
                amount,
                status: "ACTIVE",
              },
            });
          } else {
            await tx.walletReservation.create({
              data: {
                walletId: wallet.id,
                batchId: batch.id,
                bidId: createdBid.id,
                amount,
                status: "ACTIVE",
              },
            });
          }

          return createdBid;
        });

        auctionSocket.emitNewBid(id, bid);

        return res.status(201).json({
          success: true,
          message: "Bid placed successfully",
          data: {
            ...bid,
            amount: formatDecimal(bid.amount),
          },
        });
      } catch (error) {
        lastError = error;

        const isSequenceConflict =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: string }).code === "P2002";

        if (!isSequenceConflict || attempt === MAX_BID_ATTEMPTS) {
          throw error;
        }
      }
    }

    throw lastError;
  },
);

export const getAuctionBids = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;
    const { page = 1, limit = 20, bidderId } = req.query;

    const {
      page: pageNum,
      limit: limitNum,
      skip,
    } = parsePaginationParams(page, limit);

    const batch = await prisma.batch.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!batch) {
      throw new NotFoundError("Batch");
    }

    const where: any = { batchId: id };
    if (bidderId) where.bidderId = bidderId;

    const [bids, total] = await Promise.all([
      prisma.bid.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { amount: "desc" },
        include: {
          bidder: { select: { id: true, name: true } },
          audit: { select: { sequence: true, currentHash: true } },
        },
      }),
      prisma.bid.count({ where }),
    ]);

    res.json({
      success: true,
      data: bids.map((bid) => ({ ...bid, amount: formatDecimal(bid.amount) })),
      meta: buildPaginatedResponse(bids, total, pageNum, limitNum).meta,
    });
  },
);

// Admin routes
export const listAllAuctions = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const {
      page = 1,
      limit = 20,
      status,
      sellerId,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const {
      page: pageNum,
      limit: limitNum,
      skip,
    } = parsePaginationParams(page, limit);

    const where: any = {};
    if (status) where.status = status;
    if (sellerId) where.sellerId = sellerId;
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: "insensitive" } },
        {
          externalProductId: {
            contains: search as string,
            mode: "insensitive",
          },
        },
      ];
    }

    const [batchs, total] = await Promise.all([
      prisma.batch.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy as string]: sortOrder },
        include: batchInclude,
      }),
      prisma.batch.count({ where }),
    ]);

    res.json({
      success: true,
      data: batchs.map(serializeBatch),
      meta: buildPaginatedResponse(batchs, total, pageNum, limitNum).meta,
    });
  },
);

export const updateAuctionStatus = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;

    const batch = await findBatchOrFail(id);

    const updatedBatch = await prisma.$transaction(async (tx) => {
      if (status === "CANCELLED") {
        await releaseBatchReservations(tx, id);
      }

      return tx.batch.update({
        where: { id },
        data: { status },
        include: batchInclude,
      });
    });

    auctionSocket.emitAuctionStatusChange(updatedBatch);

    res.json({
      success: true,
      message: "Batch status updated",
      data: {
        previousStatus: batch.status,
        batch: serializeBatch(updatedBatch),
      },
    });
  },
);
