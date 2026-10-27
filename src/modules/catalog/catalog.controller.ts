import { Response } from "express";
import { prisma } from "../../config/database";
import { asyncHandler } from "../../shared/middlewares";
import {
  NotFoundError,
  AuthorizationError,
  ConflictError,
  Loterror,
} from "../../shared/errors";
import { RequestWithUser } from "../../shared/types";
import {
  parsePaginationParams,
  buildPaginatedResponse,
  formatDecimal,
  getBatchTiming,
} from "../../shared/utils";

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
    startingPrice: formatDecimal(batch.startingPrice),
    minimumIncrement: formatDecimal(batch.minimumIncrement),
    currentPrice: highestBid
      ? formatDecimal(highestBid.amount)
      : formatDecimal(batch.startingPrice),
    bidCount: batch._count?.bids ?? 0,
    timing: getBatchTiming(batch.startsAt, batch.endsAt),
  };
}

function parseDateRange(startsAt?: string, endsAt?: string) {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;

  if (start && end && start >= end) {
    throw new Loterror(
      "End date must be after start date",
      "INVALID_DATE_RANGE",
    );
  }

  return { start, end };
}

export const createBatch = asyncHandler(
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
      throw new AuthorizationError("You can only create batchs for yourself");
    }

    const seller = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!seller) {
      throw new NotFoundError("Seller");
    }

    if (seller.role === "BIDDER") {
      throw new Loterror("Bidders cannot own batchs", "INVALID_SELLER");
    }

    const { start, end } = parseDateRange(startsAt, endsAt);

    if (status === "SCHEDULED" && start && start.getTime() > end!.getTime()) {
      throw new Loterror("Invalid schedule window", "INVALID_DATE_RANGE");
    }

    const batch = await prisma.batch.create({
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
      include: batchInclude,
    });

    res.status(201).json({
      success: true,
      message: "Batch created successfully",
      data: serializeBatch(batch),
    });
  },
);

export const listBatchs = asyncHandler(
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

export const listMyBatchs = asyncHandler(
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

export const getBatchById = asyncHandler(
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
        _count: {
          select: { bids: true, auditEntries: true, reservations: true },
        },
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

export const updateBatch = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { id } = req.params;
    const data = req.body;

    const batch = await prisma.batch.findUnique({ where: { id } });
    if (!batch) {
      throw new NotFoundError("Batch");
    }

    if (user.role !== "ADMIN" && batch.sellerId !== user.id) {
      throw new AuthorizationError("You can only update your own batchs");
    }

    if (["ACTIVE", "ENDED", "SETTLED", "CANCELLED"].includes(batch.status)) {
      throw new ConflictError(
        "Cannot update a batch that is active or finished",
      );
    }

    const startsAt = data.startsAt ? new Date(data.startsAt) : batch.startsAt;
    const endsAt = data.endsAt ? new Date(data.endsAt) : batch.endsAt;

    if (startsAt >= endsAt) {
      throw new Loterror(
        "End date must be after start date",
        "INVALID_DATE_RANGE",
      );
    }

    const updatedBatch = await prisma.batch.update({
      where: { id },
      data: {
        ...data,
        startsAt: data.startsAt ? startsAt : undefined,
        endsAt: data.endsAt ? endsAt : undefined,
      },
      include: batchInclude,
    });

    res.json({
      success: true,
      message: "Batch updated successfully",
      data: serializeBatch(updatedBatch),
    });
  },
);

export const deleteBatch = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    const batch = await prisma.batch.findUnique({
      where: { id },
      include: {
        _count: {
          select: { bids: true, reservations: true, auditEntries: true },
        },
        settlement: { select: { id: true } },
      },
    });

    if (!batch) {
      throw new NotFoundError("Batch");
    }

    if (user.role !== "ADMIN" && batch.sellerId !== user.id) {
      throw new AuthorizationError("You can only delete your own batchs");
    }

    if (batch.status !== "DRAFT") {
      throw new ConflictError("Only draft batchs can be deleted");
    }

    if (
      batch._count.bids > 0 ||
      batch._count.reservations > 0 ||
      batch._count.auditEntries > 0 ||
      batch.settlement
    ) {
      throw new ConflictError("Cannot delete a batch with bids or settlements");
    }

    await prisma.batch.delete({ where: { id } });

    res.json({
      success: true,
      message: "Batch deleted successfully",
    });
  },
);
