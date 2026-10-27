import { Response } from "express";
import { prisma } from "../../config/database";
import { asyncHandler } from "../../shared/middlewares";
import { NotFoundError } from "../../shared/errors";
import { RequestWithUser } from "../../shared/types";
import {
  parsePaginationParams,
  buildPaginatedResponse,
  formatDecimal,
} from "../../shared/utils";
import { verifyBidAuditChain } from "../../shared/utils/audit";

const auditInclude = {
  bid: {
    select: {
      id: true,
      amount: true,
      createdAt: true,
      bidder: { select: { id: true, name: true, email: true } },
    },
  },
  batch: { select: { id: true, title: true, status: true } },
} as const;

function serializeEntry(entry: any) {
  return {
    ...entry,
    bid: entry.bid
      ? { ...entry.bid, amount: formatDecimal(entry.bid.amount) }
      : null,
  };
}

export const listAuditEntries = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { page = 1, limit = 50, batchId, bidderId } = req.query;

    const {
      page: pageNum,
      limit: limitNum,
      skip,
    } = parsePaginationParams(page, limit);

    const where: any = {};
    if (batchId) where.batchId = batchId;
    if (bidderId) where.bid = { bidderId };

    const [entries, total] = await Promise.all([
      prisma.bidAudit.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: auditInclude,
      }),
      prisma.bidAudit.count({ where }),
    ]);

    res.json({
      success: true,
      data: entries.map(serializeEntry),
      meta: buildPaginatedResponse(entries, total, pageNum, limitNum).meta,
    });
  },
);

export const listAuditByBatch = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { batchId } = req.params;
    const { page = 1, limit = 100 } = req.query;

    const {
      page: pageNum,
      limit: limitNum,
      skip,
    } = parsePaginationParams(page, limit);

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      select: { id: true },
    });
    if (!batch) {
      throw new NotFoundError("Batch");
    }

    const [entries, total] = await Promise.all([
      prisma.bidAudit.findMany({
        where: { batchId },
        skip,
        take: limitNum,
        orderBy: { sequence: "asc" },
        include: auditInclude,
      }),
      prisma.bidAudit.count({ where: { batchId } }),
    ]);

    res.json({
      success: true,
      data: entries.map(serializeEntry),
      meta: buildPaginatedResponse(entries, total, pageNum, limitNum).meta,
    });
  },
);

export const getAuditEntryByBid = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { bidId } = req.params;

    const entry = await prisma.bidAudit.findUnique({
      where: { bidId },
      include: auditInclude,
    });

    if (!entry) {
      throw new NotFoundError("Audit entry");
    }

    res.json({
      success: true,
      data: serializeEntry(entry),
    });
  },
);

export const verifyBatchChain = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { batchId } = req.params;

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      select: { id: true },
    });
    if (!batch) {
      throw new NotFoundError("Batch");
    }

    const verification = await verifyBidAuditChain(batchId);

    res.json({
      success: true,
      data: {
        batchId,
        ...verification,
      },
    });
  },
);
