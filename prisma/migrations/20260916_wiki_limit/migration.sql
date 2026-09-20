-- Add users.wiki_limit: how many wikis a user may create on their own.
--   NULL = unlimited, 0 = none, N = at most N.
-- Default 0 so existing and new accounts are locked until a teacher grants a
-- limit. Only enforced for non-teacher, non-admin users (students).
ALTER TABLE "users" ADD COLUMN "wiki_limit" INTEGER DEFAULT 0;
