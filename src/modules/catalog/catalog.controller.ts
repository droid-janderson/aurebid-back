import { Response } from "express";
import { prisma } from "../../config/database";
import { asyncHandler } from "../../shared/middlewares";
import {
  NotFoundError,
  AuthorizationError,
  ConflictError,
  LotError,
} from "../../shared/errors";
import { RequestWithUser } from "../../shared/types";
import {
  parsePaginationParams,
  buildPaginatedResponse,
  formatDecimal,
  getLotTiming,
} from "../../shared/utils";

const lotInclude = {
  seller: { select: { id: true, name: true, email: true } },
  bids: {
    orderBy: { amount: "desc" as const },
    take: 1,
    select: { id: true, amount: true, createdAt: true },
  },
  _count: { select: { bids: true } },
};

function serializeLot(lot: any) {
  const highestBid = lot.bids?.[0];

  return {
    ...lot,
    currentPrice: highestBid
      ? formatDecimal(highestBid.amount)
      : formatDecimal(lot.startingPrice),
    bidCount: lot._count?.bids ?? 0,
    timing: getLotTiming(lot.startsAt, lot.endsAt),
  };
}

function parseDateRange(startsAt?: string, endsAt?: string) {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;

  if (start && end && start >= end) {
    throw new LotError(
      "End date must be after start date",
      "INVALID_DATE_RANGE",
    );
  }

  return { start, end };
}

export const createLot = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const {
      sellerId,
      productSource,
      externalProductId,
      title,
      description,
      imageUrl,
      productData,
      startingPrice,
      minimumIncrement,
      startsAt,
      endsAt,
      status = "DRAFT",
    } = req.body;

    const ownerId = sellerId ?? user.id;

    if (ownerId !== user.id && user.role !== "ADMIN") {
      throw new AuthorizationError("You can only create lots for yourself");
    }

    const seller = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!seller) {
      throw new NotFoundError("Seller");
    }

    if (seller.role === "BIDDER") {
      throw new LotError("Bidders cannot own lots", "INVALID_SELLER");
    }

    const { start, end } = parseDateRange(startsAt, endsAt);

    if (status === "SCHEDULED" && start && start.getTime() > end!.getTime()) {
      throw new LotError("Invalid schedule window", "INVALID_DATE_RANGE");
    }

    const lot = await prisma.lot.create({
      data: {
        sellerId: ownerId,
        productSource,
        externalProductId,
        title,
        description,
        imageUrl,
        productData: productData ?? undefined,
        startingPrice,
        minimumIncrement,
        startsAt: start!,
        endsAt: end!,
        status,
      },
      include: lotInclude,
    });

    res.status(201).json({
      success: true,
      message: "Lot created successfully",
      data: serializeLot(lot),
    });
  },
);

export const listLots = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const {
      page = 1,
      limit = 20,
      status,
      sellerId,
      productSource,
      search,
      minPrice,
      maxPrice,
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
    if (productSource) where.productSource = productSource;
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } },
        {
          externalProductId: {
            contains: search as string,
            mode: "insensitive",
          },
        },
      ];
    }
    if (minPrice || maxPrice) {
      where.startingPrice = {};
      if (minPrice) where.startingPrice.gte = parseFloat(minPrice as string);
      if (maxPrice) where.startingPrice.lte = parseFloat(maxPrice as string);
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
  },
);

export const listMyLots = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const {
      page = 1,
      limit = 20,
      status,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const {
      page: pageNum,
      limit: limitNum,
      skip,
    } = parsePaginationParams(page, limit);

    const where: any = user.role === "ADMIN" ? {} : { sellerId: user.id };
    if (status) where.status = status;
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
  },
);

export const getLotById = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { id } = req.params;

    const lot = await prisma.lot.findUnique({
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
        _count: {
          select: { bids: true, auditEntries: true, reservations: true },
        },
      },
    });

    if (!lot) {
      throw new NotFoundError("Lot");
    }

    res.json({
      success: true,
      data: serializeLot(lot),
    });
  },
);

export const updateLot = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { id } = req.params;
    const data = req.body;

    const lot = await prisma.lot.findUnique({ where: { id } });
    if (!lot) {
      throw new NotFoundError("Lot");
    }

    if (user.role !== "ADMIN" && lot.sellerId !== user.id) {
      throw new AuthorizationError("You can only update your own lots");
    }

    if (["ACTIVE", "ENDED", "SETTLED", "CANCELLED"].includes(lot.status)) {
      throw new ConflictError("Cannot update a lot that is active or finished");
    }

    const startsAt = data.startsAt ? new Date(data.startsAt) : lot.startsAt;
    const endsAt = data.endsAt ? new Date(data.endsAt) : lot.endsAt;

    if (startsAt >= endsAt) {
      throw new LotError(
        "End date must be after start date",
        "INVALID_DATE_RANGE",
      );
    }

    const updatedLot = await prisma.lot.update({
      where: { id },
      data: {
        ...data,
        startsAt: data.startsAt ? startsAt : undefined,
        endsAt: data.endsAt ? endsAt : undefined,
      },
      include: lotInclude,
    });

    res.json({
      success: true,
      message: "Lot updated successfully",
      data: serializeLot(updatedLot),
    });
  },
);

export const deleteLot = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    const lot = await prisma.lot.findUnique({
      where: { id },
      include: {
        _count: {
          select: { bids: true, reservations: true, auditEntries: true },
        },
        settlement: { select: { id: true } },
      },
    });

    if (!lot) {
      throw new NotFoundError("Lot");
    }

    if (user.role !== "ADMIN" && lot.sellerId !== user.id) {
      throw new AuthorizationError("You can only delete your own lots");
    }

    if (lot.status !== "DRAFT") {
      throw new ConflictError("Only draft lots can be deleted");
    }

    if (
      lot._count.bids > 0 ||
      lot._count.reservations > 0 ||
      lot._count.auditEntries > 0 ||
      lot.settlement
    ) {
      throw new ConflictError("Cannot delete a lot with bids or settlements");
    }

    await prisma.lot.delete({ where: { id } });

    res.json({
      success: true,
      message: "Lot deleted successfully",
    });
  },
);
