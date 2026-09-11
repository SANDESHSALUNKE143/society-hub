CREATE TABLE `notice_attachments` (
	`id` char(36) NOT NULL,
	`tenant_id` char(36) NOT NULL,
	`notice_id` char(36) NOT NULL,
	`content_kind` enum('image','video') NOT NULL,
	`content_type` varchar(120) NOT NULL,
	`blob_path` varchar(500) NOT NULL,
	`byte_size` int NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	`updated_by` char(36),
	`is_deleted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `notice_attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `notice_attachments_notice_idx` ON `notice_attachments` (`notice_id`);
