import { prisma } from "../config/database";
import { auctionSocket } from "../sockets/auction.socket";
import { createSettlementForBatch } from "../modules/settlements/settlements.service";

export async function startScheduledBatchs(): Promise<void> {
  try {
    const now = new Date();

    const batchs = await prisma.batch.findMany({
      where: {
        status: "SCHEDULED",
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: { id: true },
    });

    if (batchs.length === 0) return;

    const result = await prisma.batch.updateMany({
      where: { id: { in: batchs.map((batch) => batch.id) } },
      data: { status: "ACTIVE" },
    });

    for (const batch of batchs) {
      const updated = await prisma.batch.findUnique({
        where: { id: batch.id },
      });
      if (updated) {
        auctionSocket.emitAuctionStatusChange(updated);
      }
    }

    console.log(`✅ Started ${result.count} scheduled batch(s)`);
  } catch (error) {
    console.error("❌ Error in startScheduledBatchs job:", error);
  }
}

export async function closeEndedBatchs(): Promise<void> {
  try {
    const now = new Date();

    const batchs = await prisma.batch.findMany({
      where: {
        status: "ACTIVE",
        endsAt: { lte: now },
      },
      select: { id: true },
    });

    if (batchs.length === 0) return;

    console.log(`🔍 Closing ${batchs.length} expired batch(s)...`);

    for (const batch of batchs) {
      try {
        const settlement = await createSettlementForBatch(batch.id);

        const updated = await prisma.batch.findUnique({
          where: { id: batch.id },
          include: {
            bids: {
              orderBy: { amount: "desc" },
              take: 1,
              include: { bidder: { select: { id: true, name: true } } },
            },
          },
        });

        if (updated) {
          auctionSocket.emitAuctionEnded(updated);
        }

        console.log(
          `✅ Batch ${batch.id} ended${settlement ? ` - settlement ${settlement.receiptNumber}` : " - no bids"}`,
        );
      } catch (error) {
        console.error(`❌ Failed to close batch ${batch.id}:`, error);
      }
    }
  } catch (error) {
    console.error("❌ Error in closeEndedBatchs job:", error);
  }
}

export async function updateBatchTimers(): Promise<void> {
  try {
    const now = Date.now();

    const batchs = await prisma.batch.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, endsAt: true },
    });

    for (const batch of batchs) {
      const timeRemaining = Math.max(0, new Date(batch.endsAt).getTime() - now);
      auctionSocket.emitAuctionTimer(batch.id, timeRemaining);
    }
  } catch (error) {
    console.error("❌ Error in updateBatchTimers job:", error);
  }
}

export async function runAuctionJobs(): Promise<void> {
  await startScheduledBatchs();
  await closeEndedBatchs();
  await updateBatchTimers();
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
