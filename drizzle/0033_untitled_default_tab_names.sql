-- The editor now numbers pages by position, so a stored default name such as
-- "Page 3" or "Tab 3" would show as "2 Page 3" and disagree with its number.
-- Default-named tabs become "Untitled", then "Untitled 2" and up within a
-- project, in panel order. Names the user typed are left alone.
UPDATE "project_tabs" AS t
SET "name" = CASE WHEN r.n = 1 THEN 'Untitled' ELSE 'Untitled ' || r.n END
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "project_id" ORDER BY "sort_order", "created_at") AS n
  FROM "project_tabs"
  WHERE "name" ~* '^(page|tab) [0-9]+$'
) AS r
WHERE t."id" = r."id";
