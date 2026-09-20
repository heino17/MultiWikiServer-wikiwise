-- CreateTable
CREATE TABLE "user_file_share" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "file_id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_file_share_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "user_file" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "user_file_share_file_id_idx" ON "user_file_share"("file_id");

-- CreateIndex
CREATE INDEX "user_file_share_scope_type_scope_id_idx" ON "user_file_share"("scope_type", "scope_id");