-- Phase 1 — Society & Resident Management 2.0
-- `residents` becomes the membership + occupancy record (lifecycle, verification,
-- move-in/move-out history). Existing rows are preserved and back-filled as
-- active, approved memberships so nothing regresses.

-- 1. residents: lifecycle + occupancy columns ---------------------------------
ALTER TABLE `residents` ADD COLUMN `resident_type` ENUM('owner','tenant','family') NOT NULL DEFAULT 'owner';
--> statement-breakpoint
ALTER TABLE `residents` ADD COLUMN `is_primary` boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE `residents` ADD COLUMN `status` ENUM('invited','pending_verification','active','suspended','moved_out','rejected') NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE `residents` ADD COLUMN `verification_status` ENUM('pending','under_review','approved','rejected') NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `residents` ADD COLUMN `verified_by` char(36) NULL;
--> statement-breakpoint
ALTER TABLE `residents` ADD COLUMN `verified_at` datetime(3) NULL;
--> statement-breakpoint
ALTER TABLE `residents` ADD COLUMN `rejection_reason` varchar(500) NULL;
--> statement-breakpoint
ALTER TABLE `residents` ADD COLUMN `move_in_date` datetime(3) NULL;
--> statement-breakpoint
ALTER TABLE `residents` ADD COLUMN `move_out_date` datetime(3) NULL;
--> statement-breakpoint
ALTER TABLE `residents` ADD COLUMN `move_out_reason` varchar(200) NULL;
--> statement-breakpoint
ALTER TABLE `residents` ADD COLUMN `remarks` varchar(500) NULL;
--> statement-breakpoint
ALTER TABLE `residents` ADD COLUMN `active_key` char(1) NULL;
--> statement-breakpoint

-- Back-fill: pre-existing rows are live memberships that admins already trusted.
UPDATE `residents`
   SET `resident_type` = CASE WHEN `is_owner` = true THEN 'owner' ELSE 'tenant' END,
       `status` = 'active',
       `verification_status` = 'approved',
       `verified_at` = `created_at`,
       `move_in_date` = `created_at`,
       `active_key` = 'Y'
 WHERE `is_deleted` = false;
--> statement-breakpoint
UPDATE `residents`
   SET `resident_type` = CASE WHEN `is_owner` = true THEN 'owner' ELSE 'tenant' END,
       `status` = 'moved_out',
       `active_key` = NULL
 WHERE `is_deleted` = true;
--> statement-breakpoint

-- 2. residents: swap one-flat-per-user for one-ACTIVE-membership-per-flat -----
-- MySQL permits repeated NULLs in a unique index, so historical (moved out)
-- rows are unconstrained while at most one active row exists per user+flat.
DROP INDEX `residents_tenant_user_uidx` ON `residents`;
--> statement-breakpoint
CREATE UNIQUE INDEX `residents_tenant_user_flat_active_uidx` ON `residents` (`tenant_id`,`user_id`,`flat_id`,`active_key`);
--> statement-breakpoint
CREATE INDEX `residents_tenant_user_idx` ON `residents` (`tenant_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `residents_tenant_flat_active_idx` ON `residents` (`tenant_id`,`flat_id`,`active_key`);
--> statement-breakpoint
CREATE INDEX `residents_tenant_status_idx` ON `residents` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE INDEX `residents_tenant_verification_idx` ON `residents` (`tenant_id`,`verification_status`);
--> statement-breakpoint

-- 3. resident_family_members (new) -------------------------------------------
CREATE TABLE `resident_family_members` (
  `id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `resident_id` char(36) NOT NULL,
  `name` varchar(120) NOT NULL,
  `relationship` ENUM('spouse','child','parent','sibling','other') NOT NULL DEFAULT 'other',
  `phone` varchar(20),
  `email` varchar(200),
  `linked_user_id` char(36),
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_by` char(36),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `updated_by` char(36),
  `is_deleted` boolean NOT NULL DEFAULT false,
  CONSTRAINT `resident_family_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `resident_family_tenant_idx` ON `resident_family_members` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `resident_family_resident_idx` ON `resident_family_members` (`tenant_id`,`resident_id`);
--> statement-breakpoint

-- 4. verification_documents: type + verification workflow ---------------------
ALTER TABLE `verification_documents` ADD COLUMN `doc_type` ENUM('identity','address_proof','tenant_agreement','police_verification','other') NOT NULL DEFAULT 'other';
--> statement-breakpoint
ALTER TABLE `verification_documents` ADD COLUMN `document_number` varchar(64) NULL;
--> statement-breakpoint
ALTER TABLE `verification_documents` ADD COLUMN `byte_size` int NULL;
--> statement-breakpoint
ALTER TABLE `verification_documents` ADD COLUMN `status` ENUM('pending','under_review','approved','rejected') NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `verification_documents` ADD COLUMN `uploaded_by_user_id` char(36) NULL;
--> statement-breakpoint
ALTER TABLE `verification_documents` ADD COLUMN `verified_by` char(36) NULL;
--> statement-breakpoint
ALTER TABLE `verification_documents` ADD COLUMN `verified_at` datetime(3) NULL;
--> statement-breakpoint
ALTER TABLE `verification_documents` ADD COLUMN `rejection_reason` varchar(500) NULL;
--> statement-breakpoint
ALTER TABLE `verification_documents` ADD COLUMN `expires_at` datetime(3) NULL;
--> statement-breakpoint
CREATE INDEX `verification_documents_tenant_resident_idx` ON `verification_documents` (`tenant_id`,`resident_id`);
--> statement-breakpoint
CREATE INDEX `verification_documents_tenant_status_idx` ON `verification_documents` (`tenant_id`,`status`);
--> statement-breakpoint

-- 5. resident_profiles: structured emergency contact + channel prefs ----------
ALTER TABLE `resident_profiles` ADD COLUMN `emergency_contact_name` varchar(120) NULL;
--> statement-breakpoint
ALTER TABLE `resident_profiles` ADD COLUMN `emergency_contact_relation` varchar(40) NULL;
--> statement-breakpoint
ALTER TABLE `resident_profiles` ADD COLUMN `emergency_contact_phone` varchar(20) NULL;
--> statement-breakpoint
ALTER TABLE `resident_profiles` ADD COLUMN `communication_prefs_json` text NULL;
--> statement-breakpoint

-- 6. invitations: expiry, accept, resend, duplicate prevention ----------------
ALTER TABLE `invitations` MODIFY COLUMN `status` ENUM('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `invitations` ADD COLUMN `name` varchar(120) NULL;
--> statement-breakpoint
ALTER TABLE `invitations` ADD COLUMN `flat_id` char(36) NULL;
--> statement-breakpoint
ALTER TABLE `invitations` ADD COLUMN `resident_type` ENUM('owner','tenant','family') NULL;
--> statement-breakpoint
ALTER TABLE `invitations` ADD COLUMN `expires_at` datetime(3) NULL;
--> statement-breakpoint
ALTER TABLE `invitations` ADD COLUMN `accepted_at` datetime(3) NULL;
--> statement-breakpoint
ALTER TABLE `invitations` ADD COLUMN `accepted_by_user_id` char(36) NULL;
--> statement-breakpoint
ALTER TABLE `invitations` ADD COLUMN `revoked_at` datetime(3) NULL;
--> statement-breakpoint
ALTER TABLE `invitations` ADD COLUMN `last_sent_at` datetime(3) NULL;
--> statement-breakpoint
ALTER TABLE `invitations` ADD COLUMN `resend_count` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `invitations` ADD COLUMN `active_key` varchar(240) NULL;
--> statement-breakpoint

-- Existing pending invites: give them an expiry and an active key. Duplicates
-- among historical rows are collapsed by keeping only the newest one pending.
UPDATE `invitations`
   SET `expires_at` = DATE_ADD(`created_at`, INTERVAL 14 DAY),
       `last_sent_at` = `created_at`
 WHERE `expires_at` IS NULL;
--> statement-breakpoint
UPDATE `invitations` SET `status` = 'expired'
 WHERE `status` = 'pending' AND `expires_at` < CURRENT_TIMESTAMP(3);
--> statement-breakpoint
UPDATE `invitations` i
  JOIN (
    SELECT `tenant_id`,
           LOWER(CONCAT(COALESCE(`email`,''),'|',COALESCE(`phone`,''),'|',`role`)) AS k,
           MAX(`created_at`) AS newest
      FROM `invitations`
     WHERE `status` = 'pending' AND `is_deleted` = false
     GROUP BY `tenant_id`, k
  ) newest_pending
    ON newest_pending.`tenant_id` = i.`tenant_id`
   AND newest_pending.k = LOWER(CONCAT(COALESCE(i.`email`,''),'|',COALESCE(i.`phone`,''),'|',i.`role`))
   AND newest_pending.newest > i.`created_at`
   SET i.`status` = 'expired'
 WHERE i.`status` = 'pending' AND i.`is_deleted` = false;
--> statement-breakpoint
UPDATE `invitations`
   SET `active_key` = LOWER(CONCAT(COALESCE(`email`,''),'|',COALESCE(`phone`,''),'|',`role`))
 WHERE `status` = 'pending' AND `is_deleted` = false;
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_tenant_active_uidx` ON `invitations` (`tenant_id`,`active_key`);
--> statement-breakpoint
CREATE INDEX `invitations_tenant_status_idx` ON `invitations` (`tenant_id`,`status`);
