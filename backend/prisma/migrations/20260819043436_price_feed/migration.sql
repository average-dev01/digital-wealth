-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('manual', 'live');

-- AlterTable
ALTER TABLE "currencies" ADD COLUMN     "externalPriceId" TEXT,
ADD COLUMN     "iconUrl" TEXT,
ADD COLUMN     "priceChange24h" DECIMAL(10,4),
ADD COLUMN     "priceSource" "PriceSource" NOT NULL DEFAULT 'manual',
ADD COLUMN     "priceUpdatedAt" TIMESTAMP(3),
ALTER COLUMN "mockPriceUsd" SET DATA TYPE DECIMAL(24,12);

