-- CreateEnum
CREATE TYPE "DocumentRole" AS ENUM ('MAIN_AGREEMENT', 'EXHIBIT', 'REFERENCE');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "role" "DocumentRole" NOT NULL DEFAULT 'MAIN_AGREEMENT';
