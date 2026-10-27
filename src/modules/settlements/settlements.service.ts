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
  batchId: string,
  reference: Date = new Date(),
): string {
  return `REC-${reference.getFullYear()}-${batchId.slice(-8).toUpperCase()}`;
}

export async function releaseBatchReservations(
  tx: Tx,
  batchId: string,
  keepWalletId?: string,
): Promise<number> {
  const result = await tx.walletReservation.updateMany({
    where: {
      batchId,
      status: "ACTIVE",
      ...(keepWalletId ? { walletId: { not: keepWalletId } } : {}),
    },
    data: { status: "RELEASED" },
  });

  return result.count;
}

export async function createSettlementForBatch(batchId: string) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({
      where: { id: batchId },
      include: {
        bids: {
          orderBy: { amount: "desc" },
          take: 1,
          include: { bidder: true },
        },
        settlement: true,
      },
    });

    if (!batch) {
      throw new NotFoundError("Batch");
    }

    if (batch.settlement) {
      return batch.settlement;
    }

    if (!["ACTIVE", "ENDED"].includes(batch.status)) {
      throw new SettlementError(
        "Batch is not ready to be settled",
        "BATCH_NOT_SETTLEABLE",
      );
    }

    const winningBid = batch.bids[0];

    if (!winningBid) {
      await tx.batch.update({
        where: { id: batch.id },
        data: { status: "ENDED" },
      });
      await releaseBatchReservations(tx, batch.id);
      return null;
    }

    await tx.batch.update({
      where: { id: batch.id },
      data: { status: "ENDED" },
    });

    const winnerWallet = await tx.wallet.findUnique({
      where: { userId: winningBid.bidderId },
    });
    await releaseBatchReservations(tx, batch.id, winnerWallet?.id);

    const receiptNumber = buildReceiptNumber(batch.id);

    const settlement = await tx.settlement.create({
      data: {
        batchId: batch.id,
        winningBidId: winningBid.id,
        buyerId: winningBid.bidderId,
        sellerId: batch.sellerId,
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
      include: { batch: true, winningBid: true },
    });

    if (!settlement) {
      throw new NotFoundError("Settlement");
    }

    if (!["ENDED", "SETTLED"].includes(settlement.batch.status)) {
      throw new SettlementError(
        "Batch is not finished yet",
        "BATCH_NOT_FINISHED",
      );
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
        batchId: settlement.batchId,
        status: "ACTIVE",
      },
      data: { status: "CONSUMED" },
    });

    await tx.batch.update({
      where: { id: settlement.batchId },
      data: { status: "SETTLED" },
    });

    return tx.settlement.update({
      where: { id: settlement.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
      include: {
        batch: true,
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
      where: { batchId: settlement.batchId, status: "ACTIVE" },
      data: { status: "RELEASED" },
    });

    return tx.settlement.update({
      where: { id: settlement.id },
      data: { status: "FAILED" },
    });
  });
}
