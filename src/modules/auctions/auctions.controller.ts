import { Response } from 'express';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../shared/middlewares';
import {
  NotFoundError,
  AuthorizationError,
  ConflictError,
  LotError,
  BidError,
} from '../../shared/errors';
import { RequestWithUser } from '../../shared/types';
import {
  parsePaginationParams,
  buildPaginatedResponse,
  formatDecimal,
  validateBidAmount,
  getLotTiming,
} from '../../shared/utils';
import { appendBidAudit } from '../../shared/utils/audit';
import { auctionSocket } from '../../sockets/auction.socket';
import { createSettlementForLot, releaseLotReservations } from '../settlements/settlements.service';

const lotInclude = {
  seller: { select: { id: true, name: true, email: true } },
  bids: { orderBy: { amount: 'desc' as const }, take: 1, select: { id: true, amount: true, createdAt: true } },
  _count: { select: { bids: true } },
};

function serializeLot(lot: any) {
  const highestBid = lot.bids?.[0];

  return {
    ...lot,
    currentPrice: highestBid ? formatDecimal(highestBid.amount) : formatDecimal(lot.startingPrice),
    bidCount: lot._count?.bids ?? 0,
    timing: getLotTiming(lot.startsAt, lot.endsAt),
  };
}

async function findLotOrFail(id: string) {
  const lot = await prisma.lot.findUnique({ where: { id } });

  if (!lot) {
    throw new NotFoundError('Lot');
  }

  return lot;
}

function assertCanManageLot(user: RequestWithUser['user'], sellerId: string, action: string) {
  if (!user) {
    throw new AuthorizationError('Authentication required');
  }

  if (user.role !== 'ADMIN' && sellerId !== user.id) {
    throw new AuthorizationError(`You can only ${action} your own lots`);
  }
}

export const listAuctions = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const {
    page = 1,
    limit = 20,
    status,
    sellerId,
    search,
    sortBy = 'startsAt',
    sortOrder = 'asc',
  } = req.query;

  const { page: pageNum, limit: limitNum, skip } = parsePaginationParams(page, limit);

  const where: any = status ? { status } : { status: { notIn: ['DRAFT', 'CANCELLED'] } };

  if (sellerId) where.sellerId = sellerId;
  if (search) {
    where.OR = [
      { title: { contains: search as string, mode: 'insensitive' } },
      { description: { contains: search as string, mode: 'insensitive' } },
    ];
  }

  const [lots, total] = await Promise.all([
    prisma.lot.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { [sortBy as string]: sortOrder },
      include: lotInclude,
    }),
    prisma.lot.count({ where }),
  ]);

  res.json({
    success: true,
    data: lots.map(serializeLot),
    meta: buildPaginatedResponse(lots, total, pageNum, limitNum).meta,
  });
});

export const getAuctionById = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const { id } = req.params;

  const lot = await prisma.lot.findUnique({
    where: { id },
    include: {
      seller: { select: { id: true, name: true, email: true } },
      bids: {
        orderBy: { amount: 'desc' },
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

  if (!lot) {
    throw new NotFoundError('Lot');
  }

  res.json({
    success: true,
    data: serializeLot(lot),
  });
});

export const publishAuction = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  const lot = await findLotOrFail(id);
  assertCanManageLot(user, lot.sellerId, 'publish');

  if (lot.status !== 'DRAFT' && lot.status !== 'SCHEDULED') {
    throw new ConflictError('Only draft or scheduled lots can be published');
  }

  const now = new Date();

  if (lot.endsAt <= now) {
    throw new LotError('Lot end date is in the past', 'INVALID_DATE_RANGE');
  }

  const status = lot.startsAt <= now ? 'ACTIVE' : 'SCHEDULED';

  const updatedLot = await prisma.lot.update({
    where: { id },
    data: { status },
    include: lotInclude,
  });

  auctionSocket.emitAuctionStatusChange(updatedLot);

  res.json({
    success: true,
    message: status === 'ACTIVE' ? 'Lot is now active' : 'Lot scheduled',
    data: serializeLot(updatedLot),
  });
});

export const cancelAuction = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  const lot = await findLotOrFail(id);
  assertCanManageLot(user, lot.sellerId, 'cancel');

  if (['ENDED', 'SETTLED', 'CANCELLED'].includes(lot.status)) {
    throw new ConflictError('Cannot cancel a finished lot');
  }

  const updatedLot = await prisma.$transaction(async (tx) => {
    await releaseLotReservations(tx, id);

    return tx.lot.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: lotInclude,
    });
  });

  auctionSocket.emitAuctionStatusChange(updatedLot);

  res.json({
    success: true,
    message: 'Lot cancelled successfully',
    data: serializeLot(updatedLot),
  });
});

export const endAuction = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const user = req.user!;
  const { id } = req.params;

  const lot = await findLotOrFail(id);
  assertCanManageLot(user, lot.sellerId, 'end');

  if (lot.status !== 'ACTIVE') {
    throw new ConflictError('Only active lots can be ended');
  }

  const settlement = await createSettlementForLot(id);

  const updatedLot = await prisma.lot.findUnique({
    where: { id },
    include: {
      ...lotInclude,
      bids: {
        orderBy: { amount: 'desc' },
        take: 1,
        include: { bidder: { select: { id: true, name: true } } },
      },
    },
  });

  auctionSocket.emitAuctionEnded(updatedLot);

  res.json({
    success: true,
    message: settlement
      ? 'Lot ended and settlement created'
      : 'Lot ended without bids',
    data: {
      lot: updatedLot ? serializeLot(updatedLot) : null,
      settlement,
    },
  });
});

const MAX_BID_ATTEMPTS = 3;

export const placeBid = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const amount = Number(Number(req.body.amount).toFixed(2));

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_BID_ATTEMPTS; attempt += 1) {
    try {
      const bid = await prisma.$transaction(async (tx) => {
        const lot = await tx.lot.findUnique({
          where: { id },
          include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
        });

        if (!lot) {
          throw new NotFoundError('Lot');
        }

        if (lot.sellerId === user.id) {
          throw new BidError('Cannot bid on your own lot', 'CANNOT_BID_OWN_LOT');
        }

        if (lot.status !== 'ACTIVE') {
          throw new BidError('Lot is not active', 'LOT_NOT_ACTIVE');
        }

        const now = new Date();
        if (now < lot.startsAt || now > lot.endsAt) {
          throw new BidError('Lot is outside the bidding window', 'LOT_NOT_OPEN');
        }

        const highestBid = lot.bids[0];
        const highestAmount = highestBid ? formatDecimal(highestBid.amount) : null;

        const validation = validateBidAmount(amount, {
          startingPrice: formatDecimal(lot.startingPrice),
          minimumIncrement: formatDecimal(lot.minimumIncrement),
          highestBid: highestAmount,
        });

        if (!validation.valid) {
          throw new BidError(validation.error!, 'INVALID_BID_AMOUNT');
        }

        const wallet = await tx.wallet.findUnique({
          where: { userId: user.id },
          include: { reservations: { where: { status: 'ACTIVE' } } },
        });

        if (!wallet) {
          throw new BidError('Wallet not found', 'WALLET_NOT_FOUND');
        }

        const reservedElsewhere = wallet.reservations
          .filter((reservation) => reservation.lotId !== lot.id)
          .reduce((total, reservation) => total + formatDecimal(reservation.amount), 0);

        const availableAmount = formatDecimal(wallet.balance) - reservedElsewhere;

        if (availableAmount < amount) {
          throw new BidError('Insufficient available balance', 'INSUFFICIENT_FUNDS');
        }

        const createdBid = await tx.bid.create({
          data: {
            lotId: lot.id,
            bidderId: user.id,
            amount,
          },
          include: {
            bidder: { select: { id: true, name: true } },
          },
        });

        await appendBidAudit(tx, createdBid);

        const currentReservation = wallet.reservations.find(
          (reservation) => reservation.lotId === lot.id
        );

        if (currentReservation) {
          await tx.walletReservation.update({
            where: { id: currentReservation.id },
            data: {
              bidId: createdBid.id,
              amount,
              status: 'ACTIVE',
            },
          });
        } else {
          await tx.walletReservation.create({
            data: {
              walletId: wallet.id,
              lotId: lot.id,
              bidId: createdBid.id,
              amount,
              status: 'ACTIVE',
            },
          });
        }

        return createdBid;
      });

      auctionSocket.emitNewBid(id, bid);

      return res.status(201).json({
        success: true,
        message: 'Bid placed successfully',
        data: {
          ...bid,
          amount: formatDecimal(bid.amount),
        },
      });
    } catch (error) {
      lastError = error;

      const isSequenceConflict =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002';

      if (!isSequenceConflict || attempt === MAX_BID_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw lastError;
});

export const getAuctionBids = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const { id } = req.params;
  const { page = 1, limit = 20, bidderId } = req.query;

  const { page: pageNum, limit: limitNum, skip } = parsePaginationParams(page, limit);

  const lot = await prisma.lot.findUnique({ where: { id }, select: { id: true } });
  if (!lot) {
    throw new NotFoundError('Lot');
  }

  const where: any = { lotId: id };
  if (bidderId) where.bidderId = bidderId;

  const [bids, total] = await Promise.all([
    prisma.bid.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { amount: 'desc' },
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
});

// Admin routes
export const listAllAuctions = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const {
    page = 1,
    limit = 20,
    status,
    sellerId,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const { page: pageNum, limit: limitNum, skip } = parsePaginationParams(page, limit);

  const where: any = {};
  if (status) where.status = status;
  if (sellerId) where.sellerId = sellerId;
  if (search) {
    where.OR = [
      { title: { contains: search as string, mode: 'insensitive' } },
      { externalProductId: { contains: search as string, mode: 'insensitive' } },
    ];
  }

  const [lots, total] = await Promise.all([
    prisma.lot.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { [sortBy as string]: sortOrder },
      include: lotInclude,
    }),
    prisma.lot.count({ where }),
  ]);

  res.json({
    success: true,
    data: lots.map(serializeLot),
    meta: buildPaginatedResponse(lots, total, pageNum, limitNum).meta,
  });
});

export const updateAuctionStatus = asyncHandler(async (req: RequestWithUser, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const lot = await findLotOrFail(id);

  const updatedLot = await prisma.$transaction(async (tx) => {
    if (status === 'CANCELLED') {
      await releaseLotReservations(tx, id);
    }

    return tx.lot.update({
      where: { id },
      data: { status },
      include: lotInclude,
    });
  });

  auctionSocket.emitAuctionStatusChange(updatedLot);

  res.json({
    success: true,
    message: 'Lot status updated',
    data: {
      previousStatus: lot.status,
      lot: serializeLot(updatedLot),
    },
  });
});
