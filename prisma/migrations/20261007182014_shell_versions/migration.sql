-- CreateTable
CREATE TABLE "template_version" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "template_id" TEXT NOT NULL,
    "release" INTEGER NOT NULL,
    "label" TEXT,
    "definition" JSONB NOT NULL,
    "created" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "template_version_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "created" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" DATETIME NOT NULL,
    "owner_user_id" TEXT,
    "template_id" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "plugins" JSONB NOT NULL,
    "compiledAt" DATETIME NOT NULL,
    "shell_policy" TEXT NOT NULL DEFAULT 'auto',
    "pinned_template_version_id" TEXT,
    CONSTRAINT "recipe_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recipe_pinned_template_version_id_fkey" FOREIGN KEY ("pinned_template_version_id") REFERENCES "template_version" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_recipe" ("compiledAt", "created", "definition", "id", "owner_user_id", "plugins", "slug", "template_id", "updated") SELECT "compiledAt", "created", "definition", "id", "owner_user_id", "plugins", "slug", "template_id", "updated" FROM "recipe";
DROP TABLE "recipe";
ALTER TABLE "new_recipe" RENAME TO "recipe";
CREATE UNIQUE INDEX "recipe_slug_key" ON "recipe"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "template_version_template_id_release_key" ON "template_version"("template_id", "release");

-- Backfill: every existing template gets an initial shell release 1 that
-- snapshots its current definition, so pin/notify carry a version anchor and
-- the update banner never compares against "no release yet". The id is built
-- from the template id ("<uuid>:1") to stay deterministic in raw SQL.
INSERT INTO "template_version" ("id", "template_id", "release", "label", "definition", "created")
SELECT "id" || ':1', "id", 1, NULL, "definition", CURRENT_TIMESTAMP FROM "template";
