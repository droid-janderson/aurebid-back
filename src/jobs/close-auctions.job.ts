import { prisma } from "../config/database";
import { auctionSocket } from "../sockets/auction.socket";
import { createSettlementForLot } from "../modules/settlements/settlements.service";

export async function startScheduledLots(): Promise<void> {
  try {
    const now = new Date();

    const lots = await prisma.lot.findMany({
      where: {
        status: "SCHEDULED",
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
      select: { id: true },
    });

    if (lots.length === 0) return;

    const result = await prisma.lot.updateMany({
      where: { id: { in: lots.map((lot) => lot.id) } },
      data: { status: "ACTIVE" },
    });

    for (const lot of lots) {
      const updated = await prisma.lot.findUnique({ where: { id: lot.id } });
      if (updated) {
        auctionSocket.emitAuctionStatusChange(updated);
      }
    }

    console.log(`✅ Started ${result.count} scheduled lot(s)`);
  } catch (error) {
    console.error("❌ Error in startScheduledLots job:", error);
  }
}

export async function closeEndedLots(): Promise<void> {
  try {
    const now = new Date();

    const lots = await prisma.lot.findMany({
      where: {
        status: "ACTIVE",
        endsAt: { lte: now },
      },
      select: { id: true },
    });

    if (lots.length === 0) return;

    console.log(`🔍 Closing ${lots.length} expired lot(s)...`);

    for (const lot of lots) {
      try {
        const settlement = await createSettlementForLot(lot.id);

        const updated = await prisma.lot.findUnique({
          where: { id: lot.id },
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
          `✅ Lot ${lot.id} ended${settlement ? ` - settlement ${settlement.receiptNumber}` : " - no bids"}`,
        );
      } catch (error) {
        console.error(`❌ Failed to close lot ${lot.id}:`, error);
      }
    }
  } catch (error) {
    console.error("❌ Error in closeEndedLots job:", error);
  }
}

export async function updateLotTimers(): Promise<void> {
  try {
    const now = Date.now();

    const lots = await prisma.lot.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, endsAt: true },
    });

    for (const lot of lots) {
      const timeRemaining = Math.max(0, new Date(lot.endsAt).getTime() - now);
      auctionSocket.emitAuctionTimer(lot.id, timeRemaining);
    }
  } catch (error) {
    console.error("❌ Error in updateLotTimers job:", error);
  }
}

export async function runAuctionJobs(): Promise<void> {
  await startScheduledLots();
  await closeEndedLots();
  await updateLotTimers();
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
