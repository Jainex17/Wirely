ALTER TABLE "project_versions"
  DROP COLUMN IF EXISTS "quality_score",
  DROP COLUMN IF EXISTS "violation_count";
