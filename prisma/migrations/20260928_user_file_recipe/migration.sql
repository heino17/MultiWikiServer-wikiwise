-- Add the wiki (recipe) a user file was uploaded to. Files uploaded from
-- inside a wiki (with ?recipe=...) get this association; their visibility
-- then follows the wiki's read access instead of share scopes alone.
ALTER TABLE "user_file" ADD COLUMN "recipe_id" TEXT;

-- CreateIndex
CREATE INDEX "user_file_recipe_id_idx" ON "user_file"("recipe_id");