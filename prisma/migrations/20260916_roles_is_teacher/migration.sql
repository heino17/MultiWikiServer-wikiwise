ALTER TABLE "roles" ADD COLUMN "is_teacher" BOOLEAN NOT NULL DEFAULT false;
UPDATE "roles" SET "is_teacher" = true WHERE "role_name" = 'TEACHER';