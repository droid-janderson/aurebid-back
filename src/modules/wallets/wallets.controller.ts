import { Response } from "express";
import { prisma } from "../../config/database";
import { asyncHandler } from "../../shared/middlewares";
import { NotFoundError, WalletError } from "../../shared/errors";
import { RequestWithUser } from "../../shared/types";
import {
  parsePaginationParams,
  buildPaginatedResponse,
  formatDecimal,
  formatCurrency,
} from "../../shared/utils";

async function getReservedAmount(walletId: string): Promise<number> {
  const aggregate = await prisma.walletReservation.aggregate({
    where: { walletId, status: "ACTIVE" },
    _sum: { amount: true },
  });

  return formatDecimal(aggregate._sum.amount ?? 0);
}

async function ensureWallet(userId: string) {
  return prisma.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId, balance: 0 },
  });
}

function serializeWallet(
  wallet: { id: string; balance: unknown; createdAt: Date; updatedAt: Date },
  reservedAmount: number,
) {
  const balance = formatDecimal(wallet.balance as any);
  const availableAmount = balance - reservedAmount;

  return {
    id: wallet.id,
    balance,
    reservedAmount,
    availableAmount,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    formatted: {
      balance: formatCurrency(balance),
      reservedAmount: formatCurrency(reservedAmount),
      availableAmount: formatCurrency(availableAmount),
    },
  };
}

export const getWallet = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;

    const wallet = await prisma.wallet.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, balance: 0 },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        reservations: {
          where: { status: "ACTIVE" },
          orderBy: { createdAt: "desc" },
          include: {
            batch: {
              select: { id: true, title: true, status: true, endsAt: true },
            },
          },
        },
      },
    });

    const reservedAmount = wallet.reservations.reduce(
      (total, reservation) => total + formatDecimal(reservation.amount),
      0,
    );

    res.json({
      success: true,
      data: {
        ...serializeWallet(wallet, reservedAmount),
        reservations: wallet.reservations.map((reservation) => ({
          ...reservation,
          amount: formatDecimal(reservation.amount),
        })),
        recentTransactions: wallet.transactions.map((transaction) => ({
          ...transaction,
          amount: formatDecimal(transaction.amount),
        })),
      },
    });
  },
);

export const listTransactions = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { page = 1, limit = 20, type, startDate, endDate } = req.query;

    const {
      page: pageNum,
      limit: limitNum,
      skip,
    } = parsePaginationParams(page, limit);

    const wallet = await ensureWallet(user.id);

    const where: any = { walletId: wallet.id };
    if (type) where.type = type;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          settlement: {
            select: { id: true, receiptNumber: true, status: true },
          },
        },
      }),
      prisma.walletTransaction.count({ where }),
    ]);

    res.json({
      success: true,
      data: transactions.map((transaction) => ({
        ...transaction,
        amount: formatDecimal(transaction.amount),
      })),
      meta: buildPaginatedResponse(transactions, total, pageNum, limitNum).meta,
    });
  },
);

export const deposit = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const { amount, method, metadata } = req.body;

    const wallet = await ensureWallet(user.id);

    const [transaction, updatedWallet] = await prisma.$transaction([
      prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "DEPOSIT",
          amount,
          description: metadata
            ? `Deposit via ${method} (${JSON.stringify(metadata)})`
            : `Deposit via ${method}`,
        },
      }),
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      }),
    ]);

    const reservedAmount = await getReservedAmount(wallet.id);

    res.status(201).json({
      success: true,
      message: "Deposit successful",
      data: {
        transaction: {
          ...transaction,
          amount: formatDecimal(transaction.amount),
        },
        wallet: serializeWallet(updatedWallet, reservedAmount),
      },
    });
  },
);

export const withdraw = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const user = req.user!;
    const amount = Number(Number(req.body.amount).toFixed(2));
    const { method, destination } = req.body;

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new WalletError("Invalid withdrawal amount", "INVALID_AMOUNT");
    }

    const description = destination?.pixKey
      ? `Withdrawal via ${method} to ${destination.pixKey}`
      : `Withdrawal via ${method}`;

    await ensureWallet(user.id);

    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Wallet" WHERE "userId" = ${user.id} FOR UPDATE
      `;

      if (locked.length === 0) {
        throw new NotFoundError("Wallet");
      }

      const wallet = await tx.wallet.findUnique({
        where: { id: locked[0].id },
      });

      if (!wallet) {
        throw new NotFoundError("Wallet");
      }

      const reservations = await tx.walletReservation.findMany({
        where: { walletId: wallet.id, status: "ACTIVE" },
        select: { amount: true },
      });

      const reservedAmount = reservations.reduce(
        (total, reservation) => total + formatDecimal(reservation.amount),
        0,
      );

      const availableAmount =
        formatDecimal(wallet.balance) - reservedAmount;

      if (availableAmount < amount) {
        throw new WalletError(
          "Insufficient available balance",
          "INSUFFICIENT_FUNDS",
        );
      }

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "ADJUSTMENT",
          amount: -amount,
          description,
        },
      });

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });

      return { transaction, updatedWallet, reservedAmount };
    });

    res.status(201).json({
      success: true,
      message: "Withdrawal completed",
      data: {
        transaction: {
          ...result.transaction,
          amount: formatDecimal(result.transaction.amount),
        },
        wallet: serializeWallet(result.updatedWallet, result.reservedAmount),
      },
    });
  },
);

export const listAllWallets = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { page = 1, limit = 20 } = req.query;

    const {
      page: pageNum,
      limit: limitNum,
      skip,
    } = parsePaginationParams(page, limit);

    const [wallets, total] = await Promise.all([
      prisma.wallet.findMany({
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, email: true, name: true, role: true } },
          reservations: {
            where: { status: "ACTIVE" },
            select: { amount: true },
          },
          _count: { select: { transactions: true } },
        },
      }),
      prisma.wallet.count(),
    ]);

    res.json({
      success: true,
      data: wallets.map((wallet) => {
        const reservedAmount = wallet.reservations.reduce(
          (sum, reservation) => sum + formatDecimal(reservation.amount),
          0,
        );

        return {
          ...wallet,
          reservations: undefined,
          reservedAmount,
          availableAmount: formatDecimal(wallet.balance) - reservedAmount,
          balance: formatDecimal(wallet.balance),
        };
      }),
      meta: buildPaginatedResponse(wallets, total, pageNum, limitNum).meta,
    });
  },
);

export const getWalletByUserId = asyncHandler(
  async (req: RequestWithUser, res: Response) => {
    const { userId } = req.params;

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
        reservations: {
          where: { status: "ACTIVE" },
          include: {
            batch: { select: { id: true, title: true, endsAt: true } },
          },
        },
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!wallet) {
      throw new NotFoundError("Wallet");
    }

    const reservedAmount = wallet.reservations.reduce(
      (total, reservation) => total + formatDecimal(reservation.amount),
      0,
    );

    res.json({
      success: true,
      data: {
        ...wallet,
        ...serializeWallet(wallet, reservedAmount),
        reservations: wallet.reservations.map((reservation) => ({
          ...reservation,
          amount: formatDecimal(reservation.amount),
        })),
        transactions: wallet.transactions.map((transaction) => ({
          ...transaction,
          amount: formatDecimal(transaction.amount),
        })),
      },
    });
  },
);
