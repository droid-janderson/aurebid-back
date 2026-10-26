import { Response } from 'express';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../shared/middlewares';
import { NotFoundError, AuthorizationError } from '../../shared/errors';
import { RequestWithUser } from '../../shared/types';
import { parsePaginationParams, buildPaginatedResponse, formatDecimal } from '../../shared/utils';

const bidInclude = {
  lot: {
    select: {
      id: true,
      title: true,
      status: true,
      startingPrice: true,
      minimumIncrement: true,
      startsAt: true,
      endsAt: true,
      imageUrl: true,
      seller: { select: { id: true, name: true } },
    },
  },
  bidder: { select: { id: true, name: true, email: true } },
  audit: { select: { sequence: true, currentHash: true, previousHash: true, createdAt: true } },
} as const;

function serializeBid(bid: any) {
  return { ...bid, amount: formatDecimal(bid.amount) };
}

export const listMyBids = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const user = req.user!;
  const { page = 1, limit = 20, lotId } = req.query;

  const { page: pageNum, limit: limitNum, skip } = parsePaginationParams(page, limit);

  const where: any = { bidderId: user.id };
  if (lotId) where.lotId = lotId;

  const [bids, total] = await Promise.all([
    prisma.bid.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: bidInclude,
    }),
    prisma.bid.count({ where }),
  ]);

  res.json({
    success: true,
    data: bids.map(serializeBid),
    meta: buildPaginatedResponse(bids, total, pageNum, limitNum).meta,
  });
});

export const getBidById = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  const bid = await prisma.bid.findUnique({
    where: { id },
    include: bidInclude,
  });

  if (!bid) {
    throw new NotFoundError('Bid');
  }

  const isOwner = bid.bidderId === user.id;
  const isLotSeller = bid.lot.seller.id === user.id;

  if (user.role !== 'ADMIN' && !isOwner && !isLotSeller) {
    throw new AuthorizationError('Access denied');
  }

  res.json({
    success: true,
    data: serializeBid(bid),
  });
});

export const listAllBids = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const { page = 1, limit = 20, lotId, bidderId } = req.query;

  const { page: pageNum, limit: limitNum, skip } = parsePaginationParams(page, limit);

  const where: any = {};
  if (lotId) where.lotId = lotId;
  if (bidderId) where.bidderId = bidderId;

  const [bids, total] = await Promise.all([
    prisma.bid.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: bidInclude,
    }),
    prisma.bid.count({ where }),
  ]);

  res.json({
    success: true,
    data: bids.map(serializeBid),
    meta: buildPaginatedResponse(bids, total, pageNum, limitNum).meta,
  });
});
