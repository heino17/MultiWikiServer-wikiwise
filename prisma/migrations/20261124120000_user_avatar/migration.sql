-- Own profile picture for each user (§153). The bytes live content-addressed
-- under store/avatars/<sha256>.<extension>; only metadata is stored here.
-- All four columns are NULL until the user uploads a picture.
ALTER TABLE "users" ADD COLUMN "avatar_sha256" TEXT;
ALTER TABLE "users" ADD COLUMN "avatar_content_type" TEXT;
ALTER TABLE "users" ADD COLUMN "avatar_extension" TEXT;
ALTER TABLE "users" ADD COLUMN "avatar_size_bytes" INTEGER;
