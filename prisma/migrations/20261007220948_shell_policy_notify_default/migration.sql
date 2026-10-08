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
    "shell_policy" TEXT NOT NULL DEFAULT 'notify',
    "pinned_template_version_id" TEXT,
    CONSTRAINT "recipe_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recipe_pinned_template_version_id_fkey" FOREIGN KEY ("pinned_template_version_id") REFERENCES "template_version" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_recipe" ("compiledAt", "created", "definition", "id", "owner_user_id", "pinned_template_version_id", "plugins", "shell_policy", "slug", "template_id", "updated") SELECT "compiledAt", "created", "definition", "id", "owner_user_id", "pinned_template_version_id", "plugins", "shell_policy", "slug", "template_id", "updated" FROM "recipe";
DROP TABLE "recipe";
ALTER TABLE "new_recipe" RENAME TO "recipe";
CREATE UNIQUE INDEX "recipe_slug_key" ON "recipe"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
