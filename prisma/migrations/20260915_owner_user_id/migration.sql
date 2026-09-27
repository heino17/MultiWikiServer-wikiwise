-- Add the owner_user_id column to the five tables that use it.
--
-- The official init migration (20260708160259_init) does not create these
-- columns, but the fork's later migrations expect them: 20260916_email_nullable
-- rebuilds the "users" table and selects the column, so on a fresh database
-- it failed with "ColumnNotFound" and the store could not be initialized at
-- all. Databases that existed before the fork's first migration already had
-- the columns, which is why this only affected new installations.
--
-- Plain nullable TEXT columns, no index and no foreign key, matching
-- model Users / Roles / Bag / Recipe / Template in schema.prisma.
ALTER TABLE "users" ADD COLUMN "owner_user_id" TEXT;
ALTER TABLE "roles" ADD COLUMN "owner_user_id" TEXT;
ALTER TABLE "bag" ADD COLUMN "owner_user_id" TEXT;
ALTER TABLE "recipe" ADD COLUMN "owner_user_id" TEXT;
ALTER TABLE "template" ADD COLUMN "owner_user_id" TEXT;
