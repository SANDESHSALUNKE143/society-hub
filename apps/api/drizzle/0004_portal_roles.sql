-- Expand role enums for platform vs society staff (Manage vs Client Admin).
ALTER TABLE `user_roles` MODIFY COLUMN `role` ENUM(
  'superadmin',
  'chairperson',
  'admin',
  'secretary',
  'treasurer',
  'cashier',
  'committee',
  'resident',
  'tenant'
) NOT NULL;
--> statement-breakpoint
ALTER TABLE `invitations` MODIFY COLUMN `role` ENUM(
  'superadmin',
  'chairperson',
  'admin',
  'secretary',
  'treasurer',
  'cashier',
  'committee',
  'resident',
  'tenant'
) NOT NULL;
--> statement-breakpoint
-- Legacy society admin → chairperson
UPDATE `user_roles` SET `role` = 'chairperson' WHERE `role` = 'admin';
--> statement-breakpoint
UPDATE `invitations` SET `role` = 'chairperson' WHERE `role` = 'admin';
