-- CreateTable
CREATE TABLE "pinboard_note_position" (
    "note_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,

    PRIMARY KEY ("note_id", "user_id"),
    CONSTRAINT "pinboard_note_position_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "pinboard_note" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);