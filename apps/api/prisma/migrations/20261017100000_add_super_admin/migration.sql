-- AlterTable
ALTER TABLE `User` MODIFY `role` ENUM('USER', 'ADMIN', 'SUPER_ADMIN') NOT NULL DEFAULT 'USER';

-- AlterTable (actor roles on the event tables share the enum)
ALTER TABLE `BookingStatusEvent` MODIFY `actorRole` ENUM('USER', 'ADMIN', 'SUPER_ADMIN') NULL;
ALTER TABLE `PassStatusEvent` MODIFY `actorRole` ENUM('USER', 'ADMIN', 'SUPER_ADMIN') NULL;
ALTER TABLE `ComplaintStatusEvent` MODIFY `actorRole` ENUM('USER', 'ADMIN', 'SUPER_ADMIN') NULL;

-- CreateTable
CREATE TABLE `AdminAuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `actorEmail` VARCHAR(254) NOT NULL,
    `targetId` VARCHAR(191) NULL,
    `targetEmail` VARCHAR(254) NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminAuditEvent_createdAt_idx`(`createdAt`),
    INDEX `AdminAuditEvent_targetId_idx`(`targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
