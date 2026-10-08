-- The default template is now called "Tiddlywiki" (§111). Recipes reference
-- the template by id, never by name, so renaming the row alone is safe;
-- nothing else stores the old name as a foreign key.
UPDATE "template" SET name = 'Tiddlywiki' WHERE name = 'Blank Template';