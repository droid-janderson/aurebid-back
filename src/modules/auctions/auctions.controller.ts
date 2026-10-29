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
import {
  ANTI_SNIPING_EXTENSION_MS,
  extendedEndsAt,
  getDatabaseNow,
  getServerNow,
  isPastDeadline,
  shouldExtendBatch,
} from "../../shared/utils/clock";
import { publicActorLabel } from "../../shared/utils/privacy";
import { appendBidAudit, verifyBidAuditChain } from "../../shared/utils/audit";
import { auctionSocket } from "../../sockets/auction.socket";
import { settleBatch } from "../settlements/settlements.service";
import { releaseOtherReservations } from "../wallets/reservations.service";
import { holdReservation } from "../wallets/reservations.service";

const MAX_BID_ATTEMPTS = 3;

type Viewer = { id: string; role: string } | null;

const batchInclude = {
  seller: { select: { id: true, name: true } },
  bids: {
    orderBy: [{ amount: "desc" as const }, { createdAt: "asc" as const }],
    take: 1,
    select: { id: true, bidderId: true, amount: true, createdAt: true },
  },
  _count: { select: { bids: true } },
};

function viewerOf(req: RequestWithUser): Viewer {
  return req.user ? { id: req.user.id, role: req.user.role } : null;
}

function serializeBid(
  batchId: string,
  sellerId: string,
  bid: any,
  viewer: Viewer,
) {
  const isMine = Boolean(viewer && viewer.id === bid.bidderId);
  const canSeeName = Boolean(
    viewer && (viewer.role === "ADMIN" || viewer.id === sellerId),
  );

  return {
    id: bid.id,
    batchId: bid.batchId ?? batchId,
    amount: formatDecimal(bid.amount),
    createdAt: bid.createdAt,
    ...(bid.audit ? { audit: bid.audit } : {}),
    bidder: {
      label: publicActorLabel(batchId, bid.bidderId, "bidder"),
      isMine,
      ...(canSeeName && bid.bidder?.name ? { name: bid.bidder.name } : {}),
    },
  };
}

function serializeSettlement(
  batchId: string,
  settlement: any,
  viewer: Viewer,
  participants: { sellerId: string; buyerId: string },
) {
  if (!settlement) return null;

  const canShareToken = Boolean(
    viewer &&
    (viewer.role === "ADMIN" ||
      viewer.id === participants.sellerId ||
      viewer.id === participants.buyerId),
  );

  return {
    id: settlement.id,
    status: settlement.status,
    amount: formatDecimal(settlement.amount),
    receiptNumber: settlement.receiptNumber,
    completedAt: settlement.completedAt,
    failureReason: settlement.failureReason ?? null,
    buyerLabel:
      settlement.buyerLabel ??
      publicActorLabel(batchId, participants.buyerId, "buyer"),
    sellerLabel:
      settlement.sellerLabel ??
      publicActorLabel(batchId, participants.sellerId, "seller"),
    ...(canShareToken ? { publicToken: settlement.publicToken } : {}),
  };
}

function serializeBatch(batch: any, viewer: Viewer = null) {
  const highestBid = batch.bids?.[0];
  const settlement = serializeSettlement(batch.id, batch.settlement, viewer, {
    sellerId: batch.sellerId,
    buyerId: batch.settlement?.buyerId ?? "",
  });

  return {
    id: batch.id,
    sellerId: batch.sellerId,
    productSource: batch.productSource,
    externalProductId: batch.externalProductId,
    title: batch.title,
    description: batch.description,
    imageUrl: batch.imageUrl,
    productData: batch.productData,
    startingPrice: formatDecimal(batch.startingPrice),
    minimumIncrement: formatDecimal(batch.minimumIncrement),
    startsAt: batch.startsAt,
    endsAt: batch.endsAt,
    status: batch.status,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    seller: batch.seller
      ? { id: batch.seller.id, name: batch.seller.name }
      : undefined,
    bids: Array.isArray(batch.bids)
      ? batch.bids.map((bid: any) =>
          serializeBid(batch.id, batch.sellerId, bid, viewer),
        )
      : undefined,
    currentPrice: highestBid
      ? formatDecimal(highestBid.amount)
      : formatDecimal(batch.startingPrice),
    bidCount: batch._count?.bids ?? batch.bids?.length ?? 0,
    timing: getBatchTiming(batch.startsAt, batch.endsAt),
    settlement,
    _count: batch._count,
  };
}

async function findBatchOrFail(id: string) {
  const batch = await prisma.batch.findUnique({ where: { id } });

  if (!batch || batch.deletedAt) {
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

    const where: any = {
      deletedAt: null,
      ...(status ? { status } : { status: { notIn: ["DRAFT", "CANCELLED"] } }),
    };

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

    const viewer = viewerOf(req);

    res.json({
      success: true,
      data: batchs.map((batch) => serializeBatch(batch, viewer)),
      meta: buildPaginatedResponse(batchs, total, pageNum, limitNum).meta,
    });
  },
);

export const listLeadingAuctions = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const limit = 50;

    const candidates = await prisma.batch.findMany({
      where: {
        status: "ACTIVE",
        deletedAt: null,
        bids: { some: { bidderId: user.id } },
      },
      orderBy: { endsAt: "asc" },
      take: limit,
      include: batchInclude,
    });

    const leading = candidates.filter(
      (batch) => batch.bids[0]?.bidderId === user.id,
    );

    res.json({
      success: true,
      data: leading.map((batch) =>
        serializeBatch(batch, { id: user.id, role: user.role }),
      ),
      meta: buildPaginatedResponse(leading, leading.length, 1, limit).meta,
    });
  },
);

export const getAuctionById = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;
    const viewer = viewerOf(req);

    const batch = await prisma.batch.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, name: true } },
        bids: {
          orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
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
            buyerId: true,
            buyerLabel: true,
            sellerLabel: true,
            failureReason: true,
          },
        },
        _count: { select: { bids: true, auditEntries: true } },
      },
    });

    if (!batch || batch.deletedAt) {
      throw new NotFoundError("Batch");
    }

    res.json({
      success: true,
      data: serializeBatch(batch, viewer),
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

    const now = await getServerNow();

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
      data: serializeBatch(updatedBatch, viewerOf(req)),
    });
  },
);

export const cancelAuction = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    const batch = await findBatchOrFail(id);
    assertCanManageBatch(user, batch.sellerId, "cancel");

    const updatedBatch = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Batch" WHERE id = ${id} FOR UPDATE
      `;

      if (locked.length === 0) {
        throw new NotFoundError("Batch");
      }

      const current = await tx.batch.findUnique({
        where: { id },
        select: { status: true, deletedAt: true },
      });

      if (!current || current.deletedAt) {
        throw new NotFoundError("Batch");
      }

      if (["ENDED", "SETTLED", "CANCELLED"].includes(current.status)) {
        throw new ConflictError("Cannot cancel a finished batch");
      }

      const bidCount = await tx.bid.count({ where: { batchId: id } });

      if (bidCount > 0) {
        throw new ConflictError("Cannot cancel a batch with bids");
      }

      await releaseOtherReservations(tx, id);

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
      data: serializeBatch(updatedBatch, viewerOf(req)),
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

    const { settlement, outcome } = await settleBatch(id, { force: true });

    const updatedBatch = await prisma.batch.findUnique({
      where: { id },
      include: {
        ...batchInclude,
        bids: {
          orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
          take: 1,
          include: { bidder: { select: { id: true, name: true } } },
        },
      },
    });

    auctionSocket.emitAuctionEnded(updatedBatch);

    res.json({
      success: true,
      message:
        outcome === "ENDED_WITHOUT_BIDS"
          ? "Batch ended without bids"
          : "Batch ended and settled",
      data: {
        batch: updatedBatch
          ? serializeBatch(updatedBatch, viewerOf(req))
          : null,
        settlement: settlement
          ? serializeSettlement(id, settlement, viewerOf(req), {
              sellerId: batch.sellerId,
              buyerId: settlement.buyerId,
            })
          : null,
      },
    });
  },
);

export const placeBid = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { id } = req.params;
    const amount = Number(Number(req.body.amount).toFixed(2));

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_BID_ATTEMPTS; attempt += 1) {
      try {
        const result = await prisma.$transaction(async (tx) => {
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "Batch" WHERE id = ${id} FOR UPDATE
          `;

          if (locked.length === 0) {
            throw new NotFoundError("Batch");
          }

          const batch = await tx.batch.findUnique({
            where: { id },
            include: {
              bids: {
                orderBy: [
                  { amount: "desc" },
                  { createdAt: "asc" },
                  { id: "asc" },
                ],
                take: 1,
              },
            },
          });

          if (!batch || batch.deletedAt) {
            throw new NotFoundError("Batch");
          }

          if (batch.sellerId === user.id) {
            throw new BidError(
              "Cannot bid on your own batch",
              "CANNOT_BID_OWN_BATCH",
            );
          }

          const now = await getDatabaseNow(tx);

          if (batch.status === "CANCELLED") {
            throw new BidError("Batch was cancelled", "BATCH_CANCELLED");
          }

          if (batch.status === "ENDED" || batch.status === "SETTLED") {
            throw new BidError("Batch has already ended", "BATCH_ENDED");
          }

          if (batch.status === "DRAFT") {
            throw new BidError("Batch is not active", "BATCH_NOT_ACTIVE");
          }

          if (now < batch.startsAt) {
            throw new BidError(
              "Batch has not started yet",
              "BATCH_NOT_STARTED",
            );
          }

          if (isPastDeadline(batch.endsAt, now)) {
            throw new BidError("Batch has already ended", "BATCH_ENDED");
          }

          const activated = batch.status === "SCHEDULED";
          const status = activated ? "ACTIVE" : batch.status;

          const highestBid = batch.bids[0];

          if (highestBid && highestBid.bidderId === user.id) {
            throw new BidError(
              "You are already the highest bidder for this batch",
              "ALREADY_LEADING",
            );
          }

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

          const walletRows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "Wallet" WHERE "userId" = ${user.id} FOR UPDATE
          `;

          if (walletRows.length === 0) {
            throw new BidError("Wallet not found", "WALLET_NOT_FOUND");
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

          const releasedReservations = await releaseOtherReservations(
            tx,
            batch.id,
            wallet.id,
          );

          await holdReservation(tx, {
            walletId: wallet.id,
            batchId: batch.id,
            bidId: createdBid.id,
            amount,
          });

          const extended = shouldExtendBatch(batch.endsAt, now);
          const endsAt = extended ? extendedEndsAt(batch.endsAt) : batch.endsAt;

          if (extended || activated) {
            await tx.batch.update({
              where: { id: batch.id },
              data: {
                ...(activated ? { status } : {}),
                ...(extended ? { endsAt } : {}),
              },
            });
          }

          return {
            bid: createdBid,
            endsAt,
            extended,
            activated,
            status,
            startsAt: batch.startsAt,
            releasedUserIds: releasedReservations.map(
              (reservation) => reservation.userId,
            ),
          };
        });

        auctionSocket.emitNewBid(id, result.bid);

        auctionSocket.emitWalletChanged(result.bid.bidderId, {
          reason: "RESERVATION_HELD",
          batchId: id,
        });

        for (const userId of new Set(result.releasedUserIds)) {
          auctionSocket.emitWalletChanged(userId, {
            reason: "RESERVATION_RELEASED",
            batchId: id,
          });
        }

        if (result.extended) {
          auctionSocket.emitAuctionExtended(
            id,
            result.endsAt,
            ANTI_SNIPING_EXTENSION_MS,
          );
        }

        if (result.activated) {
          auctionSocket.emitAuctionStatusChange({
            id,
            status: result.status,
            startsAt: result.startsAt,
            endsAt: result.endsAt,
          });
        }

        return res.status(201).json({
          success: true,
          message: "Bid placed successfully",
          data: {
            id: result.bid.id,
            amount: formatDecimal(result.bid.amount),
            createdAt: result.bid.createdAt,
            endsAt: result.endsAt.toISOString(),
            extended: result.extended,
            status: result.status,
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
      select: { id: true, sellerId: true, deletedAt: true },
    });

    if (!batch || batch.deletedAt) {
      throw new NotFoundError("Batch");
    }

    const viewer = viewerOf(req);
    const where: any = { batchId: id };
    if (bidderId) where.bidderId = bidderId;

    const [bids, total] = await Promise.all([
      prisma.bid.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [{ amount: "desc" }, { createdAt: "asc" }, { id: "asc" }],
        include: {
          bidder: { select: { id: true, name: true } },
          audit: {
            select: {
              sequence: true,
              previousHash: true,
              currentHash: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.bid.count({ where }),
    ]);

    res.json({
      success: true,
      data: bids.map((bid) => serializeBid(id, batch.sellerId, bid, viewer)),
      meta: buildPaginatedResponse(bids, total, pageNum, limitNum).meta,
    });
  },
);

async function findAuditableBatchOrFail(id: string) {
  const batch = await prisma.batch.findUnique({
    where: { id },
    select: { id: true, status: true, deletedAt: true },
  });

  if (!batch || batch.deletedAt || batch.status === "CANCELLED") {
    throw new NotFoundError("Batch");
  }

  return batch;
}

export const getPublicAudit = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;
    const { page = 1, limit = 100 } = req.query;

    await findAuditableBatchOrFail(id);

    const {
      page: pageNum,
      limit: limitNum,
      skip,
    } = parsePaginationParams(page, limit);

    const [entries, total] = await Promise.all([
      prisma.bidAudit.findMany({
        where: { batchId: id },
        skip,
        take: limitNum,
        orderBy: { sequence: "asc" },
        include: {
          bid: {
            include: { bidder: { select: { id: true } } },
          },
        },
      }),
      prisma.bidAudit.count({ where: { batchId: id } }),
    ]);

    res.json({
      success: true,
      data: entries.map((entry) => ({
        sequence: entry.sequence,
        previousHash: entry.previousHash,
        currentHash: entry.currentHash,
        createdAt: entry.createdAt,
        bidId: entry.bidId,
        amount: entry.bid ? formatDecimal(entry.bid.amount) : null,
        bidder: entry.bid?.bidder
          ? { label: publicActorLabel(id, entry.bid.bidder.id, "bidder") }
          : null,
      })),
      meta: buildPaginatedResponse(entries, total, pageNum, limitNum).meta,
    });
  },
);

export const verifyPublicAudit = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;

    await findAuditableBatchOrFail(id);

    const verification = await verifyBidAuditChain(id);

    res.json({
      success: true,
      data: {
        batchId: id,
        ...verification,
      },
    });
  },
);

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

    const where: any = { deletedAt: null };
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

    const viewer = viewerOf(req);

    res.json({
      success: true,
      data: batchs.map((batch) => serializeBatch(batch, viewer)),
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
        await tx.$queryRaw`SELECT id FROM "Batch" WHERE id = ${id} FOR UPDATE`;
        await releaseOtherReservations(tx, id);
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
        batch: serializeBatch(updatedBatch, viewerOf(req)),
      },
    });
  },
);
