-- Make the users.email column nullable. Empty emails are now stored as NULL
-- so that multiple users without an email do not collide on the unique index.
--
-- SQLite cannot drop a NOT NULL constraint in place, so the table is rebuilt
-- (Prisma "RedefineTables" style, preserving all data and foreign keys).
-- owner_user_id is included for fresh databases that only ran the official
-- migrations (it already exists on live databases and is carried over as-is).
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "resetCode" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" DATETIME
);
INSERT INTO "new_users" ("user_id", "username", "email", "password", "owner_user_id", "resetCode", "created_at", "last_login")
SELECT "user_id", "username", "email", "password", "owner_user_id", "resetCode", "created_at", "last_login" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_resetCode_key" ON "users"("resetCode") WHERE "resetCode" IS NOT NULL;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
