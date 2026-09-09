ALTER TABLE `flats` ADD `png_gas_connection` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE `resident_vehicles` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`kind` enum('two_wheeler','four_wheeler') NOT NULL,
	`registration_number` varchar(32) NOT NULL,
	`parking_purchased` boolean NOT NULL DEFAULT false,
	`parking_slot` varchar(32),
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`updated_by` char(36),
	`is_deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `resident_vehicles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `resident_vehicles_tenant_user_idx` ON `resident_vehicles` (`tenant_id`,`user_id`);
