-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cycleStart" DATE,
ADD COLUMN     "initialExpiryDate" DATE,
ADD COLUMN     "validityDays" INTEGER NOT NULL DEFAULT 30;
