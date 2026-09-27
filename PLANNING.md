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
- ✗ put site restrictions in a file — still unclear what belongs into it
- ✗ sell people on contributing to the project — CONTRIBUTING.md is four lines and
  only points at the upstream CLA

## some ideas

- ✗ webdav or samba for importing or editing tiddlers
  - multiple folder views (flat, folder, tag)
- ✗ active node server for a specific folder (also a massive security bypass)
- ✗ instructions for process users on different platforms (e.g. linux permission
  users) — more relevant than before, since container deployment was dropped
  ([§49](CHANGELOG.md)) and the process now runs as a real system user
