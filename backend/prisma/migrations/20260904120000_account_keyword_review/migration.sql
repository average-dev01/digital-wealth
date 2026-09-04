-- CreateEnum
CREATE TYPE "KeywordStatus" AS ENUM ('pending', 'approved', 'declined');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accountKeywordStatus" "KeywordStatus",
ADD COLUMN     "accountKeywordReviewNote" TEXT,
ADD COLUMN     "accountKeywordReviewedAt" TIMESTAMP(3);
