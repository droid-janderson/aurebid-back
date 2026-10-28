-- CreateEnum
CREATE TYPE "ReservationEventType" AS ENUM ('HELD', 'UPDATED', 'RELEASED', 'CONSUMED');

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "batchEndsAt" TIMESTAMP(3),
ADD COLUMN     "batchImageUrl" TEXT,
ADD COLUMN     "batchTitle" TEXT,
ADD COLUMN     "buyerLabel" TEXT,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "sellerLabel" TEXT;

-- CreateTable
CREATE TABLE "WalletReservationEvent" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "bidId" TEXT,
    "type" "ReservationEventType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletReservationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WalletReservationEvent_batchId_createdAt_idx" ON "WalletReservationEvent"("batchId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletReservationEvent_walletId_createdAt_idx" ON "WalletReservationEvent"("walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletReservationEvent_bidId_type_key" ON "WalletReservationEvent"("bidId", "type");

-- CreateIndex
CREATE INDEX "Batch_status_deletedAt_endsAt_idx" ON "Batch"("status", "deletedAt", "endsAt");

-- CreateIndex
CREATE INDEX "Batch_deletedAt_idx" ON "Batch"("deletedAt");

-- AddForeignKey
ALTER TABLE "WalletReservationEvent" ADD CONSTRAINT "WalletReservationEvent_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "WalletReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletReservationEvent" ADD CONSTRAINT "WalletReservationEvent_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletReservationEvent" ADD CONSTRAINT "WalletReservationEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletReservationEvent" ADD CONSTRAINT "WalletReservationEvent_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

