import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";

export const ANTI_SNIPING_WINDOW_MS = 2 * 60 * 1000;

export const ANTI_SNIPING_EXTENSION_MS = 2 * 60 * 1000;

export type Tx = Prisma.TransactionClient;

export async function getDatabaseNow(tx: Tx): Promise<Date> {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT now() as now`;
  const value = rows[0]?.now;

  if (!value) {
    throw new Error("Could not read the database clock");
  }

  return value instanceof Date ? value : new Date(value);
}

export async function getServerNow(): Promise<Date> {
  const rows = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT now() as now`;
  const value = rows[0]?.now;

  if (!value) {
    throw new Error("Could not read the database clock");
  }

  return value instanceof Date ? value : new Date(value);
}

export function shouldExtendBatch(endsAt: Date, now: Date): boolean {
  const remaining = endsAt.getTime() - now.getTime();
  return remaining > 0 && remaining <= ANTI_SNIPING_WINDOW_MS;
}

export function extendedEndsAt(endsAt: Date): Date {
  return new Date(endsAt.getTime() + ANTI_SNIPING_EXTENSION_MS);
}

export function isPastDeadline(endsAt: Date, now: Date): boolean {
  return now.getTime() >= endsAt.getTime();
}
