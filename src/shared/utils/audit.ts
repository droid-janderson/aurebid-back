import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';

/**
 * Prisma interactive transaction client.
 * All helpers below accept it so callers can append audit entries atomically
 * with the operation they are auditing.
 */
export type TransactionClient = Prisma.TransactionClient;

export interface BidHashInput {
  previousHash: string | null;
  lotId: string;
  bidId: string;
  amount: string;
  createdAt: Date;
}

/**
 * Canonical amount representation used by the audit chain.
 * Always two decimal places so the same value produces the same hash no
 * matter if it comes from a Prisma.Decimal, a number or a seed string.
 */
export function normalizeAmount(value: Prisma.Decimal | string | number): string {
  const numeric = typeof value === 'object' ? value.toString() : String(value);
  return Number(numeric).toFixed(2);
}

/**
 * Hash chain used by the BidAudit table:
 * sha256(previousHash | lotId | bidId | amount | createdAtISO)
 */
export function computeBidHash(input: BidHashInput): string {
  const payload = [
    input.previousHash ?? '',
    input.lotId,
    input.bidId,
    input.amount,
    input.createdAt.toISOString(),
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Append one entry to the audit chain of a lot.
 *
 * Must be called inside the same transaction that creates the bid, otherwise
 * a gap can be left in the chain when the bid creation rolls back.
 */
export async function appendBidAudit(
  tx: TransactionClient,
  bid: { id: string; lotId: string; amount: Prisma.Decimal | string | number; createdAt: Date }
) {
  const lastEntry = await tx.bidAudit.findFirst({
    where: { lotId: bid.lotId },
    orderBy: { sequence: 'desc' },
  });

  const sequence = (lastEntry?.sequence ?? 0) + 1;
  const previousHash = lastEntry?.currentHash ?? null;
  const amount = normalizeAmount(bid.amount);

  const currentHash = computeBidHash({
    previousHash,
    lotId: bid.lotId,
    bidId: bid.id,
    amount,
    createdAt: bid.createdAt,
  });

  return tx.bidAudit.create({
    data: {
      bidId: bid.id,
      lotId: bid.lotId,
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

/**
 * Recompute the whole audit chain of a lot and compare it with what is stored.
 */
export async function verifyBidAuditChain(lotId: string): Promise<AuditChainVerification> {
  const entries = await prisma.bidAudit.findMany({
    where: { lotId },
    orderBy: { sequence: 'asc' },
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
        reason: 'previousHash does not match the previous entry',
      };
    }

    const expectedHash = computeBidHash({
      previousHash,
      lotId,
      bidId: entry.bidId,
      amount: entry.bid ? normalizeAmount(entry.bid.amount) : '',
      createdAt: entry.createdAt,
    });

    if (expectedHash !== entry.currentHash) {
      return {
        valid: false,
        entries: entries.length,
        brokenAtSequence: entry.sequence,
        reason: 'currentHash does not match the recomputed hash',
      };
    }

    previousHash = entry.currentHash;
  }

  return { valid: true, entries: entries.length };
}
