-- Поля загрузки сканов. IF NOT EXISTS: часть колонок (ключи STL) могла быть
-- добавлена через `prisma db push` локально — миграция должна быть безопасной.
ALTER TABLE "FootScan" ADD COLUMN IF NOT EXISTS "rightStlKey" TEXT;
ALTER TABLE "FootScan" ADD COLUMN IF NOT EXISTS "leftStlKey" TEXT;
ALTER TABLE "FootScan" ADD COLUMN IF NOT EXISTS "rawDataKey" TEXT;
ALTER TABLE "FootScan" ADD COLUMN IF NOT EXISTS "stlUploadedAt" TIMESTAMP(3);
ALTER TABLE "FootScan" ADD COLUMN IF NOT EXISTS "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "FootScan" ADD COLUMN IF NOT EXISTS "archHeightMm" DOUBLE PRECISION;
ALTER TABLE "FootScan" ADD COLUMN IF NOT EXISTS "measurements" JSONB;
