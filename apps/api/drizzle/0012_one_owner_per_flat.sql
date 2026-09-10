ALTER TABLE `residents` MODIFY `is_owner` tinyint(1) NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `residents` AS r
INNER JOIN (
  SELECT `id` FROM (
    SELECT `id`,
      ROW_NUMBER() OVER (
        PARTITION BY `tenant_id`, `flat_id`
        ORDER BY `created_at` ASC, `id` ASC
      ) AS rn
    FROM `residents`
    WHERE `is_deleted` = 0 AND `is_owner` = 1
  ) ranked
  WHERE ranked.rn > 1
) extra ON extra.`id` = r.`id`
SET r.`is_owner` = 0;
