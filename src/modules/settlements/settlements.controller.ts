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
  startSettlementProcessing,
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

function serializeSettlement(settlement: any) {
  return {
    ...settlement,
    amount: formatDecimal(settlement.amount),
    winningBid: settlement.winningBid
      ? {
          ...settlement.winningBid,
          amount: formatDecimal(settlement.winningBid.amount),
        }
      : null,
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
      data: settlements.map(serializeSettlement),
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
      data: serializeSettlement(settlement),
    });
  },
);

export const processSettlement = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    const settlement = await prisma.settlement.findUnique({ where: { id } });
    if (!settlement) {
      throw new NotFoundError("Settlement");
    }

    assertParticipant(settlement, user);

    const updated = await startSettlementProcessing(id);

    res.json({
      success: true,
      message: "Settlement processing started",
      data: serializeSettlement(updated),
    });
  },
);

// Admin routes
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
      data: settlements.map(serializeSettlement),
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
