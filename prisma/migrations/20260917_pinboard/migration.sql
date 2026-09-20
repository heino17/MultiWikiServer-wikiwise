-- CreateTable
CREATE TABLE "pinboard_note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "author_user_id" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT,
    "body" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "is_important" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "expires_at" DATETIME
);

-- CreateTable
CREATE TABLE "pinboard_note_read" (
    "note_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" DATETIME,
    "dismissed_at" DATETIME,

    PRIMARY KEY ("note_id", "user_id"),
    CONSTRAINT "pinboard_note_read_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "pinboard_note" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "pinboard_note_is_active_scope_type_idx" ON "pinboard_note"("is_active", "scope_type");
