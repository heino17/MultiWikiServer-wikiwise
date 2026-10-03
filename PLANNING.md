Internal notes by core developers

Markers used below:

- ✅ done — the CHANGELOG section in brackets is the one that implemented it
- ◐ partly done — what is missing is named
- ✗ still open
- ⚖️ decision taken, recorded so it is not re-opened by accident

## Prisma

- ✗ Migration path might be only for development
- ✗ Add other database types

## Web

- ✅ Referer enforcement (wiki UI cannot access admin api) — `RequestState.ts:87`,
  called by every recipe route; bug-fixed in [§2](CHANGELOG.md), extended in [§47](CHANGELOG.md)
  (C2 trust boundaries). **Provisional:** the check is a prefix test on the referer
  path, and the code comment says so. The complete vision is listed under *Wiki* below.
- ◐ All the headers — Content-Security-Policy exists and is sent per wiki, opt-in via
  the `cspAllow` list ([§47](CHANGELOG.md), `RecipeResolver.ts:60`). No
  `X-Frame-Options`, no `Strict-Transport-Security`, no `Referrer-Policy`.
- ✗ CORS — nothing implemented; only a debug flag in `zodRegister.ts:8`

## CLI

- ✅ Save and load archive (for backup purposes) — superseded by the ZIP backup
  manager for database, keys and config ([§36](CHANGELOG.md))
- ✗ Export recipe or bag to wiki folder (file system sync adapter)
- ✅ Import wiki folder to recipe or bag — `new-commands/load-wiki-folder.ts`
- ✅ Import a single-file TiddlyWiki 5 — `import-wiki-file`, parser in
  `new-managers/WikiFileImport.ts` ([§84](CHANGELOG.md))
- ✅ The admin dialog for it: "Take over a wiki file" in the "Create a wiki"
  dropdown, upload → preview → confirmation, system-tiddler opt-in, behind
  `/api/wiki-file/*` ([§85](CHANGELOG.md))
- ✅ The snapshot list left that dialog: it was only reachable after picking an
  existing wiki *and* inspecting a file, and the restore button was a bare
  icon. "Restore a snapshot" in the same dropdown opens its own dialog with a
  wiki picker, a written restore button and an inline confirmation; the import
  dialog keeps only an undo button in its result
  ([§92](CHANGELOG.md))
- ✅ A snapshot can be deleted from the restore dialog, behind the same gate as
  the restore and with its own inline confirmation, and the retention rule
  stands written under the list instead of letting snapshots quietly vanish
  from it ([§93](CHANGELOG.md))
- ◐ The wiki-file list in "My Files" and the migration of existing
  `user_file` HTML attachments into a bag are still open
- ⚖️ The wiki-file routes live under `/api`, not under `/admin`: the generic
  record route `/admin/:op/:tab` claims every two-segment `/admin/...` path and
  parses its body as JSON, which made every multipart upload a
  `MALFORMED_JSON`. Do not move them back without changing that route
  ([§85](CHANGELOG.md))
- ⚖️ A merge needs write access to the write bag, a replace needs `C_admin` on
  it (or the owner or the site admin), because a replace deletes what the file
  does not contain. The snapshot list and the restore sit behind the same gate
  as the replace that created them ([§85](CHANGELOG.md))
- ⚖️ A replace writes only the default write bag of the target wiki and takes a
  snapshot into a hidden bag first, because MWS has no content history. The
  snapshot bag is not referenced by any recipe and is pruned to the last 10 per
  wiki. Do not re-open this as "just delete the tiddlers" — the restore command
  depends on that bag, and open tabs are updated through `WikiStore` events
  ([§84](CHANGELOG.md))
- ⚖️ A wiki takes its snapshots with it: deleting a wiki drops the snapshot bags
  of that slug in the same transaction. They belong to no recipe, so nothing
  else would ever touch them, and the restore dialog cannot name a wiki that no
  longer exists — up to ten full copies of a deleted wiki would otherwise sit in
  the store with no way to reach them. Note that snapshots are keyed by slug,
  not by wiki identity: a wiki recreated under a name it had before inherits the
  old snapshots, and restoring one writes that old content into the new wiki
  ([§93](CHANGELOG.md))
- ⚖️ Core plugin, theme and library tiddlers of an imported file are written
  into a bag **only when the operator asks for them and only when the plugin's
  own `version` is the version the target wiki runs**; by default they are left
  out, because the plugins of a wiki come from its recipe and `$:/core` alone is
  megabytes. The version test is deliberately on `version` and not on
  `core-version`: the latter only says which cores a plugin accepts
  (`">=5.0.0"` for the stock core) and would let anything through, while a core
  from another release breaks the wiki in a way no snapshot brings back. A
  plugin that names no version cannot be checked and therefore stays out.
  ``A language pack is not part of this opt-in``, because MWS keeps
  language plugins in the bag and not in the recipe — the recipe's plugin list
  is empty for the wikis MWS creates, the language is a property of the wiki
  and not of the installation. It travels under the same opt-in as every other
  `$:/` tiddler, and `$:/language` itself is only written when the wiki can
  speak the language afterwards (pack in the file, in the core, or in the target
  bag), otherwise the target keeps its own language
  ([§86](CHANGELOG.md), [§94](CHANGELOG.md))
- ⚖️ An imported core plugin travels with the wiki, but it does not necessarily
  run: a template with `externalPlugins` serves its plugins from the
  installation's cache as `$tw.preloadTiddler` scripts, and `loadTiddlersBrowser`
  puts them into the store *after* the DOM store, so the cached copy wins. The
  imported copy is what the bag holds, what the snapshots carry and what another
  installation reads; with `externalPlugins` off the bag copy is the one that
  boots. Do not "fix" this by reordering the boot — the cache copy is what the
  client plugin of the installation is built against
  ([§94](CHANGELOG.md))
- ⚖️ `$:/` tiddlers are skipped unless the operator opts in, and a replace never
  *deletes* the `$:/` tiddlers of the target bag. Both rules are deliberate, not
  an oversight
- ⚖️ …with one exception, and it is a *restore*: it deletes `$:/` tiddlers like
  any other. The rule above protects the wiki from a file that stays silent
  about its own settings; a snapshot is not silent about them, it is the wiki's
  own former state including them. Treating a restore like an import left
  everything the wiki had gained since the snapshot standing, so a restored
  wiki was a mixture of the wiki and the snapshot — and only for system
  tiddlers, which made it look like a random defect rather than a rule
  ([§96](CHANGELOG.md))
- ⚖️ `$:/DefaultTiddlers` is the one system tiddler MWS also takes from the core
  of an uploaded file, and it does so *without* the system-tiddler opt-in. A
  single-file TiddlyWiki practically never keeps the start page in its store —
  the stock edition leaves it in `$:/core`, where it reads `GettingStarted` —
  so reading only the store left every such import on whatever MWS wrote when
  the wiki was created (`Willkommen`), a title the file never had. The result
  looked like a broken import while the import itself was correct. The core is
  only consulted when the file's store says nothing about it
  ([§95](CHANGELOG.md))
- ⚖️ The snapshot hint on the wikis page counts with the same predicates as the
  restore (`canWriteBag()`, `mayReplace()`) instead of going through
  `resolveWikiTarget`. `assertRecipe()` ends the request with an *empty* response
  for a missing or inaccessible wiki, which for a single-wiki route is a correct
  `403` and for the hint would have wiped the counts of every other wiki. Asking
  directly also lets the route stay silent about what the reader may not replace
  instead of denying — a hint that names an invisible wiki would leak it
  ([§97](CHANGELOG.md))
- ◐ The hint is a box above the list, not a count per row. Rows won the argument
  about clutter, but they would also be the better place if the wikis page ever
  grows a column of its own ([§97](CHANGELOG.md))
- ⚖️ The session state of the browser that saved a file is dropped before the
  opt-in is even looked at — `$:/StoryList`, `$:/temp/`, `$:/state/`,
  `$:/status/`, `$:/HistoryList`, `$:/Import`, `$:/build`, `$:/isEncrypted` — the
  same list TiddlyWiki's own import deselects (`core/modules/upgraders/
  system.js`). `$:/status/` is in it because the syncer reads `$:/status/UserName`
  from there, so an imported one would sign every later save with a stranger's
  name. A replace names the titles it deletes, because that is the one part of
  the takeover that can destroy work ([§86](CHANGELOG.md))
- ✗ Support includeWikis
- ✗ Automated export

## Admin

- ✗ Some kind of URL mapping menu
- ✅ Forbidden characters in recipe and bag names — slug normalization in
  `sanitizeSlugPart` (`TabDataAdapter.ts:1546`) plus live validation while
  typing ([§16](CHANGELOG.md), [§10](CHANGELOG.md), [§13](CHANGELOG.md))
- ✅ All the settings — default language and theme, feature switches, cookie notice,
  legal notice ([§47](CHANGELOG.md), `app-settings.tsx`)

## Wiki

- ✗ Storing large binary tiddlers on the file system — still in the database, but
  the storage report now quantifies it (blobs vs. content) so the cost is visible
  ([§40](CHANGELOG.md))
- ✅ Guest access to wiki — explicit `ANON` role ([§4](CHANGELOG.md)) plus the
  public start page ([§48](CHANGELOG.md))
- ⚖️ "Very tempted to remove READ privilege and just allow everyone to read because
  of the imsurmountable security issues that come with it otherwise." — deliberately
  *not* done. The opposite direction was taken: read access stays role-based and
  bag-granular, anonymous read is an explicit role, and the known coarse granularity
  is documented in the README security section instead of being papered over.
- ✗ When you visit a page, you visit with page permissions only, and the page has to
  ask permission before it can read or write to any other wiki or bag you have access
  to … This can be enforced with the referer header. API keys could also be used for
  similar restricted access. — first step done (the referer check, see *Web*), full
  model still open.

## other

- ✗ Not planed, but https://crates.io/crates/indradb

## planning for a publicized release

- ✗ make a note about wikis not being able to talk to each other — still not
  documented anywhere; the only place it surfaces is the referer check comment
- ✅ verify all of the authentication and security — [§15](CHANGELOG.md) (system
  roles), [§47](CHANGELOG.md) (owner protection, namespaces, 404 instead of 403),
  [§8](CHANGELOG.md) (OPAQUE password storage), plus ARCHITECTURE.md
  "Security Boundaries". Remaining known gaps: no HSTS/X-Frame-Options, no CORS,
  and the referer check is provisional
- ✅ make sure the getting started doc is correct — README "How to run" and
  README_features.md; the release route is `npx mws init-data-folder` since
  [§54](CHANGELOG.md), which replaced the two `npm pkg set` commands of
  [§53](CHANGELOG.md)
- ✅ the documented release installation was executed as written on a real
  machine for 0.3.0 ([§53](CHANGELOG.md)) and again for 0.3.1 with the new
  command ([§54](CHANGELOG.md)) — downloaded asset, checksum, init, store and
  server all checked, including that the data-folder guard still refuses to
  start in a wrong folder
- ✅ the wiki previews were verified against a crash of the headless browser,
  not just against a healthy run ([§55](CHANGELOG.md)) — a long-lived server
  has to survive the death of its Chromium, and it is checked by killing it
  while the server keeps running
- ✅ an upgrade from an existing database works, not just a fresh install
  ([§56](CHANGELOG.md)) — the first attempt at that failed in the worst
  possible way: every database created before the column migration existed was
  permanently unbootable, and only fresh test folders had been used to check
  the migrations. Both directions are now covered: the old development wiki
  skips the schema change and records the migration, a fresh install applies
  it. More column migrations are likely to come, so a check of the pending
  migration list against a real old database belongs into the release check
  from now on
- ✗ put site restrictions in a file — still unclear what belongs into it
- ✅ sell people on contributing to the project — `CONTRIBUTING.md` is now a real
  bilingual guide (setup, commands, conventions, documentation contract,
  release checklist) instead of four lines pointing at the upstream CLA
  ([§80](CHANGELOG.md)); the CLA requirement was dropped deliberately, the
  repository license covers contributions. `AGENTS.md` was rewritten in the same
  pass ([§80](CHANGELOG.md))
- ✅ a check that also runs without a maintainer — GitHub Actions installs,
  typechecks the server packages and the admin app and builds the bundle on every
  push to `main` and on every pull request ([§81](CHANGELOG.md)). Until then every
  check was manual
- ⚖️ the CI of this fork does not deploy anything — the inherited workflow built
  `editions/mws-docs` and pushed it to `TiddlyWiki/mws.tiddlywiki.com-gh-pages`
  with a token the fork does not have, and that site belongs to TiddlyWiki. The
  workflow and `.github/scripts/build-mws-site.sh` were therefore replaced by a
  pure verification run ([§81](CHANGELOG.md)). Publishing our own docs site is a
  separate decision, with its own hosting and its own fix for the
  `markdown-it-tiddlywiki` crash that killed the build

## Build and CI

- ✅ GitHub Actions typechecks the server packages and the admin app and builds
  the bundle, on every push to `main` and every pull request ([§81](CHANGELOG.md));
  the actions run on `node24` ([§82](CHANGELOG.md)). First green run on `18d56f0`
- ✗ pin `runs-on` before 19.10.2026 — GitHub migrates the `ubuntu-latest` label to
  Ubuntu 26, which is announced but not yet exercised here. If a runner change
  breaks the build, pin `ubuntu-24.04`; no reason to freeze it before that

## some ideas

- ✗ webdav or samba for importing or editing tiddlers
  - multiple folder views (flat, folder, tag)
- ✗ active node server for a specific folder (also a massive security bypass)
- ✗ instructions for process users on different platforms (e.g. linux permission
  users) — more relevant than before, since container deployment was dropped
  ([§49](CHANGELOG.md)) and the process now runs as a real system user
