-- Add the creation date to a role, so the roles list can show it like the
-- wikis, bags and users lists already do.
--
-- Nullable and without a default on purpose. The roles an existing store
-- already has (ANON, ADMIN, the teacher roles) would otherwise be backfilled
-- with the moment this migration runs, which reads as "created today" and is
-- simply untrue. Those rows keep NULL and the list shows an em dash; every
-- role created from here on gets its timestamp from the database.
ALTER TABLE "roles" ADD COLUMN "created" DATETIME;