-- CreateTable
CREATE TABLE `BookingDailySequence` (
    `locationId` VARCHAR(191) NOT NULL,
    `dateStamp` VARCHAR(6) NOT NULL,
    `lastValue` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`locationId`, `dateStamp`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
