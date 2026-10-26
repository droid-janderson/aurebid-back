import { Response } from 'express';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../shared/middlewares';
import { NotFoundError } from '../../shared/errors';
import { RequestWithUser } from '../../shared/types';
import { parsePaginationParams, buildPaginatedResponse, formatDecimal } from '../../shared/utils';
import { verifyBidAuditChain } from '../../shared/utils/audit';

const auditInclude = {
  bid: {
    select: {
      id: true,
      amount: true,
      createdAt: true,
      bidder: { select: { id: true, name: true, email: true } },
    },
  },
  lot: { select: { id: true, title: true, status: true } },
} as const;

function serializeEntry(entry: any) {
  return {
    ...entry,
    bid: entry.bid ? { ...entry.bid, amount: formatDecimal(entry.bid.amount) } : null,
  };
}

export const listAuditEntries = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const { page = 1, limit = 50, lotId, bidderId } = req.query;

  const { page: pageNum, limit: limitNum, skip } = parsePaginationParams(page, limit);

  const where: any = {};
  if (lotId) where.lotId = lotId;
  if (bidderId) where.bid = { bidderId };

  const [entries, total] = await Promise.all([
    prisma.bidAudit.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: auditInclude,
    }),
    prisma.bidAudit.count({ where }),
  ]);

  res.json({
    success: true,
    data: entries.map(serializeEntry),
    meta: buildPaginatedResponse(entries, total, pageNum, limitNum).meta,
  });
});

export const listAuditByLot = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const { lotId } = req.params;
  const { page = 1, limit = 100 } = req.query;

  const { page: pageNum, limit: limitNum, skip } = parsePaginationParams(page, limit);

  const lot = await prisma.lot.findUnique({ where: { id: lotId }, select: { id: true } });
  if (!lot) {
    throw new NotFoundError('Lot');
  }

  const [entries, total] = await Promise.all([
    prisma.bidAudit.findMany({
      where: { lotId },
      skip,
      take: limitNum,
      orderBy: { sequence: 'asc' },
      include: auditInclude,
    }),
    prisma.bidAudit.count({ where: { lotId } }),
  ]);

  res.json({
    success: true,
    data: entries.map(serializeEntry),
    meta: buildPaginatedResponse(entries, total, pageNum, limitNum).meta,
  });
});

export const getAuditEntryByBid = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const { bidId } = req.params;

  const entry = await prisma.bidAudit.findUnique({
    where: { bidId },
    include: auditInclude,
  });

  if (!entry) {
    throw new NotFoundError('Audit entry');
  }

  res.json({
    success: true,
    data: serializeEntry(entry),
  });
});

export const verifyLotChain = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const { lotId } = req.params;

  const lot = await prisma.lot.findUnique({ where: { id: lotId }, select: { id: true } });
  if (!lot) {
    throw new NotFoundError('Lot');
  }

  const verification = await verifyBidAuditChain(lotId);

  res.json({
    success: true,
    data: {
      lotId,
      ...verification,
    },
  });
});
