import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";

export type TransactionClient = Prisma.TransactionClient;

export interface BidHashInput {
  previousHash: string | null;
  batchId: string;
  bidId: string;
  amount: string;
  createdAt: Date;
}

export function normalizeAmount(
  value: Prisma.Decimal | string | number,
): string {
  const numeric = typeof value === "object" ? value.toString() : String(value);
  return Number(numeric).toFixed(2);
}

export function computeBidHash(input: BidHashInput): string {
  const payload = [
    input.previousHash ?? "",
    input.batchId,
    input.bidId,
    input.amount,
    input.createdAt.toISOString(),
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

export async function appendBidAudit(
  tx: TransactionClient,
  bid: {
    id: string;
    batchId: string;
    amount: Prisma.Decimal | string | number;
    createdAt: Date;
  },
) {
  const lastEntry = await tx.bidAudit.findFirst({
    where: { batchId: bid.batchId },
    orderBy: { sequence: "desc" },
  });

  const sequence = (lastEntry?.sequence ?? 0) + 1;
  const previousHash = lastEntry?.currentHash ?? null;
  const amount = normalizeAmount(bid.amount);

  const currentHash = computeBidHash({
    previousHash,
    batchId: bid.batchId,
    bidId: bid.id,
    amount,
    createdAt: bid.createdAt,
  });

  return tx.bidAudit.create({
    data: {
      bidId: bid.id,
      batchId: bid.batchId,
      sequence,
      previousHash,
      currentHash,
      createdAt: bid.createdAt,
    },
  });
}

export interface AuditChainVerification {
  valid: boolean;
  entries: number;
  brokenAtSequence?: number;
  reason?: string;
}

export async function verifyBidAuditChain(
  batchId: string,
): Promise<AuditChainVerification> {
  const entries = await prisma.bidAudit.findMany({
    where: { batchId },
    orderBy: { sequence: "asc" },
    include: { bid: true },
  });

  let previousHash: string | null = null;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const expectedSequence = index + 1;

    if (entry.sequence !== expectedSequence) {
      return {
        valid: false,
        entries: entries.length,
        brokenAtSequence: entry.sequence,
        reason: `Expected sequence ${expectedSequence} but found ${entry.sequence}`,
      };
    }

    if ((entry.previousHash ?? null) !== previousHash) {
      return {
        valid: false,
        entries: entries.length,
        brokenAtSequence: entry.sequence,
        reason: "previousHash does not match the previous entry",
      };
    }

    const expectedHash = computeBidHash({
      previousHash,
      batchId,
      bidId: entry.bidId,
      amount: entry.bid ? normalizeAmount(entry.bid.amount) : "",
      createdAt: entry.createdAt,
    });

    if (expectedHash !== entry.currentHash) {
      return {
        valid: false,
        entries: entries.length,
        brokenAtSequence: entry.sequence,
        reason: "currentHash does not match the recomputed hash",
      };
    }

    previousHash = entry.currentHash;
  }

  return { valid: true, entries: entries.length };
}
