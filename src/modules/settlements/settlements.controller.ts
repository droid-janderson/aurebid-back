import { Response } from "express";
import { prisma } from "../../config/database";
import { asyncHandler } from "../../shared/middlewares";
import {
  NotFoundError,
  AuthorizationError,
  SettlementError,
} from "../../shared/errors";
import { RequestWithUser } from "../../shared/types";
import {
  parsePaginationParams,
  buildPaginatedResponse,
  formatDecimal,
} from "../../shared/utils";
import {
  completeSettlement,
  createSettlementForBatch,
  failSettlement,
} from "./settlements.service";

const settlementInclude = {
  batch: {
    select: {
      id: true,
      title: true,
      status: true,
      imageUrl: true,
      endsAt: true,
    },
  },
  winningBid: { select: { id: true, amount: true, createdAt: true } },
  buyer: { select: { id: true, name: true, email: true } },
  seller: { select: { id: true, name: true, email: true } },
} as const;

function serializeSettlement(
  settlement: any,
  options: { revealNames?: boolean } = {},
) {
  const { revealNames = true } = options;

  const party = (user: any, label: string | null | undefined) => {
    if (!user) return null;

    return revealNames
      ? { id: user.id, name: user.name, label: label ?? null }
      : { label: label ?? null };
  };

  return {
    id: settlement.id,
    batchId: settlement.batchId,
    buyerId: revealNames ? settlement.buyerId : undefined,
    sellerId: revealNames ? settlement.sellerId : undefined,
    amount: formatDecimal(settlement.amount),
    receiptNumber: settlement.receiptNumber,
    status: settlement.status,
    completedAt: settlement.completedAt,
    failureReason: settlement.failureReason ?? null,
    buyerLabel: settlement.buyerLabel ?? null,
    sellerLabel: settlement.sellerLabel ?? null,
    batchTitle: settlement.batchTitle ?? settlement.batch?.title ?? null,
    batchImageUrl:
      settlement.batchImageUrl ?? settlement.batch?.imageUrl ?? null,
    batchEndsAt: settlement.batchEndsAt ?? settlement.batch?.endsAt ?? null,
    batch: settlement.batch
      ? {
          id: settlement.batch.id,
          title: settlement.batch.title,
          status: settlement.batch.status,
          imageUrl: settlement.batch.imageUrl,
          endsAt: settlement.batch.endsAt,
        }
      : null,
    winningBid: settlement.winningBid
      ? {
          ...settlement.winningBid,
          amount: formatDecimal(settlement.winningBid.amount),
        }
      : null,
    buyer: party(settlement.buyer, settlement.buyerLabel),
    seller: party(settlement.seller, settlement.sellerLabel),
  };
}

function assertParticipant(
  settlement: { buyerId: string; sellerId: string },
  user: NonNullable<RequestWithUser["user"]>,
) {
  if (
    user.role !== "ADMIN" &&
    settlement.buyerId !== user.id &&
    settlement.sellerId !== user.id
  ) {
    throw new AuthorizationError("Access denied");
  }
}

export const listMySettlements = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { page = 1, limit = 20, status, batchId } = req.query;

    const {
      page: pageNum,
      limit: limitNum,
      skip,
    } = parsePaginationParams(page, limit);

    const where: any = {
      OR: [{ buyerId: user.id }, { sellerId: user.id }],
    };
    if (status) where.status = status;
    if (batchId) where.batchId = batchId;

    const [settlements, total] = await Promise.all([
      prisma.settlement.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: settlementInclude,
      }),
      prisma.settlement.count({ where }),
    ]);

    res.json({
      success: true,
      data: settlements.map((settlement) => serializeSettlement(settlement)),
      meta: buildPaginatedResponse(settlements, total, pageNum, limitNum).meta,
    });
  },
);

export const getSettlementById = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    const settlement = await prisma.settlement.findUnique({
      where: { id },
      include: {
        ...settlementInclude,
        transactions: true,
      },
    });

    if (!settlement) {
      throw new NotFoundError("Settlement");
    }

    assertParticipant(settlement, user);

    res.json({
      success: true,
      data: {
        ...serializeSettlement(settlement),
        transactions: settlement.transactions.map((transaction) => ({
          ...transaction,
          amount: formatDecimal(transaction.amount),
        })),
      },
    });
  },
);

export const getSettlementByToken = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { token } = req.params;

    const settlement = await prisma.settlement.findUnique({
      where: { publicToken: token },
      include: settlementInclude,
    });

    if (!settlement) {
      throw new NotFoundError("Settlement");
    }

    res.json({
      success: true,
      data: serializeSettlement(settlement, { revealNames: false }),
    });
  },
);

export const listAllSettlements = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { page = 1, limit = 20, status, batchId } = req.query;

    const {
      page: pageNum,
      limit: limitNum,
      skip,
    } = parsePaginationParams(page, limit);

    const where: any = {};
    if (status) where.status = status;
    if (batchId) where.batchId = batchId;

    const [settlements, total] = await Promise.all([
      prisma.settlement.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: settlementInclude,
      }),
      prisma.settlement.count({ where }),
    ]);

    res.json({
      success: true,
      data: settlements.map((settlement) => serializeSettlement(settlement)),
      meta: buildPaginatedResponse(settlements, total, pageNum, limitNum).meta,
    });
  },
);

export const createSettlementForBatchHandler = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { batchId } = req.params;

    const settlement = await createSettlementForBatch(batchId);

    if (!settlement) {
      throw new SettlementError(
        "Batch has no bids to settle",
        "NO_WINNING_BID",
      );
    }

    const fullSettlement = await prisma.settlement.findUnique({
      where: { id: settlement.id },
      include: settlementInclude,
    });

    res.status(201).json({
      success: true,
      message: "Settlement created",
      data: fullSettlement ? serializeSettlement(fullSettlement) : settlement,
    });
  },
);

export const completeSettlementHandler = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;

    const completed = await completeSettlement(id);

    res.json({
      success: true,
      message: "Settlement completed",
      data: serializeSettlement(completed),
    });
  },
);

export const failSettlementHandler = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;

    const failed = await failSettlement(id);

    res.json({
      success: true,
      message: "Settlement marked as failed",
      data: serializeSettlement(failed),
    });
  },
);
