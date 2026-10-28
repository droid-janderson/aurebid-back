import { prisma } from "../config/database";
import { env } from "../config/env";
import { formatDecimal } from "../shared/utils";
import { getServerNow } from "../shared/utils/clock";
import { auctionSocket } from "../sockets/auction.socket";
import { settleBatch } from "../modules/settlements/settlements.service";

const STUCK_SETTLEMENT_MS = 60 * 1000;

const MAX_TIMER_DELAY_MS = 60 * 60 * 1000;

let sweepTimer: NodeJS.Timeout | null = null;
let eventTimer: NodeJS.Timeout | null = null;
let running = false;

export async function startScheduledBatchs(
  now: Date = new Date(),
): Promise<number> {
  const batchs = await prisma.batch.findMany({
    where: {
      status: "SCHEDULED",
      deletedAt: null,
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    select: { id: true },
  });

  if (batchs.length === 0) return 0;

  await prisma.batch.updateMany({
    where: { id: { in: batchs.map((batch) => batch.id) } },
    data: { status: "ACTIVE" },
  });

  for (const batch of batchs) {
    const updated = await prisma.batch.findUnique({ where: { id: batch.id } });
    if (updated) {
      auctionSocket.emitAuctionStatusChange(updated);
    }
  }

  console.log(`✅ Started ${batchs.length} scheduled batch(s)`);
  return batchs.length;
}

export async function closeEndedBatchs(
  now: Date = new Date(),
): Promise<number> {
  const batchs = await prisma.batch.findMany({
    where: {
      deletedAt: null,
      endsAt: { lte: now },
      status: { in: ["ACTIVE", "SCHEDULED", "ENDED"] },
    },
    select: { id: true },
  });

  if (batchs.length === 0) return 0;

  console.log(`🔍 Closing ${batchs.length} expired batch(s)...`);

  let closed = 0;

  for (const batch of batchs) {
    try {
      const { outcome } = await settleBatch(batch.id);

      if (outcome === "SKIPPED") continue;

      const updated = await prisma.batch.findUnique({
        where: { id: batch.id },
        include: {
          bids: {
            orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
            take: 1,
            include: { bidder: { select: { id: true } } },
          },
        },
      });

      if (updated) {
        auctionSocket.emitAuctionEnded(updated);
      }

      closed += 1;
      console.log(`✅ Batch ${batch.id} ended (${outcome})`);
    } catch (error) {
      console.error(`❌ Failed to close batch ${batch.id}:`, error);
    }
  }

  return closed;
}

export async function retryStuckSettlements(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_SETTLEMENT_MS);

  const settlements = await prisma.settlement.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      updatedAt: { lte: cutoff },
      batch: { deletedAt: null },
    },
    select: { batchId: true },
    take: 25,
  });

  if (settlements.length === 0) return 0;

  let retried = 0;

  for (const settlement of settlements) {
    try {
      await settleBatch(settlement.batchId, { force: true });
      retried += 1;
    } catch (error) {
      console.error(
        `❌ Failed to retry settlement for batch ${settlement.batchId}:`,
        error,
      );
    }
  }

  return retried;
}

export async function updateBatchTimers(): Promise<void> {
  const now = Date.now();

  const batchs = await prisma.batch.findMany({
    where: { status: "ACTIVE", deletedAt: null },
    select: { id: true, endsAt: true },
  });

  for (const batch of batchs) {
    const timeRemaining = Math.max(0, batch.endsAt.getTime() - now);
    auctionSocket.emitAuctionTimer(batch.id, timeRemaining);
  }
}

export async function runAuctionJobs(): Promise<void> {
  const now = await getServerNow();

  await startScheduledBatchs(now);
  await closeEndedBatchs(now);
  await retryStuckSettlements();
  await updateBatchTimers();
}

async function msUntilNextEvent(): Promise<number | null> {
  const now = await getServerNow();

  const [nextStart, nextEnd] = await Promise.all([
    prisma.batch.findFirst({
      where: { status: "SCHEDULED", deletedAt: null, startsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true },
    }),
    prisma.batch.findFirst({
      where: {
        status: { in: ["ACTIVE", "SCHEDULED"] },
        deletedAt: null,
        endsAt: { gt: now },
      },
      orderBy: { endsAt: "asc" },
      select: { endsAt: true },
    }),
  ]);

  const candidates = [
    nextStart?.startsAt.getTime(),
    nextEnd?.endsAt.getTime(),
  ].filter((value): value is number => typeof value === "number");

  if (candidates.length === 0) return null;

  return Math.min(...candidates) - now.getTime();
}

function scheduleNextEvent(): void {
  if (!running) return;

  if (eventTimer) {
    clearTimeout(eventTimer);
    eventTimer = null;
  }

  void msUntilNextEvent()
    .then((delay) => {
      if (!running || delay === null) return;

      const wait = Math.min(Math.max(delay, 250), MAX_TIMER_DELAY_MS);

      eventTimer = setTimeout(() => {
        eventTimer = null;
        void runAuctionJobs().catch(console.error).finally(scheduleNextEvent);
      }, wait);
    })
    .catch((error) => {
      console.error("❌ Could not schedule the next auction event:", error);
    });
}

export async function startAuctionScheduler(): Promise<void> {
  if (running) return;
  running = true;

  await runAuctionJobs().catch(console.error);

  sweepTimer = setInterval(() => {
    void runAuctionJobs().catch(console.error).finally(scheduleNextEvent);
  }, env.auction.sweepIntervalMs);

  scheduleNextEvent();
  console.log(
    `⏱ Auction scheduler started (sweep ${env.auction.sweepIntervalMs}ms)`,
  );
}

export function stopAuctionScheduler(): void {
  running = false;

  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }

  if (eventTimer) {
    clearTimeout(eventTimer);
    eventTimer = null;
  }
}

if (require.main === module) {
  runAuctionJobs()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
