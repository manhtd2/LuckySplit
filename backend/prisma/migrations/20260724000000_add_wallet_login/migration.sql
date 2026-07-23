-- AlterTable
ALTER TABLE "Organizer" ADD COLUMN     "loginWalletAddress" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Organizer_loginWalletAddress_key" ON "Organizer"("loginWalletAddress");
