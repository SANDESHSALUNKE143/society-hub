ALTER TABLE `complaint_comments` ADD COLUMN `kind` ENUM('comment','question') NOT NULL DEFAULT 'comment';
