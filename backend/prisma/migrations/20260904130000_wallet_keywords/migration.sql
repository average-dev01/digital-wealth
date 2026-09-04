-- AlterTable
ALTER TABLE "users" DROP COLUMN "accountKeyword",
DROP COLUMN "accountKeywordReviewNote",
DROP COLUMN "accountKeywordReviewedAt",
DROP COLUMN "accountKeywordSetAt",
DROP COLUMN "accountKeywordStatus";

-- CreateTable
CREATE TABLE "wallet_keywords" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "walletName" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "status" "KeywordStatus" NOT NULL DEFAULT 'pending',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_keywords_userId_walletName_key" ON "wallet_keywords"("userId", "walletName");

-- AddForeignKey
ALTER TABLE "wallet_keywords" ADD CONSTRAINT "wallet_keywords_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

