ALTER TABLE `parking_slots` ADD `kind` enum('puzzle','open') NOT NULL DEFAULT 'open';
--> statement-breakpoint
ALTER TABLE `parking_slots` ADD `wing` varchar(32);
--> statement-breakpoint
ALTER TABLE `parking_slots` ADD `floor` int;
