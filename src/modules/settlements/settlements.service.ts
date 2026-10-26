import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { formatDecimal } from "../../shared/utils";
import {
  ConflictError,
  NotFoundError,
  SettlementError,
  WalletError,
} from "../../shared/errors";

type Tx = Prisma.TransactionClient;

export function buildReceiptNumber(
  lotId: string,
  reference: Date = new Date(),
): string {
  return `REC-${reference.getFullYear()}-${lotId.slice(-8).toUpperCase()}`;
}

export async function releaseLotReservations(
  tx: Tx,
  lotId: string,
  keepWalletId?: string,
): Promise<number> {
  const result = await tx.walletReservation.updateMany({
    where: {
      lotId,
      status: "ACTIVE",
      ...(keepWalletId ? { walletId: { not: keepWalletId } } : {}),
    },
    data: { status: "RELEASED" },
  });

  return result.count;
}

export async function createSettlementForLot(lotId: string) {
  return prisma.$transaction(async (tx) => {
    const lot = await tx.lot.findUnique({
      where: { id: lotId },
      include: {
        bids: {
          orderBy: { amount: "desc" },
          take: 1,
          include: { bidder: true },
        },
        settlement: true,
      },
    });

    if (!lot) {
      throw new NotFoundError("Lot");
    }

    if (lot.settlement) {
      return lot.settlement;
    }

    if (!["ACTIVE", "ENDED"].includes(lot.status)) {
      throw new SettlementError(
        "Lot is not ready to be settled",
        "LOT_NOT_SETTLEABLE",
      );
    }

    const winningBid = lot.bids[0];

    if (!winningBid) {
      await tx.lot.update({
        where: { id: lot.id },
        data: { status: "ENDED" },
      });
      await releaseLotReservations(tx, lot.id);
      return null;
    }

    await tx.lot.update({
      where: { id: lot.id },
      data: { status: "ENDED" },
    });

    const winnerWallet = await tx.wallet.findUnique({
      where: { userId: winningBid.bidderId },
    });
    await releaseLotReservations(tx, lot.id, winnerWallet?.id);

    const receiptNumber = buildReceiptNumber(lot.id);

    const settlement = await tx.settlement.create({
      data: {
        lotId: lot.id,
        winningBidId: winningBid.id,
        buyerId: winningBid.bidderId,
        sellerId: lot.sellerId,
        amount: winningBid.amount,
        receiptNumber,
        status: "PENDING",
      },
    });

    return settlement;
  });
}

export async function startSettlementProcessing(settlementId: string) {
  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
  });

  if (!settlement) {
    throw new NotFoundError("Settlement");
  }

  if (settlement.status !== "PENDING") {
    throw new SettlementError(
      "Settlement is not pending",
      "INVALID_SETTLEMENT_STATUS",
    );
  }

  return prisma.settlement.update({
    where: { id: settlementId },
    data: { status: "PROCESSING" },
  });
}

export async function completeSettlement(settlementId: string) {
  const current = await prisma.settlement.findUnique({
    where: { id: settlementId },
  });

  if (!current) {
    throw new NotFoundError("Settlement");
  }

  if (current.status === "COMPLETED") {
    throw new ConflictError("Settlement is already completed");
  }

  if (current.status === "FAILED") {
    throw new SettlementError("Settlement has failed", "SETTLEMENT_FAILED");
  }

  return prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.findUnique({
      where: { id: settlementId },
      include: { lot: true, winningBid: true },
    });

    if (!settlement) {
      throw new NotFoundError("Settlement");
    }

    if (!["ENDED", "SETTLED"].includes(settlement.lot.status)) {
      throw new SettlementError("Lot is not finished yet", "LOT_NOT_FINISHED");
    }

    const amount = formatDecimal(settlement.amount);

    const [buyerWallet, sellerWallet] = await Promise.all([
      tx.wallet.findUnique({ where: { userId: settlement.buyerId } }),
      tx.wallet.findUnique({ where: { userId: settlement.sellerId } }),
    ]);

    if (!buyerWallet) {
      throw new WalletError("Buyer wallet not found", "WALLET_NOT_FOUND");
    }

    if (!sellerWallet) {
      throw new WalletError("Seller wallet not found", "WALLET_NOT_FOUND");
    }

    if (formatDecimal(buyerWallet.balance) < amount) {
      throw new WalletError(
        "Buyer has insufficient balance to settle",
        "INSUFFICIENT_FUNDS",
      );
    }

    await tx.wallet.update({
      where: { id: buyerWallet.id },
      data: { balance: { decrement: amount } },
    });

    await tx.wallet.update({
      where: { id: sellerWallet.id },
      data: { balance: { increment: amount } },
    });

    await tx.walletTransaction.upsert({
      where: {
        settlementId_type: {
          settlementId: settlement.id,
          type: "BUYER_SETTLEMENT_DEBIT",
        },
      },
      update: { amount, walletId: buyerWallet.id },
      create: {
        settlementId: settlement.id,
        walletId: buyerWallet.id,
        type: "BUYER_SETTLEMENT_DEBIT",
        amount,
        description: `Settlement ${settlement.receiptNumber} debit`,
      },
    });

    await tx.walletTransaction.upsert({
      where: {
        settlementId_type: {
          settlementId: settlement.id,
          type: "SELLER_SETTLEMENT_CREDIT",
        },
      },
      update: { amount, walletId: sellerWallet.id },
      create: {
        settlementId: settlement.id,
        walletId: sellerWallet.id,
        type: "SELLER_SETTLEMENT_CREDIT",
        amount,
        description: `Settlement ${settlement.receiptNumber} credit`,
      },
    });

    await tx.walletReservation.updateMany({
      where: {
        walletId: buyerWallet.id,
        lotId: settlement.lotId,
        status: "ACTIVE",
      },
      data: { status: "CONSUMED" },
    });

    await tx.lot.update({
      where: { id: settlement.lotId },
      data: { status: "SETTLED" },
    });

    return tx.settlement.update({
      where: { id: settlement.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
      include: {
        lot: true,
        buyer: { select: { id: true, name: true, email: true } },
      },
    });
  });
}

export async function failSettlement(settlementId: string) {
  return prisma.$transaction(async (tx) => {
    const settlement = await tx.settlement.findUnique({
      where: { id: settlementId },
    });

    if (!settlement) {
      throw new NotFoundError("Settlement");
    }

    if (settlement.status === "COMPLETED") {
      throw new ConflictError("Completed settlements cannot fail");
    }

    await tx.walletReservation.updateMany({
      where: { lotId: settlement.lotId, status: "ACTIVE" },
      data: { status: "RELEASED" },
    });

    return tx.settlement.update({
      where: { id: settlement.id },
      data: { status: "FAILED" },
    });
  });
}
