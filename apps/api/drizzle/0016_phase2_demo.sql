ALTER TABLE `societies` ADD `status` enum('active','suspended') NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE `societies` ADD `feature_flags_json` text;
--> statement-breakpoint
ALTER TABLE `societies` ADD `plan_id` char(36);
--> statement-breakpoint
ALTER TABLE `assets` ADD `next_service_at` datetime(3);
--> statement-breakpoint
ALTER TABLE `events` ADD `capacity` int;
--> statement-breakpoint
CREATE TABLE `event_rsvps` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`event_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`updated_by` char(36),
	`is_deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `event_rsvps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `event_rsvps_tenant_idx` ON `event_rsvps` (`tenant_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_rsvps_event_user_uidx` ON `event_rsvps` (`event_id`,`user_id`);
--> statement-breakpoint
CREATE TABLE `platform_plans` (
	`id` char(36) NOT NULL,
	`code` varchar(40) NOT NULL,
	`name` varchar(120) NOT NULL,
	`monthly_fee_paise` int NOT NULL DEFAULT 0,
	`modules_json` text,
	`flat_hint` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`updated_by` char(36),
	`is_deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `platform_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_subscriptions` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`plan_id` char(36) NOT NULL,
	`cycle` enum('monthly','yearly') NOT NULL DEFAULT 'monthly',
	`status` enum('active','cancelled','expired') NOT NULL DEFAULT 'active',
	`starts_at` datetime(3) NOT NULL,
	`ends_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`updated_by` char(36),
	`is_deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `platform_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `platform_subscriptions_tenant_idx` ON `platform_subscriptions` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE `platform_discounts` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36),
	`subscription_id` char(36),
	`code` varchar(40),
	`percent_off` int,
	`flat_off_paise` int,
	`starts_at` datetime(3),
	`ends_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`updated_by` char(36),
	`is_deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `platform_discounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `platform_discounts_tenant_idx` ON `platform_discounts` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE `platform_bills` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`subscription_id` char(36),
	`period_ym` varchar(7) NOT NULL,
	`amount_paise` int NOT NULL,
	`status` enum('issued','paid','void') NOT NULL DEFAULT 'issued',
	`notes` text,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`updated_by` char(36),
	`is_deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `platform_bills_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `platform_bills_tenant_idx` ON `platform_bills` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE `platform_payments` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`bill_id` char(36) NOT NULL,
	`amount_paise` int NOT NULL,
	`method` varchar(40) NOT NULL DEFAULT 'offline',
	`status` enum('success','failed') NOT NULL DEFAULT 'success',
	`receipt_number` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`updated_by` char(36),
	`is_deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `platform_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `platform_payments_tenant_idx` ON `platform_payments` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE `platform_announcements` (
	`id` char(36) NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`audience` enum('all','tenants') NOT NULL DEFAULT 'all',
	`tenant_ids_json` text,
	`published_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`updated_by` char(36),
	`is_deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `platform_announcements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`opened_by_user_id` char(36) NOT NULL,
	`subject` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`reply` text,
	`closed_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`updated_by` char(36),
	`is_deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `support_tickets_tenant_idx` ON `support_tickets` (`tenant_id`);
