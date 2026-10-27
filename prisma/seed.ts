import { createHash } from "node:crypto";
import {
  PrismaClient,
  UserRole,
  BatchStatus,
  ReservationStatus,
  WalletTransactionType,
  SettlementStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEED_NOW = new Date();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const hoursFromNow = (hours: number): Date =>
  new Date(SEED_NOW.getTime() + hours * HOUR);
const daysFromNow = (days: number): Date =>
  new Date(SEED_NOW.getTime() + days * DAY);

const DEPOSIT_DESCRIPTION = "Saldo inicial (seed)";

interface SeedBidInput {
  id: string;
  batchId: string;
  bidderId: string;
  amount: string;
  createdAt: Date;
  sequence: number;
  previousHash: string | null;
}

function hashBid(input: {
  previousHash: string | null;
  batchId: string;
  bidId: string;
  amount: string;
  createdAt: Date;
}): string {
  const payload = [
    input.previousHash ?? "",
    input.batchId,
    input.bidId,
    input.amount,
    input.createdAt.toISOString(),
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

async function seedBid(input: SeedBidInput): Promise<string> {
  const bid = await prisma.bid.upsert({
    where: { id: input.id },
    update: {
      batchId: input.batchId,
      bidderId: input.bidderId,
      amount: input.amount,
      createdAt: input.createdAt,
    },
    create: {
      id: input.id,
      batchId: input.batchId,
      bidderId: input.bidderId,
      amount: input.amount,
      createdAt: input.createdAt,
    },
  });

  const currentHash = hashBid({
    previousHash: input.previousHash,
    batchId: input.batchId,
    bidId: bid.id,
    amount: input.amount,
    createdAt: input.createdAt,
  });

  await prisma.bidAudit.upsert({
    where: { bidId: bid.id },
    update: {
      batchId: input.batchId,
      sequence: input.sequence,
      previousHash: input.previousHash,
      currentHash,
      createdAt: input.createdAt,
    },
    create: {
      bidId: bid.id,
      batchId: input.batchId,
      sequence: input.sequence,
      previousHash: input.previousHash,
      currentHash,
      createdAt: input.createdAt,
    },
  });

  return currentHash;
}

interface SeedWalletInput {
  userId: string;
  balance: string;
  initialDeposit: string;
}

async function seedWallet(input: SeedWalletInput) {
  const wallet = await prisma.wallet.upsert({
    where: { userId: input.userId },
    update: { balance: input.balance },
    create: { userId: input.userId, balance: input.balance },
  });

  const existingDeposit = await prisma.walletTransaction.findFirst({
    where: {
      walletId: wallet.id,
      type: WalletTransactionType.DEPOSIT,
      description: DEPOSIT_DESCRIPTION,
    },
  });

  if (!existingDeposit) {
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: WalletTransactionType.DEPOSIT,
        amount: input.initialDeposit,
        description: DEPOSIT_DESCRIPTION,
      },
    });
  }

  return wallet;
}

interface SeedReservationInput {
  walletId: string;
  batchId: string;
  bidId: string;
  amount: string;
  status: ReservationStatus;
}

async function seedReservation(input: SeedReservationInput) {
  return prisma.walletReservation.upsert({
    where: {
      walletId_batchId: {
        walletId: input.walletId,
        batchId: input.batchId,
      },
    },
    update: {
      bidId: input.bidId,
      amount: input.amount,
      status: input.status,
    },
    create: {
      walletId: input.walletId,
      batchId: input.batchId,
      bidId: input.bidId,
      amount: input.amount,
      status: input.status,
    },
  });
}

async function main() {
  console.log("🌱 Starting database seed...");

  const admin = await prisma.user.upsert({
    where: { email: "admin@aurebid.com" },
    update: {
      name: "Administrador do Sistema",
      role: UserRole.ADMIN,
      passwordHash: await bcrypt.hash("admin123", 12),
    },
    create: {
      name: "Administrador do Sistema",
      email: "admin@aurebid.com",
      passwordHash: await bcrypt.hash("admin123", 12),
      role: UserRole.ADMIN,
    },
  });

  const auctioneer = await prisma.user.upsert({
    where: { email: "auctioneer@aurebid.com" },
    update: {
      name: "João Leiloeiro",
      role: UserRole.AUCTIONEER,
      passwordHash: await bcrypt.hash("auctioneer123", 12),
    },
    create: {
      name: "João Leiloeiro",
      email: "auctioneer@aurebid.com",
      passwordHash: await bcrypt.hash("auctioneer123", 12),
      role: UserRole.AUCTIONEER,
    },
  });

  const bidder = await prisma.user.upsert({
    where: { email: "bidder@aurebid.com" },
    update: {
      name: "Maria Compradora",
      role: UserRole.BIDDER,
      passwordHash: await bcrypt.hash("bidder123", 12),
    },
    create: {
      name: "Maria Compradora",
      email: "bidder@aurebid.com",
      passwordHash: await bcrypt.hash("bidder123", 12),
      role: UserRole.BIDDER,
    },
  });

  const bidder2 = await prisma.user.upsert({
    where: { email: "bidder2@aurebid.com" },
    update: {
      name: "Carlos Licitante",
      role: UserRole.BIDDER,
      passwordHash: await bcrypt.hash("bidder123", 12),
    },
    create: {
      name: "Carlos Licitante",
      email: "bidder2@aurebid.com",
      passwordHash: await bcrypt.hash("bidder123", 12),
      role: UserRole.BIDDER,
    },
  });

  console.log(
    "✅ Users created:",
    [admin, auctioneer, bidder, bidder2].map((u) => u.email).join(", "),
  );

  const adminWallet = await seedWallet({
    userId: admin.id,
    balance: "10000.00",
    initialDeposit: "10000.00",
  });

  const auctioneerWallet = await seedWallet({
    userId: auctioneer.id,
    balance: "23500.00",
    initialDeposit: "10000.00",
  });

  const bidderWallet = await seedWallet({
    userId: bidder.id,
    balance: "50000.00",
    initialDeposit: "50000.00",
  });

  const bidder2Wallet = await seedWallet({
    userId: bidder2.id,
    balance: "26500.00",
    initialDeposit: "40000.00",
  });

  console.log(
    "✅ Wallets created:",
    [adminWallet.id, auctioneerWallet.id, bidderWallet.id, bidder2Wallet.id]
      .length,
    "wallet(s)",
  );

  const batch001 = await prisma.batch.upsert({
    where: { id: "batch-001" },
    update: {
      sellerId: auctioneer.id,
      title: "Óleo sobre tela - Paisagem Brasileira",
      description:
        "Belíssima pintura a óleo representando uma paisagem do interior do Brasil. Assinada pelo artista, moldura original em madeira nobre. Dimensões: 80x60cm.",
      imageUrl:
        "https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=800",
      productData: {
        artist: "Carlos Silva",
        year: 1985,
        technique: "Óleo sobre tela",
        dimensions: "80x60cm",
        frame: "Original em madeira nobre",
        signed: true,
        certificate: true,
      },
      startingPrice: "5000.00",
      minimumIncrement: "500.00",
      startsAt: daysFromNow(-1),
      endsAt: daysFromNow(1),
      status: BatchStatus.ACTIVE,
    },
    create: {
      id: "batch-001",
      sellerId: auctioneer.id,
      productSource: "MANUAL",
      externalProductId: "painting-001",
      title: "Óleo sobre tela - Paisagem Brasileira",
      description:
        "Belíssima pintura a óleo representando uma paisagem do interior do Brasil. Assinada pelo artista, moldura original em madeira nobre. Dimensões: 80x60cm.",
      imageUrl:
        "https://images.unsplash.com/photo-1578321272176-b7bbc0679853?w=800",
      productData: {
        artist: "Carlos Silva",
        year: 1985,
        technique: "Óleo sobre tela",
        dimensions: "80x60cm",
        frame: "Original em madeira nobre",
        signed: true,
        certificate: true,
      },
      startingPrice: "5000.00",
      minimumIncrement: "500.00",
      startsAt: daysFromNow(-1),
      endsAt: daysFromNow(1),
      status: BatchStatus.ACTIVE,
    },
  });

  const batch002 = await prisma.batch.upsert({
    where: { id: "batch-002" },
    update: {
      sellerId: auctioneer.id,
      title: "Rolex Submariner Date 116610LN",
      description:
        "Relógio Rolex Submariner Date em aço inoxidável, mostrador preto, cerâmica. Ano 2018, completo com caixa e documentos. Estado impecável.",
      imageUrl:
        "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=800",
      productData: {
        brand: "Rolex",
        model: "Submariner Date",
        reference: "116610LN",
        year: 2018,
        material: "Aço inoxidável",
        dial: "Preto",
        bezel: "Cerâmica preta",
        bracelet: "Oyster",
        box: true,
        papers: true,
      },
      startingPrice: "45000.00",
      minimumIncrement: "1000.00",
      startsAt: daysFromNow(1),
      endsAt: daysFromNow(7),
      status: BatchStatus.SCHEDULED,
    },
    create: {
      id: "batch-002",
      sellerId: auctioneer.id,
      productSource: "MANUAL",
      externalProductId: "watch-001",
      title: "Rolex Submariner Date 116610LN",
      description:
        "Relógio Rolex Submariner Date em aço inoxidável, mostrador preto, cerâmica. Ano 2018, completo com caixa e documentos. Estado impecável.",
      imageUrl:
        "https://images.unsplash.com/photo-1524592094714-0f0654e20314?w=800",
      productData: {
        brand: "Rolex",
        model: "Submariner Date",
        reference: "116610LN",
        year: 2018,
        material: "Aço inoxidável",
        dial: "Preto",
        bezel: "Cerâmica preta",
        bracelet: "Oyster",
        box: true,
        papers: true,
      },
      startingPrice: "45000.00",
      minimumIncrement: "1000.00",
      startsAt: daysFromNow(1),
      endsAt: daysFromNow(7),
      status: BatchStatus.SCHEDULED,
    },
  });

  const batch003 = await prisma.batch.upsert({
    where: { id: "batch-003" },
    update: {
      sellerId: auctioneer.id,
      title: "Ford Mustang 1967 Fastback",
      description:
        "Ford Mustang 1967 Fastback V8 390, restaurado completamente. Motor original, câmbio manual 4 marchas, cor Highland Green. Documentação em dia, placa preta.",
      imageUrl:
        "https://images.unsplash.com/photo-1584345604476-8ec5e12e42dd?w=800",
      productData: {
        brand: "Ford",
        model: "Mustang",
        year: 1967,
        bodyStyle: "Fastback",
        engine: "V8 390ci",
        transmission: "Manual 4 marchas",
        color: "Highland Green",
        mileage: "45.000 km (após restauração)",
        plate: "Preta (coleção)",
        restoration: "Completa em 2022",
      },
      startingPrice: "180000.00",
      minimumIncrement: "5000.00",
      startsAt: daysFromNow(7),
      endsAt: daysFromNow(10),
      status: BatchStatus.DRAFT,
    },
    create: {
      id: "batch-003",
      sellerId: auctioneer.id,
      productSource: "MANUAL",
      externalProductId: "car-001",
      title: "Ford Mustang 1967 Fastback",
      description:
        "Ford Mustang 1967 Fastback V8 390, restaurado completamente. Motor original, câmbio manual 4 marchas, cor Highland Green. Documentação em dia, placa preta.",
      imageUrl:
        "https://images.unsplash.com/photo-1584345604476-8ec5e12e42dd?w=800",
      productData: {
        brand: "Ford",
        model: "Mustang",
        year: 1967,
        bodyStyle: "Fastback",
        engine: "V8 390ci",
        transmission: "Manual 4 marchas",
        color: "Highland Green",
        mileage: "45.000 km (após restauração)",
        plate: "Preta (coleção)",
        restoration: "Completa em 2022",
      },
      startingPrice: "180000.00",
      minimumIncrement: "5000.00",
      startsAt: daysFromNow(7),
      endsAt: daysFromNow(10),
      status: BatchStatus.DRAFT,
    },
  });

  const batch004 = await prisma.batch.upsert({
    where: { id: "batch-004" },
    update: {
      sellerId: auctioneer.id,
      title: "Escultura em bronze - Figura Feminina",
      description:
        "Escultura em bronze patinado representando figura feminina, base em mármore. Peça única, assinada pelo escultor. Altura: 45cm.",
      imageUrl:
        "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800",
      productData: {
        artist: "Alfredo Ceschiatti",
        material: "Bronze patinado",
        height: "45cm",
        base: "Mármore",
        unique: true,
      },
      startingPrice: "12000.00",
      minimumIncrement: "500.00",
      startsAt: daysFromNow(-10),
      endsAt: daysFromNow(-3),
      status: BatchStatus.SETTLED,
    },
    create: {
      id: "batch-004",
      sellerId: auctioneer.id,
      productSource: "MANUAL",
      externalProductId: "sculpture-001",
      title: "Escultura em bronze - Figura Feminina",
      description:
        "Escultura em bronze patinado representando figura feminina, base em mármore. Peça única, assinada pelo escultor. Altura: 45cm.",
      imageUrl:
        "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=800",
      productData: {
        artist: "Alfredo Ceschiatti",
        material: "Bronze patinado",
        height: "45cm",
        base: "Mármore",
        unique: true,
      },
      startingPrice: "12000.00",
      minimumIncrement: "500.00",
      startsAt: daysFromNow(-10),
      endsAt: daysFromNow(-3),
      status: BatchStatus.SETTLED,
    },
  });

  console.log(
    "✅ Batchs created:",
    [batch001, batch002, batch003, batch004].map((l) => l.id).join(", "),
  );

  const batch001Hash1 = await seedBid({
    id: "bid-001",
    batchId: batch001.id,
    bidderId: bidder.id,
    amount: "5500.00",
    createdAt: hoursFromNow(-3),
    sequence: 1,
    previousHash: null,
  });

  const batch001Hash2 = await seedBid({
    id: "bid-002",
    batchId: batch001.id,
    bidderId: bidder2.id,
    amount: "6000.00",
    createdAt: hoursFromNow(-2),
    sequence: 2,
    previousHash: batch001Hash1,
  });

  const batch001Hash3 = await seedBid({
    id: "bid-003",
    batchId: batch001.id,
    bidderId: bidder.id,
    amount: "6500.00",
    createdAt: hoursFromNow(-1),
    sequence: 3,
    previousHash: batch001Hash2,
  });

  const batch004Hash1 = await seedBid({
    id: "bid-004",
    batchId: batch004.id,
    bidderId: bidder.id,
    amount: "12000.00",
    createdAt: daysFromNow(-5),
    sequence: 1,
    previousHash: null,
  });

  const batch004Hash2 = await seedBid({
    id: "bid-005",
    batchId: batch004.id,
    bidderId: bidder2.id,
    amount: "13500.00",
    createdAt: daysFromNow(-4),
    sequence: 2,
    previousHash: batch004Hash1,
  });

  void batch001Hash3;
  void batch004Hash2;

  console.log("✅ Bids + bid audit chain created");

  await seedReservation({
    walletId: bidderWallet.id,
    batchId: batch001.id,
    bidId: "bid-003",
    amount: "6500.00",
    status: ReservationStatus.ACTIVE,
  });

  await seedReservation({
    walletId: bidder2Wallet.id,
    batchId: batch001.id,
    bidId: "bid-002",
    amount: "6000.00",
    status: ReservationStatus.ACTIVE,
  });

  await seedReservation({
    walletId: bidderWallet.id,
    batchId: batch004.id,
    bidId: "bid-004",
    amount: "12000.00",
    status: ReservationStatus.RELEASED,
  });

  await seedReservation({
    walletId: bidder2Wallet.id,
    batchId: batch004.id,
    bidId: "bid-005",
    amount: "13500.00",
    status: ReservationStatus.CONSUMED,
  });

  console.log("✅ Wallet reservations created");

  const settlement = await prisma.settlement.upsert({
    where: { batchId: batch004.id },
    update: {
      winningBidId: "bid-005",
      buyerId: bidder2.id,
      sellerId: auctioneer.id,
      amount: "13500.00",
      receiptNumber: "REC-2026-0001",
      status: SettlementStatus.COMPLETED,
      completedAt: daysFromNow(-2),
    },
    create: {
      batchId: batch004.id,
      winningBidId: "bid-005",
      buyerId: bidder2.id,
      sellerId: auctioneer.id,
      amount: "13500.00",
      receiptNumber: "REC-2026-0001",
      status: SettlementStatus.COMPLETED,
      completedAt: daysFromNow(-2),
    },
  });

  await prisma.walletTransaction.upsert({
    where: {
      settlementId_type: {
        settlementId: settlement.id,
        type: WalletTransactionType.BUYER_SETTLEMENT_DEBIT,
      },
    },
    update: {
      walletId: bidder2Wallet.id,
      amount: "13500.00",
      description: `Débito do settlement ${settlement.receiptNumber}`,
    },
    create: {
      settlementId: settlement.id,
      walletId: bidder2Wallet.id,
      type: WalletTransactionType.BUYER_SETTLEMENT_DEBIT,
      amount: "13500.00",
      description: `Débito do settlement ${settlement.receiptNumber}`,
    },
  });

  await prisma.walletTransaction.upsert({
    where: {
      settlementId_type: {
        settlementId: settlement.id,
        type: WalletTransactionType.SELLER_SETTLEMENT_CREDIT,
      },
    },
    update: {
      walletId: auctioneerWallet.id,
      amount: "13500.00",
      description: `Crédito do settlement ${settlement.receiptNumber}`,
    },
    create: {
      settlementId: settlement.id,
      walletId: auctioneerWallet.id,
      type: WalletTransactionType.SELLER_SETTLEMENT_CREDIT,
      amount: "13500.00",
      description: `Crédito do settlement ${settlement.receiptNumber}`,
    },
  });

  console.log("✅ Settlement + wallet transactions created");

  console.log("\n🎉 Database seed completed successfully!");
  console.log("\n📋 Test credentials:");
  console.log("   Admin:       admin@aurebid.com       / admin123");
  console.log("   Leiloeiro:   auctioneer@aurebid.com  / auctioneer123");
  console.log("   Licitante:   bidder@aurebid.com      / bidder123");
  console.log("   Licitante 2: bidder2@aurebid.com     / bidder123");
  console.log("\n📦 Seeded data:");
  console.log("   batch-001  ACTIVE     (3 bids, 2 active reservations)");
  console.log("   batch-002  SCHEDULED");
  console.log("   batch-003  DRAFT");
  console.log("   batch-004  SETTLED    (2 bids, settlement REC-2026-0001)");
}

main()
  .catch((error) => {
    console.error("❌ Seed error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
