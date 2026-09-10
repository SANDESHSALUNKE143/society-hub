ALTER TABLE `societies` ADD `upi_id` varchar(80);
--> statement-breakpoint
ALTER TABLE `societies` ADD `account_name` varchar(120);
--> statement-breakpoint
ALTER TABLE `societies` ADD `account_number` varchar(40);
--> statement-breakpoint
ALTER TABLE `societies` ADD `ifsc` varchar(20);
--> statement-breakpoint
ALTER TABLE `societies` ADD `qr_blob_path` varchar(500);
--> statement-breakpoint
ALTER TABLE `societies` ADD `qr_content_type` varchar(120);
--> statement-breakpoint
ALTER TABLE `payments` ADD `proof_blob_path` varchar(500);
--> statement-breakpoint
ALTER TABLE `payments` ADD `proof_content_type` varchar(120);
--> statement-breakpoint
ALTER TABLE `payments` ADD `review_note` varchar(500);
--> statement-breakpoint
ALTER TABLE `payments` MODIFY `method` enum('razorpay','cash','cheque','neft','upi') NOT NULL;
