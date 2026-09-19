-- AlterTable
ALTER TABLE "session" ADD COLUMN     "isp" VARCHAR(50),
ADD COLUMN     "province" VARCHAR(20);

-- CreateIndex
CREATE INDEX "session_website_id_created_at_province_idx" ON "session"("website_id", "created_at", "province");

-- CreateIndex
CREATE INDEX "session_website_id_created_at_isp_idx" ON "session"("website_id", "created_at", "isp");
