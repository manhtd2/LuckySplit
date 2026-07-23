-- CreateEnum
CREATE TYPE "EventMode" AS ENUM ('RANDOM_SPLIT', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "EventState" AS ENUM ('OPEN', 'FUNDED', 'COMMITTED', 'DISTRIBUTING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TxKind" AS ENUM ('CREATE', 'FUND', 'COMMIT', 'REVEAL', 'DISTRIBUTE_BATCH', 'CANCEL', 'RETRY_REFUND');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "Organizer" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "creatorTokenHash" TEXT NOT NULL,
    "circleWalletId" TEXT,
    "circleWalletAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organizer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "contractEventId" INTEGER,
    "organizerId" TEXT NOT NULL,
    "mode" "EventMode" NOT NULL,
    "numWallets" INTEGER NOT NULL,
    "numWinners" INTEGER NOT NULL,
    "fixedAmountPerWinner" TEXT,
    "totalDeposit" TEXT,
    "state" "EventState" NOT NULL DEFAULT 'OPEN',
    "targetBlock" BIGINT,
    "commitSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fundedAt" TIMESTAMP(3),
    "committedAt" TIMESTAMP(3),
    "revealedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "amount" TEXT,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "blocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnchainTx" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "TxKind" NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockNumber" BIGINT,
    "status" "TxStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnchainTx_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organizer_creatorTokenHash_key" ON "Organizer"("creatorTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Organizer_circleWalletAddress_key" ON "Organizer"("circleWalletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Event_contractEventId_key" ON "Event"("contractEventId");

-- CreateIndex
CREATE INDEX "WalletEntry_eventId_idx" ON "WalletEntry"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_eventId_address_key" ON "WalletEntry"("eventId", "address");

-- CreateIndex
CREATE INDEX "OnchainTx_eventId_idx" ON "OnchainTx"("eventId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnchainTx" ADD CONSTRAINT "OnchainTx_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
