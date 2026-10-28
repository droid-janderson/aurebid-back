import { Prisma } from "@prisma/client";
import { formatDecimal } from "../../shared/utils";

type Tx = Prisma.TransactionClient;

type ReservationRow = {
  id: string;
  walletId: string;
  batchId: string;
  bidId: string | null;
  amount: Prisma.Decimal | number | string;
};

async function appendEvent(
  tx: Tx,
  reservation: ReservationRow,
  type: "HELD" | "UPDATED" | "RELEASED" | "CONSUMED",
): Promise<void> {
  await tx.walletReservationEvent.createMany({
    data: [
      {
        reservationId: reservation.id,
        walletId: reservation.walletId,
        batchId: reservation.batchId,
        bidId: reservation.bidId,
        type,
        amount: reservation.amount,
      },
    ],
    skipDuplicates: true,
  });
}

export async function releaseOtherReservations(
  tx: Tx,
  batchId: string,
  keepWalletId?: string,
): Promise<number> {
  const reservations = await tx.walletReservation.findMany({
    where: {
      batchId,
      status: "ACTIVE",
      ...(keepWalletId ? { walletId: { not: keepWalletId } } : {}),
    },
    select: {
      id: true,
      walletId: true,
      batchId: true,
      bidId: true,
      amount: true,
    },
  });

  if (reservations.length === 0) return 0;

  await tx.walletReservation.updateMany({
    where: { id: { in: reservations.map((reservation) => reservation.id) } },
    data: { status: "RELEASED" },
  });

  for (const reservation of reservations) {
    await appendEvent(tx, reservation, "RELEASED");
  }

  return reservations.length;
}

export async function holdReservation(
  tx: Tx,
  input: {
    walletId: string;
    batchId: string;
    bidId: string;
    amount: number;
  },
): Promise<{ id: string; amount: Prisma.Decimal }> {
  const existing = await tx.walletReservation.findUnique({
    where: {
      walletId_batchId: { walletId: input.walletId, batchId: input.batchId },
    },
  });

  if (existing) {
    const updated = await tx.walletReservation.update({
      where: { id: existing.id },
      data: {
        bidId: input.bidId,
        amount: input.amount,
        status: "ACTIVE",
      },
      select: { id: true, amount: true },
    });

    await appendEvent(
      tx,
      { ...existing, bidId: input.bidId, amount: input.amount },
      existing.status === "ACTIVE" ? "UPDATED" : "HELD",
    );

    return updated;
  }

  const created = await tx.walletReservation.create({
    data: {
      walletId: input.walletId,
      batchId: input.batchId,
      bidId: input.bidId,
      amount: input.amount,
      status: "ACTIVE",
    },
    select: { id: true, amount: true },
  });

  await appendEvent(
    tx,
    {
      id: created.id,
      walletId: input.walletId,
      batchId: input.batchId,
      bidId: input.bidId,
      amount: input.amount,
    },
    "HELD",
  );

  return created;
}

export async function consumeReservation(
  tx: Tx,
  walletId: string,
  batchId: string,
): Promise<number> {
  const reservations = await tx.walletReservation.findMany({
    where: { walletId, batchId, status: "ACTIVE" },
    select: {
      id: true,
      walletId: true,
      batchId: true,
      bidId: true,
      amount: true,
    },
  });

  if (reservations.length === 0) return 0;

  await tx.walletReservation.updateMany({
    where: { id: { in: reservations.map((reservation) => reservation.id) } },
    data: { status: "CONSUMED" },
  });

  for (const reservation of reservations) {
    await appendEvent(tx, reservation, "CONSUMED");
  }

  return reservations.length;
}

export async function sumActiveReservations(
  tx: Tx,
  walletId: string,
  options: { excludeBatchId?: string } = {},
): Promise<number> {
  const reservations = await tx.walletReservation.findMany({
    where: {
      walletId,
      status: "ACTIVE",
      ...(options.excludeBatchId
        ? { batchId: { not: options.excludeBatchId } }
        : {}),
    },
    select: { amount: true },
  });

  return reservations.reduce(
    (total, reservation) => total + formatDecimal(reservation.amount),
    0,
  );
}
