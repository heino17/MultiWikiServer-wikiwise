// C1 · Namespace-Partition: moves personal default bags from the legacy
// "editions/<slug>" naming onto the owner-scoped "editions/<owner-id>/<slug>"
// convention, so no other user can squat the bag a wiki relies on.
//
// The recipe.slug / wiki URL stays unchanged; only bag names and the
// bag references inside recipe/template definitions are rewritten.
//
// The rewrite is definition-driven and idempotent: stale references to the
// legacy "editions/<slug>" form are resolved against the current bag set
// (whether those bags are still named "editions/<slug>" or have already been
// moved to "editions/<owner-id>/<slug>").
//
// Usage:
//   node scripts/c1-namespace-migrate.mjs                # dev store
//   node scripts/c1-namespace-migrate.mjs --db <path>    # any store
//   node scripts/c1-namespace-migrate.mjs --dry-run      # plan only
import { createRequire } from "module";
import { resolve } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const args = process.argv.slice(2);
const dbPathArg = args.find((a) => a.startsWith("--db="));
const dbPath = (dbPathArg ? dbPathArg.slice("--db=".length) : resolve(ROOT, "dev/wiki/store/database.sqlite"));
const dryRun = args.includes("--dry-run");

const LEGACY = /^editions\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const NAMESPACED = /^editions\/([^/]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const BROKEN_OWNER = "undefined"; // legacy bogus owner string (old import bug)

console.log(`C1 namespace migration — ${dryRun ? "DRY RUN" : "APPLY"} — ${dbPath}`);
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

const plan = db.transaction(() => {
  const bags = db.prepare("SELECT id, name, owner_user_id FROM bag").all();
  const recipes = db.prepare("SELECT id, slug, definition, owner_user_id FROM recipe").all();
  const templates = db.prepare("SELECT id, name, definition, owner_user_id FROM template").all();

  // legacy "editions/<slug>" -> namespaced "editions/<owner>/<slug>"
  const renames = new Map();
  const bagIds = new Map();
  for (const bag of bags) {
    const m = LEGACY.exec(bag.name);
    if (!m) continue;
    if (bag.owner_user_id == null || bag.owner_user_id === BROKEN_OWNER) continue; // system / broken-owner docs stay
    const newName = `editions/${bag.owner_user_id}/${m[1]}`;
    if (newName === bag.name) continue;
    const clash = db.prepare("SELECT 1 AS x FROM bag WHERE name = ? AND id <> ?").get(newName, bag.id);
    if (clash) { console.warn(`SKIP ${bag.name}: target ${newName} already exists`); continue; }
    renames.set(bag.name, newName);
    bagIds.set(bag.id, newName);
  }

  // reverse: legacy references in already-migrated stores (bags are already
  // namespaced, but a definition still points at "editions/<slug>").
  const reverseBySlug = new Map();
  for (const bag of bags) {
    const m = NAMESPACED.exec(bag.name);
    if (!m) continue;
    if (bag.owner_user_id !== m[1]) continue; // name must match the row owner
    const prev = reverseBySlug.get(m[2]);
    if (prev === undefined) reverseBySlug.set(m[2], bag.name);
    else if (prev !== bag.name) console.warn(`AMBIGUOUS slug ${m[2]}: ${prev} vs ${bag.name}`);
  }
  const resolveLegacy = (slug, ownerUserId) => {
    const r = renames.get(`editions/${slug}`);
    if (r) return r;
    const ns = reverseBySlug.get(slug);
    if (ns) return ns;
    return null; // the "editions/<slug>" bag still exists unrenamed (system) -> unchanged
  };

  const cleanOwner = (owner) => (owner === BROKEN_OWNER ? null : owner);
  const ownerFixCount = {
    bag: bags.filter((b) => b.owner_user_id === BROKEN_OWNER).length,
    recipe: recipes.filter((r) => r.owner_user_id === BROKEN_OWNER).length,
    template: templates.filter((t) => t.owner_user_id === BROKEN_OWNER).length,
  };

  const rewriteDef = (def) => {
    const parsed = typeof def === "string" ? safeParse(def) : def;
    if (!parsed || typeof parsed !== "object") return null;
    let changed = false;
    const writablePrefixBags = Array.isArray(parsed.writablePrefixBags)
      ? parsed.writablePrefixBags.map((row) => {
          if (row && typeof row.bagName === "string") {
            const m = LEGACY.exec(row.bagName);
            if (m) {
              const next = resolveLegacy(m[1]);
              if (next && next !== row.bagName) { changed = true; return { ...row, bagName: next }; }
            }
          }
          return row;
        })
      : parsed.writablePrefixBags;
    const readonlyBags = Array.isArray(parsed.readonlyBags)
      ? parsed.readonlyBags.map((n) => {
          if (typeof n === "string") {
            const m = LEGACY.exec(n);
            if (m) {
              const next = resolveLegacy(m[1]);
              if (next && next !== n) { changed = true; return next; }
            }
          }
          return n;
        })
      : parsed.readonlyBags;
    if (!changed) return null;
    return JSON.stringify({ ...parsed, writablePrefixBags, readonlyBags });
  };

  const touched = { bag: bagIds.size, recipe: 0, template: 0 };
  const changedRows = { recipe: [], template: [] };
  for (const recipe of recipes) {
    const def = rewriteDef(recipe.definition);
    if (def) { touched.recipe++; changedRows.recipe.push(`${recipe.slug}: ${def}`); }
  }
  for (const template of templates) {
    const def = rewriteDef(template.definition);
    if (def) { touched.template++; changedRows.template.push(`${template.name}: ${def}`); }
  }

  if (!dryRun && (touched.bag || touched.recipe || touched.template || ownerFixCount.bag)) {
    const updBag = db.prepare("UPDATE bag SET name = ?, owner_user_id = ?, updated = ? WHERE id = ?");
    const updRecipe = db.prepare("UPDATE recipe SET definition = ?, owner_user_id = ?, updated = ? WHERE id = ?");
    const updTemplate = db.prepare("UPDATE template SET definition = ?, owner_user_id = ?, updated = ? WHERE id = ?");
    const now = new Date().toISOString().replace("Z", "+00:00");

    for (const bag of bags) {
      const nextName = bagIds.get(bag.id) ?? bag.name;
      const nextOwner = cleanOwner(bag.owner_user_id);
      if (nextName !== bag.name || nextOwner !== bag.owner_user_id)
        updBag.run(nextName, nextOwner, now, bag.id);
    }
    const defByRecipe = new Map(changedRows.recipe.map((e) => {
      const i = e.indexOf(": ");
      return [e.slice(0, i), e.slice(i + 2)];
    }));
    for (const recipe of recipes) {
      const def = defByRecipe.get(recipe.slug) ?? recipe.definition;
      const owner = cleanOwner(recipe.owner_user_id);
      if (def !== recipe.definition || owner !== recipe.owner_user_id)
        updRecipe.run(def, owner, now, recipe.id);
    }
    const defByTemplate = new Map(changedRows.template.map((e) => {
      const i = e.indexOf(": ");
      return [e.slice(0, i), e.slice(i + 2)];
    }));
    for (const template of templates) {
      const def = defByTemplate.get(template.name) ?? template.definition;
      const owner = cleanOwner(template.owner_user_id);
      if (def !== template.definition || owner !== template.owner_user_id)
        updTemplate.run(def, owner, now, template.id);
    }
  }

  return { renames: [...renames.entries()], ownerFixCount, touched };
});

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

const { renames, ownerFixCount, touched } = plan();

console.log(`bag renames: ${renames.length}`);
for (const [oldName, newName] of renames) console.log(`  ${oldName}  ->  ${newName}`);
console.log(`broken-owner ('undefined') fixes: ${JSON.stringify(ownerFixCount)}`);
console.log(`rows to touch: bags ${touched.bag}, recipes ${touched.recipe}, templates ${touched.template}`);
if (!dryRun && (touched.bag || touched.recipe || touched.template || ownerFixCount.bag))
  console.log("applied.");
db.close();