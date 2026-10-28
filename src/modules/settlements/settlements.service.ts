import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { formatDecimal } from "../../shared/utils";
import { getDatabaseNow, isPastDeadline } from "../../shared/utils/clock";
import { publicActorLabel } from "../../shared/utils/privacy";
import {
  ConflictError,
  NotFoundError,
  SettlementError,
  WalletError,
} from "../../shared/errors";
import {
  consumeReservation,
  releaseOtherReservations,
} from "../wallets/reservations.service";

type Tx = Prisma.TransactionClient;

export function buildReceiptNumber(
  batchId: string,
  reference: Date = new Date(),
): string {
  return `REC-${reference.getFullYear()}-${batchId.slice(-8).toUpperCase()}`;
}

async function lockWallet(tx: Tx, walletId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
}

export async function releaseBatchReservations(
  tx: Tx,
  batchId: string,
  keepWalletId?: string,
): Promise<number> {
  return releaseOtherReservations(tx, batchId, keepWalletId);
}

type SettleResult = {
  settlement: Prisma.SettlementGetPayload<object> | null;
  outcome: "SETTLED" | "ENDED_WITHOUT_BIDS" | "SKIPPED";
};

export async function settleBatch(
  batchId: string,
  options: { force?: boolean } = {},
): Promise<SettleResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Batch" WHERE id = ${batchId} FOR UPDATE
      `;

      if (locked.length === 0) {
        throw new NotFoundError("Batch");
      }

      const batch = await tx.batch.findUnique({
        where: { id: batchId },
        include: {
          bids: {
            orderBy: [{ amount: "desc" }, { createdAt: "asc" }, { id: "asc" }],
            take: 1,
            include: { bidder: { select: { id: true } } },
          },
          settlement: true,
        },
      });

      if (!batch || batch.deletedAt) {
        throw new NotFoundError("Batch");
      }

      const now = await getDatabaseNow(tx);

      if (batch.status === "CANCELLED" || batch.status === "DRAFT") {
        throw new SettlementError(
          "Batch is not ready to be settled",
          "BATCH_NOT_SETTLEABLE",
        );
      }

      if (
        !options.force &&
        batch.status !== "ENDED" &&
        !isPastDeadline(batch.endsAt, now)
      ) {
        return { settlement: batch.settlement, outcome: "SKIPPED" as const };
      }

      const winningBid = batch.bids[0];

      if (!winningBid) {
        await tx.batch.update({
          where: { id: batch.id },
          data: { status: "ENDED" },
        });
        await releaseOtherReservations(tx, batch.id);
        return { settlement: null, outcome: "ENDED_WITHOUT_BIDS" as const };
      }

      if (batch.settlement?.status === "COMPLETED") {
        return {
          settlement: batch.settlement,
          outcome: "SETTLED" as const,
        };
      }

      const buyerLabel = publicActorLabel(
        batch.id,
        winningBid.bidderId,
        "buyer",
      );
      const sellerLabel = publicActorLabel(batch.id, batch.sellerId, "seller");

      const settlement =
        batch.settlement ??
        (await tx.settlement.create({
          data: {
            batchId: batch.id,
            winningBidId: winningBid.id,
            buyerId: winningBid.bidderId,
            sellerId: batch.sellerId,
            amount: winningBid.amount,
            receiptNumber: buildReceiptNumber(batch.id, now),
            status: "PENDING",
            batchTitle: batch.title,
            batchImageUrl: batch.imageUrl,
            batchEndsAt: batch.endsAt,
            buyerLabel,
            sellerLabel,
          },
        }));

      const attempts = settlement.attempts + 1;

      if (settlement.attempts >= env.settlement.maxAttempts) {
        return { settlement, outcome: "SKIPPED" as const };
      }

      const claim = await tx.settlement.updateMany({
        where: {
          id: settlement.id,
          status: { in: ["PENDING", "PROCESSING", "FAILED"] },
        },
        data: { status: "PROCESSING", attempts },
      });

      if (claim.count === 0) {
        const current = await tx.settlement.findUnique({
          where: { id: settlement.id },
        });

        if (current?.status === "COMPLETED") {
          return { settlement: current, outcome: "SETTLED" as const };
        }

        return { settlement: current, outcome: "SKIPPED" as const };
      }

      const amount = formatDecimal(settlement.amount);

      const wallets = await tx.wallet.findMany({
        where: { userId: { in: [settlement.buyerId, settlement.sellerId] } },
      });

      const buyerWallet = wallets.find(
        (wallet) => wallet.userId === settlement.buyerId,
      );
      const sellerWallet = wallets.find(
        (wallet) => wallet.userId === settlement.sellerId,
      );

      if (!buyerWallet) {
        throw new WalletError("Buyer wallet not found", "WALLET_NOT_FOUND");
      }

      if (!sellerWallet) {
        throw new WalletError("Seller wallet not found", "WALLET_NOT_FOUND");
      }

      for (const walletId of [buyerWallet.id, sellerWallet.id].sort()) {
        await lockWallet(tx, walletId);
      }

      const debited = await tx.wallet.updateMany({
        where: {
          id: buyerWallet.id,
          balance: { gte: new Prisma.Decimal(amount.toFixed(2)) },
        },
        data: { balance: { decrement: amount } },
      });

      if (debited.count !== 1) {
        throw new WalletError(
          "Buyer has insufficient balance to settle",
          "INSUFFICIENT_FUNDS",
        );
      }

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

      await consumeReservation(tx, buyerWallet.id, settlement.batchId);
      await releaseOtherReservations(tx, settlement.batchId, buyerWallet.id);

      await tx.batch.update({
        where: { id: settlement.batchId },
        data: { status: "SETTLED" },
      });

      const completed = await tx.settlement.update({
        where: { id: settlement.id },
        data: {
          status: "COMPLETED",
          completedAt: now,
          failureReason: null,
        },
        include: {
          batch: true,
          buyer: { select: { id: true, name: true, email: true } },
        },
      });

      return { settlement: completed, outcome: "SETTLED" as const };
    });
  } catch (error) {
    await recordSettlementFailure(batchId, error);
    throw error;
  }
}

async function recordSettlementFailure(
  batchId: string,
  error: unknown,
): Promise<void> {
  if (
    error instanceof NotFoundError ||
    (error instanceof SettlementError &&
      error.code === "BATCH_NOT_SETTLEABLE")
  ) {
    return;
  }

  const reason =
    error instanceof Error ? error.message : "Unknown settlement failure";

  try {
    await prisma.$transaction(async (tx) => {
      const settlement = await tx.settlement.findUnique({
        where: { batchId },
      });

      if (!settlement || settlement.status === "COMPLETED") return;

      const attempts = settlement.attempts + 1;
      const exhausted = attempts >= env.settlement.maxAttempts;

      await tx.settlement.update({
        where: { id: settlement.id },
        data: {
          attempts,
          failureReason: reason.slice(0, 500),
          status: exhausted ? "FAILED" : "PENDING",
        },
      });
    });
  } catch (recordError) {
    console.error("Could not record settlement failure:", recordError);
  }
}

export async function createSettlementForBatch(
  batchId: string,
  options: { force?: boolean } = {},
) {
  const { settlement } = await settleBatch(batchId, options);
  return settlement;
}

export async function startSettlementProcessing(settlementId: string) {
  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
  });

  if (!settlement) {
    throw new NotFoundError("Settlement");
  }

  if (settlement.status === "COMPLETED") {
    return settlement;
  }

  if (settlement.status === "FAILED") {
    throw new SettlementError("Settlement has failed", "SETTLEMENT_FAILED");
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
    return current;
  }

  const { settlement } = await settleBatch(current.batchId, { force: true });

  if (!settlement) {
    throw new SettlementError(
      "Settlement could not be completed",
      "SETTLEMENT_ERROR",
    );
  }

  return settlement;
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

    return tx.settlement.update({
      where: { id: settlement.id },
      data: {
        status: "FAILED",
        failureReason:
          settlement.failureReason ?? "Marked as failed by an operator",
      },
    });
  });
}
