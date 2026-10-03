# 🇺🇸 CHANGELOG – MultiWikiServer-wikiwise

Documentation of the changes to heino17's MultiWikiServer-wikiwise fork. This log
tells the development story in reverse order of features, bug fixes, and reworks
since the base state.

As of: 2026-09-30 · Base: `TiddlyWiki/MultiWikiServer` @ `3627482`

## Summary

This fork contains several small bug fixes as well as features
for the HTTP/proxy operation of MWS: public read access via the ANON
role, no phantom saving in read-only wikis, owner protection for
wikis/bags/templates/roles/users, `admin` user management (direct
password, deletion), wiki creation & deletion at the click of a
button, as well as later renaming of wiki names and slugs (including
automatic renaming of the default bag). The admin app is fully
bilingual (DE/EN), protects system roles from deletion, validates
wiki slugs live (format + availability), bundles wiki creation in a
dropdown, toggles between a light (warm `#F3E6C5`) and dark
design, and adds a secure random password generator with a
selectable length (8–32) and a copy display to the password
fields.

Since September 2026, a complete **teacher area** has been added
(§21–§27): A school administrator (principal/`admin`) creates teachers;
each teacher manages **only their own class** and does **not** see the
wikis of the other teachers. The separation is done via **personal
roles** (named after the username, e.g. `Frau Meyer`) instead of via
the shared TEACHER system role; a server-side role guard prevents
the assignment of foreign teacher roles (as well as `ADMIN`/`TEACHER`),
and the admin UI hides foreign personal roles in the user dialog.
At the same time, **cooperation** remains possible: A teacher can
invite another teacher into their wiki by invitation
(`B_write`/`C_admin`), and class roles give students targeted read
access. In addition, the email column of the user table is made
`nullable`, so that multiple users without an email no longer collide
on `""`. All changes are deliberately kept small and backward compatible.

Additionally, an admin tab **"Storage"** has been added (§39–§41):
It clearly separates the **system disk status** from the **storage usage
of MultiWikiServer-wikiwise**, reports the **binary content (blobs &
files)** (count/size, file store, inbox, orphaned files), and shows the
**storage usage per user (top 10)** including wiki content and file
store. This makes it visible that MWS keeps binary content inline as
base64 in the SQLite database (no separate blob store).

There is also a new tab **"My Files"** (§44): Every logged-in user
uploads their own files (default limit of 100 MB per file, overridable
via `MWS_USERFILE_SIZE_LIMIT`), keeps them available in the browser
for download and inline preview (image, audio, video, PDF, text,
Markdown, and ODT text documents), and can share them selectively —
admin shares reach everyone, teacher shares reach their class members
and admins, student shares reach specifically chosen recipients. The
bytes are stored content-addressed (`store/files/<sha256>/`) on the
disk; a SQLite table holds only metadata (`user_file` +
`user_file_share`).

In addition, every wiki toolbar has an **"Upload file" button**
(§45): It uploads files directly from the opened wiki — with write
access into the file store of the **wiki owner**, not of the
uploader.

Since September 2026 there is also a **security rework "C"** (§47):
Personalized bag namespaces against name squatting (C1), wiki
classification + CSP headers + existence oracle (C2), and the structured
"My Areas" UI with trust labels (C3).

Wiki-uploaded files can now be **embedded in the wiki itself** (§65):
After the upload, the wiki shows the ready-to-paste TiddlyWiki code
(`[img[...]]` for images, `[ext[...]]` for everything else), and a
"Files in this wiki" button lists all files of the wiki with preview
and copyable code. Wiki files are visible to whoever may open the wiki
(read access) — no separate share is required; personal "My files"
stay private.

---

## Release 0.4.0 — 2026-09-30

26 commits since 0.3.3, 98 files, +4554/−622. The centre of gravity is files
and lists: uploading into a wiki and embedding the result (§65), and search
plus sorting in every list of the admin app (§78, §79).

**New**

- **Files inside a wiki** (§65): the wiki toolbar uploads into the wiki
  owner's file store — also when you write in a foreign wiki as guest or
  teacher. "Files in this wiki" lists them with preview and ready-to-paste
  TiddlyWiki code (`[img[...]]`/`[ext[...]]`). Visibility follows the wiki's
  read access; personal files in "My files" stay private.
- **Search and sort in all six lists** (§78, §79): wikis, templates, bags,
  roles, users and my files each get a search field that filters as you type
  (case, umlauts and "ß" ignored) plus sortable column headers. Numbers count
  as numbers, file sizes by their real byte count, and sorting flattens the
  wiki groups on purpose — otherwise the grouping would tear one result into
  three blocks.
- **The wiki list pages** (§76): ten wikis per page instead of rendering
  fifteen thumbnails at once, configurable under settings (0 = all in one
  list).

**Fixed**

- **Security:** the one-click wiki of `admin` was the only wiki that was
  immediately readable by every logged-in user and publicly visible on the
  start page; it now starts private like everyone else's (§68). The modal also
  closes after creating (§69), and welcome tiddler as well as "Files in this
  wiki" show a headline instead of "1. …" (§70, §71).
- Thumbnails were frozen in the browser cache and only refreshed after
  Ctrl+Shift+R (§74); the preview now stays visible while editing and refreshes
  by itself after a 30 s grace period instead of going blank (§75).
- The whole "MWS Bedienungsanleitung" was written in Markdown and therefore
  unusable as a manual (§72), and `load-wiki-folder --overwrite` was
  fundamentally unusable for existing bags (§73).
- The bags list shows its roles one under another instead of as a comma list
  (§77).
- Maintenance: dependency clean-up, `hono` to 4.13.10 and in-range repairs
  (§67), README quick start completed (§66).

**Operating notes**

- One additive migration, `20260928_user_file_recipe`: it adds a nullable
  `recipe_id` and an index to `user_file`. No data is rewritten. If a database
  already has the column, the migration is recognised as applied (§56) instead
  of aborting the start with "duplicate column name" — that protection now
  applies for real.
- The first start after the update builds a fresh plugin cache under
  `cache/mws/0.4.0/`; older directories are left untouched and can be deleted.
- The 0.2.x data-folder rule and the API are unchanged, and all eight
  languages are complete.

---

## Release 0.4.1 — 2026-10-01

4 commits since 0.4.0. A patch release: one user-visible bug fix in the wiki
client, three maintenance commits behind it.

**Fixed**

- **One connection alert instead of a flood** (§83, upstream issue #139): when
  the network disappeared, the wiki stacked alert after alert — measured on an
  isolated instance, the first alert after 61.9 s, then two alerts per failed
  poll with a counter up to 10, a reload every 5 s, and both alerts stayed on
  screen after the network came back. Now there is **one** notice with its own
  German and English wording, it disappears as soon as a sync task works
  again, and the retries back off from 5 s to 10, 30 and 60 s, so a laptop
  waking from sleep no longer queries the server for minutes. Unsaved changes
  are kept. A server that really answers with an error (403, 503) is still
  reported as an ordinary message.

**Maintenance**

- `CONTRIBUTING.md` and `AGENTS.md` written out (§80).
- GitHub Actions verify instead of publishing the upstream site (§81) and run
  on `node24` with `checkout`/`setup-node` v7 (§82).
- `scripts/syncer-alert-sim.mjs` measures the alert behaviour with Playwright
  and is the regression check for §83.

**Operating notes**

- No migration, no schema change; the 0.2.x data-folder rule and the API are
  unchanged.
- The first start after the update builds a fresh plugin cache under
  `cache/mws/0.4.1/`; `cache/mws/0.4.0/` is left untouched and can be deleted.
- The syncer in the wiki is client-side code: an open wiki tab needs a reload
  to get the new behaviour.

---

## 1. Missing dependency: `escape-string-regexp`

**Files:** `package.json` (root)

The server imported `escape-string-regexp` in
`packages/mws/src/services/setupDevServer.ts`, but the package was missing in
all `package.json` files → the build (`tsup`) failed with
`Could not resolve "escape-string-regexp"`.

**Fix:** Added the dependency to the root `package.json`:

```json
"escape-string-regexp": "^5.0.0"
```

---

## 2. CSRF referer check blocked the password change

**File:** `packages/mws/src/new-managers/sessions.ts`

**Problem:** The pages `/login` and `/profile` are part of the same
admin interface. The "Update password" flow on `/profile` internally
performs a fresh login via `/login/1` and `/login/2`. Their
referer check, however, only allowed pages under `/login`:

```
ACCESS_DENIED → reason: "Referer check failed"
```

**Fix:** The two login endpoints now additionally accept
`/profile` as referer:

```ts
state.assertReferer(["/login", "/profile"]);
```

(Lines for `login1` and `login2`.)

---

## 3. `crypto.subtle` not available in the browser (HTTP)

**File:** `packages/admin-vanilla/src/passwords.ts`
**Package:** `packages/admin-vanilla/package.json`

**Problem:** `generateSessionSignature()` used
`window.crypto.subtle.digest("SHA-256", …)`. `crypto.subtle` only exists
in a *secure context* — that is, HTTPS or `localhost`. Over
`http://192.168.x.x:5000` the password change therefore failed:

```
can't access property "digest", window.crypto.subtle is undefined
```

**Fix:** SHA-256 via `js-sha256` (pure JS, no secure context required), with
the same result as the server-side check
(`sha256(session_key + session_id)` → base64):

```ts
import { sha256 } from "js-sha256";

async function generateSessionSignature(sessionKey: string, session_id: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(sessionKey + session_id);
  const hash = sha256.arrayBuffer(data);
  return await arrayBufferToBase64_viaBlob(hash);
}
```

---

## 4. Public (anonymous) read access via the ANON role

**Files:**
- `packages/mws/src/new-managers/sessions.ts`
- `packages/mws/src/new-commands/init-store.ts`
- `packages/mws/src/new-managers/TabUpserts.ts`

**Problem:** MWS has purely role-based ACLs. Anyone who is not logged in
was hard-assigned `roles: []` (`sessions.ts`, `username: "(anon)"`)
— which made a publicly readable wiki impossible. The AuthUser type does
comment: "User role_ids may have length even if the user isn't
logged in, to allow ACL for anon", but that was never implemented (in the
Git history there was never an `ANON` role; the earlier
"Allow anonymous reads/writes" flag comes from the old TW5 multi-wiki
version and has long since been commented out).

**Fix:** Introduction of a static `ANON` role that every anonymous
user automatically receives:

1. `sessions.ts`: `static AnonRoleName = "ANON"`; the

   `roleLookup` query loads the roles `ADMIN`, `USER`, `ANON`; the
   anon fallback gets `roles: [{ role_id, role_name: "ANON" }]`
   (defensively, only if the role exists).

2. `init-store.ts`: now additionally creates the role `ANON` alongside
   `ADMIN`/`USER` (`description: "Anonymous users (not logged in)"`). In
   order to be able to retrofit existing databases (in which an admin
   user already exists) with `npm start init-store`, roles + blank
   template are now created idempotently — only the creation of the
   `admin` user remains tied to the empty users table.

3. `TabUpserts.ts`: `ANON` is — like `ADMIN`/`USER` — a protected
   static role (`CANNOT_WRITE_STATIC_ROWS`).

**Usage:** Analogous to the other roles in the admin UI or directly in the
DB. Example: assign the role `ANON` on the recipe *and* its bags with
`A_read` → the wiki is publicly readable (writing remains blocked,
`canUserWrite: false`).

**Status:** Verified against `mws-docs` (rollback possible by removing the
`ANON` entries from `recipe_permission`/`bag_permission`).

---

## 5. Read-only wikis: faulty "Save" banners for anonymous users

**Files:**
- `plugins/client/tiddlers/syncer/config-sync-filter.tid` (new)
- `plugins/client/src/multiwikiclientadaptor.ts`
- `plugins/client/src/new-multiwikiclientadaptor.ts`

**Problem:** In a public (read-only) wiki the browser repeatedly threw the
following while loading:
`Sync error while processing save task: ... 403 BAG_NO_WRITE_PERMISSION`
("count: 3").

Cause: The TiddlyWeb standard `$:/config/SyncFilter`
(`dev/wiki/tw5/5.4.1/core/wiki/config/SyncFilter.tid`) does exclude
`$:/status/`, `$:/state/`, `$:/temp/`, etc., but **not** the
story tiddlers `$:/StoryList` and `$:/History`. These are created or
modified by the browser locally at startup. Since they have no
`tiddlerInfo` (or `changeCount` has increased), they count as "needing to
be saved" → the syncer sends them to the server → 403 when anonymous.

In addition, the batch save paths of both sync adaptors
(`saveTiddlers` → `rpcSaveRecipeTiddlerList` or `PUT /batch/save`)
were not guarded, even though the single-tiddler variant (`saveTiddler`)
has long filtered out `isReadOnly`/`$:/StoryList`/state tiddlers.

**Fix:**
1. New plugin tiddler `$:/config/SyncFilter` that, in addition to the
   core filter, also excludes `[[$:/History]]` and `prefix[$:/StoryList]`
   (deliberately not `[!is[system]]` — system tiddlers such as
   `$:/SiteTitle` or palettes must still be synchronized).
2. Both `saveTiddlers` implementations filter out tiddlers that are not
   writable on the server (`isReadOnly`), the server-side
   `$:/StoryList`, and local state tiddlers. These are marked
   locally as "saved" (instead of being sent to the server) so that
   the syncer stops repeating them — without error banners.

The client plugin cache (`dev/wiki/cache/mws/0.2.5/client/plugin.json`)
is automatically regenerated at server startup when
`plugins/client` changes (hash comparison) — an `npm run build:client`
(`tsc`) + `pm2 restart MultiWikiServer-wikiwise` is sufficient. Then
hard-reload once in the browser (Ctrl+F5).

---

## 6. Red console message: `XHR OPTIONS /wiki/<slug> → 405`

**File:** `packages/mws/src/new-managers/index.ts`

**Problem:** When opening a wiki, the TW core saver
"PutSaver" sends a one-time `OPTIONS` to the current wiki URL to test
whether the server accepts WebDAV PUTs (header `dav`, see
`core/modules/savers/put.js`). MWS deliberately answered `OPTIONS` on
`/wiki/:slug` and `/tw5/:version` with `405` → in the browser a
red (functionally harmless) network line.

**Fix:** `OPTIONS` now responds with an empty `200` and **without** the
`dav` header. This keeps the PutSaver disabled (a 2xx status is
not sufficient, the `dav` header must additionally be set),
but keeps the console clean. Saving goes through the
MultiWikiClient adaptor anyway, not through the PutSaver.

---

## 7. Red console message: `GET /wiki/favicon.ico → NS_BINDING_ABORTED`

**File:** `packages/mws/src/new-managers/index.ts`

**Problem:** The rendered wiki HTML contains `<link rel="shortcut icon"
href="favicon.ico">`. Since the page is located under `/wiki/<slug>`
(without a trailing slash), the browser resolves `favicon.ico` relative
to it as `/wiki/favicon.ico` — and that hit the recipe route
`^/wiki/([^/]+)$` with `slug = "favicon.ico"` → 403. Firefox shows this
as a canceled `favicon.ico` request (red console message). The actual
favicon is set later by TW Startup (`favicon.js`) anyway, as a data URI
from `$:/favicon.ico`.

**Fix:** Dedicated route `^/wiki/favicon\.ico$` → **302 redirect** to
`/favicon.ico` (which the server answers with the default icon, 200).
The recipe route is never confronted with `favicon.ico` as a slug again.

---

## 8. Login directly in the wiki (`tc-password-wrapper` → writable, without `/login`)

**Goal:** The built-in TW login dialog ("Login to TiddlySpace",
`tc-password-wrapper`) should really log the user in — without the
detour via the admin page `https://…/login`. After the login the
wiki is writable if the user's role has write permissions on the
recipe (ADMIN/USER yes, ANON read only).

**Files:**
- `plugins/client/build/build-opaque.mjs` — bundles `@serenity-kit/opaque`
  (OPAQUE/PAKE login, WASM) via esbuild into a plugin tiddler
  `tiddlers/library/opaque.js` (`build:opaque` script, which runs as
  part of `build:client`).
- `plugins/client/src/new-multiwikiclientadaptor.ts` — new methods
  `login(username, password, cb)` and `logout(cb)`: they call `/login/1`,
  `/login/2` and `/logout` respectively, `startLoginRequest`/`finishLoginRequest`
  via the OPAQUE client. The server sets the session cookie
  (`path: "/"`), so that all following wiki requests (same origin)
  are automatically authenticated. Then `getStatus` reports the wiki
  as writable.
- `packages/mws/src/new-managers/sessions.ts` — `login1`/`login2`
  now additionally allow referers from `/wiki` (previously only `/login`
  and `/profile`), so that the login dialog works from within the wiki.

**Browser flow:** Login button/click triggers `tm-login` → the
TW syncer shows the password dialog → submit calls `adaptor.login()` →
PAKE-11 login against the server → session cookie set → `getStatus`
shows `isLoggedIn`/`canUserWrite` → wiki writable.

**Note:** The plugin bundle is rebuilt from the
plugin folder at server startup (cache `dev/wiki/cache/mws/…`); so
after changes to the adaptor, run `npm run build:client` + restart.

**Dialog text** (`Login to TiddlySpace` → "Log in to this wiki" /
`Login bei TiddlySpace` → "In dieses Wiki einloggen"): The value comes from
`Syncer.prototype.getLoginServiceName()` in
`plugins/client/tiddlers/syncer/syncer.js` and depends on the
active wiki language (`$:/language`). Supported codes (full
code if it works, otherwise primarily the language code; underscores are
normalized to hyphens, `zh_CN` = `zh-cn`): `de` "In dieses Wiki einloggen", `en` "Log
in to this wiki", `es` "Iniciar sesión en este wiki", `fr` "Se connecter à ce
wiki", `ja` "このWikiにログイン", `ko` "이 위키에 로그인", `ru` "Войти в эту
вики", `zh-cn` "登录此 Wiki". Languages that are not listed fall back to
English. Additional languages can simply be added as an entry in `languageMap`
(key = language code, e.g. `"pl": "…"`). A wiki can override the text
individually with the tiddler `$:/config/mws/LoginServiceName` (takes
precedence over any language logic).

---

## 9. Type check: `npm run tsc2` reported a missing `react` import

**File:** `packages/jsx-lit/src/JSXElement.tsx`

**Problem:** `npm run tsc2` (`tsc -p tsconfig.json --noEmit`, type check
across the whole repo) reported exactly one error:

```
error TS2307: Cannot find module 'react'
```

The cause was the pure type import `import type { Dispatch, SetStateAction }
from 'react'` in `JSXElement.tsx`. `react` (or `@types/react`), however,
is not installed anywhere in the repo and is not listed in any
`package.json` — not even as a dependency/devDependency. Verified via
`git stash` that the error occurred independently of the content changes.

**Fix:** Only two trivial types are needed → defined **locally**
instead of importing from `react` (no new dependency, no runtime change):

```ts
type Dispatch<T> = (value: T) => void;                    // wie React: (value: A) => void
type SetStateAction<T> = T | ((prev: T) => T);            // wie React: S | ((prevState: S) => S)
```

**Result:** `npm run tsc2` reports 0 errors. The admin bundle
(`admin-vanilla`, uses `jsx-lit` via esbuild) still builds cleanly
unchanged (`/main.js` → 200). There is no build/restart note; `react`
deliberately remains uninstalled.

---

## 10. Feature "New wiki at the click of a button" (`PUT /admin/wiki`)

A new wiki is created atomically server-side — only a display name
is required. The slug is derived from the username of the logged-in
admin (`wiki-<benutzername>`, incremented to `-2`, `-3`, … in case of a collision).

**Backend** (`packages/mws/src/new-managers/TabDataAdapter.ts`, route
`AdminCreateWiki`; registered in `new-managers/index.ts` `ApiRoutes` +
`ClientRoutes`):

- a `$transaction` creates:
  - **Bag** `editions/<owner-id>/<slug>` (owner-namespaced, see C1;
    system wikis without an owner: `editions/<slug>`), perms:
    `ADMIN → C_admin`, `USER → A_read`, `ANON → A_read`
  - **Recipe** (slug `<slug>`, template "Blank Template"), perms:
    `ADMIN → B_write`, `USER → A_read`, `ANON → A_read`; the only
    `writablePrefixBags` reading: `{prefix: "", bagName}`
  - **Start tiddlers**: `$:/SiteTitle` (= display name), `$:/DefaultTiddlers`
    and a welcome tiddler (fields `created`/`modified` in the
    `YYYYMMDDHHmmssmmm` format, `creator`/`modifier` = username)
- Response: `{slug, displayName, bagName, templateName, lastCompiledAt}`
- only the display name is validated (`min 1` / `max 120`); referer
  and `X-Requested-With` check as with `AdminSave`; for non-admins
  the usual `C_admin`/`B_write` access protection applies.
- **Permission requirement:** According to `TabUpserts.ts`
  (`checkExisting`), the creation of bags/recipes is fundamentally tied to
  the `ADMIN` role (`isAdmin` = role `ADMIN`). A regular `USER` therefore
  receives `403 ACCESS_DENIED "You don't have permission to create
  bags."` when submitting. Since the wiki permissions are also assigned
  based on roles (`ADMIN → B_write`, `USER → A_read`), the creator must
  be in the `ADMIN` role — then they can also write to their wiki. The
  user "Heino" received the role via a regular `PUT /admin/save/users`
  (`userRoles: ["USER", "ADMIN"]`).

**Frontend** (`packages/admin-vanilla/src/app.tsx`):

- Button **"New wiki"** (only in the *Wikis* tab, next to "Create wiki")
  opens a dialog with an input field, pre-filled with
  `<benutzername>s Wiki`
- Create via `PUT pathPrefix + "/admin/wiki"` (header
  `X-Requested-With: TiddlyWiki`); on success the
  `InMemoryAdminStorage` is reloaded and a link to
  `/wiki/<slug>` is displayed.

**Verification** (via a test admin session against `127.0.0.1:5000`):

- Slug base + collision (`wiki-admin` → `wiki-admin-2`) ✓
- anonymous `GET /wiki/<slug>` → 200 with the correct `<title>` (first
  word: display name from the real `$:/SiteTitle`) ✓
- permissions in the DB correct for bag and recipe ✓ (see above)
- **as a non-admin user** (`Heino`, after role assignment): one-click
  `PUT /admin/wiki` → 200 (`wiki-heino`); anonymous `GET /wiki/wiki-heino`
  → 200 with `<title>Heinos Wiki`; Heino can write
  (`PUT /recipe/wiki-heino/batch/save` → 200, `canWrite: true`) ✓
- `/main.js` delivers the new UI code (markers `Neues Wiki`,
  `startNewWiki`, `/admin/wiki`) ✓

---

## 11. Feature "Delete wiki" (`PUT /admin/wiki/delete`)

Deleting belongs to the one-click creation as well. Server-side the
wiki (recipe) is removed atomically; bags that **only** this wiki
referenced are deleted along with their content (cascade via FK,
`RecipeBag.bag` is `onDelete: Restrict` → for each bag it is checked
whether other recipes still reference it, only then is it deleted).
Shared bags are kept.

**Backend** (`TabDataAdapter.ts`, `AdminDeleteWiki`; registered in
`new-managers/index.ts`): `PUT /admin/wiki/delete`, body `{slug}`;
ADMIN role required (otherwise `403 ACCESS_DENIED`), unknown slug →
`404 RECIPE_NOT_FOUND`. Response `{slug, deleted: true}`.

**Frontend** (`admin-vanilla/app.tsx`): In the edit dialog of a wiki
(tab *Wikis*, mode "edit") a red button **"Delete wiki"**
appears on the left next to Cancel/Save. It asks for confirmation
via `confirm()`, then calls the endpoint, reloads the list on
success (`PerTabStore.reloadItems`) and closes the dialog. Errors are
shown in the dialog as a red message.

**Ownership protection (creator + admin account):** In order to prevent
an admin user from deleting **or editing** foreign wikis, each newly
created wiki carries its creator (`Recipe.owner_user_id`, set on
create in `AdminCreateWiki` and in `RecipeDataAdapter.saveRow`;
edits do **not** overwrite the owner). **Saving**
(`PUT /admin/save/wikis`) and **deleting** (`PUT /admin/wiki/delete`)
is only allowed if `recipe.owner_user_id === user.user_id` **or** the
bootstrap account `admin` (super-admin). Legacy wikis without an owner
(e.g. `mws-docs`) can only be edited/deleted via the `admin` account.
The owner check in `checkExisting` (`TabUpserts.ts`) counts the creator
independently of roles: whoever owns the wiki/bag may also
save it, even if the editor list only contains a role that the
owner does not hold (e.g. `ADMIN` for seeded wikis). Templates remain
subject to the strict role model (`templateAdmins`).
The red button is only shown in the frontend if the logged-in
user is the creator or is called `admin`. The Wikis tab additionally
has the column **"Created by"** (server field `ownerUsername`).

**Verification** (test admin session + Heino session):

- Admin: create wiki → delete → 200; `GET /wiki/…` then 404 ✓
- Heino: create own wiki → delete → 200 ✓
- Heino: delete attempt on `mws-docs` → `403 ACCESS_DENIED`, wiki remains ✓
- Heino: save `wiki-admin` (owner `admin`) → `403 ACCESS_DENIED`, definition in the DB unchanged ✓
- Heino: save `mws-docs` (ownerless) → `403 ACCESS_DENIED` ✓
- Heino: save his own wiki → 200 ✓
- Admin: save `wiki-admin` → 200 (super-admin) ✓
- Admin: deletes Heino's wiki → 200 (super-admin) ✓
- `getList`/`/admin/load` delivers `ownerUsername` (creator username) ✓
- unknown slug → `404 RECIPE_NOT_FOUND {recipeName}` ✓
- existing wikis (`mws-docs`) still 200 ✓

**Same protection for bags:** Bags now also carry a creator
(`Bag.owner_user_id`, set in `AdminCreateWiki` and in
`BagDataAdapter.saveRow` on creation; edits do not overwrite it).
In the admin UI tab *Bags*, a bag may only be edited by whoever
created it or by the `admin` account (`PUT /admin/save/bags` →
otherwise `403 ACCESS_DENIED`); the creation of new bags is still
allowed for every admin (the creator becomes the owner). Column
**"Created by"** in the Bags tab (server field `ownerUsername`).

**Verification bags** (Heino session + admin session):

- Heino: `PUT /admin/save/bags` on the ownerless `editions/mws-docs` → 403, description unchanged ✓
- Heino: edit own bag `editions/wiki-heino` → 200, owner remains Heino ✓
- Heino: create a new bag → 200, `owner_user_id` = Heino ✓
- admin: may edit Heino's bag → 200 (super-admin) ✓
- `/admin/load` delivers `ownerUsername` for all bags ✓

**Same protection for templates, roles, and users:** Like wikis and
bags, templates, roles, and user accounts also carry a creator
(`owner_user_id`; set on creation, edits do not overwrite it).
The following applies everywhere: only the creator or the
`admin` account may edit (`403 ACCESS_DENIED` otherwise); system/ownerless
rows (e.g. `Blank Template`, `ADMIN`/`USER`/`ANON`) are only editable
via `admin`. New user accounts are **owned by their creator**
(creator = inviter is the owner, see §12); maintaining one's own
account remains possible. All four tabs have the column **"Created by"**
(server field `ownerUsername`).

**Additionally closed security hole:** `PUT /admin/save/users`
now strictly requires the ADMIN role — previously a
non-admin user could grant themselves the ADMIN role via the API
(self-promotion without UI access).

**Verification (Heino session + admin session):**

- Heino: change `Blank Template` → 403 ✓; create/change own template → 200 (owner Heino) ✓
- Heino: write `ADMIN` role → 403/400 ✓; create/change own role → 200 ✓
- Heino: change `admin` account → 403, email unchanged ✓; own account → 200 ✓
- Heino: create a new user → 200, owner = Heino (see §12) ✓
- Non-admin: promote own role to ADMIN via API → 403 ✓
- admin: may change all templates/roles/users → 200 ✓
- `/admin/load` delivers `ownerUsername` for templates, roles, users ✓

---

## 12. User management: Invitation, own password, deletion

**Owner semantics ("inviter"):** Since users cannot register
themselves but are created by others, the **creator** is the owner of
the account (`Users.owner_user_id` = creator, not self-owned).
Example: Heino creates `Testuser` → column
**"Created by: Heino"**; Heino may edit **and delete** `Testuser`
(his "sub-user"). The `admin` account may edit/delete any user
— except **himself** (`admin` can never be deleted, protection
against lockout). The created user himself may only act with the
ADMIN role in the admin interface; his own maintenance runs
via the profile/password system (`/login/*`), not via the
Users tab.

**Direct password (instead of email):** Since no emails are sent,
the fields **"New password"** and **"Confirm password"** in the
users dialog now have client-side password matching
(`enter-password`/`confirm-password` renderer, helper text "Passwords
do not match yet."). The server hashes the plaintext password
server-side via `PasswordService.PasswordCreation` (OPAQUE aPAKE
registration record) and stores only the hash; it is **never** stored
in plaintext and `password` never appears in the response
(`password: ""`). Leaving it empty = password remains unchanged; for
new accounts without a password the reset code flow still works.

**Deletion (`PUT /admin/user/delete`):**

- Body `{username}`; ADMIN role required (otherwise 403).
- Permission: the creator (owner) of the account, the `admin` account, or
  the user themselves may delete. `admin` himself is **undeletable**.
- Cascade: role links (`_RolesToUsers`) and sessions are
  removed; **the user's wikis/bags/templates/roles are kept**
  (they become ownerless → afterwards only `admin` may manage them).
- Frontend: red **"Delete user"** button in the edit dialog of the
  Users tab (only visible for the owner/creator, `admin`, and never for
  the `admin` account itself).

**Verification (Heino session + admin session):**

- Heino creates a user → 200, `owner_user_id` = Heino, password hash
  stored ✓
- Heino edits the invited user (empty password = unchanged) → 200 ✓
- Heino deletes his own sub-user → 200; role links + sessions gone ✓
- Heino deletes `admin` → 403; `admin` deletes himself → 403 ✓
- Heino deletes a foreign (admin-created) user → 403; `admin` deletes him → 200 ✓
- Non-admin: self-edit/self-delete via the Users tab → 403 (the hole remains closed) ✓
- `/admin/user/delete` shows `ownerUsername` correctly (Heino→Heino,
  Testuser→Heino, admin→admin) ✓

---

## 13. Feature "Rename wiki" (slug, display name, bags)

A wiki can be renamed afterwards in the Wikis tab (Wikis) —
separately for **Slug** (URL path) and **Display name** (display title).
Both take effect server-side when saving (`PUT /admin/save/wikis`) and
keep the dependent data consistent.

**Slug change (URL of the wiki):**

- The slug is the URL path component (`/wiki/<slug>`). If it is changed,
  the recipe definition is rewritten to the new slug
  (`checkExisting` → `rename`).
- The **default bag** `editions/<owner-id>/<old-slug>` is automatically
  renamed along with it to `editions/<owner-id>/<new-slug>`
  (`followDefaultBagOnSlugRename` in `TabDataAdapter.ts`) — **tiddlers,
  permissions, and recipe bag links are preserved via the
  unchanged `bag_id`** (no data loss, no "freshly created" empty bag).
- Safety guards before the bag is renamed:
  - only if the bag exactly follows the `editions/<owner-id>/<slug>` convention
    (custom bag names are never touched);
  - only if the target bag name does **not already exist** (otherwise
    the existing one is used where possible);
  - only if **no other wiki** still references the bag
    (shared bags are never renamed).
- The client automatically switches the write target (`editions/<owner-id>/<slug>`) along
  with the slug edit (`syncDefaultBagOnSlugChange` in `renders.tsx`).

**Change display name (display title):**

- Changes only the display name, not the URL.
- The wiki-internal title `$:/SiteTitle` and the **"Willkommen"**
  starter teaser in the default bag are updated to the new display name
  (`mirrorDisplayNameIntoStarterTiddlers`).
- The reconciliation runs on **every** save of an existing wiki — this
  also heals tiddlers that were left with an old name by renames **before**
  the sync was introduced.
- Conservative detection: the "Willkommen" teaser is only rewritten
  if it still looks like the unchanged starter
  (heading `# Willkommen in „…"` + sentence "per Knopfdruck");
  **self-written/customized teasers remain untouched**.

**Verification (Heino session):**

- Both renames in one save (slug + display name) → 200, bag
  renamed along, tiddlers retained ✓
- Edit after a previous save with a further display name change → 200,
  `$:/SiteTitle` + "Willkommen" follow along ✓
- Customized `$:/SiteTitle` / "Willkommen" is not overwritten ✓
- Custom bag names are not renamed; shared bags stay invalid ✓

---

## 14. Multilingual admin app: 8 languages (`i18n`)

**Files:**
- `packages/admin-vanilla/src/i18n.ts` (new)
- `packages/admin-vanilla/src/locales/en.ts` … `zh-cn.ts` (new; en, de, es,
  fr, ja, ko, ru, zh-cn)
- `packages/admin-vanilla/src/app.tsx` (all visible strings via `t()`)

**Concept:** The keys are English strings (en.ts = source of truth); the
remaining translations are located in one file per language. `t(key, params?)`
supports `{name}` interpolation and falls back to the key itself if
a translation is missing. Currently **472 keys** in all 8 languages, 1:1
consistent (verified by checks: same key set, same placeholders).
Plural variants use `Intl.PluralRules`: en/de/es/fr/ru provide their
own form for `#one` among others; ja/ko/zh use the base form.

**Language switcher:** `<select>` with the options `🇺🇸 English`, `🇩🇪 Deutsch`,
`🇪🇸 Español`, `🇫🇷 Français`, `🇯🇵 日本語`, `🇰🇷 한국어`, `🇷🇺 Русский`,
`🇨🇳 中文` in the header (labels from `localeLabels` in `i18n.ts`). The
selection is stored in `localStorage` (`"mws.admin.locale"`) and takes
effect immediately via `setCurrentLocale()` + `location.reload()`; without
its own entry the installation-wide default language applies (see §47),
otherwise the browser language (`navigator.language`) (`normalizeLocaleCode`
maps `de`/`es`/`fr`/`ja`/`ko`/`ru`/`zh` to the matching language, everything
else to `en`).

**Detail fixes in this process:**
- `description`/`headerDescription`/`footerDescription` are now
  actually rendered via `t()` (they were raw without translation).
- The temperature display field `title` is forced to a string.
- The locale `<select>` uses `ref` instead of `value` (webjsx `SimpleAttrs`).

---

## 15. Delete Roles + Protection of the System Roles

**Backend** (`packages/mws/src/new-managers/TabDataAdapter.ts`, route
`AdminDeleteRole`; registered in `new-managers/index.ts`):
`PUT /admin/role/delete`, body `{name}`.

- Authorized: the creator (owner) of the role or the `admin` account.
- **System roles `ADMIN`/`USER`/`ANON` cannot be deleted** → `403`
  (`"The system role '<name>' cannot be deleted."`).
- Deletes the role as well as the associated
  `recipe_permission`/`template_permission`/`bag_permission`
  (`role_id`) rows (there is no FK cascade in the DB); user memberships
  disappear via the `_RolesToUsers` cascade.

**Frontend** (`app.tsx`): a red **"Delete role"** button in the edit
dialog of the Roles tab (with a `confirm()` prompt). The permission
check (`canDeleteRole`) additionally hides it when the role name
corresponds to a system role name (`roleNameIsReserved`). For creating
roles, the create button is also only shown to the logged-in `admin`
account (the server blocks non-admins in `TabUpserts.ts` anyway —
otherwise a user could grant themselves privileges by self-assignment).

---

## 16. Wiki Slug: Live Validation + Availability Check

**Goal:** While typing in the slug field (Wiki tab, create/edit), it
is immediately shown whether the slug has the permitted format and is
still available — the slug is an important URL component.

**Format:** Only lowercase letters, numbers and hyphens —
`^[a-z0-9]+(-[a-z0-9]+)*$` (i.e. `mein-wiki`, **never** `mein wiki`).
The value is intentionally **not** trimmed, so that trailing spaces
also appear as invalid in the client.

**Client** (`packages/admin-vanilla/src/definition/renders.tsx`,
`renderSlugLiveValidation`):
- empty → a notice about the format;
- invalid format → red warning;
- valid + **already taken** → red "This name is already taken."
  (DE: „Dieser Name ist bereits vergeben."; against `itemsByTab.wikis`);
- valid + available → green "This name is available."
  (DE: „Dieser Name ist verfügbar.").

When editing, the current slug itself is exempt from the assignment
check ("saved" comparison). New i18n keys (en+de) and the CSS variable
`--color-success` (light+dark) were added.

**Server** (`packages/mws/src/new-managers/TabDataAdapter.ts`,
`RecipeDataAdapter.saveRow`): the same regex checks the slug when
saving — invalid formats are rejected with a clear message (instead of
being able to save silently). Uniqueness is still guaranteed by
`checkExisting`.

**The same availability signal for bag names:** In the Bags tab,
`renderBagNameLiveValidation`
(`packages/admin-vanilla/src/definition/renders.tsx`) checks live
against `itemsByTab.bags` whether the typed name is already taken —
the same green/red messages as with the slug (the i18n keys are
reused). When editing, the name itself is exempt from the check. A
format check is deliberately omitted: bag names are free-form
identifiers (spaces, umlauts, capitalization allowed — we tested
"Mein erstes Bag"), since they never appear in URLs. The server still
enforces uniqueness via `checkExisting` (foreign bags → 403 "Only the
user who created the bag …").

**The same for the username in the Users tab:**
`renderUsernameLiveValidation` checks live against `itemsByTab.users`
(key `username`, server-side uniqueness via `checkExisting` +
`username @unique`). When editing, the own name is exempt.

Live validation only runs in the real admin editors
(`liveValidation: true` in `createModalState`) — the login/profile
forms (`FomController`, `liveValidation: false`) deliberately show
**no** availability message while typing in the username field.

---

## 17. Wiki Creation as a Dropdown (Instead of Two Buttons)

**Before:** Two separate buttons in the Wiki tab: primary "New Wiki"
(1-click) + ghost button "Create Wiki" (full form).

**Now:** A dropdown **"Create a Wiki"** (primary button,
`<details>`/`<summary>` like the existing account menu) with two menu
items:
- **"Create 1-Click Wiki"** → quick create (`startNewWiki`, previously
  "New Wiki");
- **"Create Defined Wiki"** → full form (`openCreate`, previously
  "Create Wiki").

The ghost button on the right was removed; for the other tabs
(Templates/Bags/Roles/Users) it remains unchanged. The dropdown opens
to the left and never exceeds the window width (`right: 0`,
`max-width: calc(100vw - 96px)`, no horizontal scrollbar).

---

## 18. Light/Dark Mode with a Toggle

**Files:**
- `packages/admin-vanilla/src/theme.ts` (new)
- `packages/admin-vanilla/src/main.tsx` (early theme initialization)
- `packages/admin-vanilla/src/app.tsx` (toggle button in the header)
- `packages/admin-vanilla/src/app.inline.css`

**Behavior:** Default = follow the system (`prefers-color-scheme`, no
`data-theme` attribute → the media queries take effect live). A click on
the round button (sun/moon icon) next to the language switcher records
the choice as `data-theme="light"|"dark"` on `<html>` and stores it in
`localStorage` (`"mws.admin.theme"`). `initializeTheme()` in main.tsx
applies a stored choice **before the first paint** (no flickering while
loading).

**CSS:** The light block is now the base (`html { … }`); dark applies
via `@media (prefers-color-scheme: dark)` to
`html:not([data-theme="light"])`, and at the end of the file
`html[data-theme="dark"]` (the attribute selector wins by specificity)
forces dark explicitly. **New light base color:**
`--color-surface-page-*` were made warmer — mid tone `#F3E6C5`, top
`#f7ecd2`, bottom `#ecdab0`.

**Accessibility:** The button carries `aria-label` + `title`
("Switch to light/dark mode", translated DE/EN).

---

## 19. Bug Fix: Profile Page (`/profile`) Showed No Data

**Problem:** On `https://…/profile` ("User Profile") the fields
**Username**, **Email** and **Roles** were always empty — not a single
entry was present in the form.

**Cause:** The profile form was never wired up to server data:
`ProfileForm.createDraft()` created the draft with empty values
(`username: ""`, `email: ""`, `roles: []`), and there was nowhere that
populated these fields from the server data. In addition, the embedded
`userState` contained `username` and `roles` but **no** `email` — so
the client could not know the email at all.

**Fix (two places):**

1. **Server** (`packages/mws/src/new-managers/sessions.ts`): The
   `AuthUser` interface and `parseIncomingRequest()` now also carry the
   **`email`** (loaded along with the session lookup; anon: `""`). Thus
   it is available in the `embeddedServerResponse` of every admin page.
2. **Client** (`packages/admin-vanilla/src/app-profile.tsx`):
   `createDraft()` now reads the profile data directly from
   `embeddedServerResponse.userState`:
   - `username` = `userState.username`,
   - `email` = `userState.email`,
   - `roles` = `userState.roles` → now only the role names.

**Verification** (test session of user `Heino` against port 5000):

- `GET /profile` returns `userState` with `"email":"Heino@…
  das-buddhistische-haus.de"` and the roles of the user ✓
- UI displays username, email and roles correctly ✓ (confirmed by the
  user)

---

## 20. Feature: Password Generator for Password Fields

**Where?** Everywhere a **new** password is set:

- **Users tab** (`Set password` / `Reset password`),
- **Profile page** (`New password`),
- **Login reset flow** (`New password`).

For pure login and "Current password" fields there is no generator.

**Handling:** Below the input field a **"🎲 Generate password"** button
and a **length field** appear (8–32, default 16; entries outside 8–32
are corrected immediately). To its right a display continuously shows
the **entropy** of the chosen password ("Entropy: 98.07 bit" with 16
characters) and a **color bar** the password strength (red → yellow →
green in 5 levels). A click generates a secure random password, which

- is displayed **in plain text on its own line** (with
  `user-select: all` — selectable by click, for copying/reading off),
- is automatically transferred into the password field **and** the
  confirmation field ("Passwords match.").

**Character set "secure + simple":** `A-Z a-z 0-9 !@#$%&*` with a
guaranteed mix (at least 1 uppercase letter, 1 lowercase letter, 1
digit, 1 special character each). Generation exclusively via
`crypto.getRandomValues`.

**Implementation:**

- `packages/admin-vanilla/src/password-generator.tsx` (new): custom
  element `<mws-password-generator>` (🎲 button) + `generatePassword()`
  (LOS/"rejection free" random index, Fisher-Yates shuffle) + entropy
  display (`length × log₂(70)`) + 5-level strength color bar.
- `FieldDefinition` in `tabs.ts` has a new optional field
  `passwordGenerator?: string | true` (string = key of the confirmation
  field that is filled along with it).
- The `enter-password` renderer (`renders.tsx` `renderTextInputField`)
  only appends the generator below the field when `passwordGenerator` is
  set.
- New i18n keys `Generate password`, `Length`, `Entropy: {value} bit`
  and `Password strength` (DE: „Passwort generieren", „Länge",
  „Entropie: {value} bit", „Passwortstärke") — parity now **246/246**.
- `confirmPassword` / `confirmNewPassword` remain pure client fields
  (temp/validation); only `password` / `newPassword` go to the server
  and are hashed there via OPAQUE — no plaintext in the DB.

**Verification:**

- `npx tsc -p tsconfig.json --noEmit` ✓
- Generator **🎲 button**, entropy display & strength bar always up to
  date with the length; logic verified by a Node smoke test: 18,000
  checks (length/character set/guaranteed mix incl. clamping 8/32/
  fallback) ✓
- Bundle (`main.js`) contains generator markup,
  `password|length` texts and `crypto.getRandomValues` logic ✓
- i18n parity en↔de: 246/246 ✓

---

## 21. Teacher Area: TEACHER Role & `AuthUser.isTeacher`

**File:** `packages/mws/src/new-managers/sessions.ts`,
`packages/mws/src/new-commands/init-store.ts`

A school operator (principal/`admin`) hires users as teachers by
assigning them the system role **`TEACHER`** (normally via the Users
tab or `PUT /admin/save/users`).

- `SessionManager.TeacherRoleName = "TEACHER"`; every session of a user
  with this role gets `AuthUser.isTeacher = true`.
- A teacher is therefore a **delegated user manager, not an admin**:
  they may create, edit and delete their own (invited) students in
  their Users tab, but they do **not** manage the contents of other
  teachers and do **not** override the content ACLs. There is
  deliberately **no** `isAdmin` bypass for teachers.
- `init-store.ts` idempotently creates the `TEACHER` role as well
  (`description: "Teacher/team manager (delegated) – isTeacher"`).

**Verification:** A user with the `TEACHER` role → `/admin/load` returns
`isTeacher: true`; without the role `false`. Teachers see only their own
students + themselves in the Users tab (see §12/`getList` filter).

---

## 22. Content Separation: Personal Roles (Named After the Username)

**File:** `packages/mws/src/new-managers/TabDataAdapter.ts`
(`ensurePersonalRole`, called in `AdminCreateWiki`)

**Why is this necessary?** The SET role `TEACHER` is a shared "thing" —
all teachers share it. If a 1-click wiki received the `TEACHER` role as
a recipe/bag permission, **all** teachers could see **all** teacher
wikis (data leak). Therefore each teacher gets an **own, private
role**:

- `ensurePersonalRole` creates/links exactly one role, named after the
  **username** (raw, e.g. `Frau Meyer`; slug suffix `-persoenlich` only
  if the name collides with a reserved system role name — `ADMIN`,
  `USER`, `ANON`, `TEACHER`, case-insensitive; occupied by a foreign
  owner → numeric suffix), owner = the user themselves.
- With the **1-click wiki** (`AdminCreateWiki`, `PUT /admin/wiki`) a
  teacher assigns **their own** personal role instead of `ADMIN`:
  - Bag `editions/<owner-id>/<slug>` → `<Benutzername> → C_admin`
  - Recipe → `<Benutzername> → B_write`
  - **No** more `USER`/`ANON` `A_read`! A teacher's private wikis are
    thus readable only by the teacher themselves — regardless of whether
    logged in or anonymous. Making them public happens deliberately
    (§26).
  - The owner of bag/recipe remains the teacher (`owner_user_id`), so
    that the previous owner/`admin` protection (§11) still applies
    unchanged.
- The role guard (§23) prevents a teacher from assigning this role to
  themselves — it is theirs, they already have it independently via the
  1-click wiki.

**Verification** (live test against a local instance):

- frau-meyer creates `wiki-frau-meyer-2` → new role `Frau Meyer` (DB),
  bag/recipe with `Frau Meyer` permissions; frau-meyer opens
  `/wiki/wiki-frau-meyer-2`: 200 ✓
- herr-schmidt opens the same wiki: **403**, and the wiki does **not**
  appear in their admin wiki list ✓
- Student/anonymous: 403 ✓

---

## 23. Role Guard: Teachers Must Not Assign All Roles

**File:** `packages/mws/src/new-managers/TabDataAdapter.ts`
(`UserDataAdapter.saveRow`)

A teacher can assign roles to their students via `PUT /admin/save/users`
— but not every role. The guard blocks:

1. **`ADMIN` and `TEACHER`** — a teacher may neither appoint new admins
   nor new teachers (otherwise self-promotion security hole, analogous
   to §11).
2. **Personal roles of other teachers** — any role whose owner
   (`owner_user_id`) is a **different** teacher must not be assigned
   (that would leak other teachers' wikis to the student). The own role
   (named after the own username) is allowed.

Technically: First `normalizeLineList(data.userRoles)` is checked
against `["ADMIN","TEACHER"]`; then the selected roles are resolved per
owner via `prisma.users.findMany` and the owners who themselves carry
the `TEACHER` role (≠ current user) are marked as forbidden. On
violation: `403 ACCESS_DENIED` with a clear reason.

**Verification** (herr-schmidt session):

- Create a user with `userRoles: ["USER", "Klasse 2"]` → 200 ✓
- User with `userRoles` including `Frau Meyer` → 403 ✓
- User with `userRoles` including `ADMIN`/`TEACHER` → 403 ✓

---

## 24. Admin UI: Foreign Personal Roles Out of the User Dialog

**Files:**
- `packages/mws/src/new-managers/TabDataAdapter.ts`
  (`RoleDataAdapter.getList`/`saveRow` → new server field
  `foreignTeacherRole`)
- `packages/admin-vanilla/src/definition/tabs.ts`
  (`RoleAdminRecord` + `roles` field definition, mode `"server"`)
- `packages/admin-vanilla/src/definition/renders.tsx`
  (`getLookupOptions`)

**Problem:** The server guard (§23) does block foreign personal roles
server-side (403 verified), but in the dropdown of the user dialog
**all** roles appeared — including `Frau Meyer` etc. That was confusing
and let the teacher infer that the colleague `Frau Meyer` even exists
(existence leak).

**Fix:** The server marks per role whether it is the personal role of
**another** teacher:

- `RoleDataAdapter.getList` computes `foreignTeacherRole` via
  `getTeacherOwnerIdSet` (determines which role owners themselves carry
  the `TEACHER` role) and compares with the current user.
- `tabs.ts`: new field `foreignTeacherRole` (type `switch`,
  `mode: "server"`) on the role record — it does not appear anywhere in
  the UI, since the Roles tab has no runtime field groups, but it is
  available in the client record.
- `getLookupOptions`: **Only** in the `userRoles` field are roles with
  `foreignTeacherRole: true` hidden for non-admins.

**Important:** The wiki/bag/template permission dropdowns
(`recipeAdmins`, `recipeUsers`, `bagPermissions`, `templateAdmins`,
`templateUsers`) still show **all** roles — collaboration (§25) needs
foreign personal roles there, and the server guard protects against
misuse.

**Verification** (`/admin/load` responses):

- As herr-schmidt: `Frau Meyer` has `foreignTeacherRole: true`,
  `Herr Schmidt` `false` ✓
- As frau-meyer: exactly the other way around ✓
- The built client (`/main.js`) contains
  `e.roles.filter(r=>r.foreignTeacherRole)` and applies it only for
  `userRoles` ✓

**Addition — Visibility in the Admin Lists (`wikis`/`bags`):**

The list filters of `RecipeDataAdapter.getList` and
`BagDataAdapter.getList` now count only **qualified roles**
(`visibilityRoleIds`, constant `CORE_ROLE_NAMES =
["ADMIN","USER","ANON","TEACHER"]`): anyone who can reach a wiki/bag
only via the shared system roles `USER`/`ANON`/`TEACHER` does **not**
see it in the admin view. Only personal teacher roles, invited roles
and class roles create visibility.

**Verification** (live test after `2026-09-16`):

- frau-meyer (roles: `USER`, `TEACHER`, `Frau Meyer`) sees in `wikis`
  **only** `wiki-frau-meyer` + `wiki-frau-meyer-2` and in `bags` only
  their own (including the one shared with herr) — `wiki-heino`,
  `wiki-admin`, `wiki-admin-2` and the demo wikis are **no longer** in
  the list ✓
- herr-schmidt (roles: `USER`, `TEACHER`, `Herr Schmidt`) sees in
  `wikis` only `wiki-herr-schmidt` and in `bags` their own plus the one
  shared with them, `Test-Bag-1-frau-meyer` ✓
- Admins keep the unfiltered view (`isAdmin` branch unchanged) ✓

Note: This only affects the **admin view**. Actual read access to
old/demo wikis with `USER`/`ANON` permission via the wiki URL remains
for logged-in users (a deliberate decision, see §24).

---

## 25. Collaboration: A Teacher Invites a Teacher into Their Wiki

Because the personal roles are transparent (§24, only the `userRoles`
filter hides them), a teacher can specifically pull a colleague into a
shared wiki:

1. herr-schmidt creates their own wiki `wiki-herr-schmidt` via the
   Wikis tab → own role `Herr Schmidt`.
2. frau-meyer saves `wiki-frau-meyer-2` and additionally enters
   `Herr Schmidt`:
   - **Recipe admins** (`recipeAdmins`, level `B_write`),
   - **Bag permissions** (`editions/wiki-frau-meyer-2`), level `B_write`
     (the details likewise via the bag/template permission tables).

**Effect:** herr-schmidt sees `wiki-frau-meyer-2` in their admin wiki
list and opens `/wiki/wiki-frau-meyer-2` with 200 — so they can
read/write along. Students and anonymous users: still 403.

**Verification** (live test):

- herr opens a foreign, invited wiki: 200 ✓
- Student/anonymous on the same wiki: 403 ✓
- Conversely, schueler-a1 opens herr's wiki (`wiki-herr-schmidt`):
  403 ✓ (no cross-access)

---

## 26. Student Sharing: Class Roles Grant Read Access

In addition to collaboration, a teacher wiki can be deliberately
opened for the teacher's **own class** — without becoming public:

1. The principal/`admin` creates class roles (e.g. `Klasse 1`,
   `Klasse 2`; owner = `admin`).
2. The teacher assigns their students to these roles (normally via the
   Users tab, the §23 guard only blocks foreign teacher roles).
3. In the Wikis dialog they enter the class role under **"Who may read
   this wiki (A_read)"** (= `recipeUsers`). When saving,
   `syncRecipePermissionsToBags` automatically mirrors this sharing to
   the bags of the wiki (§28). A manual second step in the Bags tab is
   no longer needed. (Existing wikis are healed with a simple re-save.)

**Effect:** Logged-in students of the class read the wiki (200);
anonymous visitors stay out (403), because no `ANON` permission exists
anymore. Other classes/foreigners: 403.

**Verification** (live test, schueler-a1 with the password `start123`
set by frau-meyer + `Klasse 1 → A_read` on `wiki-frau-meyer-2`):

- schueler-a1 opens `wiki-frau-meyer-2`: 200 ✓
- Anonymous on the same wiki: 403 ✓
- Collaborator herr-schmidt: 200 ✓ (role remains)
- schueler-a1 on `wiki-herr-schmidt`: 403 ✓

---

## 27. Bug Fix: `users.email` Nullable (No `""` Collision)

**Files:**
- `prisma/schema.prisma` (`Users.email String? @unique`)
- `prisma/migrations/20260916_email_nullable/migration.sql` (new;
  RedefineTables rebuild of the `users` table, data/FKs preserved,
  `email` NOT NULL removed)
- `packages/mws/src/new-managers/TabUpserts.ts`
  (`UserImportWriter.upsert`: empty email → `null`)
- `packages/mws/src/new-managers/TabDataAdapter.ts`
  (`saveRow`/`getList`: DB `null` → `""` in the DataStore response)

**Problem:** `Users.email` was `String @unique` (NOT NULL). A user
without an email was stored as `""`. The second user without an email
collided on the unique index → `409`/UNIQUE error when creating.

**Fix:** Empty emails are now stored as **`NULL`**; multiple `NULL`s
are allowed in the unique index. The two-column migration
`20260916_email_nullable` rebuilds the user table Prisma-style and is
applied automatically by the server at startup
(`packages/mws/src/db/sqlite-adapter.ts`). The client still sees `""`
(Zod expects `string`), the rest of the code remains unchanged.

**Verification** (live test, herr-schmidt session):

- Create two users **without** email one after the other → both 200 ✓
- Stored in the DB as `email: null` (not `""`) ✓
- New `users` table: `email` nullable, `owner_user_id` remains
  nullable + preserved ✓
- Test users then removed again via `PUT /admin/user/delete` ✓

---

## 28. Bug/Feature: Deleting Bags (Owner + Admin)

**Files:**
- `packages/mws/src/new-managers/TabDataAdapter.ts` (new route
  `AdminDeleteBag`, `PUT /admin/bag/delete`)
- `packages/admin-vanilla/src/app.tsx` (`deleteBag`, "Delete bag"
  button in the Bags dialog), `locales/de.ts` + `locales/en.ts`
- `packages/mws/src/new-managers/index.ts` (route registered)

**Problem:** The Bags tab had **no** deletion — neither a server
endpoint nor a UI button. A teacher could no longer remove a test bag
they had created themselves.

**Fix:** New endpoint `PUT /admin/bag/delete` with body `{name}`:

- **Permission:** Only the **owner** (bag owner == logged-in user;
  teachers may only delete their own) or the site admin `admin`.
- **Protection:** Bags that are referenced by a **wiki recipe**
  (`recipeBag`) are not deleted (to prevent breaking a wiki) → 403 with
  a clear message.
- Deleting removes `bagPermission` and `tiddlers` rows as well as the
  bag itself.

In the client the **"Delete bag"** button only appears when editing
one's own bag (`canDeleteBag`, owner comparison via `ownerUsername`),
with a German/English confirmation.

**Verification** (live test, frau-meyer session `2026-09-16`):

- Delete an own free test bag → 200 `{deleted:true}`, gone from the DB
  and from the admin list ✓
- Foreign bag (`editions/wiki-heino`, owner Heino) → 403 ✓
- Referenced own bag (`editions/wiki-frau-meyer-2`) → 403
  ("used by a wiki recipe") ✓

---

## 29. Feature: Recipe permissions automatically applied to the bags

**Files:** `packages/mws/src/new-managers/TabDataAdapter.ts`
(`syncRecipePermissionsToBags`, called in
`RecipeDataAdapter.saveRow`)

**Problem:** When opening a wiki, MWS checks both the recipe **and** every bag
(`RecipeResolver.assertRecipe`). If a teacher enters the class role only in
`recipeUsers` (recipe `A_read`), the bag permission was missing → schueler
saw the wiki in the admin list but got a 403 when opening it
(`BAG_NO_READ_PERMISSION`). The same gap also affected `B_write`
cooperations.

**Fix:** When a wiki is saved, all bags of the recipe automatically receive
the permissions that were granted at recipe level:

- `A_read` on the recipe → `A_read` on the bag;
- `B_write` on the recipe → `B_write` on the bag;
- Existing higher permissions are kept (the owner's `C_admin` is never
  downgraded), the sync is a pure upsert ("only raise").

This way the sharing is complete with **one** entry
(recipe + bags consistent). Existing wikis whose bags are still missing
heal automatically on the next save.

**Verification** (live test `2026-09-16`, frau-meyer session):

- Before: `editions/wiki-frau-meyer` only had `Frau Meyer → C_admin`;
  schueler-a1 (roles `Klasse 1`, `USER`) → `/wiki/wiki-frau-meyer` **403**.
- Re-save of the wiki (recipeUsers `Klasse 1`) → the bag gets
  `Klasse 1 → A_read` (the owner's `C_admin` remains) ✓
- schueler-a1 opens `/wiki/wiki-frau-meyer` → **200** ✓

---

## 30. Feature: "Real names" instead of "Recipe" in the admin UI

**Files:** `packages/admin-vanilla/src/definition/tabs.ts`
(field group titles), `packages/admin-vanilla/src/locales/en.ts` /
`locales/de.ts`

**Problem:** Internally the wiki permissions are called "Recipe Users" /
"Recipe Admins" (German "Rezept-User" / "Rezept-Admins"). For teachers
these terms were confusing and technical.

**Fix:** The two field groups in the wiki settings dialog are now called
**"Readers" / "Leser"** (who may open the wiki — read access) and
**"Editors" / "Bearbeiter"** (who may make changes). The server field
names `recipeUsers`/`recipeAdmins` remain unchanged; only the display was
renamed.

**Verification:** `npx tsc --noEmit` (admin-vanilla) green; the built
`public/admin-vanilla/main.js` contains the new keys ("Readers",
"Leser", "Bearbeiter" …).

---

## 31. Feature: Understandable, translated error messages

**Files:** `packages/admin-vanilla/src/app.tsx`
(`formatStorageErrorForDisplay`, `renderErrorBanner`,
`STORAGE_ERROR_REASON_KEYS` …), `app.inline.css` (`.error-banner`),
`locales/en.ts` / `locales/de.ts`

**Problem:** Errors from the admin API were displayed raw, e.g.
`{"status":403,"reason":"ACCESS_DENIED","details":{…}}`. That is not
readable for teachers and was not localized.

**Fix:**

- `formatStorageErrorForDisplay(storageError, t)` now translates known
  server reasons (`details.reason` / `reason`) via a mapping table into
  i18n keys (EN/DE). Variable reasons (e.g. "The system role '…' cannot
  be deleted." or forbidden role assignments) are detected via prefixes;
  unknown codes get a generic, localized fallback plus the `reason` code.
- The error display (delete errors in the dialog, storage errors in the
  modal footer, global `mainStorageError`, new wiki errors) uses a modern
  `.error-banner` (icon circle in the danger color, rounded surface,
  optional dismiss button) instead of raw `<pre>` JSON blocks.

**Verification:** `npx tsc --noEmit` (admin-vanilla) green; the server
reason "This bag is used by a wiki recipe and cannot be deleted on its
own." comes exactly from `AdminDeleteBag`, the mapping key exists in the
built `public/admin-vanilla/main.js`; the display in the client is now:
"This bag is used by a wiki and cannot be deleted."

---

## 32. Feature: Student wiki limit (teacher sets it per student)

**Files:** `prisma/schema.prisma` (`Users.wiki_limit Int?`),
`prisma/migrations/20260916_wiki_limit/migration.sql`,
`packages/mws/src/new-managers/sessions.ts` (`AuthUser.wikiLimit`),
`wiki-contract.ts` (`UpsertUserInput.wikiLimit`), `TabUpserts.ts`
(`UserImportWriter`), `TabDataAdapter.ts` (`ensurePersonalRole`,
`AdminCreateWiki`), `new-commands/init-store.ts`,
`packages/admin-vanilla/src/definition/tabs.ts` (field `wikiLimit`),
`packages/admin-vanilla/src/app.tsx` (render flags, tab filter,
create menu, empty state), `locales/en.ts` / `locales/de.ts`

**Problem:** Students could create any number of their own wikis. The
teacher should be able to set per student how many own wikis that
student may create (0…unlimited) — and student wikis should be private
by default (shared wikis via Readers/Editors).

**Fix:**

- New DB field `Users.wiki_limit Int? @default(0)` with migration script
  (`ALTER TABLE "users" ADD COLUMN "wiki_limit" INTEGER DEFAULT 0;`),
  Prisma client regenerated.
- **Limit semantics:** `NULL` = unlimited, `0` = blocked, `N` = at most
  `N` own wikis. Enforced in `AdminCreateWiki` **only for
  non-teachers/non-admins**: it counts the own `recipe` rows and responds
  with 403 and `"Your administrator has not allowed you to create your
  own wikis."` (at 0) or `"You have reached your limit of {N} own
  wiki(s)."` (when the limit is reached). Admins and teachers are
  exempt.
- `AuthUser` carries `wikiLimit`, the session query selects
  `wiki_limit`; anonymous users always get 0.
- In the admin UI, the Users tab shows a number field "Own wiki limit"
  (empty = unlimited); only teachers/admins see the Users tab.
- **Privacy:** `AdminCreateWiki` assigns students/teachers a personal
  role (`ensurePersonalRole`) instead of the system ADMIN role; this way
  student wikis do not automatically appear for others (including the
  teacher), visibility arises only via shared Readers/Editors.
- Instructional controls in the client: the tab filter hides
  bags/templates for non-admins/teachers; the "Create a wiki" menu is
  only shown when `canCreateOwnWiki`; empty states explain the block or
  the reached limit.
- The admin bootstrap user (init-store) gets `wikiLimit: null`.

**Verification:** Typechecks (root + admin-vanilla) green, `tsup` build
ok; live test against `dev/wiki/store/database.sqlite`:

- frau-meyer sets "Own wiki limit" for schueler-a1 to `2` → this
  matches his existing count (2 own wikis); 3rd creation →
  `403 ACCESS_DENIED` "You have reached your limit of 2 own wiki(s)."
- Limit set to `0` → creation → `403 …` "Your administrator has not
  allowed you to create your own wikis."
- Limit empty (unlimited) → creation → `200`, new
  `wiki-schueler-a1-3`, then deleted again and the limit reset to `2`.
- Privacy: frau-meyer does **not** see schueler-a1's wikis in
  `/admin/load` and gets `403` on `/wiki/wiki-schueler-a1`;
  schueler-a1 himself reaches his wiki with `200`.
- The built client contains the new strings
  (`Own wiki limit`, error texts EN/DE).

---

## 33. Feature: Teacher capability on the role flag instead of the name

**Files:** `prisma/schema.prisma` (`Roles.is_teacher Boolean @default(false)`),
`prisma/migrations/20260916_roles_is_teacher/migration.sql`,
`packages/mws/src/new-managers/sessions.ts` (`isTeacher` via the
`is_teacher` flag), `wiki-contract.ts` (`UpsertRoleInput.isTeacher`),
`TabUpserts.ts` (`RoleImportWriter`), `TabDataAdapter.ts`
(`getTeacherOwnerIdSet`, `RoleDataAdapter.saveRow`,
`UserDataAdapter.saveRow` role protection, `visibilityRoleIds`),
`new-commands/init-store.ts`,
`packages/admin-vanilla/src/definition/tabs.ts` (field `isTeacher`,
`switch`), `packages/admin-vanilla/src/definition/renders.tsx` (role
selection for non-admins), `locales/en.ts` / `locales/de.ts`

**Problem:** The teacher hierarchy hung on the hard-coded role **name**
"TEACHER" (`isTeacher` was determined by name comparison). Renaming it
to e.g. "Gruppenleiter 1" would have immediately stripped all teacher
rights.

**Fix:**

- New column `Roles.is_teacher Boolean @default(false)`; the migration
  sets it to `true` for the existing `TEACHER` role.
- Detection now checks the **flag** on one of the user's roles
  (`sessions.ts`), no longer the name. This decouples the capability
  from the name and it **survives any rename**; several group leader
  roles ("Gruppenleiter 1", "Gruppenleiter 2", …) are also possible.
- `RoleDataAdapter.saveRow`: `isTeacher` is persisted via
  `RoleImportWriter` in `update`/`create`; only **admins** may set the
  flag (403 `"You must be an admin to grant teacher capabilities."`).
- `UserDataAdapter.saveRow` protection: teachers may not assign a role
  whose flag is set (instead of blanket-checking the name "TEACHER").
- `getTeacherOwnerIdSet`/`foreignTeacherRole` detect foreign leader
  roles via the flag.
- `visibilityRoleIds` filters teacher capabilities by flag instead of
  name — even after a rename they do not grant admin list visibility.
- `getLookupOptions` (client) hides flagged roles in the role selection
  for non-admins.
- New UI field "Teacher role" (switch) in the Roles tab; i18n EN/DE.

**Verification:** Typechecks (root + admin-vanilla) green, `tsup` build
ok, the migration is applied automatically at startup. Live test:

- Admin renames `TEACHER` to "Gruppenleiter 1" → herr-schmidt remains
  `isTeacher: true` (the session reads the flag); renamed back.
- Admin creates the new role "Gruppenleiter 2" with the flag and assigns
  it to schueler-a1 → schueler-a1 (limit 2, 2 existing wikis)
  immediately gets the teacher exemption and creates another wiki.
- Non-admin (teacher frau-meyer) cannot set the flag → 403.
- Test artifacts removed again afterwards (role deleted, role assignment
  reverted, test wiki deleted, TEACHER unchanged).

---

## 34. Feature: Creators always see their own wikis

**Files:** `packages/mws/src/new-managers/TabDataAdapter.ts`
(`RecipeDataAdapter.getList`)

**Problem:** A non-admin user only saw their own wikis if a
"qualified" role (personal/invited/class role) was included in the
recipe permissions. Seeded wikis (e.g. `buch-vorlage`,
`dein-tiddlywiki`, `wiki-heino`) have only core roles
(`A_read → USER/ANON`, `B_write → ADMIN`) — the creator Heino (role
only "USER") saw his own wiki list displayed empty. For others,
however, they remained just as invisible.

**Fix:** `RecipeDataAdapter.getList` additionally queries
`{ owner_user_id: this.user.user_id }` via `OR` for non-admins. This way
a creator always sees their own wikis — regardless of which roles are
in the permissions. For other users visibility remains purely
role-based (private).

**Verification:** Typecheck green, `tsup` build ok, `pm2 restart`. Live
test: Heino (only "USER") sees his 6 own wikis in the list; frau-meyer
and schueler-a1 still do **not** see these wikis; frau-meyer/schueler-a1
still see only their own or shared wikis.

---

## 35. Feature: Teacher roles undeletable + "created by: —"

**Files:** `packages/mws/src/new-managers/TabDataAdapter.ts`
(`AdminDeleteRole`), dev DB (`roles.owner_user_id` of the TEACHER role)

**Problem:** The TEACHER role (i.e., every teacher role) carried an
owner ("created by: <User>") and could be deleted by the site admin —
in contrast to the system roles ADMIN/USER/ANON, which are protected by
a name check.

**Fix:**

- `AdminDeleteRole` additionally blocks every role with `is_teacher=true`
  (reason: `"A teacher role cannot be deleted."`). The protection is tied
  to the **capability flag**, not the name — it survives renaming
  "TEACHER" to e.g. "Gruppenleiter 1" (consistent with the `is_teacher`
  feature, §33).
- The TEACHER role gets `owner_user_id = NULL`, so "created by" shows
  "—" just like for the system roles and only the site admin can edit
  it.

**Verification:** Typecheck green, `tsup` build ok, `pm2 restart`
(online). Live test as admin: `role/delete` on TEACHER → 403 ("A teacher
role cannot be deleted."); on ADMIN → still 403 (system role);
temporary role without the flag ("Loeschtest") → created and deleted
(200). TEACHER record: `owner_user_id IS NULL`, `is_teacher=1`.

---

## 36. Feature: Admin backup (database + keys + config)

**Files:** `packages/mws/src/new-managers/BackupRoutes.ts` (new),
`packages/mws/src/new-managers/index.ts` (registration),
`packages/admin-vanilla/src/app.tsx` (admin menu "Backups"),
`packages/admin-vanilla/src/app.inline.css`,
`packages/admin-vanilla/src/locales/en.ts` / `de.ts`

**Problem:** There was no way to back up the complete wiki inventory
(tiddlers, bags, recipes, roles, users). Everything is contained in the
single SQLite file `store/database.sqlite`; simply copying it during
operation can be inconsistent because of the WAL.

**Fix:**

- New admin routes `PUT /admin/backup` and `GET /admin/backup/list`
  (only `isAdmin`, `requestedWithHeader` + referer check).
- `GET /admin/backup/download?name=<name>` delivers the complete backup
  as a ZIP (`Content-Disposition: attachment`). The ZIP is built without
  an extra package using Node `zlib` (CRC32 + optional Deflate). This
  route deliberately runs **without** `requestedWithHeader` so that a
  normal `<a download>` link works (protection via `okAdmin` + referer
  check; the backup name is checked by regex against path traversal).
- `PUT /admin/backup/delete` (body `{ name }`) deletes a backup.
- Important: The backup routes are registered in `ApiRoutes` **before**
  `AdminSave` (`/admin/:op/:tab`), otherwise the generic route
  intercepts `PUT /admin/backup/delete` (`op`/`tab` validation fails).
- Snapshot via SQLite `VACUUM INTO` — runs during operation, is
  consistent and contains the WAL state. Deliberately **outside** a
  transaction (`VACUUM` is forbidden there), therefore directly via
  `state.engine`.
- Target: `backups/mws-<YYYYMMDD-HHMMSSmmm>/` next to `store/` (so in
  the data instance, not served by the web server). Contains
  `database.sqlite` as well as — if present — `passwords.key`,
  `package.json`, `package-lock.json`, `mws*.json` (config) and
  `tw5-versions.txt`, plus `backup.json` (name, time, files, size).
- Retention: the newest 10 backups are kept, older ones are deleted.
- Admin UI: "Backups" dropdown in the header area (admins only) with
  "Create backup now" and the list of the most recent backups. Each
  entry is a download link (ZIP) and has a small delete button (with a
  confirmation prompt).

**Restore:**

1. Stop the server (`pm2 stop MultiWikiServer-wikiwise`).
2. Move the current `store/` folder aside.
3. Copy `database.sqlite` from the backup to `store/database.sqlite`
   (if necessary, additionally restore `passwords.key` and `mws*.json`).
4. Start the server (`pm2 start MultiWikiServer-wikiwise`).

**Verification:** Typecheck green, `pm2 restart`. Live test as admin:
backup created → 200, folder contains a valid DB (`PRAGMA
integrity_check` = ok; same row counts for `Recipe`/`recipe_bag`/
`recipe_permission`/`users`/`roles` as live), `passwords.key`/
`package.json`/`tw5-versions.txt` copied; the list shows the backups;
after 11 backups 10 remain (oldest removed). Download as admin → 200
(`application/zip`, `unzip -t` error-free, unpacked DB valid); delete
as admin → 200, folder gone; nonexistent name and path traversal
(`../../etc`) → 404. Non-admin and no session → 403. Test session and
own test backup removed after the test.

---

## 37. Feature: Display "X of Y own wikis"

**Files:** `packages/admin-vanilla/src/definition/tabs.ts` (column + field
`ownWikiUsage`, `UserAdminRecord`),
`packages/mws/src/new-managers/TabDataAdapter.ts` (`UserDataAdapter`),
`packages/admin-vanilla/src/app.tsx` (banner in the Wiki tab),
`packages/admin-vanilla/src/app.inline.css`,
`packages/admin-vanilla/src/locales/en.ts` / `de.ts`

**Problem:** Although the student wiki limit (§32) is enforced
server-side, there was nowhere to see how many own wikis you had
already created and how many are still allowed. Admins/teachers also
could not recognize at a glance the usage of an individual user.

**Fix:**

- **Banner in the Wiki tab:** For logged-in users without an admin role
  — thus also teachers — a compact notice appears above the wiki list
  (`wiki-limit-banner`, smaller font/padding than a normal callout):
  - with a limit: "You have created X of Y own wikis — Z more are
    possible." (when the limit is reached, the existing "Limit reached"
    message; at limit 0, the "not yet allowed" message),
  - without a limit (and for teachers, for whom the limit does not
    apply server-side): "You have created X of ∞ own wikis — unlimited
    additional wikis are possible."
  Admins see no banner.
- **Column in the user list:** New server column "Own wikis" with the
  display `created / limit` (e.g. `1 / 2`). No limit or
  admins/teachers (exempt from the rule) show `n / ∞`.
- The counting is done server-side in `UserDataAdapter.getList`
  directly via `prisma.recipe.owner_user_id` (one `findMany` + map
  tally), so that teachers also count wikis that are not visible to
  them in the wiki list. `saveRow` counts analogously via
  `prisma.recipe.count`, so that the row is updated correctly after
  saving.
- `ownWikiUsage` is a pure server field (`mode: "server"`), so it is
  not editable in the storage form. The exception for admins/teachers
  is determined, just like in the session logic, via
  `role_name === "ADMIN"` or `is_teacher`.

**Verification:** Typecheck (server + client) green, server rebuilt
(`tsup`), `pm2 restart`. Live as admin: `GET /admin/load` returns
`ownWikiUsage` for every user (student with limit 2 and 1 wiki →
`1 / 2`, admin/teacher → `n / ∞`). The client bundle contains the
banner logic (with and without a limit), the new locale texts and the
compact `wiki-limit-banner` CSS. No test artifacts were created in the
DB.

---

## 38. Fix: Creators may also edit their own wikis

**Files:** `packages/mws/src/new-managers/RecipeResolver.ts`
(`assertRecipe`, `canWriteBag`)

**Problem:** Heino (role only "USER") could not edit his own wikis —
the wiki page reported "You are logged in as Heino (read-only)". Cause:
The affected wikis (`buch-vorlage`, `dein-tiddlywiki`, …) were created
when Heino was still an admin. Their bags therefore have only core
roles (`ADMIN → C_admin`, `USER/ANON → A_read`). After the degradation
to "USER" only reading remained. §34 had fixed the **visibility** of
own wikis in the admin panel, but not the **write/read permissions** in
the resolver that serves the actual wiki page.

**Fix:** The resolver now additionally knows the `owner_user_id` of the
recipe and the bags and treats the creator like an authorized user:

- `assertRecipe`: If the user is the owner of the recipe or of one of
  its bags, the role-based read barrier is dropped (own wikis remain
  readable, even if the roles are changed later).
- `canWriteBag`: If the user is the owner of the target bag, they may
  write — regardless of roles. For everyone else the strict role-based
  check still applies.

**Verification:** Typecheck green, `tsup` build + `pm2 restart`. Live as
Heino: `GET /recipe/buch-vorlage/status` → `canUserWrite: true`; save a
test tiddler via `batch/save` → 200, then remove it again via
`batch/delete` (no leftovers in the `tiddler` table). Cross-check as
schueler-a1 (foreign wiki): `canUserWrite: false`, `batch/save` → 403
`BAG_NO_WRITE_PERMISSION`.

---

## 39. Feature: Admin tab "Storage" (storage overview)

**Files:** `packages/mws/src/new-managers/StorageRoutes.ts` (new),
`packages/mws/src/new-managers/index.ts` (registration),
`packages/admin-vanilla/src/app.tsx`,
`packages/admin-vanilla/src/app.inline.css`,
`packages/admin-vanilla/src/locales/en.ts` / `de.ts`,
`prisma/schema.prisma` (read-only queries)

**Problem:** There was no place where an admin could see at a glance
how full the system disk is and how much space each individual
component of the MultiWikiServer-wikiwise occupies. For operations
(backups, cleanup, capacity planning) this transparency was completely
missing.

**Fix:**

- New admin route `GET /admin/storage` (`zodRoute`, `state.okAdmin()`,
  `securityChecks: { requestedWithHeader: true }`, `state.assertReferer`
  against its own origin). Registered as `AdminStorage` in
  `new-managers/index.ts`.
- Response `StorageInfo` with:
  - `disk` (`statfsSync(wikiPath)` → `totalBytes`/`usedBytes`/
    `availableBytes`, usage in percent + traffic light status),
  - `lastScan` (timestamp of the last collection),
  - `recordCounts` (Prisma counts for tiddlers/bags/wikis/templates/
    users),
  - `categories` (recursive directory scans via `getDirStats`:
    database, application data, attachments, temporary data, backups,
    cache, system & configuration — each with files, directories, size,
    modification date),
  - `blobs` and `topUsers` (see §40/§41).
- Admin UI: The new **"Storage"** tab appears to the right of "Users"
  and is **visible only to admins** (tab button and `loadStorage` check
  `userState.isAdmin`). Since it is not a CRUD tab (no `TabId`), a
  synthetic `storageTabDefinition` is used in the frontend; `activeTab`
  was extended to `TabId | "storage"` and the list panel branch was
  branched off via an `isStorageTab` ternary.
- Display (from top to bottom):
  - **"System disk" / "Disk storage status"** — card with progress bar,
    traffic light status, "Last scan" and `{free} free`. The earlier
    heading `System disk` was deliberately renamed resp. separated so
    that disk space and app usage are not confused.
  - **"MWS-wikiwise storage usage"** — its own section
    (`storage-records-section`) with the counts for tiddlers, bags,
    wikis, templates and users.
  - **Data overview** — table over the directory categories with the
    columns path/category/files/directories/total size/modification
    date.
  - **Legend** — explains the categories and colors.
  - **Refresh / Try again** in the section header.
- All labels are stored bilingually (EN/DE) as i18n keys (among others
  "Storage"/"Speicher", "System disk"/"System-Festplatte", "Disk storage
  status"/"Speicherstatus der Festplatte", "MWS-wikiwise storage
  usage"/"Speicherbelegung MWS-wikiwise").

**Verification:** Typecheck (root + `admin-vanilla`) green, `tsup` build
ok. Live test against `dev/wiki/store/database.sqlite`: `GET
/admin/storage` returns valid disk values, counts and categories; the
new strings and CSS classes are contained in the built client bundle;
non-admin and session without `X-Requested-With` header → rejected. (A
complete HTTP end-to-end test as admin was not possible via `curl`
because of the OPAQUE password, see Operations/Outlook.)

---

## 40. Feature: "Blobs & Files" section in the Storage tab

**Files:** `packages/mws/src/new-managers/StorageRoutes.ts`,
`packages/admin-vanilla/src/app.tsx`,
`packages/admin-vanilla/src/app.inline.css`,
`packages/admin-vanilla/src/locales/en.ts` / `de.ts`

**Background:** MWS does **not** store binary content (images, videos,
PDFs) **like Rails/ActiveStorage in separate files**, but rather
**inline as base64 text in the `Tiddler.fields` field** of the SQLite
database. The old `AttachmentService` (`store/files/<hash>/`) does exist
in `attachments.ts`, but it is **inactive** (`attachmentsEnabled=false`,
no `attachment_hash` in the schema, no imports). That is why there was
previously no display of how much space the actual binary content
occupies.

**Fix:**

- The `blobs` block of the route classifies binary tiddlers via MIME
  patterns (`BINARY_TYPE_PATTERNS` = `image/%`, `video/%`, `audio/%`,
  `application/pdf`, `application/octet-stream`, `font/%`), checked via
  SQL over `json_extract(fields, '$.type')`. `application/json` and the
  like do **not** count as a blob.
- Delivered are: `blobCount`/`blobBytes` (number and byte sum of the
  binary content), `contentBytes` (`sum(length(fields))` over all
  tiddlers), `tiddlerCount`, `storeFiles` (files/directories/size/
  modification date of `store/files/`), `inbox` (`store/inbox/`) and
  `orphanedStoreFiles` (orphaned files).
- **Orphan detection:** A directory under `store/files/` is considered
  valid if it matches a 64-character hex/SHA256 name and contains both
  `meta.json` and a `data*` file. Everything else (foreign files,
  incomplete or unreferenced folders) is counted as orphaned.
- UI: its own section **"Blobs & Files"** (`storage-blobs-section`)
  with six tiles: **Blobs**, **File store**, **Wiki content**,
  **File attachments on disk**, **Inbox**, **Orphaned files** (classes
  `is-blobs`/`is-store`/`is-content`/`is-disk`/`is-inbox`/`is-orphan`).
  The "Blobs" and "Wiki content" tiles additionally show a note
  ("{count} files", "in store/files/" etc.).

**Verification:** The SQL logic was tested in isolation via
`better-sqlite3` against `dev/wiki`: `blobCount 23`, `blobBytes
7.865.187`, `contentBytes 17.957.395`, `tiddlerCount 1088`. The orphan
detection was tested in isolation with test folders (3 of 4 correctly
detected). Typecheck and build green.

---

## 41. Feature: "Storage usage per user (Top 10)"

**Files:** `packages/mws/src/new-managers/StorageRoutes.ts`,
`packages/admin-vanilla/src/app.tsx`,
`packages/admin-vanilla/src/app.inline.css`,
`packages/admin-vanilla/src/locales/en.ts` / `de.ts`

**Problem:** It is unknown which users occupy how much storage —
important, e.g., to recognize run-away student wikis.

**Fix:**

- The `topUsers` block determines the top 10 via an SQL join
  `Users → Recipe (owner_user_id) → recipe_bag → Bag → Tiddler`
  (per user only wikis are counted where he is the owner:
  `HAVING count(DISTINCT r.id) > 0`; sorting `total_bytes DESC
  LIMIT 10`). Fields: `username`, `wikiCount`, `wikiContentBytes`,
  `fileStoreBytes`, `totalBytes`.
- **Without double counting:** Since the binary content is contained in
  the tiddler fields, it would otherwise be counted twice. The table
  therefore states explicitly: **File store** = binary blob bytes,
  **Total** = all tiddler field bytes of the user, **Wiki content** =
  Total − File store.
- UI: its own section **"Storage usage per user (Top 10)"** with the
  columns **User | Wikis | Wiki content | File store | Total** (classes
  `storage-user-table`, `storage-user-name`, `storage-user-total`);
  numeric columns right-aligned, "Total" bold.

**Verification:** SQL logic tested via `better-sqlite3` against
`dev/wiki` (top user among others Heino: 5 wikis, 17.191.550 B total,
7.612.135 B blobs, 9.579.415 B wiki content). The generated SQL was
verified in the built `dist/mws.js` and the UI strings/CSS classes in
the client bundle. i18n is in sync between EN and DE with **353/353**
keys. Latest build: `public/admin-vanilla/main-6SOOAJ4R.js`.

---

## 42. Feature: Pinboard – shared "pin a note"

**Goal:** A low-threshold exchange spot for all logged-in users
(admin, teacher, student). Everyone may pin notes (post-its); visibility
runs through three target groups (scopes): **GLOBAL** (everyone), **class/role**
(role), **individual person** (user). The feature is purely UI + API + DB –
no changes to the TW core, to sync, or to ACLs needed.

### Backend

**Schema** (`prisma/schema.prisma`, migration `20260917_pinboard`):

- `PinboardNote`: `id`, `author_user_id`, `author_name` (snapshot),
  `scope_type` (`GLOBAL`/`ROLE`/`USER`), `scope_id?`, `body` (max 1700
  characters, server-side `MAX_BODY` in `PinboardRoutes.ts`), `color`
  (6 colors), `is_important`, `is_active`,
  `created_at`/`updated_at`, `expires_at?`
- `PinboardNoteRead`: `note_id`, `user_id`, `read_at?`,
  `dismissed_at?` (PK = `(note_id, user_id)`). Only *private*:
  read receipt for one's own badge, **no** feedback to the author.

**Routes** (`packages/mws/src/new-managers/PinboardRoutes.ts`,
registered in `new-managers/index.ts`):

| Route | Method | Description |
|-------|---------|--------------|
| `/api/pinboard` | GET | List of all visible notes + `unreadCount` + targets |
| `/api/pinboard/unread-count` | GET | Badge number only (polling every 30 s) |
| `/api/pinboard/note` | PUT | Create / update (body, color, important, scope, expiration) |
| `/api/pinboard/note/delete` | PUT | Remove (author, admin, teacher on class boards) |
| `/api/pinboard/read` | PUT | Toggle `read` / `dismissed` |

**Visibility & moderation** (`canSee`, `canEdit`, `canDelete` in
`PinboardRoutes.ts`):

- A note is visible if `is_active=true`, it has not expired **and** the
  target group matches: `GLOBAL` → all logged-in users; `ROLE` → members of
  that role; `USER` → exactly this person. Authors always see their own
  notes; admins see everything.
- Delete/remove: **author** their own, **admin** everything; **teacher**
  on their class boards (roles they created).
- **Writing on the global board** only admin/teacher (not students) —
  otherwise there is a spam risk. Class/person notes may be pinned by anyone.

**Unread badge:** `unreadCount` = visible notes without `read_at` **and**
without `dismissed_at` for the current user, but **not** own notes.
Polling in the client every 30 s (`loadPinboardUnread`).

### Frontend

**Component** (`packages/admin-vanilla/src/pinboard.tsx`,
custom element `<mws-pinboard>`):

- **"Pinboard" tab** in the admin bar (visible for all roles),
  badge with the number of unread notes.
- **Cork/felt background** (light: warm beige `#d4b896` with
  linen texture; dark: dark felt `#2d2218`).
- **Post-it cards**: stable tilt per ID (`tiltForId`: –3°…+3°);
  hover straightens it + lifts it (scale 1.02, stronger shadow); tape
  strip at the top; important notes = red thumbtacks, sorted to the very top.
- **Preview on the board**: every note shows only the first **130 characters**
  (`BODY_PREVIEW_CHARS`, cut at a word boundary + "…") — the
  full text is behind a click in the viewer (see below), the board stays calm
  and **does not shift when opening** (no more canvas growth).
- **Wide notes**: from **200 characters** (`BODY_WIDE_CHARS`) the note is
  displayed twice as wide (`is-wide`: 340 px instead of 220 px,
  `grid-column: span 2`), so that long previews are more readable.
- **Colors**: yellow/pink/blue/green/orange/purple (CSS variables, dark mode
  adapted).
- **Filter chips**: *All · Unread · Mine*.
- **Composer** (new/edit): textarea (**1700 characters**, above it a
  **character counter** `NNN/1700`, red when the limit is reached), color swatches,
  important checkbox, target group dropdown (only allowed options),
  optional expiration date. The server-side Zod limit (`<=1700`) is
  displayed translated ("Too long: at most 1700 characters allowed.").
- **Viewer modal**: a click on a note opens the full text in a
  centered modal (`.pinboard-viewer`, colored note look matching the note,
  `pre-wrap`, scrollable for very long texts, max. 62vh height). Header with
  author + recipient group ("All"/"For {name}"), meta bar (time,
  expiration date "Expires on …", "Mine"). Close via ×, "Close" button
  or a click on the background.
- **Actions**: per note on hover (small pills) *and* in the viewer modal:
  mark as read/unread, "Unpin for me" (dismissed),
  edit (author/admin), remove (author/admin/teacher on class boards).
  New in the modal: **"Copy to clipboard"** — copies the full text
  via the Clipboard API (secure context, user gesture) and shows "Copied"
  feedback with a checkmark icon for 1.6 s; errors appear as a red message.
- **Filed-away area** (collapsed at the end) for dismissed notes.
- Fully **i18n** (EN/DE, **57 keys**, parity 57/57).

**Integration** (`packages/admin-vanilla/src/app.tsx`):

- Tab button in the bar (`pinboard`), badge `pinboardUnread`.
- Renders `<mws-pinboard onUnreadChange={…} />` in the content area.
- Unread polling every 30 s, live update when a note is opened.

**CSS** (`packages/admin-vanilla/src/app.inline.css`):

- `pinboard-wall` (cork background, dark variant), `pinboard-wall-grid`
  (responsive masonry-like), `pinboard-note` (card, tilt, hover,
  colors), `pinboard-note-tape` (tape), `pinboard-note-pin`
  (thumbtack), `pinboard-note.is-wide` (wide notes), filter chips,
  composer incl. `pinboard-char-count`/`.is-full`, `.pinboard-viewer`
  (modal + color variants), actions, empty/filed-away states.

### Migration & data

- `prisma/migrations/20260917_pinboard/migration.sql`:
  `CREATE TABLE pinboard_note` + `pinboard_note_read` + index
  `(is_active, scope_type)`. FK `note_id → pinboard_note` (cascade).
- Prisma client generated without errors (`npx prisma generate`).

### Verification

- `npm run tsc2` → 0 errors.
- `npm run build` → ESM server (`dist/mws.js`) + client bundle
  (`public/admin-vanilla/main-*.js` / `*.css`) successful.
- Manual smoke tests (admin + teacher + student sessions against
  localhost:5000):
  - Teacher pins globally → visible to everyone ✓
  - Student pins in the class (role) → only class members see it ✓
  - Student pins at a classmate (USER) → only the recipient sees it ✓
  - Student **cannot** pin globally → 403 `ACCESS_DENIED` ✓
  - Unread badge counts correctly (not own notes, not dismissed,
    mark-as-read works) ✓
  - Important notes (red pin) sort first ✓
  - Edit/delete rights apply (author/admin/teacher class board) ✓
  - Expiration date: expired notes disappear from visibility ✓
  - Preview: >130 characters → truncated teaser with "…" (word boundary);
    ≥200 characters → note becomes twice as wide (`is-wide`, 340 px) ✓
  - Viewer modal: a click opens the full text in note look; **the remaining
    notes do not shift** (no canvas height change) ✓
  - "Copy to clipboard" returns the full text; brief
    "Copied" feedback; the error case shows a red message ✓
  - Character counter: `NNN/1700` red at the limit; 1701 characters → translated
    Zod message "Too long: at most 1700 characters allowed." ✓
  - Dark mode look correct (felt, post-it colors adapted) ✓
  - i18n EN/DE complete (tab label, tooltips, error messages, composer,
    viewer modal, copy; 57/57) ✓
  - 30 s polling updates the badge without a reload ✓

---

## 43. Feature: Thumbnail display (wiki previews)

**Goal:** The wiki list in the *Wikis* admin tab shows a
**thumbnail** (headless screenshot of the real wiki page) for each wiki instead of
just text columns. A click opens the image large in a modal. The image is rendered
**per user** — it shows exactly what the logged-in viewer
would see on the wiki page (including their view and read permissions).

### Backend

**File:** `packages/mws/src/new-managers/WikiThumbnailRoutes.ts` (new),
route registered in `packages/mws/src/new-managers/index.ts` before the
general recipe route (`REGEX_WIKI_THUMBNAIL`):

| Route | Method | Description |
|-------|---------|--------------|
| `/wiki/<slug>/thumbnail` | GET/HEAD/OPTIONS | PNG of the wiki (640×400) |

- **Access condition:** logged in (`user.isLoggedIn`) **and**
  `RecipeResolver.assertRecipe` — the same read rights as when opening the
  wiki itself (anonymous → 403, no rights → 403). Thus the preview is
  not a side channel for content.
- **Rendering:** `playwright-core` + Chromium (headless, `--no-sandbox`).
  The browser path is looked up **once** (and cached) via a
  fallback chain: `MWS_CHROMIUM_PATH` → `CHROME_PATH` → Playwright browser
  cache (`~/.cache/ms-playwright`, e.g. including `firefox`/`ffmpeg` after a single
  `npx playwright install chromium`; new and old directory layouts
  incl. `chrome-headless-shell`) → `/usr/bin/chromium(-browser)` →
  `/snap/bin/chromium`. Missing candidates are skipped — only if
  none exists does the render call report the missing browser.
  The browser is started lazily and **reused**. It renders the
  real page `/wiki/<slug>` with **viewport 1280×800** and takes a
  screenshot after the TiddlyWiki client has booted (networkidle + 2500 ms wait);
  this is downscaled to **640×400
  (`object-fit: cover`)** via a helper page (better antialiasing than a
  native low-res capture). **Concurrency limited:** at most
  **2** renders run at the same time (each opens its own browser context;
  `MWS_THUMBNAIL_RENDER_CONCURRENCY`, clamped to 1…8). After a TTL expiry
  the entire wiki list re-renders on first opening — instead of an unlimited
  CPU/RAM spike the renders queue up FIFO (verification with
  limit 1: 12 wiki images requested simultaneously, one after another in ~51 s, all
  200 `image/png`).
- **Session context:** the session cookie of the calling user is passed along
  to the browser context → the image matches their view. The cache
  is deliberately **shared across users** (one slot per slug): the
  access check runs server-side in `assertRecipe` (without rights there is
  no PNG at all), and the thumbnail is content-wise
  identical for all permitted users — personalized elements are created client-side in the browser and
  do not appear in the screenshot. Whoever requests first after the TTL expiry
  thus defines the image for everyone, until invalidation. A real
  per-user cache (`<slug>.<userId>.png`) would be N×M render slots and would
  counteract the render limit (see above) — therefore deliberately not.
- **Cache:** the result is located under `store/thumbnails/<slug>.png` in the
  data store (outside web delivery). TTL by default **24 h**;
  resolution: `MWS_THUMBNAIL_TTL_HOURS` (environment variable) →
  `admin.thumbnailTtlHours` (settings page, §47) → 24 h (`thumbnailTtlMs`
  in `WikiThumbnailRoutes.ts`). Writing is atomic (`…png.tmp` +
  `rename`), an in-flight queue prevents parallel duplicate renders for
  the same path. Response: `image/png`, `Cache-Control: private,
  max-age=<TTL in s>` (always private per session, value follows the server TTL),
  plus **`ETag`** (from mtime+size) and **`Last-Modified`**. Conditional
  requests are answered: `If-None-Match` (also in ETag lists or
  `*`) and `If-Modified-Since` → **304** without body; the comparison runs at
  second resolution so that the last-modified round is not
  missed by sub-second mtimes.
- **Invalidation (debounced):** after `batch/save`/`batch/delete` on a wiki
  (`RecipeRoutes.ts` → `invalidateThumbnail`) the cached PNG is only
  **throttled** deleted: every change resets a timer, and the file
  is only removed **shortly after the last change** (default **180 s**,
  `MWS_THUMBNAIL_DEBOUNCE_SECONDS` overridable). Thus the
  TiddlyWiki autosaves (one `batch/save` per tiddler change) no longer
  repeatedly destroy the preview while a wiki is being edited — the next image after the
  timer expires is automatically re-rendered (a short staleness window after
  the last edit is intentional).
- **Cleanup:** when a wiki is deleted (`AdminDeleteWiki` — owner **or**
  site admin), its preview is **immediately** removed (`deleteThumbnail`, also
  aborts a possibly running debounce timer so that later re-creating
  the same slug does not lose the fresh PNG). In addition,
  a **sweep at server start** (`sweepOrphanedThumbnails` on
  `mws.config.init.after`) removes all files from `store/thumbnails/` that no longer
  belong to any current recipe (deleted wikis, `.png.tmp` leftovers from
  crashes) — the orphans left behind earlier are thus removed.
  The filename is the lossy slug sanitization
  (`[^a-zA-Z0-9_-] → _`); the sweep therefore builds the valid file set from the
  **sanitized** slugs of all recipes — a collision can only keep one file,
  never delete a live one.

### Frontend

**Files:** `packages/admin-vanilla/src/definition/tabs.ts` (column
  `thumbnailUrl`, makes the first column wider than before),
  `packages/admin-vanilla/src/definition/store.ts` (URL construction),
  `packages/admin-vanilla/src/app.tsx` (`renderListCellValue` +
  preview modal), `packages/admin-vanilla/src/app.inline.css`,
  `packages/admin-vanilla/src/locales/en.ts` / `de.ts`

- **Column:** `thumbnailUrl` (empty label, width 3) sits directly after
  `slug`. The value is built **client-side** from the slug
  (`${pathPrefix}/wiki/<slug>/thumbnail`); **nothing** new comes from the
  server JSON.
- **Thumbnail:** `<img class="wiki-thumbnail">` — 128×80, `object-fit: cover`,
  rounded, `loading="lazy"` + `decoding="async"` (scroll performance),
  gear/stripe base pattern as long as the image loads, `cursor: zoom-in`.
- **Modal:** a click on the image (`stopPropagation`, does not open the
  slug link) → centered `.thumbnail-modal` (`.modal-shell-centered` /
  `.modal-card`) with header "Thumbnail" / "Wiki preview",
  `.close-button` (×), a click on the background closes as well; large
  `.wiki-thumbnail-full` (640×400, `object-fit: cover`,
  `max-height: calc(100vh - 220px)`).
- **i18n:** keys `Thumbnail` → "Thumbnail" and `Wiki preview` →
  "Wiki preview" (EN/DE, parity 1:1).

### Verification

- `npm run tsc2` green; `npm run build` (ESM server + client bundle)
  successful; route included in `dist/mws.js`.
- Live test against localhost:5000:
  - logged in + read access on `wiki-<slug>` → `GET /wiki/<slug>/thumbnail`
    → 200, `image/png`, edge dimensions 640×400 ✓
  - anonymous → 403 `ACCESS_DENIED` "User not authenticated" ✓
  - without read access → 403 (the same barrier as the wiki page itself) ✓
  - HEAD → 200 without body; OPTIONS → 200 empty ✓
  - Cache: the second call is served from `store/thumbnails/`, after `batch/save`
    it is re-rendered ✓
  - Client: the column appears in the Wikis tab, the modal opens/closes (×,
    background click) ✓

> **Operational note:** For the first rendering of a wiki, Chromium must be
> present on the server. Simplest option: one-time
> `npx playwright install chromium` (places everything in `~/.cache/ms-playwright`,
> is found automatically by the fallback chain); alternatively a
> system Chromium (`apt install chromium` or similar) or explicitly
> `MWS_CHROMIUM_PATH`/`CHROME_PATH`. If no browser is reachable, only
> **the generation** fails — the wiki data itself is not affected,
> and a failed render is not cached.

---

## 44. Feature: "My Files" (per-account file upload)

**Goal:** Every logged-in user (admin, teacher, student) manages
**their own files** in their own tab: upload, download, view
inline (image, audio, video, PDF, text, Markdown and ODT) and share
in a targeted way.
The bytes are stored content-addressed on the hard disk under
`store/files/<sha256>/` — exactly the layout that the admin tab "Storage"
(§40) evaluates —, the SQLite tables `user_file`/`user_file_share`
hold only metadata and recipients. The feature is purely UI + API + DB,
no changes to the TW core, to sync, or to ACLs.

### Backend

**Files:** `packages/mws/src/new-managers/UserFileRoutes.ts` (new),
routes registered in `packages/mws/src/new-managers/index.ts`;
limit specification in `packages/mws/src/ServerState.ts` (default **100 MB**
per file, overridable via `MWS_USERFILE_SIZE_LIMIT`).

| Route | Method | Description |
|-------|---------|--------------|
| `/api/user-files/upload` | PUT | **Stream** the multipart into the inbox, `sha256` while streaming, then adoption into `store/files/<sha256>/`; over the limit → 413, body is discarded |
| `/api/user-files/list` | GET | Own files (metadata); admins see all, with owner column |
| `/api/user-files/shared` | GET | "Shared with me": foreign visible files (with owner); empty for admins |
| `/api/user-files/share-targets` | GET | Permitted recipient options ("All", roles, users) per account type |
| `/api/user-files/share` | PUT | Replace share scopes (`GLOBAL`/`ROLE`/`USER`), normalized server-side to the allowed options; an empty list ends sharing |
| `/api/user-files/download` | GET/HEAD | Stream as `attachment` with the correct filename |
| `/api/user-files/preview` | GET/HEAD | Stream `inline` with `Accept-Ranges: bytes`, range support (206 + `Content-Range`, otherwise 416 `bytes */<size>`) — for seeking in audio/video |
| `/api/user-files/delete` | PUT | Delete one of your own files (admin: all); the bytes are only removed when no `user_file` row points to the hash anymore |

**Rights matrix** (`shareGrantsVisibility`): owners always see their files,
admins see everything. Otherwise the account type of the
**sharer** decides: admin shares reach everyone; teacher shares reach
admins and members of the selected roles — **other teachers never**;
student shares reach only specifically selected recipients
(classmates/teachers). Recipient options (`collectShareTargets`) and
submitted scopes (`normalizeShareScopes`) are filtered per user,
inadmissible entries are discarded server-side.

**Storage:** `store/files/<sha256>/data.<ext>` (one data file per
content hash; extension from a MIME table) + `meta.json`
(contentHash, filename, type, original name, `user_id`, timestamps). The
upload streams without a buffer via the inbox; leftovers are cleaned up on
abort. GET/HEAD paths check the same visibility
(`fetchAuthorizedFile`) — an unshared file yields 404.

### Frontend

**File:** `packages/admin-vanilla/src/user-files.tsx` (custom element
`<mws-user-files>`), styles in `app.inline.css`, i18n in
`locales/en.ts`/`de.ts`.

- **"My Files" tab** in the admin bar; table with name, type,
  size and timestamp; admins additionally see the owner
  (owner column). The admin detection (`isAdminView`) checks **both**
  mount types — `hasAttribute("admin")` (string tag
  `<mws-user-files admin>`) **or** `props.admin === true` —, since the
  JSX string tag mount does not populate `props`.
- **Upload** via ghost button (upload icon) → multipart PUT; afterwards
  automatic refresh of the list.
- **Preview modal:** image (its own `<img>`), audio/video with controls
  (`autoplay`, seek via range requests), PDF in an iframe;
  **ODT** (`application/vnd.oasis.opendocument.text`, `.odt`) is
  **client-side** converted to HTML with `odf-kit/reader`
  (`odtToHtml(bytes, { fragment: true })`) and rendered in a sandboxed
  iframe (custom element `OdtPreviewDocument`, `srcdoc` as property)
  with a light/dark look (`mws-light`/`mws-dark`) —
  `.doc` files deliberately **without** preview (download offered);
  text files as `<pre>`; **Markdown** (`text/markdown`, `.md`) renders
  with a lean client-side renderer (`renderMarkdownToJSX`: headings
  h1–h5, lists, code, block quote, `hr`, inline `**bold**` / `__bold__` /
  `*italic*` / `_italic_` / `~~strikethrough~~` / `` `code` `` / links). Content
  is rendered exclusively as **text nodes** (never parsed as HTML)
  → no XSS; links only `http(s)`/`mailto`.
- **Download** via `/api/user-files/download` (browser saves the
  file) — also for "Shared with me" files.
- **Share** (share icon): selection from `/api/user-files/share-targets`
  (all/class people), saving via `/api/user-files/share`.
- **Delete** (trash can icon): only own files (admin: all).
- Fully **i18n** (DE/EN), light/dark mode (preview areas
  use `--color-surface-modal`/`--color-surface-field`), icons in the
  preview header 16×16.

### Migration & data

- `prisma/migrations/20260920120000_user_file` (table `user_file`:
  `id`, `user_id` (owner, without FK), `filename`, `type`, `extension`,
  `sha256`, `sizeBytes`, `created_at`/`updated_at`, index on `user_id`)
- `prisma/migrations/20260920150000_user_file_share` (table
  `user_file_share`: `file_id` → `user_file` (cascade), `scope_type`,
  `scope_id`; indices on `file_id` and `(scope_type, scope_id)`)

### Verification

- `npm run tsc2` → 0 errors; `npm run build` → ESM server + client bundle.
- Live tests against localhost:5000 (admin/teacher/student sessions):
  - Upload (PUT, multipart) → file in the list + `store/files/` ✓
  - Download: `attachment` header, browser saves correctly ✓
  - Preview: image/audio/video/PDF/text/Markdown/ODT; Markdown file renders
    (e.g. `TiddlyWiki-Setup.md`) structurally correct, no HTML injection ✓
  - ODT preview: an uploaded `.odt` (filename with spaces) renders
    in the sandboxed iframe — heading + table appear in the
    `srcdoc`, the iframe width follows the detail area
    (`odt-preview-document { width: 100% }`) ✓
  - Admin owner column: an admin session shows all
    files in "My Files" with the owner's username (e.g. "Schüler 2"); verified via the
    string tag mount `<mws-user-files admin>` ✓
  - Range: `Range: bytes=…` → 206 + `Content-Range`, invalid → 416 ✓
  - Sharing: entitled recipients see the file, unshared →
    404; teachers do not see teacher shares of other teachers ✓
  - Delete removes the row and, as soon as no reference exists,
    also the bytes ✓

---

## 45. Feature: File upload directly in the wiki (goes to the wiki owner)

**Goal:** Every wiki gets an
**"Upload file"** button in its toolbar. A click uploads a file to the **file store of
the wiki owner** (`recipe.owner_user_id`), not that of the
uploader: for example, if a teacher opens a wiki that belongs to a student/colleague
and has **write access** there, the file ends up in the owner's
"My Files". Without a wiki context (no `recipe` parameter)
the upload stays with the own account as before (§44).

### Frontend

**Files (new):** `plugins/client/tiddlers/upload-file.js`
(startup module), `plugins/client/tiddlers/status/upload-file-button.tid`
(button in `$:/tags/PageControls`), `plugins/client/tiddlers/status/icon-upload.tid`;
texts in `plugins/client/tiddlers/en-US.multids`.

- The button dispatches `tm-upload-file`; the startup module listens at the
  root widget. Not logged in (`$:/status/IsLoggedIn ≠ yes`) → notice
  "You must be logged in to upload files".
- Logged in: hidden `<input type=file multiple>`; each selected
  file is sent **sequentially** via multipart `PUT` to
  `api/user-files/upload?recipe=<slug>` (`X-Requested-With:
  fetch`). The slug comes from `$:/config/multiwikiclient/recipe`.
- Notifier: own upload → "Uploaded "X" to your files"; foreign wiki →
  "Uploaded "X" to <Besitzer>'s wiki"; missing write access → "You do
  not have write access to this wiki"; over the limit → 413 message; otherwise
  a generic error.

### Backend

**File:** `packages/mws/src/new-managers/UserFileRoutes.ts`
(route `/api/user-files/upload`, now with `zodQueryKeys: ["recipe"]`).

- Optional query parameter `recipe`: `RecipeResolver.assertRecipe`
  resolves the wiki; write access applies for **admin**, **wiki owner**,
  `B_write` on the recipe **or** write access on a writable bag
  (`RecipeResolver.canWriteBag`). Otherwise **403** with
  `x-reason: no write access to this wiki`.
- Target owner = `recipe.owner_user_id` (fallback: uploader). This
  value ends up in `user_file.user_id` **and** in the `meta.json` of the bytes.
- Response: `{ file, owner: { user_id, username } }` — the client uses
  `owner.username` for the notifier wording.
- Without the `recipe` parameter, behavior is unchanged (file goes to
  the uploader).

### Verification

- `npm run tsc2` → 0 errors; server bundle rebuilt via `tsup`.
- E2E (second instance on `:5001`, admin opens `wiki-schuler-2` from
  "Schüler 2"): a click on "Upload file" → `PUT …/upload?recipe=wiki-schuler-2`
  → **200**, response `owner.username = "Schüler 2"`; notifier "Uploaded
  "klassenfoto.txt" to Schüler 2's wiki"; `user_file.user_id` = Schüler 2,
  bytes under `store/files/<sha256>/`. Test file then removed via
  `/api/user-files/delete` (row + bytes gone) ✓
- The running dev server on `:5000` must be restarted after the build
  (Node holds the old bundle in memory).

---

## 46. Translation: MWS client texts automatically follow the wiki language

### Findings

- All MWS client strings are translatable tiddlers with the title
  `$:/language/MWS/...`. They are shipped as **shadow tiddlers** by the plugin
  `$:/plugins/mws/client` and are defined
  in `plugins/client/tiddlers/en-US.multids` only in English.
- The core language plugin (`$:/languages/de-DE`) translates exclusively
  core strings, **not** the `MWS/...` keys. An automatic fallback to
  `de-DE` therefore does not exist; `$tw.language.getString(title)` only looks up
  `$:/language/<title>`.
- A normal wiki tiddler with the same title (`$:/language/MWS/...`)
  **overrides** the shadow; `$tw.wiki.isShadowTiddler(title)` remains
  `true` in the process. Thus the translation is purely possible on the data side — without code.

### Automatics (implemented)

`plugins/client/tiddlers/language.js` is a `module-type: startup` module. It
collects all translated strings at start via
`[all[shadows+tiddlers]prefix[$:/plugins/mws/client/i18n/]]` (shadows are not
included in the default `prefix[]` source filter — hence the explicit
source filter). Each translation file `tiddlers/i18n/<code>.multids` thus creates
shadow tiddlers `$:/plugins/mws/client/i18n/<code>/<key>`; the code is derived
from the last `$:/language` path segment (lowercased, `_`→`-`).
Resolution: first the exact code (`de-DE` → `de-de`), then the primary language
(`de-DE` → `de`, `zh-Hans`/`zh-CN`/`zh_CN` → `zh`). On a match the
module writes real tiddlers `$:/language/MWS/<key>` with the translated text; a
`change` listener on `$tw.wiki` applies the language again as soon as
`$:/language` arrives or is switched.

Important: when switching to an unsupported language (or English),
nothing is **deleted** (`deleteTiddler` leaves an empty shell
`{title, type}` instead of making the shadow visible), rather the English
text is explicitly written from a start snapshot of the shadows. Real
tiddlers `$:/language/MWS/...` that already exist at start are considered
per-wiki overrides and are never touched.

Already shipped: `de`, `ru`, `es`, `fr`, `ja`, `ko`, `zh` (English is supplied
by the `en-US.multids` shadows as the source file). Another language is added
by a new file `tiddlers/i18n/<code>.multids` with the same keys.
The client plugin does not ship a fixed language — each wiki decides
for itself via its `$:/language` (without `$:/language` it stays English).

So that the injected overrides are not written back to the server via the syncer,
the sync filter excludes `$:/language/MWS/`:
`$:/config/SyncFilter` ends with `-[prefix[$:/language/MWS/]]`
(`plugins/client/tiddlers/syncer/config-sync-filter.tid`).

### String set (23 keys)

`BagInfo/Heading`, `Login/ServiceName`, `SaveWiki/{ButtonCaption,
ButtonTooltip}`, `Sidebar/ConnectionStatus`, `Syncer/{CopyLogs, LoggedIn,
LoggedInAs, Login, Logout, ReadOnly, Refresh, RefreshTooltip, SaveSnapshot}`
as well as `UploadFile/{ButtonCaption, ButtonTooltip, Description, ResultSuccess,
ResultSuccessToWiki, ResultError, ResultNotLoggedIn, ResultNoWikiWriteAccess,
ResultTooLarge}`. All eight language files use the same key set
(verification by script in the test phase). The buttons "Server status",
"Log in to server/log out", "Refresh", "Snapshot", "Copy
logs", the login status and the login dialog read their strings via
`{{$:/language/MWS/...}}` resp. `syncer.getLoginServiceName()` from
`$:/language/MWS/Login/ServiceName` (`syncer.js`); only
`GettingStarted.tid` deliberately remains content and is not translated.

### Wiki owner in the button text (`<<owner>>`)

The upload button is no longer neutrally called "Upload file" but names the
owner: "Upload a file for Schüler 2". For this, the server provides at
compile time a real config tiddler `$:/config/multiwikiclient/owner` with
the `username` of the recipe owner (`RecipeIndexSender.ts`,
`writeFinalTiddlers`; read in `serveWikiIndex`). The MWS client translations
`UploadFile/{ButtonCaption, ButtonTooltip, Description}` contain the
placeholder `<<owner>>`.

The placeholder is replaced in `language.js`: when writing the real
`$:/language/MWS/...` tiddlers, `<<owner>>` is replaced with the owner's name
(and double spaces are removed if no owner is known, e.g. in the
docs wiki `mws-docs`). This is necessary because TiddlyWiki does not resolve transclusions
in attribute values (`tooltip=`, `aria-label=`) as wikitext —
`<<owner>>` as a macro in a shadow transclusion would remain literal there.
Since `$:/config/multiwikiclient/owner` only arrives with the server sync,
`language.js` additionally listens for its change and rewrites the strings.

### Why not via the template?

The obvious approach — a shared `readonlyBags` bag in the template so that
all wikis inherit it — is **not** possible here:

- `compileRecipeSimpleV1` would indeed copy the `readonlyBags` into every recipe
  (`TabUpserts.ts:519`), but the `Blank Template` is deliberately
  immutable: when saving via the admin API, for `isDefault` the
  existing `definition` is kept and `readonlyBags` is ignored
  (`TabDataAdapter.ts:546`), dependent recipes are not recompiled.
- You cannot write into a readonly bag via the wiki API
  (`RecipeResolver.saveTiddlers` only targets the writable bag,
  `RecipeResolver.ts:330`).
- All 17 wikis use this default template; `AdminCreateWiki` uses it
  fixed (`TabDataAdapter.ts:1419`).

### Discarded: forced German overrides

An earlier approach hardwired German (start tiddler for new wikis via
`wiki-language-defaults.ts` + `.multids`, plus a one-time import into the
existing data). This forced German on all wikis and has been replaced by the
automatics above; `wiki-language-defaults.ts` and `translations/de-DE.multids`
are removed, as are the tiddlers previously written into the existing data.

---

## 47. Security rework "C" (namespace partitioning C1 + trust boundaries C2 + My Areas C3)

**C1 · Namespace partitioning per owner (squatter protection):**

- A wiki's default bag is now called `editions/<owner-id>/<slug>` instead of
  `editions/<slug>` (`defaultBagName` in `TabDataAdapter.ts`). Thus
  the personal namespace is collision-proof: no other user can pre-create
  the bag that the wiki depends on when saving
  (previously: a teacher created `editions/<schueler-slug>` → the student received
  mysterious 403s).
- **URL stays unchanged** (`/wiki/<slug>`): the namespace ID is
  only in the internal bag name, not in the public slug. System wikis without
  an owner (`mws-docs`, `bedienungsanleitung`) keep `editions/<slug>`.
- `name` remains globally `@unique`; **no** Prisma schema migration
  is needed (no `@@unique([owner_user_id, name])`, no NULL-owner trap).
- Migrating the existing data:

  ```
  node scripts/c1-namespace-migrate.mjs            # dev store
  node scripts/c1-namespace-migrate.mjs --dry-run  # show only
  node scripts/c1-namespace-migrate.mjs --db <path>
  ```

  The script renames personal default bags, rewrites the bag
  references in all `recipe.definition`/`template.definition` JSONs
  (bag IDs, tiddlers, permissions and RecipeBag links remain
  untouched) and is idempotent. It additionally cleans up the old
  bug owner `"undefined"` (from the §44 era) to `NULL`.
- Slug renaming follows (`followDefaultBagOnSlugRename`, see §13).

**C2 · Trust boundaries + CSP** (existing state from the rework): classification
private vs. collaborative (foreign-writable bags), warning in the admin UI,
CSP header on wiki pages, existence oracle (`404` instead of `403`).

**C3 · "My Areas" UI** (existing state from the rework): grouping
"My Wikis / Shared with me / Class areas / System" +
trust label + bag owner in the admin UI.

---

## 47. Admin app: default language and theme for the first load (`settings`)

**Goal:** The operator specifies installation-wide in which language and
in light or dark the admin app is delivered on the **first** page load
— and which features are visible to everyone. A visitor's own choice
(language/theme switcher in the header, `localStorage`) always takes precedence
for language/theme — the setting is only the fallback.

**Storage (server-side):** keys in the `settings` table, processed in
`packages/mws/src/new-managers/PrefsRoutes.ts` (`readPrefs`):

| Key | Meaning | Default |
|-----|-----------|---------|
| `admin.defaultLocale` | Language on first load | Browser language |
| `admin.defaultTheme` | Light/dark on first load | System theme |
| `admin.showPinboard` | Pinboard tab (+ 30 s badge poll) | `true` |
| `admin.showUserFiles` | "My Files" tab | `true` |
| `admin.showWikiUpload` | "Upload file" button in the wiki toolbar (§45) | `true` |
| `admin.showLocaleSelect` | Language dropdown in the header | `true` |
| `admin.showThumbnails` | Thumbnail column in the wikis list (§43) | `true` |
| `admin.thumbnailTtlHours` | Thumbnail cache time in hours (§43) | `null` (= 24 h) |
| `admin.showLanding` | Public start page (`/`) for anonymous visitors (§48) | `true` |
| `admin.landingMessage` | Welcome text on the public start page (Markdown) | `null` |
| `admin.landingNews` | News on the public start page (Markdown) | `null` |

Bools are stored as `"true"`/`"false"`; a missing entry
means `true` (backwards compatibility).

- `GET /api/prefs` — every logged-in user reads the current settings.
- `PUT /api/prefs` — only `admin` (`state.okAdmin()`), body contains **all**
  fields: `{ defaultLocale: string|null, defaultTheme: "dark"|"light"|null,
  showPinboard: boolean|null, …, thumbnailTtlHours: number|null,
  showLanding: boolean|null, landingMessage: string|null,
  landingNews: string|null }`; `null`
  deletes the setting (→ default). `thumbnailTtlHours` is limited to 1..2160
  (hours), `landingMessage` to 2000 and `landingNews` to 10000
  characters.

**Dependency:** "Upload files from wikis" (2.1) requires "My
Files": if `showUserFiles` is off, switch 2.1 on the
settings page is grayed out (`is-disabled` row, note "Requires
'My Files'."), and server-side **both** keys are
evaluated as upload permission (`isWikiUploadEnabled`: `showWikiUpload &&
showUserFiles`, at the top in `RecipeIndexSender.ts`).

**Delivery before the first paint:** `serveIndex`
(`services/setupDevServer.ts`) reads the prefs per request and injects them
twice:
- as `prefs` in `window.embeddedServerResponse` (used by `i18n.ts`
  `getCurrentLocale()` and `theme.ts` `getEffectiveTheme()` at start) and
- as a small object in `window.embeddedServerPreflight` in `index.html` —
  a tiny inline `<script>` right at the top of the `<head>` sets `data-theme`
  (+ matching background) from it **before** the CSS takes effect, so that there
  is no wrong flash of the wrong thing. `initializeTheme()` cleans up the inline
  background style object again after the app starts.

The admin HTML response goes out with `Cache-Control: no-store` (no
intermediate caching, no back-forward cache), so that on re-opening
the current state is always delivered. In addition, the
settings page fetches the current state on opening (`connectedCallback` → `GET /api/prefs`)
and sets the selection fields accordingly —
thus the display always mirrors the actually stored values.

**Resolution order:**
- Language: `localStorage` (`mws.admin.locale`) → `prefs.defaultLocale` →
  `navigator.language` → `en`
- Theme: `localStorage` (`mws.admin.theme`) → `prefs.defaultTheme` →
  `prefers-color-scheme` (OS)

**UI:** ⚙ button (`settings.svg`) in the header, visible only for admins, opens
`/settings` (`app-settings.tsx`, route in `main.tsx`). Two selection fields
(language with "Follow browser language", theme with "Follow system theme") as well as
a **"Features"** section with six switches (pinboard, My Files,
upload from wikis, show language selection, thumbnails, public
start page) + number field "Thumbnail cache time (hours)" (empty = default
24 h) + two Markdown text fields "Landing welcome message" / "Landing news"
+ save button.
Non-admins see the page read-only with the note "Only
administrators …". The feature switches apply installation-wide (a
personal hiding per user is deliberately not provided — in
single-user operation the operator is also the user).

**Applying the switches (client):** In `app.tsx`, `featurePref(name)`
reads the prefs from `embeddedServerResponse.prefs`: the pinboard/files tabs and
their panels are hidden, the pinboard poll only starts with
active pinboard, the language `<select>` in the header is omitted, and the
thumbnail column is filtered out of `listColumns`. In the wiki, the
"Upload file" button stays hidden server-side: `RecipeIndexSender` writes
the config tiddler
`$:/config/multiwikiclient/hide-upload-file` (text `yes`) into the store when
wiki upload is disabled; `upload-file-button.tid` hides the button via `<$reveal state="..."
type="nomatch" text="yes">`, and `upload-file.js` then does not register the
`tm-upload-file` listener at all. New i18n keys (23) in all
8 languages (section `#region admin settings`).

---

## 48. Feature: Public start page (`/`) for anonymous visitors

**Goal:** Anyone who calls the server without a login no longer lands
directly on the login form, but on an inviting start page with hero text,
statistic cards, the list of publicly readable wikis (with
thumbnails) and — optionally — a welcome text and news block of the
operator. The login button ("Log in") leads to the familiar form.
The admin can switch off the start page with a toggle (then the
previous redirect to `/login` applies again).

### Backend

- **`GET /api/landing`** — public (`securityChecks.requestedWithHeader:
  false`), no login needed. Returns:
  - `versions`: `{ mws, tw5[] }` (version corner in the footer),
  - `stats`: `{ publicWikis, tiddlers, users, online }` — `online` = active
    sessions with `last_accessed` < 15 min (throttled touch in §sessions),
  - `wikis`: `[{ slug, displayName, description }]` — **only** wikis whose
    recipe **and** all bags allow ANON read access
    (the same filter as the `assertRecipe` read gate; private wikis are
    not leaked, not even by name). The owner can additionally remove
    a publicly readable wiki from the start page (§ "Per-wiki visibility"),
  - `message` / `news`: the prefs `admin.landingMessage` / `admin.landingNews`.
  - Route registration in `new-managers/index.ts` (`LandingData`).
  - Implementation: `packages/mws/src/new-managers/LandingRoutes.ts`.

- **Per-wiki visibility on the start page:** per wiki a
  checkbox in the **wiki editor** (field `landingVisible`, group "Landing page")
  controls whether a publicly readable wiki is shown to anonymous visitors. The
  checkbox only appears as long as `ANON` is among the readers (`recipeUsers`)
  — if that is not the case, a note is rendered instead.
  No template fork needed: templates are pure start content, the
  visibility is a pure wiki setting. Saved as
  `landing.hidden.<recipeId>` = `"true"` in the `settings` table (row
  missing ⇒ default "show"); written/read in
  `new-managers/TabDataAdapter.ts` (`saveRow` upsert/delete, `getList`
  inverts into `landingVisible`, `AdminDeleteWiki` cleans up the row).
  `GET /api/landing` filters these out of `wikis` and `stats.publicWikis`.
  The change is persisted with the regular "Save changes" of the
  editor. A dedicated `/api/landing/wikis` endpoint
  no longer exists (removed, together with the `/settings` section).

- **Anon thumbnails only from the cache:** `WikiThumbnailRoutes` serves
  thumbnails for anonymous visitors only from the existing
  thumbnail `<canvas>` snapshot (`store/thumbnails/<slug>.png`); a
  server-side **rendering of the wiki for anon is strictly forbidden**
  (DoS protection). Logged-in users render as before. The recipe check
  (`assertRecipe`) applies to everyone — a private wiki ⇒ `404` for anon.

- **`last_accessed` touch:** `sessions.ts` now updates `last_accessed`
  throttled (~5 min) in `parseIncomingRequest`, so that the online counter
  is correct without writing to the DB on every request.

### Frontend

- **Routing (`main.tsx`):** anonymous + `prefs.showLanding !== false` + path
  `/` ⇒ `new LandingPage()`. All other paths (and anon with the
  start page switched off) behave as before (redirect to `/login`).
- **`app-landing.tsx` (new):** header (branding + theme toggle +
  language selection + "Log in"), optional welcome `message`, four
  statistic cards (tiddlers total, public wikis, users, online),
  section "Public wikis" as a card grid with `image` thumbnails
  (fallback gradient if there is no image), optional `news` block and a
  version footer ("MWS {version}" / "TiddlyWiki {version}" + link to the
  TiddlyWiki docs). Markdown in `message`/`news` is rendered
  following the `escapeHtml` pattern (headings, lists, block quote, code,
  links — XSS-safe, since raw HTML output is escaped first).
  On load it calls `GET /api/landing`; errors ⇒ "The overview could not
  be loaded."
- **Settings (§47):** toggle "Show the public landing page" +
  two text fields "Landing welcome message" / "Landing news" (Markdown,
  max. 2000 / 10000 characters). Toggle off ⇒ anonymous `/` resolution is dropped.
  The former section "Public wikis on the landing page" was removed —
  the per-wiki visibility has moved into the wiki editor (§ "Per-wiki
  visibility").
- **i18n:** new keys 21 in all 8 languages (sections `#region admin
  settings` and `#region landing page`); later −4 settings keys of the
  per-wiki visibility +3 editor keys ("Landing page", callout, note)
  and +2 for the `/landing` preview ("Public start page",
  "Back to the wiki overview"). Current parity: 521 keys.
- **`/landing` route (see the start page while logged in):** logged-in users land
  on `/` in the admin app. A separate route `/landing` renders the same
  public start page for anonymous **and** logged-in visitors. Important:
  `/api/landing` resolves the ANON role independent of login from the
  `roles` table (not from `state.user.roles` — a logged-in
  user does not carry an ANON role, otherwise the list would be empty). In the
  admin header a globe button "Public start page" appears
  (only if `showLanding` is active), which opens `/landing` in the same
  window — exactly the anonymous preview. On the landing page the header shows
  "Back to the wiki overview" instead of "Log in" for logged-in users.

### Verification

- `GET /api/landing` anonymously: 200 with 8 public wikis, stats (tiddlers
  1127, 6 users, online 0 without active sessions), versions, `message`/`news`
  from the prefs.
- Anonymous `GET /` headless: renders the landing page (stat cards, wiki cards,
  thumbnails via `/wiki/<slug>/thumbnail`), no redirect to `/login`.
  Wiki cards open with `target="_blank" rel="noopener noreferrer"`.
  With `showLanding=false` (via `PUT /api/prefs`) ⇒ `/` redirects again to
  `/login`; then reset to `true`.
- `/landing` headless: anonymous ⇒ landing with "Log in" button; logged in
  (admin session) ⇒ landing with "Back to the wiki overview"; admin
  header shows the globe link `href="/landing"`, which navigates
  to the landing page in the same window.
- Anon thumbnail `/wiki/bedienungsanleitung/thumbnail` ⇒ `200 image/png`
  (cache only); an arbitrary private wiki ⇒ `404`.
- Logged-in admin (`/settings` headless): toggle + both text fields
  visible and operable; `PUT`/`GET`/DB rows for the 3 new keys
  verified (`null` deletes the row), values afterwards reset to the
  initial state.
- Per-wiki visibility (wiki editor, admin headless): "Landing page"-
  toggle only when `ANON` is among readers; OFF + save ⇒ `settings` row
  `landing.hidden.<recipeId>`=`"true"` and `GET /api/landing` shows 7
  (wiki + counter gone), ON + save ⇒ row disappears, 8. Private
  wiki without ANON ⇒ callout instead of the toggle. `/settings` without the old section.
- `tsc` (admin-vanilla) + `tsc2` (root) green; locale parity 521/521.

---

## 49. Repo: Docker support removed

**Goal:** This fork is not shipped as a container. The Docker files were
therefore dead weight — and, as an audit showed, not merely unused: four
independent defects meant that a Docker deployment would have delivered
the wrong product, refused to start, or lost data.

### Findings

- **The image ran upstream, not the fork.** `Dockerfile:6` installed
  `npm install @tiddlywiki/mws@latest -g` — the *upstream* package name —
  while the comment above it claimed "(wikiwise fork)". No image for this
  fork was ever published either: `.github/workflows/ghcr.yml:18` gated
  the publish job on `github.repository ==
  'TiddlyWiki/MultiWikiServer'`, so in
  `heino17/MultiWikiServer-wikiwise` it never ran.
- **`DOCKER.md` pointed at upstream as well.** Its quick start pulled
  compose file and Dockerfile via `curl` from
  `raw.githubusercontent.com/TiddlyWiki/MultiWikiServer/main/…`, so
  following the documentation produced upstream MWS without a single
  fork feature.
- **Both compose files refused to start.** `ENTRYPOINT ["mws"]` combined
  with `command: ["npx", "mws", "listen", …]` results in
  `mws npx mws listen …`; `runCLI.ts:42` takes the command name from
  `process.argv[2]`, so the process exits with `Command "npx" not
  found` (reproduced locally). `docker run` with the image's own CMD
  worked, `docker compose up` never did.
- **The mounts lost data.** Only `/data/store` was persisted, but
  backups are written to `backups/<timestamp>/` *next to* `store`
  (`BackupRoutes.ts:29-31`), and `passwords.key` lives in the instance
  root (`startup.ts:89`). In volume mode the backups stayed in the
  container layer, in directory mode they never appeared on the host at
  all; both are gone after `down`, recreate or update. `passwords.key`
  is lost the same way, which invalidates every user password.
- **Thumbnails cannot work in the image.** `findChromium()` searches
  `MWS_CHROMIUM_PATH`, `CHROME_PATH`, the Playwright cache,
  `/usr/bin/chromium(-browser)` and `/snap/bin/chromium`;
  `node:24-alpine` ships no browser, so every wiki thumbnail request
  fails.
- Two documentation errors on top: `DOCKER.md:194` claimed Node 22
  Alpine while the image is `node:24-alpine`, and `ghcr.yml:57` passed
  `build-args: MWS_VERSION=…` although the Dockerfile declares no `ARG`
  of that name. `DOCKER.md:58` noted itself that files and page were
  written by GitHub Copilot and untested by anyone who knows Docker.

### Removed

- `Dockerfile`, `docker-compose.volume.yml`,
  `docker-compose.directory.yml`
- `DOCKER.md`
- `.github/workflows/ghcr.yml`

### Verification

- After the removal, no reference to `docker` or `ghcr` remains in any
  own file; the Docker block was self-contained, nothing else pointed at
  it.
- The `files` array in `package.json` (contents of the npm package)
  never contained any of the removed files, so packaging is unchanged.
- `ci.yml` and `.github/scripts/build-mws-site.sh` untouched; the native
  installation from the README is unaffected.

---

## 50. Fix: the fork could not be installed at all

**Goal:** The README told everyone to run `npm init @tiddlywiki/mws@latest my-folder`.
That command does not install this fork — and after checking what it actually produces,
two bugs turned up that made a fresh installation impossible in the first place.

### Finding: the quick start installed upstream

- `npm view @tiddlywiki/mws version repository.url` returns
  `0.2.5` and `git+https://github.com/TiddlyWiki/MultiWikiServer.git`, i.e. the
  **upstream** package. This fork is not on npm, and under the same name it
  never can be: the root `package.json` is also called `@tiddlywiki/mws`.
- A test run of the documented command created a working instance — with
  upstream's two migrations (`20260708160259_init`, `20260731035054_rb_pk`)
  and without a single fork feature. In the two bundles, the string `ANON`
  (fork, §4) occurs 15 times in the fork and **0** times in upstream 0.2.5.
- The mechanism is in npm itself: `npm init <pkg>` rewrites the name to
  `create-<pkg>` (`npm/lib/commands/init.js:117`), so the command actually runs
  `@tiddlywiki/create-mws`, whose `create.js:44` installs
  `@tiddlywiki/mws@latest` from the registry. The fork can publish neither
  name, so there is no one-liner install until it publishes under a name of
  its own. `create-package/` is not part of the published package anyway
  (not in `files`).

### Bug 1: a fresh database could not be initialized

`npx mws init-store` on an empty store died with
`DriverAdapterError: ColumnNotFound` while applying
`20260916_email_nullable`: that migration rebuilds the `users` table and
selects `owner_user_id`, but the official init migration
`20260708160259_init` never creates the column. Databases that existed
before the fork's first migration already had it, which is why this only
appeared on new installations.

- New migration `prisma/migrations/20260915_owner_user_id/migration.sql`
  adds the column to all five tables that use it: `users`, `roles`, `bag`,
  `recipe`, `template`. Plain nullable `TEXT`, no index, no foreign key,
  exactly as in `schema.prisma`.
- A column-by-column comparison of the migrated fresh database against
  `schema.prisma` now finds no difference; before the fix, five columns
  were missing.

### Bug 2: `init-store` crashed on the second wiki

`init-store` loads two wikis (`init-store.ts:96` and `:103`): the
documentation and the fork's own `editions/bedienungsanleitung`. The latter
was not in the `files` array of `package.json`, so in an installed package
the folder does not exist, `loadWikiFolder` returns no bags, and
`load-wiki-folder.ts:168` fails with
`TypeError: Cannot read properties of undefined (reading 'bagName')`.

- `files` now contains `editions/bedienungsanleitung/tiddlers` and
  `editions/bedienungsanleitung/tiddlywiki.info`. The 2.5 MB
  `output/index.html` build artifact stays out of the package.
- The runner in `init-store.ts` skips a wiki folder that is not part of the
  installation and says so, instead of crashing the whole command.

### Packaging: `prepare`

Installing the fork from a git URL or packing it produced a package
without `dist`, because `/dist` is gitignored and there was no `prepare`
script — the server bundle simply was missing.

- New script `prepare` → `node scripts/scripts.mjs build:pack`, which
  installs the `tools` dependencies if needed and runs the normal build.
  It is skipped when `dist/mws.js` already exists, so a `npm install` in a
  working copy stays fast. `npm run build` rebuilds on demand.
- `ci.yml` is unaffected: it builds the documentation edition with
  TiddlyWiki 5 and never runs `npm install` in the repository root.

### Documentation

- `README.md` (both languages), `README_features.md` (both languages) and
  `editions/mws-docs/tiddlers/Installation.md` now describe the fork's own
  path: `git clone` → `npm install` → `npm start` for the development wiki,
  and `npm pack` plus a tarball install for a separate data folder. Each
  place carries the same warning that `@tiddlywiki/mws` on npm is upstream.

### Verification

All of it on a fresh clone and a fresh instance, not on an existing store:

- `git clone` → `npm install` → `prepare` builds `dist/mws.js` (2.04 MB),
  exit 0.
- `npm pack` → `tiddlywiki-mws-0.1.0.tgz`; the tarball contains the 55
  files of `editions/bedienungsanleitung` and `repository.url` points to
  the fork.
- Instance: `npm install <tarball>`, `npx mws update-tiddlywiki`,
  `npx mws init-store` → exit 0, all 9 migrations applied (including the
  fork's `pinboard`, `user_file` and `roles_is_teacher`), admin user
  created, both wikis loaded.
- `npx mws listen --listener` → `/`, `/admin` and
  `/wiki/bedienungsanleitung` answer 200; `GET /api/landing` reports
  `publicWikis: 1` with the manual, so the public start page of §48 lists
  it for anonymous visitors.
- Before the two fixes the same sequence ended in
  `ColumnNotFound` and then in the `bagName` TypeError.

### Still open

- The local `main` is **72 commits ahead of `origin/main`**: none of the
  fork's work is on GitHub yet, so `npm install github:heino17/…` would
  install the fork without its features.
- For a real one-liner, the fork has to publish the server package and a
  matching `create-*` package under a name it owns. That needs a decision
  about the name and npm access; `create-package/create.js:44` still
  hardcodes `@tiddlywiki/mws@latest` and has to follow that decision.

---

## 51. Repo: the fork gets its own package name `@mws/wikiwise`

**Goal:** §50 ended with the question of which name the fork should be
published under. Decided: `@mws/wikiwise`, with `@mws/create-wikiwise` as the
init package that `npm init` runs.

### The name

- The root `package.json` was called `@tiddlywiki/mws`, inherited from
  upstream. That name belongs to the TiddlyWiki project, and the scope
  `@tiddlywiki` can only be published by them, so `npm publish` with the
  inherited name is impossible.
- `@mws-wikiwise` is not a legal package name at all: npm only accepts
  `@scope/name` or a plain name, and rejects a name that starts with `@`
  without a slash with `EINVALIDPACKAGENAME` — found because installing the
  packed tarball failed. `@mws/wikiwise` keeps the scope the fork already
  uses for `@mws/admin-vanilla`.
- Changed: root `package.json` → `@mws/wikiwise`, `tools/package.json` →
  `@mws/tools` (it carried the root's name and pointed its `repository` at
  upstream; it is now `private`), `create-package/package.json` →
  `@mws/create-wikiwise`, plus `package-lock.json`.
- The workspace packages keep their internal names (`@tiddlywiki/server`,
  `@tiddlywiki/events`, `@mws/admin-vanilla`, …). They are bundled into
  `dist` and never installed from the registry, so renaming them would only
  add churn.
- `create-package/create.js` installed `@tiddlywiki/mws@latest` and told the
  user to run `npm init @tiddlywiki/mws@latest`; both now name
  `@mws/wikiwise`, so `npm init @mws/wikiwise@latest <folder>` creates a
  folder with the fork in it.

### Version 0.3.0

- The server version was `0.1.0` — *lower* than upstream's `0.2.5`, which is
  misleading for a fork that is functionally ahead. It is now `0.3.0`, so the
  fork's own numbering is clearly beyond upstream's 0.2.x line.
- The **data folder** template stays at `0.2.0` on purpose.
  `packages/mws/src/index.ts:79` requires the data folder's `package.json`
  to start with `0.2`, and every existing installation carries `0.2.x`.
  Raising the template to `0.3.0` would mean loosening that check, and any
  existing store with `0.2.x` in it would still have to be accepted.
  Server version and data folder version are independent: `ServerState.ts:66`
  reads the server version from the root `package.json`, the gate only looks
  at the data folder.
- `create-package` is at `0.1.0`, its first release under its own name.

### Documentation

- `README.md` (both languages), `README_features.md` (both languages),
  `editions/mws-docs/tiddlers/Installation.md` and
  `create-package/README.md` name the new package and the new tarball name.
  npm names the tarball of a scoped package `scope-name-version`, so
  `npm pack` produces `mws-wikiwise-0.3.0.tgz`.

### Verification

Fresh clone, fresh instance, with the renamed package:

- `npm install` → `prepare` builds `dist/mws.js`; `npm pack` produces
  `mws-wikiwise-0.3.0.tgz` (3.47 MB).
- Instance: `npm install <tarball>` → exit 0, the instance's dependency is
  `@mws/wikiwise`, `repository.url` points to the fork.
- `npx mws update-tiddlywiki`, `npx mws init-store` → exit 0, both wikis
  loaded, `ANON` present 15× in the bundle.
- `npx mws listen --listener` → `/`, `/admin` and `/wiki/bedienungsanleitung`
  answer 200, and `GET /api/landing` reports `"mws": "0.3.0"` with the
  manual as the one public wiki.

### Still open

- **Publishing is not done.** It needs an npm login, 2FA and the scope `mws`
  to be available on npm — the scope cannot be checked without an account,
  and `mws` is a short, generic name. If it is taken by someone else, the
  unscoped `mws-wikiwise` (verified free) or `@heino17/wikiwise` are the
  alternatives. Publishing under a name is permanent, so this is worth
  checking before the first `npm publish`.
- `packages/mws/src/db/sqlite-adapter.ts:45` and `:78` still print
  `@tiddlywiki/mws` in the diagnostics for 0.0.x alpha databases. Those
  databases cannot be used by the fork either, and the suggested
  `npm install @tiddlywiki/mws@0.0` cannot be rewritten to the fork's name
  because the fork has no 0.0.x release — left as is on purpose.

---

## 52. Repo: distribution as a GitHub release instead of the npm registry

**Goal:** §51 left one question open: how does anyone get this fork without a
working `npm publish`. The answer is that they do not need one.

### Why not the registry

- Publishing to npm requires an npm account, and npm requires a second factor
  for publishing. That is a real obstacle for the maintainer here, and it is
  worth being explicit about it instead of pretending it is a non-issue.
- The name is decided by npm rules and availability, not by us:
  `@mws-wikiwise` is not a legal package name at all (`EINVALIDPACKAGENAME`,
  because npm only accepts `@scope/name` or a plain name), and the scope `mws`
  is **already taken** on npm – the profile exists with zero packages, while a
  non-existent name answers 404. So `@mws/wikiwise` would only be publishable
  if the owner of `mws` added us as a member.
- The one-liner `npm init <name>@latest` cannot be reproduced without the
  registry. `npm init` with a path or URL fails with `EUNSUPPORTED` ("Unrecognized
  initializer"), so there is no `npm init`-style shortcut for a plain repository
  either.
- Conclusion: the package stays named `@mws/wikiwise` for its own identity
  (it is what `require`s resolve to, what the tarball manifest says and what the
  instance's `package.json` lists), but it is not published. `create-package`
  is accordingly documented as unusable until the registry exists.

### What replaces it

- **Every release carries a ready-to-install package.**
  `npm install https://github.com/heino17/MultiWikiServer-wikiwise/releases/download/v0.3.0/mws-wikiwise-0.3.0.tgz`
  works because npm installs any HTTPS tarball – verified against a GitHub
  tarball, which npm unpacked and resolved with all dependencies, `better-sqlite3`
  included. No account, no second factor, and the version is pinned in the URL.
- The package contains the built `dist/mws.js`, so nothing has to be compiled.
  A clone still builds it through `npm install`, because `prepare` runs
  `build:pack` and `dist/` is gitignored.
- `README.md` (both languages), `README_features.md` (both languages) and
  `editions/mws-docs/tiddlers/Installation.md` now lead with the release
  route, keep the clone route as the alternative for people who want to change
  the code or track the current state, and explain the `sha256sum` check. The
  expected checksum is part of the release notes.
- The release itself is created by hand in the GitHub UI; `gh` is not available
  in this environment, so the tag and the asset upload are manual steps.

---

## 53. Fix: the release installation needs one more command

**Goal:** §52 documented the release route as four commands. Following it
exactly, in a fresh empty folder, the server refused to start:

```
Error: The wiki path package.json file is not named '@tiddlywiki/mws-instance'.
```

### What happened

- `npm install <tarball-url>` in an empty folder makes npm write a
  `package.json` – and it names it after the folder, not after the data
  folder template. MWS requires that file to be named
  `@tiddlywiki/mws-instance`, to be `private: true` and to carry a `0.2.x`
  version, and it checks this on every start (`packages/mws/src/index.ts:66-81`).
  The check is deliberate: that file is what keeps the tiddlers of a data
  folder out of a public registry, so the server refuses rather than guessing.
- The create package normally copies that template, which is why the clone and
  `npm pack` routes never hit this: both start from `create-package/files`.
  A route that begins with `npm install` has no such step.

### The fix, without touching the runtime

- Two commands turn npm's file into the data folder manifest and keep the
  dependency entry, so `npm ls` and later updates still know where the server
  came from:
  ```
  npm pkg set private=true --json
  npm pkg set name="@tiddlywiki/mws-instance" version=0.2.0
  ```
- They have to be two commands, and the split is not cosmetic. `npm pkg set`
  stores values as strings, so `private=true` would produce the **string**
  `"true"` while `packages/mws/src/index.ts:83` compares against the boolean
  `true` – the server aborts with the `PACKAGE_JSON_PRIVATE` message. The flag
  `--json` fixes the boolean, but it makes npm parse **every** value as JSON, and
  `@tiddlywiki/mws-instance` is not valid JSON:
  `npm error Unexpected token '@', "@tiddlywik"... is not valid JSON`.
  So the boolean goes in its own `--json` command, and the name and version in a
  second one without it.
- `README.md` (both languages), `README_features.md` (both languages) and
  `editions/mws-docs/tiddlers/Installation.md` now carry the command and
  explain why it exists. The release notes were corrected in place as well.

### Verified against the published release

Taken from the release page, not from a local build:

1. `npm install https://github.com/heino17/MultiWikiServer-wikiwise/releases/download/v0.3.0/mws-wikiwise-0.3.0.tgz`
   → exit 0, `@mws/wikiwise@0.3.0` in `node_modules`
2. the downloaded file's `sha256sum` equals the one in the release notes
3. both `npm pkg set` commands → `name`, `private` and `version` correct, dependency kept
4. `npx mws update-tiddlywiki` → exit 0
5. `npx mws init-store` → exit 0, both wikis loaded, admin `1234`
6. `npx mws listen --listener` → `/`, `/admin` and `/wiki/bedienungsanleitung`
   answer 200, `GET /api/landing` reports `"mws": "0.3.0"`

## 54. `npx mws init-data-folder` replaces the `npm pkg set` detour

**Goal:** §53 documented the release route with a detour that only works
because `npm pkg set` fails on a value that is not JSON-capable. Two commands,
one with `--json` and one without, are exactly the kind of stumbling block that
does not belong in an installation guide for first-time users. The step belongs
in the tool that knows the rule anyway.

### What changed

- New command `npx mws init-data-folder`
  (`packages/mws/src/new-commands/init-data-folder.ts`) that writes the data
  folder's `package.json`. The source is deliberately
  `create-package/files/package.json` – the same file the create package copies
  and the `npm pack` route uses, now the only such place in the package
  (`package.json` → `files`).
- It writes exactly the three fields the start check fails on (`name`,
  `private`, `version`) and takes over the `start` script. Existing
  `dependencies` and the folder's own scripts are preserved.
- The command may run in a folder without a server: it is exempt from the data
  folder check (`packages/mws/src/index.ts`) and runs before the access to
  `passwords.key` and the database (`startup.ts`). Only that way it can create
  anything in the folder at all.
- **The data folder coat stays `@tiddlywiki/mws-instance`, version `0.2.0`** –
  unchanged, because the start check still insists on exactly that.

### Safety behaviour

The command does not blindly overwrite anything:

- `package.json` missing → created from the template.
- Existing file is already a valid instance manifest → message, no change
  (idempotent, and harmless even in a running system).
- File is not valid JSON → abort with exit 1, file unchanged.
- File carries a different, deliberately chosen name (e.g. from `npm init -y`,
  where npm takes the folder name) → **no** overwrite, exit 1 with a hint. If
  you want to get rid of the name, rename the file yourself beforehand.

The last case is deliberate: a foreign package name in a folder where MWS will
later be installed is not a mistake but a decision of the user, and the
installer must not silently overturn it.

### Docs

`README.md` (EN/DE), `README_features.md` (EN/DE),
`editions/mws-docs/tiddlers/Installation.md` and `create-package/README.md`
now name `npx mws init-data-folder` instead of the two `npm pkg set` lines and
link the 0.3.1 asset. §53 stays as history, how the detour looked and why it
was needed.

### Tested

Fresh installation from the locally built 0.3.1 tarball:

1. `npm install <tgz>` → `npx mws init-data-folder` → `name`, `private: true`,
   `version: 0.2.0` and `start` script correct, dependency kept
2. second call → unchanged (idempotent)
3. broken JSON → exit 1, file byte-identical
4. deliberately named `package.json` → exit 1, file byte-identical
5. real instance from `tests/` → message "is already a data folder", checksum
   of `store/` and `passwords.key` unchanged
6. then `update-tiddlywiki` → `init-store` → `listen`: `/`, `/admin` and
   `/wiki/bedienungsanleitung` answer 200, `GET /api/landing` reports
   `"mws": "0.3.1"`
7. **Regression of the protection:** In a folder with a wrong or missing
   `package.json`, `update-tiddlywiki`, `init-store` and `listen` still refuse
   to start – the new command has not loosened the check
8. `npx mws help` lists `init-data-folder` with a description

---

## 55. Fix: a dead Chromium blocked all wiki previews for good

**Goal:** After the installation from the 0.3.1 release, a real installation
reported:

```
GET /wiki/wiki-admin/thumbnail browser.newContext: Target page, context or browser has been closed
    at renderThumbnail (.../WikiThumbnailRoutes.ts:282:19)
```

The admin list afterwards showed a preview image for **no** wiki at all, and
the server had to be restarted before any was produced again.

### What happened

- Chromium is started on first demand and then kept in a module-global
  `browserPromise` (`packages/mws/src/new-managers/WikiThumbnailRoutes.ts`,
  line 193 before this change). The cached object was **never** checked again.
- Playwright considers a browser object valid even when the process behind it
  has long ended. Only `isConnected()` tells the truth. If Chromium dies – a
  crash, the OOM killer, a `kill` from outside – then every further
  `browser.newContext()` on that object throws
  `Target page, context or browser has been closed`.
- `getBrowser()` only caught **start** errors (`browserPromise = null`), not the
  death of an already started browser. Result: a single crash poisons the
  cache, and every later preview fails identically until the server restarts.
  The correction was therefore ineffective.

### The solution

- `startBrowser()` checks `isConnected()` before every hand-off and restarts
  Chromium if it is no longer alive. A started but meanwhile dead browser is
  never reused.
- The starts run through a promise chain. Without it, two preview requests
  arriving in parallel would each start a Chromium and leave the second one
  permanently ownerless in the background.
- If the browser dies **during** the render, there is exactly one retry with a
  fresh browser instead of a permanently broken preview.
- A render that keeps failing is no longer a request error. The route answers
  like for a wiki without a preview with `404` and writes an understandable
  line to the log, instead of throwing a Playwright error object. In the wiki
  list a placeholder appears, the wiki itself is unaffected.

### Tested

On the running server, with login and a real admin list. The test was: render
once, kill all Chromium processes of the server with SIGKILL, clear the preview
cache, reload.

| Run | before (0.3.1) | after |
| --- | --- | --- |
| 1, fresh | `200 image/png`, 2 files | `200 image/png`, 2 files |
| 2, Chromium was dead | `500 application/json`, 0 files | `200 image/png`, 2 files |
| 3 | `500 application/json`, 0 files | `200 image/png`, 2 files |

Counter-test with the unchanged 0.3.1 bundle on the same test: the `500` error
with an identical stack trace persists permanently, the preview folder stays
empty. The Chromium call itself is not the problem – start, page output and
screenshot work flawlessly on the same machine, it is solely the reuse of the
dead browser.

---

## 56. Fix: databases from before the 27.09. no longer refuse to start

**Goal:** `npm start` aborts as soon as a wiki is used that was created
**before** the 27.09. – including the development wiki in the repository:

```
New migrations found [ '20260915_owner_user_id' ]
Applying migration 20260915_owner_user_id
SqliteError: duplicate column name: owner_user_id
    at Database.exec (node_modules/better-sqlite3/lib/methods/wrappers.js:9:14)
```

### What happened

- §50 (commit `2190cfa`, 27.09.) added the migration `20260915_owner_user_id`
  so that **fresh** databases get the five `owner_user_id` columns. SQLite can
  only add columns with `ALTER TABLE ... ADD COLUMN` and knows no
  `ADD COLUMN IF NOT EXISTS`. Running it again is therefore impossible.
- Databases from **before** the 27.09. already have these columns, because they
  belonged to the schema back then. The entry in `_prisma_migrations` is
  naturally missing – the migration did not even exist at that time.
- On the first start after the update it therefore counts as pending, the
  `ALTER TABLE` runs again, and SQLite aborts with `duplicate column name`. The
  migration loop ends at the first error, it stays at this one error: **every**
  further start fails identically, the wiki is no longer reachable and the
  database can only be repaired by hand.
- Every installation created before the 27.09. is affected, not just
  development wikis. Fresh installations are unremarkable – that is why the
  error did not show up when testing with fresh data folders. For the version
  sequence 0.3.0 to 0.3.2 this is a start-preventing error.
- The special case was already known for `20260916_email_nullable` and was
  caught by hand there (`owner_user_id` … "it already exists on live databases
  and is carried over as-is"). But that only covered the `users` table, the
  other four tables remained unprotected.

### The solution

- `packages/mws/src/db/sqlite-adapter.ts` analyses the script of a pending
  migration before running it. If it consists exclusively of
  `ALTER TABLE … ADD COLUMN` statements, every column is checked against the
  actual schema via `PRAGMA table_info`.
- If **all** columns are already present, the DDL is dropped. The migration is
  booked as applied with an explanatory log line: the schema is exactly what
  the migration wanted to create, only the log entry is missing.
- The detection path only applies in the proven case. If even one column is
  missing (fresh database), or if the script does more than add columns
  (rebuild a table, copy data, create indexes), the migration runs unchanged.
  `parseAddedColumns` then returns `null` and the script is executed as before –
  checked against all ten migrations, two of which are recognised as pure
  column migrations (`20260915_owner_user_id`, `20260916_wiki_limit`).
- On the development wiki the log line reads:

  ```
  New migrations found [ '20260915_owner_user_id' ]
  Skipping the schema change of migration 20260915_owner_user_id, this
  database already has users.owner_user_id, roles.owner_user_id,
  bag.owner_user_id, recipe.owner_user_id, template.owner_user_id
  Migrations applied [ '20260915_owner_user_id' ]
  ```

### Tested

- **Old stock, exactly the reported case:** The development wiki aborted with
  `SqliteError: duplicate column name: owner_user_id` before the fix. After the
  fix the server starts, books the migration and returns `/api/landing` with
  `200`. 9 rows before, 10 rows after in `_prisma_migrations`,
  `PRAGMA integrity_check` = `ok`, users (6), bags (14), recipes (14) and
  templates (1) unchanged.
- **Counter-test, no data loss:** Before the test run a backup of the database
  via the SQLite backup API (9 migrations, 6 users, `integrity_check` `ok`),
  then a comparison of the row counts.
- **Fresh database, counter-test:** Complete new installation from the 0.3.3
  package following the create-package flow (`npm install` →
  `update-tiddlywiki` → `init-store`) in an empty folder. There the columns are
  missing, so the migration runs **unchanged** – the log line reads
  `Applying migration …` throughout, not a single `Skipping` line. Result: all
  five columns present, 10 rows in `_prisma_migrations`, `integrity_check`
  `ok`. Subsequent start on port 5099: `/api/landing` reports `mws: 0.3.3`, 1
  wiki, 54 tiddlers, 1 user, no error message. That way the usual path of a
  new installation is untouched.
- **Detection, synthetic:** `parseAddedColumns` consistently returns `null` for
  `ADD COLUMN` + `CREATE TABLE`, `ADD COLUMN` + `INSERT`, pure `CREATE TABLE`, a
  pure comment script and an empty script, and returns the column for an
  `ADD COLUMN` script with and without a trailing semicolon.

---

## 57. Fix: the language menu on the start page lay half under the content

**Goal:** On the start page `/` the language menu in the header was cut off at
the bottom: the expandable part was painted over by the content area, the lower
language options were no longer clickable.

### What happened

- The header `.landing-header` uses `backdrop-filter: blur(12px)`.
  `backdrop-filter` – like `filter`, `transform` or `opacity` below 1 – creates
  an **own stacking context**. A `z-index` inside the header therefore only
  still applies within that container and no longer raises the element against
  the rest of the document.
- The header itself had no own `z-index` and therefore lay on level 0. The news
  box `.landing-news` that follows it directly in the DOM painted over it.
  Measured: 180 × 168 px overlap; `elementFromPoint()` in the middle of the
  menu hit the heading `h2.landing-section-title`, not the menu.
- All language options in the lower third were affected, independently of the
  chosen language and without any JavaScript involvement – pure layering of
  levels.
- The pattern was already solved correctly in the admin area: `.hero-panel`
  carries `position: relative; z-index: 1`. The login page has no language
  menu, there is nothing to correct there.

### The solution

- `.landing-header` in `packages/admin-vanilla/src/app.inline.css` gets
  `position: relative; z-index: 1`. That puts the header above the news box,
  and the `z-index` of the language options works as intended again – both
  needed only the one comment.

### Tested

- **Measurement before/after:** Before, `.landing-news` overlapped the language
  menu over an area of 180 × 168 px, all three measuring points in the menu
  area hit content elements underneath. After, all three measuring points lie on
  the dropdown or on a language option, the overlap is gone.
- **Both pages with the header checked:** Start page `/` and legal notice page,
  each with the menu expanded in the German and English version.

---

## 58. Fix: the default writable bag follows the slug on a rename again

**Goal:** If the slug of a wiki is changed in the admin, the derived writable
bag `editions/<owner-id>/<slug>` no longer follows the new slug. The wiki
afterwards still points to the old bag name – the slug is renamed, but the
default bag keeps the old slug in its name forever.

### What happened

- The coupling was recorded in two places independently of each other, and the
  two places knew different naming schemes:
  - The admin client (`syncDefaultBagOnSlugChange` in
    `packages/admin-vanilla/src/definition/renders.tsx`) built the new name
    while typing as `editions/<slug>` – **without** the owner part.
  - The server (`followDefaultBagOnSlugRename` in
    `packages/mws/src/new-managers/TabDataAdapter.ts`) only renamed the bag if
    the **submitted** target row already contained the new derived name.
- Since the owner notation was introduced, the actual target value is
  `editions/<owner-id>/<slug>` however. The client comparison
  `editions/<slug>` therefore never matched, the target field stayed unchanged
  – and with it the condition of the server (`old name !== new name`) never
  matched either. The bag rename was silently ineffective for all wikis with
  owner namespacing, thus for practically every wiki.
- No test existed for this: neither for `followDefaultBagOnSlugRename` nor for
  `defaultBagName`.

### The solution

- **One source of truth, on the server.** The naming convention now only exists
  in `defaultBagName(ownerUserId, slug)`. The client helper and its call are
  gone; the target field no longer follows the slug while typing. That is
  deliberate: the client does not know the owner ID, and after saving the server
  writes the corrected value back into the same field anyway.
- **The server follows the slug if the field still carries the old name.**
  `followDefaultBagOnSlugRename` derives both names from `defaultBagName` and
  treats a target value that equals the old *or* the new derived name as
  "follow the slug" – even if the client did not touch the field at all. A
  target value that is neither the old nor the new derived name was chosen
  deliberately and stays untouched.
- **The function returns the rows to be saved** instead of only renaming the
  bag. `authoredDefinition`, the compiled recipe-bag assignment, the mirroring
  of the display name and the answer to the admin thereby use the same name.
  Before, the saved definition could point to a renamed bag that no longer
  existed under that name.
- **Unchanged protection conditions:** No rename on a name conflict (the
  existing bag keeps its name), on a missing old bag or if the bag is still used
  by other recipes. The check for slug uniqueness still runs before the rename in
  the same transaction, a rejected slug therefore takes the bag rename with it.
- **The bag is renamed in place** (`bag.update`), not newly created: `bag_id`,
  tiddlers and permissions are preserved.

### Tested

- **The core case, without touching the target field:** Wiki created, slug
  changed to `…-umbenannt` and saved, without touching the target field. Result
  checked in the database: definition points to
  `editions/<owner>/…-umbenannt`, the bag exists under the new name with the
  **same** `bag_id` as before (`01a0e74a-…` → `01a0e74a-…`), the 3 tiddlers
  are unchanged in the same bag, `recipe_bag` refers to the new name, the old
  name is free.
- **Deliberate foreign bag:** A wiki was deliberately pointed at the bag of
  another wiki and then renamed. The target value stays saved unchanged, the bag
  of the other wiki keeps name and ID, and no additional bag arises from the
  field.
- **No target row:** Saving completely without a row with an empty prefix
  changes nothing – none is invented, the bag stays unnamed.
- **Interface, Chromium against the fresh test installation:** Slug field
  changed, the target field visibly does **not** follow along, after saving the
  value caught up by the server stands in the field, after reloading it stands
  in the wiki. No JS errors on the admin page.
- For the test, `admin.showLoginPuzzle` was switched off in the throwaway
  installation, because the emoji puzzle of the login does not allow an
  automated click; the server logic is unaffected by that.

---

## 59. Fix: the plugin library could not be opened in any wiki

**Goal:** In every wiki, no plugin library could be opened under *Settings →
Plugins → "Get more plugins"*. Firefox reported

```
Error loading plugin library: https://tiddlywiki.com/library/v5.4.1/index.html
```

Chromium stayed silent. That way **no** plugin could be installed – and no
language either.

### What happened

- TiddlyWiki loads the library in a **hidden cross-origin iframe**
  (`$:/core/modules/startup/browser-messaging.js`) and talks to it via
  `postMessage`. The download of a plugin (`tm-load-plugin-from-library`) also
  runs through the same frame.
- MWS sends a strict CSP with `frame-src 'self'` for wiki pages
  (`buildCspPolicy` in `packages/mws/src/new-managers/RecipeResolver.ts`).
  Exactly this one directive blocks the access to the library. This is not a
  network problem: `https://tiddlywiki.com/library/v5.4.1/index.html`
  answers with HTTP 200.
- The way out would be `cspAllow` per wiki, extending `frame-src`. In the
  development environment it was set nowhere (0 of 13 wikis), and in the admin
  form there is **no input field** for it – the exception was therefore neither
  set nor reachable.
- **Two different symptoms, one cause:** Firefox fires `onerror` on a frame
  blocked by CSP, the core makes an alert with the mentioned message from it.
  Chromium instead fires `load`, the status stays "loaded", the library stays
  empty – **without any message**. The silent case is the more unpleasant one,
  because it does not stand out as an error.

### The solution

- `frame-src` contains `https://tiddlywiki.com` as a fixed entry (constant
  `PLUGIN_LIBRARY_ORIGIN` in
  `packages/mws/src/new-managers/RecipeResolver.ts`). That way the library
  works in every wiki without intervention.
- This is a **deliberate deviation** from the strict standard and applies to all
  wikis, not only those whose admin decided it. Rationale: language packs and
  plugins should be available without an extra step, and the embedded page is
  TiddlyWiki's own library – it can only send messages to the parent frame and
  cannot execute a script in the wiki origin. A self-hosted library URL
  (`$:/config/PluginLibrary/URL` set differently) still has to be listed per
  wiki in `cspAllow`; the list is appended behind it. Script sources remain
  unchanged at `same-origin`.
- The comment at the function continues to describe the progressive basic idea
  and names the exception including the rationale, so that it can later be
  removed deliberately.

### Tested

- **Before, on the same wiki, both browsers:** Firefox delivers the CSP message
  ("blocked the loading of a resource (frame-src)") **and** the alert with a
  message verbatim as in the report, status stays "loading", 0 entries.
  Chromium reports the same violation but shows no alert (status "loaded", 0
  entries) – exactly the silent error.
- **After, with an empty `cspAllow`:** header `frame-src 'self'
  https://tiddlywiki.com`, no CSP violations, status "loaded", **105 library
  entries of which 34 are language packs** – identical in Chromium and in
  Firefox.
- **Also the download path:** `$:/languages/de-DE` requested from the library,
  the language pack arrives completely (182 498 characters of JSON, type
  `application/json`), as well as a regular plugin
  (`$:/plugins/tiddlywiki/async`). That way the reported path – installing a
  language – is fully checked.
- Checked on the fresh throwaway installation with an empty `cspAllow`, i.e.
  exactly the state of all 13 wikis of the development environment.

---

## 60. Fix: empty button in the panel header of "Pinboard" and "My files"

**Goal:** In the tabs *Pinboard* and *My files* there was an empty button at
the far right of the header (28 × 20 px) – without label, without tooltip and
without any recognisable function.

### What happened

- The header renders a "create" button for every tab, except for `wikis` (and
  `roles` for non-admins). The label comes from `getCreateLabel(currentTab)`.
- *Pinboard* and *My files* are display-only tabs without records. They are
  described via synthetic definitions (`pinboardTabDefinition`,
  `userFilesTabDefinition`) and therefore deliberately carry an empty
  `createLabel: ""`.
- The condition checked only the tab ID, not the label. Result: a button
  without text – only the inner distances remained visible, i.e. 28 × 20 px. A
  click called `openCreate("pinboard"/"files")` and thus into the void.
- **Both** tabs were affected, not only one. *Storage* was not affected,
  because that tab already has its own branch with "Refresh".
- For users this was only an empty spot at the right edge: no error message, no
  consequence – but visibly wrong.

### The solution

- The condition now additionally requires a **non-empty** create label
  (`!!getCreateLabel(currentTab)`). That way all display-only tabs
  automatically get no button, including future ones – they do not have to be
  excluded individually.
- No function is lost: *My files* has the dropzone with file picker and
  "Refresh" in the panel, *Pinboard* the note creation.

### Tested

- All eight tabs clicked through one after the other and the action bar read
  out: *Wikis* keeps its two dropdowns (Backups, Create a wiki) and no bare
  buttons, *Templates* "Create template", *Bags* "Create bag", *Roles* "Create
  role", *Users* "Create user", *Storage* "Refresh" – all unchanged. *Pinboard*
  and *My files*: no button any more, the `.user-files-dropzone` is still
  present. No JS errors.

---

## 61. Fix: the footer of the start page floated mid-page

**Goal:** On the start page `/` the footer sat about 187 px above the bottom
edge at 1920 × 1080. It should stick to the bottom while keeping its full
width.

### What happened

- `.landing-shell` was a grid with `align-content: start`. That packs every row
  to the top; the rest of the `min-height: 100vh` remained as empty space
  **below** the footer. So the suspected cause was right: the content of the
  sections is not tall enough, and the grid made sure that this free space was
  not taken up by the footer.
- Measured at 1920 × 1080: shell 1080 px, footer from y = 860, 33 px high,
  187 px of space to the bottom edge.
- The full width is not the problem, it is intended: the footer is a block
  with a `border-top` that takes the inner width of the shell via
  `align-items: stretch` (1920 px minus 2 × 32 px padding = 1856 px).

### The solution

- `.landing-shell` is now `display: flex; flex-direction: column`. The flex
  child `.landing-footer` gets `margin-top: auto` and takes up the free space.
  That works independently of how many sections there are – unlike a fixed
  `grid-template-rows`.
- The width stays untouched: `align-self` remains `auto`, deliberately **no**
  `width: fit-content` was set.

### Tested

- **Before/after at 1920 × 1080:** footer from y = 860 to y = 1029, space to
  the bottom edge 187 → 18 px (exactly the `padding` of the shell). The width
  stays 1856 px, the margin on the left as on the right 32 px.
- **Eight window sizes checked,** measured rather than assumed: 1920 × 1080,
  1440 × 900, 1024 × 768, 800 × 600, 390 × 844, 1920 × 420 and 1000 × 360 on
  `/landing` as well as 1920 × 1080 on `/legal-notice`. In **no** case a
  horizontal scrollbar; on a page that fits, the space is exactly 18 px, on
  overflow the footer correctly lies below the fold and the page scrolls.
  **Full width verified in all seven cases:** the footer measures exactly the
  inner width of the shell, 32 px of margin on the left as on the right, no
  `max-width`.
- **No regressions:** `.landing-header` keeps its `z-index: 1`, the language
  menu (§57) is still not painted over – 0 px overlap with the news box, all 8
  options hit at their position by `elementFromPoint`. No JS errors.

---

## 62. Cosmetic: a heart in front of the version line in the footer

**Goal:** The footer started with the sober line
`MWS-wikiwise 0.3.3 · TiddlyWiki 5.4.1`. What was wanted was a ❤️ in front of
it, without touching the entry itself.

### The solution

- The heart is an **own `<span class="landing-footer-heart">`** directly before
  the version line, not part of it. Reason: the text comes from the
  translation key `MWS-wikiwise {version}`, which exists in all locale files.
  An emoji in the key would have to be adjusted in every language – and would
  still not be translatable, because it is not text. That way all language
  files stay untouched.
- `aria-hidden="true"`: the heart is decoration. Screen readers keep reading
  only the version, not "red heart".
- CSS: `flex: 0 0 auto`, `font-size: 0.85em`, `line-height: 1` and
  `translateY(calc(0.06em - 2px))`. Emoji visibly sit too high in small text
  and are drawn slightly too large; both are corrected that way. The lift is
  deliberately in `px` and not in `em`, so that it stays the same
  independently of the font size. `0.06em` is the base correction so the heart
  does not fall out of the line entirely. First implemented with 5 px, then
  adjusted down to 2 px after looking at it in the running system – measured
  `matrix(1, 0, 0, 1, 0, -1.37168)`, i.e. 2 px plus 0.63 px of base
  correction.
- Added to **all three** footers: start page (`app-landing.tsx`), admin app
  (`app.tsx`, `.admin-footer`) and legal notice (`legal-notice.tsx`). The
  legal-notice footer previously had no version line; it was added with the
  heart in front of it. The source is `embeddedServerResponse` (`mwsVersion`
  and `tw5Versions`), which the page already receives – no additional request
  was needed.

### Tested

- **DOM:** exactly one heart span, content only the heart
  (`U+2764 U+FE0F`), 13 × 10 px, `aria-hidden="true"`. The version line still
  reads `MWS-wikiwise 0.3.3 · TiddlyWiki 5.4.1` – in every language.
- **Alignment:** the heart sticks 1 px above the top edge of the text and
  2 px above its bottom edge. The footer height stays 33 px as before, no
  additional wrap.
- **Legal notice:** The footer now carries `❤️`, the version line and "Back to
  the start page" – 4 entries instead of 3 before. Checked there in seven
  languages as well: heart consistently 10 px high, text identical.
- **Seven languages** (en, de, fr, es, ko, ru, zh-cn) clicked through: the heart
  is 13 × 10 px everywhere, the text identical. No JS errors.
- **Bundle check:** the delivered `main.js` contains all three heart spans
  with `children:"❤️"` – the builder kept the pair correctly as an
  escape sequence and did not turn it into the text variant without
  variation selector.

## 63. The footer now sits at the bottom in all admin tabs as well

**Goal:** The footer sticks to the bottom of the screen on the start page, but
in the admin app it sat right behind the content. On a tab with two entries
like "Pinboard" (0 notes) that looked like half a page: the footer with version
line, version link, legal notice and cookie button stood after 350 px of
content in the middle of the screen, with 335 px of nothing below it.

### The solution

- `.admin-shell` is now a flex column (`display: flex; flex-direction: column`)
  like `.landing-shell`. The footer gets `margin-top: auto` and thus takes up
  the slack of a short tab. Deliberately **no** `gap` on the container: the
  vertical rhythm of the admin so far comes from the `margin-top` of the
  individual sections (hero −17 px, tab strip 24 px, section header 26 px), a
  `gap` would add up to those and falsify all distances. The modals in between
  are `position: fixed` and therefore out of the flex flow.
- **The fixed 28 px gap now lives on the predecessor instead of on the footer**
  – `.admin-shell > :has(+ .admin-footer) { margin-bottom: 28px; }`. Reason:
  `margin-top: auto` swallows its own margin once the page overflows – on long
  tabs the gap would have been gone. The margin of the element *above* the
  footer is not affected by that. Since a different element sits directly in
  front of the footer depending on the active tab, it is addressed via
  `:has()`; the pseudo class is already in use anyway with
  `body:has(.modal-shell[open])`.
- The `margin-bottom` of the section header (16 px) is thereby raised to 28 px
  where it sits directly in front of the footer. The result is the same gap as
  on tabs with content – before it was 44 px there.

### Tested

All eight tabs clicked through in the browser (Wikis, Templates, Bags, Roles,
Users, Storage, Pinboard, My files), measured before and after each:

| Tab | before: footer above the edge | after: footer above the edge | gap above it |
| --- | --- | --- | --- |
| Wikis | 402 px | **32 px** | 398 px |
| Templates | 600 px | **32 px** | 596 px |
| Bags | 554 px | **32 px** | 550 px |
| Roles | 461 px | **32 px** | 457 px |
| Users | 600 px | **32 px** | 596 px |
| Storage | −710 px | −710 px | **28 px** |
| Pinboard | 335 px | **32 px** | 331 px |
| My files | 368 px | **32 px** | 364 px |

- **Storage** is the only tab whose content runs past the screen (1822 px of
  page content at a window height of 1080 px). There the footer naturally stays
  below the fold, and the fixed gap of 28 px is retained – exactly the case
  that would have broken with a pure `margin-top: auto` solution.
- **32 px** is the bottom padding of `.admin-shell`, so the footer sticks to
  the content edge and not to the window edge. On the start page it
  correspondingly is 18 px. Footer height in all tabs 33 px as before.
- **Narrow windows** 1920 / 1280 / 900 / 420 px: no horizontal overflow at any
  width. At 420 px the content runs past the screen, the footer stands below it
  as expected and wraps to two lines (47 px high).
- **Start page and legal notice** unchanged: footer 18 px above the edge, 33 px
  high, heart present. No JS errors.

## 64. "MWS-wikiwise 0.3.3" in the footer linked

**Goal:** The product name with version number in the three footers (start
page, admin app, legal notice) should point to the project GitHub repository.

### The solution

- Instead of a separate constants module, the URL is entered as a hard literal
  in the three files – that matches the project style, there are no URL
  constants so far.
- **Only the product name** becomes the link, not the TiddlyWiki part:
  `MWS-wikiwise 0.3.3` (linked) · `TiddlyWiki 5.4.1` (plain). The link sits
  around the first `t()` call of the version span. The translations stay
  untouched because the link is made in JSX – the key value itself remains
  plain text.
- `target="_blank" rel="noreferrer"` like for all external links of the app
  (TiddlyWiki docs link, preview, wiki links). The Content-Security-Policy
  does not apply here: it only concerns the embedded wiki page
  (RecipeResolver) and contains no `navigate-to` – navigation to a new tab is
  not blocked.
- Visually the link automatically uses the `.landing-footer a` style (accent
  colour + underline), identical to the footer links "TiddlyWiki docs" and
  "Legal notice". No CSS change needed.

### Tested

All three footers checked in the browser via a fresh test instance (with login
including the emoji puzzle):

- **Start page** (public): link text exactly `MWS-wikiwise 0.3.3`,
  `href` exactly `https://github.com/heino17/MultiWikiServer-wikiwise`,
  `target="_blank"`, `rel="noreferrer"`.
- **Legal notice** (public): identical.
- **Admin app** (logged in): identical; the version span stays complete
  `MWS-wikiwise 0.3.3 · TiddlyWiki 5.4.1`.
- **No wrap:** footer height still 33 px, heart position unchanged (y = 1049),
  the link sits at 1048–1062 px in the accent colour `rgb(227, 201, 131)` with
  underline like the other footer links.
- No JS errors.

---

## 65. Embedding files uploaded into a wiki ("Files in this wiki")

**Goal:** files uploaded through the wiki toolbar should be usable inside the
wiki right away — images as images, other files as a link — without the wiki
having to know an "folder" or a separate share being needed. The documentation
had claimed this for longer (`Datei-in-einem-Wiki-verwenden`), but technically
the assignment was missing.

### The solution

**Server (steps 1–4, commit `5b68a69`):**

- `user_file.recipe_id` (recipe id, nullable, with an index) via Prisma schema
  plus migration `20260928_user_file_recipe`. `NULL` = personal file.
- An upload with `?recipe=<slug>` now writes this `recipe_id`
  (`UserFileUpload`); uploads from "My files" stay `NULL`.
- New routes, both with `assertReferer(["/", "/wiki"])`:
  - `GET/HEAD /api/user-files/wiki-file?recipe=<slug>&id=<id>` — streams the
    file **inline** (images/audio/video/PDF/…) with **range support**
    (seeking). The range logic of `UserFilePreview` was extracted into the
    shared helper `streamInline` for that, and both routes use it.
  - `GET /api/user-files/wiki-files?recipe=<slug>` — the list of all files of
    the wiki (for the folder modal).
- **Visibility = wiki read access:** both routes use the same read gate as the
  wiki page itself (`RecipeResolver.assertRecipe`). Whoever may open the wiki
  sees the files — deliberately **without `okUser`**, so that anonymous readers
  of a public wiki can load the contents too. Users with no relation to the
  wiki get exactly the same 404 as for the wiki itself (no existence oracle).
  Only files that really were uploaded into *this* wiki (`recipe_id` match) are
  reachable; personal files stay private.

**Client (step 5, commit `1d1379a`):**

- After an upload **inside a wiki** a modal opens with the finished TiddlyWiki
  code to paste: `[img[…]]` for images, `[ext[…]]` for everything else.
  (Personal uploads still get only the success note.)
- New toolbar button **"Files in this wiki"** (folder icon,
  `$:/tags/PageControls`, `tm-mws-wiki-files`): loads
  `/api/user-files/wiki-files` and shows per file preview (`[img]`/`[ext]`),
  file name and the copyable code snippet in a modal.
- The upload response now passes `id` and `type` through; 8 new i18n strings in
  all 8 languages.

### Tested

- `tsc2` and client `tsc` without errors; server and client bundle build.
- The migration is applied automatically by the `SqliteAdapter` at startup
  ("Applying migration 20260928_user_file_recipe"); column plus index
  `user_file_recipe_id_idx` verified via `PRAGMA table_info`.
- **End to end against a fresh instance** (port 5099, with the built-in
  `dist/`): login via the real OPAQUE protocol (`@serenity-kit/opaque`,
  `/login/1` + `/login/2`), then `PUT /api/user-files/upload?recipe=bedienungsanleitung`
  with a test PNG. Verified: `200` with `id/type/sizeBytes`; in the database
  `user_file.recipe_id` is exactly the recipe id of the wiki; `GET
  /api/user-files/wiki-files?recipe=…` lists the file; `GET
  /api/user-files/wiki-file?recipe=…&id=…` returns `200 image/png` with
  byte-identical content and, with `Range: bytes=0-9`, `206` + `Content-Range:
  bytes 0-9/70`. Gate: anonymously the file route returns exactly the same
  status as the wiki page itself (here `200`, because the wiki has ANON read
  access), unknown `recipe` → `404` (no existence oracle).

### Addition: URL resolution in the wiki client repaired

In the browser test (wiki `wiki-frau-meyer`, image `TAvatar2.jpg`) the folder
modal showed no image, and the inserted snippet loaded the file as
`http://localhost:5000/wiki/api/user-files/…` → `400 NO_ROUTE_MATCHED`. The
reason: the snippet began with `api/user-files/…` (without a leading slash),
and TiddlyWiki resolves relative URLs against the wiki page URL `/wiki/<slug>`
— which yields `/wiki/api/…`. In addition `[ext[…]]` was not a TW macro at all
(there is no core macro `ext`), so non-images would have been rendered as
literal text.

**Fix (`plugins/client/tiddlers/upload-file.js`):**

- New helper `wikiFileUrl()` returns the **domain-independent** URL
  `/api/user-files/wiki-file?recipe=…&id=…` (leading slash instead of host):
  TiddlyWiki resolves it against the current origin, so no host and port are
  baked into the tiddler and the snippet survives a change of server address.
  The XHR paths (upload, folder list) keep using
  `getHost()`/`$:/config/multiwikiclient/host`.
- Non-images get a real wiki link `[[filename|url]]` instead of the dead
  `[ext[…]]` (special characters `]`/`|` in the name are removed).
- Since the dev server reads the client tiddlers from
  `plugins/client/tiddlers/` at startup (plugin cache `mws/<version>/client`),
  the fix takes effect after a restart of the dev server.

---

## 66. README: quick start "Aus dem Repository" extended by initialization steps

After `git clone` + `npm install` + `npm start` on a fresh clone the server got
stuck at `Error: You need to run update-tiddlywiki first`, because `dev/` is
gitignored and the clone therefore contains neither `dev/wiki/tw5/<version>` nor
`dev/wiki/store/` — the steps were only in the development section, which the
quick start left out. In addition the quick start pointed at
`localhost:5000/dev/`, which only holds with a local `dev/mws.dev.json`; a fresh
clone listens on port `8080` without that file.

**Fix (`README.md`, EN and DE):** the quick start was extended by
`npm start update-tiddlywiki` and `npm start init-store`, with a note that
`dev/` is not in git; address corrected to <http://localhost:8080/>.

---

## 67. Dependency clean-up: hono to 4.13.10, in-range repairs

`npm audit` reported hono advisories among others (CORS ReDoS, `memo()` SSR data
leak, proxy helpers, language middleware, `parseBody()`, query parser) — hono
4.12.27 was pinned exactly in `@tiddlywiki/server` and resolved as `"*"` in
`@mws/wikiwise`, so no fix was possible. Cleaned up in range:

- `packages/mws/package.json: "hono": "*"` → `"hono": "^4.13.10"`, and
  `packages/server/package.json: "hono": "4.12.27"` → `"hono": "^4.13.10"`.
  hono is the core router of the server-side TW server (`new Hono<HonoEnv>()`,
  `@hono/node-server`, `serve-static`); 4.13.10 fixes all the listed advisories.
- `npm audit fix` additionally pulled in-range: `@hono/node-server` 2.0.8 → 2.1.1
  (WS handshake DoS), `uuid` 11.1.0 → 11.1.1, `picomatch` 2.3.1 → 2.3.2,
  `micromatch` 3.1.3 → 3.2.3.
- **Verified:** E2E (17 checks, login/upload/wiki-file/wiki-files/recipe gate)
  against a fresh instance with the newly built `dist/mws.js` → **ALL PASS**.
- **Remaining:** only `esbuild`/`html-jsx` (moderate, pure build dev tooling,
  not part of the server package; a fix only via the breaking change
  `html-jsx@0.3.7`).

---

## 68. Fix: the one-click wiki of `admin` now also starts private

When creating a one-click wiki (`PUT /admin/wiki`, button **"Create 1-Click
Wiki"**) only the **site admin** additionally received `USER → A_read` and
`ANON → A_read`. Teachers and students have received — since §22 — only their
**personal** role and thus deliberately **no** read access for everyone. The
admin was therefore the only user whose wiki, created with a click, was
immediately readable by *all* logged-in users **and** anonymously public; it
additionally appeared on the public start page `/` (§48, same ANON rule as
`LandingRoutes.ts`).

**Cause:** `AdminCreateWiki` in
`packages/mws/src/new-managers/TabDataAdapter.ts` chose the roles
conditionally:

```ts
const commonRole = isAdmin ? rolesMapper("USER") : undefined;
const anonRole   = isAdmin ? rolesMapper("ANON") : undefined;
```

and injected those two variables into both permission lists (bag `C_admin` +
recipe `B_write`) as `A_read`.

**Fix (`TabDataAdapter.ts`):** the special treatment for `isAdmin` is dropped
completely — a read access is now entered **for nobody**:

- `commonRole`/`anonRole` and the two `...(… ? [{ level: "A_read" }] : [])`
  spreads removed; the permission lists now consist only of the creator role.
- `NEW_WIKI_ROLES` reduced from `["ADMIN", "USER", "ANON"]` to `["ADMIN"]` —
  `USER`/`ANON` are not resolved at all any more, which the comment there and
  at the role selection explains.

**Result:** the one-click wiki is private for **all** users — identical to the
one of Frau Meyer and Heino. The admin keeps full access: `ADMIN → C_admin`
(bag) resp. `ADMIN → B_write` (recipe) as well as the `isAdmin` bypass in
`RecipeResolver.assertRecipe` (`RecipeResolver.ts:200`). `owner_user_id` remains
the admin, the owner protection (§11) applies unchanged.

**Sharing:** deliberately, as before for the teacher, via the wiki dialog
("Create Defined Wiki" → *Readable by* / `recipeUsers`, §26) resp. by invitation
(§25) — thus **not** via the one-click button.

**Verified:** `tsc -p tsconfig.json --noEmit` without errors.

**Note:** already created admin wikis keep their previous `USER`/`ANON` rights
(the change only affects newly created wikis). Whoever wants to make them
private removes the two roles in the wiki dialog under *Readable by*.

---

## 69. Fix: the one-click wiki modal closes after creating

After a successful one-click creation the dialog **"Create a wiki with a
single click"** stayed open and additionally showed the note "Fertig — dein
Wiki ist da:" with the link to the new wiki. The dialog only vanished when it
was clicked away with *Close* / ✕ — although the action had long since
finished.

**Fix (`packages/admin-vanilla/src/app.tsx`, `submitNewWiki`):** in the success
case the dialog is now closed (`newWikiOpen = false`) and the name field is
emptied — exactly like when deleting a wiki (`deleteWiki` →
`store.closeModal()`), which already handles the same sequence this way. In the
error case the dialog stays open as before and shows the error in the
`error-banner`.

**Consequence:** the confirmation link "Fertig — dein Wiki ist da:" in the
dialog has become superfluous and was removed — along with
`@state() newWikiSlug` (no longer set) and the now unused text key in all eight
language files (`de`, `en`, `es`, `fr`, `ja`, `ko`, `ru`, `zh-cn`). The link is
not lost: `store.reload()` reloads the list, the new wiki stands immediately under *My
wikis* — the slug column there is a link to `/wiki/<slug>`
(`getListColumnLinkMappers`, `app.tsx:2492`).

**Verified:** `tsc -p tsconfig.json --noEmit` without errors.

---

## 70. Fix: the welcome tiddler showed "1. Willkommen in …" instead of a heading

The start tiddler of the one-click wiki contained as its first line
`# Willkommen in „<Wiki-Name>" 🎉`. That is **Markdown**, but the tiddler is
`text/vnd.tiddlywiki` — and there `#` is **not** a heading, it is the character
for a **numbered list item**. TW therefore renders the line as `<ol><li>` → in
the wiki view a small "1." stood in front of the text instead of the bold
heading.

**Fix (`packages/mws/src/new-managers/TabDataAdapter.ts`, `welcomeText`):**
`#` → `!`. The TW syntax for headings is `!` (h1) to `!!!!!!` (h6)
(`core/modules/parsers/wikiparser/rules/heading.js`, regexp `(!{1,6})`); `#`
belongs to the list `list.js` (`ordered`). The two bullet points below stay `*`
(unsorted list) — that was already right.

**Migration of existing wikis (`mirrorDisplayNameIntoStarterTiddlers`):** the
guard that recognises the automatically generated welcome text at the unchanged
starter (and carries it along when the wiki is renamed) tested for
`startsWith("# Willkommen in …")`. Since the starter text has changed, it would
have run into the void for existing wikis and the text would no longer have been
**updated** on a rename. The guard therefore now accepts both forms (`#` **and**
`!`); on the next rename an old wiki is automatically carried along to `!`.
Self-written welcome texts remain untouched (the additional condition is
`includes("per Knopfdruck für dich angelegt")`).

**Verified:** read the TW 5.4.1 source of the rules `heading.js` (`!`) and the
list rule (`#`); `tsc -p tsconfig.json --noEmit` without errors.

**Still open (not touched):** the 54 `.tid` files of the edition
`bedienungsanleitung` (wiki *MWS Bedienungsanleitung*) are written in Markdown as
well (`#` heading, `-` lists, `**bold**`), but have **no** `type:` field — they
therefore inherit `text/vnd.tiddlywiki` and are rendered just as wrongly. (For
comparison: `editions/mws-docs` does it right, `.md` files with `.meta` files
on `type: text/markdown`.)

---

## 71. Fix: "Files in this wiki" showed "1. Dateien in diesem Wiki"

The same Markdown instead of TW syntax as in §70, this time in the **client
plugin** at the wiki toolbar button **"Files in this wiki"**. The button
creates the tiddler `$:/state/mws/WikiFiles` and shows it as a modal; its
heading was built with `# ` and therefore appeared as a numbered list item
("1. Dateien in diesem Wiki") instead of a bold heading.

**File:** `plugins/client/tiddlers/upload-file.js`

There, **three** places were built with Markdown syntax for
`text/vnd.tiddlywiki`, **two** of them headings:

- `renderWikiFiles` (`:250`) — `var body = "# " + …` → `"! " + …`. This is the
  tiddler `$:/state/mws/WikiFiles`.
- `showUploadSnippet` (`:203`) — `text: "# " + …` → `"! " + …`. The **same**
  heading, but in the success modal that appears after a file upload into a
  wiki — it deserved the same fix and gets it along.
- `renderWikiFiles` (`:248`) — `"**" + file.filename + "**"` →
  `"''" + file.filename + "''"`. TW bold is `''` (`rules/emphasis/bold.js`,
  regexp `/''/mg`); `**` remained as **two visible asterisks**. This affected
  every list entry, thus the file name of every file in the modal.

The language texts themselves (`en-US.multids` and the seven `i18n/*.multids`)
are plain prose without markup — they were never affected.

**Verified:** read the TW 5.4.1 rules `heading.js` (`!`), `emphasis/bold.js`
(`''`), `list.js` (`#`/`*`). That covers the code part of the repo completely:
the sweep over all `addTiddler`/`setText`/`saveTiddler` places finds **no**
further place that builds wiki text from Markdown. The remaining hits are
either pass-through of client text (`attachments.ts`, `RecipeResolver.ts`,
`save-tiddler-text.ts`), JSON/`"yes"`/`"no"` status values or deliberately
Markdown for the admin interface (`app-landing.tsx`, `legal-notice.tsx`,
`user-files.tsx` — the latter is rendered to HTML server-side, TW wiki text
would be without effect there).

**Remains open** (static contents, not touched, see the query):
`editions/bedienungsanleitung/tiddlers/*.tid` (49 of the 54 files, §70) and
three `editions/mws-docs/tiddlers/*.tid` with a single backtick instead of a
double one for inline code (`Allowed Methods.tid`, `Usage.tid`,
`system/$__mws_cssvar-macro.tid`).

---

## 72. Fix: the complete "MWS Bedienungsanleitung" was written in Markdown

After §70/§71 the same cause in the edition `editions/bedienungsanleitung`
(the wiki *MWS Bedienungsanleitung*, 54 `.tid` files, created in
`new-commands/init-store.ts`): the tiddlers have **no** `type:` field, so they
inherit `text/vnd.tiddlywiki` — but they were written in **Markdown**.
Headings appeared as "1. Title", bullet lists as literal hyphens, bold as
visible `**`.

**Decision:** TW syntax instead of `type: text/markdown`. A Markdown parser is
not present in the standard setup (it is only available in `editions/mws-docs`)
— with `text/markdown` the manual would have been unreadable in normal
operation.

**Converted (49 of the 54 files, 354 lines):**

- `# Title` → `! Title`
- `- Point` → `* Point` (all 220 list items stood in column 0, no nesting, no
  continuation lines)
- `**bold**` → `''bold''` (155 places)
- `` `code` `` → ```` ``code`` ```` (8 places)

Untouched remained the 5 files without Markdown: `$:/core/ui/TagTemplate`
(widget/HTML), `$:/TagLanguageStyles` (CSS), `$:/DefaultTiddlers`,
`$:/SiteTitle`, `$:/SiteSubtitle`. The converter touched **only the body**
(never the header) and yields 368/354 lines — the difference consists
exclusively of 14 newly inserted blank lines.

**Second class of error, only visible through rendering:** in Markdown a list
may interrupt a paragraph, in TW it may not. In `Übersicht`/`Overview` the
section headings (`''Anmelden & Konto''`) stood directly above their list, so
all the items landed as text inside one `<p>`. 14 blank lines inserted (7 per
file).

**Verified with the real renderer** (`node dev/wiki/tw5/5.4.1/tiddlywiki.js
editions/bedienungsanleitung --rendertiddler … text/html`), all 54 pages:

- `<h1>`, `<strong>`, `<ul><li>`, `<code>` — no literal `- `, `# `, `**` any
  more, no visible backtick, no `<ol>`
- all links resolve (`tc-tiddlylink-resolves`)

**Two corrections to my own analysis:** a first sweep reported three false
positives in `editions/mws-docs` (`Allowed Methods.tid`, `Usage.tid`,
`system/$__mws_cssvar-macro.tid`) — "single instead of double backtick for
inline code". The renderer refutes this: the rule `codeinline.js` matches
`/(``?)/mg`, **one** backtick is a valid inline code delimiter in TW 5.4.1
(just like the double one). Those three files therefore remained **unchanged**.
Likewise the 4 backtick places in the manual were already correct; converting
them to double backticks is cosmetic.

For the code files from §70/§71 the same applies: the TW constructs used
(`!`, `''`, `*`, ``````) are verified against the real renderer.

---

## 73. Fix: `load-wiki-folder --overwrite` was fundamentally unusable for existing bags

When updating the manual from §72 in the local store (`load-wiki-folder
editions/bedienungsanleitung --overwrite`) the command aborted with a 403:

```
SendError: {"status":403,"reason":"ACCESS_DENIED",
  "details":{"reason":"Only the user who created the bag (or the site admin
  'admin') may edit it."}}
  at BagDataAdapter.saveRow (TabDataAdapter.ts:905)
  at LoadWikiFolderCommand.execute (new-commands/load-wiki-folder.ts:142)
```

**Cause:** two authorization paths in the same `saveRow` contradicted each
other. `BagDataAdapter.saveRow` checked the owner via the hardcoded comparison
`user.username === "admin"`, while the preceding `checkExisting()`
(TabUpserts.ts:97) evaluates `user.isAdmin`. The CLI command identifies itself
as admin but has no `username` at all
(`new BagDataAdapter({ isAdmin: true } as any)`), so the inline check always
failed — and that for **every** already existing bag. `init-store` got past it because it creates new bags
(`existing === null`); an `--overwrite` could therefore never work. Also
affected: every user holding the ADMIN role whose `username` is not exactly
`admin`.

**Fix (without a change of the rights semantics):** the inline check was
removed in favour of the canonical helper `assertCanEdit()`, which already
existed for templates, and its `isSiteAdmin` extended by `user.isAdmin`.
`isAdmin` is derived by the SessionManager from the ADMIN role and is
therefore reliable; `checkExisting` already relied on nothing else. Both paths
now judge identically, the error message is uniform.

**Second, small CLI correction:** `recipe-users` and `owner-roles` were declared
as `<string>` in the commander info (thus **single-valued**), while description,
type (`string[]`) and `init-store` anticipated several roles. The parser
therefore rejected `--recipe-users ANON USER` with
`The option "recipe-users" may only have a single value`. Declared as
`<string...>` (variadic) both options are now multi-valued, as documented. Without
this the import would have lost the manual's existing `USER`→`A_read` share — logged-in users do not
get the `ANON` role (namely `SessionManager.parseIncomingRequest`), so access
would have silently been restricted to administrators.

**Side effect of the import, checked and deliberately accepted:** the recipe
definition of the manual now contains explicitly
`plugins: ["$:/themes/tiddlywiki/vanilla", "$:/themes/tiddlywiki/snowwhite"]`
(instead of `[]`). That is a **no-op**: `requiredPlugins`
(plugin-cache/index.ts:22-26) already contains those same two themes, and
`RecipeResolver.getPluginList()` merges both lists via a `Set`. Neither
appearance nor access change.

**Also affected by the import, restored:** `load-wiki-folder` hardcodes
`landingVisible: true` (load-wiki-folder.ts:176, TabDataAdapter.ts:463), thereby
deleting a set `landing.hidden.<recipeId>` and it would have made the manual
visible on the public start page. Since the CLI cannot express this state, the
flag was set back after the import (the checkbox *Landing page* in the wiki
editor steers the same). Likewise the 8 handwritten tiddlers of the bag were
deleted (`saveLoadedTiddlers` removes every title that is not in the folder) —
among them `$:/language`, `$:/languages/de-DE`, the Markdown plugin and the
draft `Entwurf: 'Start' von admin`.

**Verified:** full comparison of the SQLite database before/after the import
over recipes, recipe definitions, recipe-bag assignment, recipe and bag rights,
bags, templates, users and roles: **all 14 other wikis bit-identical**, recipe
and bag rights of the manual unchanged, only the manual's bag 62 → 54 tiddlers.
All 54 imported tiddlers were checked for Markdown remains: 0 hits.

---

## 74. Fix: thumbnails frozen in the browser cache (image only updates after Ctrl+Shift+R)

After §43 (thumbnail display) the report came in: a newly created tiddler does
not appear in the preview image, a `Ctrl+Shift+R` shows it immediately. The
server logic from §43 is correct in that — the error lay in two response headers
in `serveWikiThumbnail()` (`WikiThumbnailRoutes.ts`).

**Cause 1 — `Cache-Control: private, max-age=<TTL>`:** the image URL is stable
per wiki (`/wiki/<slug>/thumbnail`, `store.ts:316`), and `max-age` was set to the
**server TTL** (24 h). The browser therefore did not issue the request at all for
up to 24 hours — the revalidation via `ETag`/`If-Modified-Since`, which is
already fully implemented right below it, was never reached. The server could
re-render the PNG as often as it liked: the copy in the browser simply stood
still. `max-age` was doubly wrong here — the TTL controls **when the server
re-renders**, not how long a browser may keep a *byte-identical* image.
Verified on the example `wiki-heino`: tiddler `New Tiddler` saved at 08:07, PNG
re-rendered server-side at 10:19, HTTP headers before that
`cache-control: private, max-age=86400` with an unchanged URL.

**Fix:** `private, no-cache` (instead of `max-age`) for 200 and 304. The browser
thus asks again on every display, but on no change it only gets a 304 without
body — the ETag is formed from `mtime`+size of the PNG file and is therefore
guaranteed to be new after a re-render.

**Cause 2 — the 404 without cache header:** for a wiki without a PNG the route
answered with `writeHead(404, {contentType})` and **without** `Cache-Control`. A
404 without freshness information is heuristically cacheable according to HTTP,
so the browser could remember the "no image" state and keep serving it long
after the PNG existed. That is exactly what happened with the wiki *MWS
Bedienungsanleitung*: the preview image was missing for hours in the admin list
although the route could have rendered it at any time — the browser just did not
want to load it any more. **Fix:** a `404` now answers with
`cache-control: no-store`.

**Remaining, deliberate delay:** the 180 s debounce from §43 (TiddlyWiki
autosaves on every keystroke) and rendering only on the next list call remain
unchanged. The expected behaviour is therefore: save tiddler → wait about
3 min → (re)load the Wikis tab → new image. No reload of the page and no hard
reload any more. *(This delay is shortened to 60 s in §75 and deleting the PNG
is abolished — sections 74 and 75 belong together.)*

**Verified** against the running server:

| Case | before | after |
| --- | --- | --- |
| Fetch | `200`, `max-age=86400` | `200`, `private, no-cache` + `ETag` |
| `If-None-Match` = current | — | `304 Not Modified` (no body) |
| `If-None-Match` = stale | — | `200` with new image |
| PNG missing | `404` without header | `404`, `no-store` |

Two smaller observations from the same pass (no error, only an explanation):
`recipe.compiledAt` is only updated when saving the wiki **definition**, not when
saving a tiddler — it is therefore no use as a cache buster, but `lastEventId`/
`tiddler.updated` would be, should one ever want versioned URLs (`?v=…`) instead
of revalidation. And `bedienungsanleitung.png` did not exist at all before the
hard reload: the file only arose at 10:19, thus through the forced new request.

---

## 75. Fix: the preview goes stale instead of vanishing (no empty image while typing)

The cache fix from §74 made the display reliable, but the waiting time remained
unchanged: 180 s debounce plus rendering only on the next list call. Reason:
TiddlyWiki sends a sync on every keystroke (`syncer.js`
`throttleInterval = 1000`), and §43 had the PNG **deleted** as soon as a tiddler
had been saved after 180 s of quiet. In that time window the image was gone —
with a real render (about 2.5 s Chromium) the wiki list had an empty cell for
all visitors without write access, since only logged-in users render at all.

**Cause of the 3 minutes, in numbers:** `syncer.js` throttles saves to one per
second (`throttleInterval = 1000`), the task timer of the server runs at 250 ms,
so after the last change that is 1.25 s in total. The debounce in §43 was
therefore set to 180 s, so that a typing user does not re-render every preview
image. The price: up to three minutes until the update.

**Change — freshness from the database instead of a timer:**
`serveWikiThumbnail()` now compares the `mtime` of the lying PNG with the
newest `tiddler.updated` across the bags of the recipe (`isStaleAfterEdit()`, an
`aggregate` query on `_max(updated)`). The caller `RecipeRoutes.ts` no longer
calls anything at all after `batch/save` and `batch/delete`, there are no
`invalidationTimers` any more and the PNG is never deleted. A re-render now
only happens when

1. no PNG exists,
2. the server TTL (§43, `admin.thumbnailTtlHours`) has expired, or
3. the PNG is older than the last tiddler save **and** the wiki has had
   `thumbnailGraceMs()` ms of quiet since (default **30 s**,
   `MWS_THUMBNAIL_GRACE_SECONDS`; the old name
   `MWS_THUMBNAIL_DEBOUNCE_SECONDS` is dropped).

Thus a stale preview image stays visible and is replaced on the next fetch after
60 s of writing quiet — instead of vanishing. The comparison also survives a
restart: the debounce timer from §43 lived only in the process, and a restart
within the window left a stale image standing until the TTL (24 h). It is still
only deleted when the **wiki is deleted** (`deleteThumbnail()`), and the clean-up
run over orphaned files at startup (`sweepOrphanedThumbnails()`) remains
unchanged.

**Verified** against the running server, with real `batch/save` calls included
(the measurement was made with the grace set to 60 s at the time, the default
has since been lowered to 30 s):

| Case | Result |
| --- | --- |
| PNG newer than last save | `200` in 19 ms, no render |
| Save, fetch immediately (within the grace) | `200` in 19 ms, PNG unchanged, old image visible |
| Save, fetch anonymously during the grace | `200`, PNG present |
| Fetch after 62 s of quiet | `200` in 4.6 s, PNG newly rendered |
| Tiddler newer than PNG, grace 0 | `200` in 4.0 s, PNG newly rendered |
| Headers unchanged | `200`/`304`: `private, no-cache`; `404`: `no-store` |

**Grace default lowered from 60 s to 30 s**, `MWS_THUMBNAIL_RENDER_CONCURRENCY`
stays at **2**. Both are pure defaults, still overridable via environment
variable; the parallelism is read once at startup, so a restart suffices.

Why the grace is not a load driver: a render is requested exclusively — there is
no background job that re-renders all wikis. "Many wikis in use" does not create
load by itself, only "many wikis that are currently stale **and** being looked
at". Extended thinking pauses of 30–60 s are now rendered; that costs renders,
but no RAM/CPU without cause. The price in content: more often an image is
created from a half-finished state of editing.

Why the parallelism stays at 2 — measured on 4 cores / 8 GB with 15 wikis, all
thumbnails removed and all 15 re-rendered in parallel:

| | Value |
| --- | --- |
| RAM at rest | 463 MB (151 MB Node + 312 MB idle browser) |
| RAM peak with 4 simultaneous renders | 883 MB (+420 MB, ~14 % of free memory) |
| CPU on a full render | 26.9 CPU seconds = **29 % of 4 cores** |
| Wall time full render of all 15 wikis (4 slots) | 89.95 s |

Rendering is **wait-bound, not CPU-bound**: `page.goto(…, networkidle)` with a
60 s timeout plus 2.5 s wait time before the screenshot, plus software rendering
(`--disable-gpu`) — into the Node process itself land 0.00 s CPU, the load sits
entirely in Chromium. The same job with four small wikis, executed twice:

| | Wall time | per render |
| --- | --- | --- |
| 4 in parallel (concurrency 4) | **12.24 s** | 5.6 – 12.2 s |
| one after another (concurrency 1) | **18.27 s** | 4.0 – 4.8 s |

Factor **1.5** for double the memory need. Extrapolated to the burst of 15 the
time gain is correspondingly small (serial ~70–90 s, with 4 slots 90 s), because
the individual renders stretch from ~4.5 s to 5.6–12.2 s. On this machine the
higher parallelism is therefore not worth it; it stays at 2 and can still be
raised to 8 via environment variable for installations with lots of RAM. What
was noticeable here in the first place is the wall time of the full render
itself: 90 s until the last image of a wiki list is there.

Side finding while measuring: the 404 of the **rights check** (private wiki,
anonymous fetch) still carries no `Cache-Control`. That is the generic MWS
behaviour for all routes, not thumbnail-specific; a blanket `no-store` as default
was discarded, because `Cache-Control` is *merged* rather than replaced when
answering, and every successful response would then have been delivered
contradictorily as `no-store, private, no-cache`.

---

## 76. Paging the wiki list instead of rendering 15 preview images at once

With preview images enabled (§73/§74) the wiki list loads **all** wikis at
once: one row per wiki, each with its own PNG. With 15 wikis that is 15 HTTP
requests and 15 images in the DOM — initially only the top ones are visible, the
rest still renders in the background (2 slots, §75).

**Why client-side and not server-side:** `/admin/load` already delivers the wiki
list within a single response, and sorting as well as grouping happen in the
client anyway. A server-side page fetch would change nothing about that, it
would only introduce another roundtrip per paging movement. The list is also
small and bounded at the top (one row per wiki) — there is nothing a server-side
fetch would leave out.

**Behaviour:** the default is 10 wikis per page, configurable via
`admin.wikisPerPage` (0–200; `0` = all wikis in one list, empty field =
default 10). The pager shows Back/Next, "Page X of Y" and the total count. The
groups "My wikis", "Shared with you" and "System wikis" remain; if a group
continues on the following page, its heading is repeated there. The page number
is clamped (no empty page when the list gets shorter) and reset on tab change; a
click on Back/Next brings the list header back into the visible area.

**Effect:** the actual gain is not the number of pages but the number of preview
images: with 15 wikis and 10 per page there are 10 PNGs in the DOM instead of
15 — and only the page actually being looked at is rendered.

**Setting:** new field "Wikis per page" in the admin settings, with the same
0–200 validation as in the server schema.

**Tested** (second dev instance on port 5001, 15 wikis, headless Chromium):
10 → 2 pages (10 + 5), 7 → 3 pages, 5 → 3 pages, 0 → no pager with all three
groups in one list; saving via the form (7) and clearing the field (row is
deleted, the default 10 applies); 999, −3 and `"abc"` are rejected with 400, the
stored value remains unchanged.


## 77. Bags tab: roles below each other instead of as a comma list

The "Permissions" column in the Bags tab showed the roles of a bag as **one**
comma-separated line ("ADMIN, USER, ANON"). Every additional role made the line
wider, and because the column sits at the far right it was precisely the one
that slipped out of the window – one had to scroll horizontally to see it.

**Like in the wiki list:** there `recipeUsers`, `recipeAdmins` and `groupRoles`
have long been stacked below each other as badges (`list-access-names`), and
exactly that was missing here. The Bags tab now uses this representation too –
one role per row instead of side by side.

The value still arrives unchanged as a comma-separated string from the
preparation (`summarizePermissionRoles()` in `definition/store.ts`) and is now
only split in the list cell; nothing changes in the record itself, so that
export and detail view remain untouched.

**Measured** (second dev instance, window 1600 px wide): column "Permissions"
347 → 156 px, the horizontal overflow of the list shrinks from 245 px to 55 px.
The Templates tab has the same comma column ("Readonly bags"), but is
unremarkable here (153 px, no overflow), because the installed template has no
readonly bags.


---

## 78. Search and sorting in all five list tabs

With 15 wikis, 15 bags and 12 roles the admin list was the only place left where
one still knew how a record is called: no search field, no sortable columns,
and the order was the order from `/admin/load`. Whoever was looking for "the
collection of recipes" or "Mrs Meyer's wiki" had to scroll through the list and
read against top and bottom.

All five generic tabs (**Wikis, Templates, Bags, Roles, Users**) now have the
same header bar with search field and clickable columns. "My files" is not part
of this yet — that follows in §79.

**Search.** A `type="search"` field per tab filters the list while typing,
plus a click button (×) and the hit count ("3 of 15 shown"). The search is
**independent of case, umlauts and eszett**: "schuler" finds "Schüler",
"strasse" finds "Straße". Case and diacritics are removed via `normalize("NFD")`.
For "ß" (and the capital "ẞ") Unicode has no decomposition — `NFD` leaves it
unchanged, and `toLowerCase` makes a lower-case "ß" out of it beforehand —, so
it is replaced by hand with "ss". Without that the search would fail for German
data in exactly the most common way of avoiding an umlaut.

Folding applies only in the **search**, not in the sorting: a sort is a fixed
order and `localeCompare` likewise does not fold "ß", whereas the search may be
indulgent. Thus "Schuler" finds "Schüler" (umlaut omitted), but "Schueler"
does not — that is a different word.

Only **named, visible** columns are searched. The thumbnail column has no
heading and its URL says nothing about the record, so it does not count. The
badge columns can be found via their visible wording ("Owner", "Private",
"Shared"), truncated columns in full length — a hit one cannot see is better
than one one cannot find.

**Sorting.** A click on a column sorts ascending, the second descending, the
third removes the sorting again. Active columns get an arrow (▲/▼), `aria-sort`
and a screen reader announcement ("Sorted ascending"); the header cell is marked
up as `columnheader`, the sort button is called "Sort by Slug".

Sorting is done by what *stands* in the cell:
- Numbers in text fields numerically, so that "10 Bags" lands behind "9 Bags"
  and not in front of it.
- ISO dates chronologically.
- "Own wikis" in the form "3 / 5" resp. "3 / ∞" by current usage (the first
  number).
- Text with `localeCompare(..., { numeric: true, sensitivity: "base" })`, thus
  including digits in the text ("Class 2" after "Class 10").

**Empty values stay at the bottom** – in *both* directions. An unknown value is
"not known" and not "the smallest"; otherwise the two system wikis without owner
would jump to the top when sorting descending. In case of a tie the ID decides,
so that the order stays stable.

**Grouping yields to sorting.** The wiki list is otherwise grouped into "My
wikis", "Shared with you" and "System wikis". As soon as a column is actively
sorted, **one** flat list over all groups appears — otherwise the grouping would
tear the sorting result into three blocks. A third click on the header restores
the groups. The page navigation from §76 also works with filtered and sorted
data, so the pager counts what is actually visible.

**Own state per tab, only in memory.** Whoever changes tab and comes back finds
query and sorting in place. Deliberately *not* in `localStorage`: a stored
sorting survives an update in which the column was renamed, and would then sort
by a column that no longer exists.

**A JSX finding while doing so:** the JSX runtime used writes `value={...}` via
`setAttribute`. But an attribute update does not update a `search` field in
which text has already been typed — so on tab change the old text remained while
the list was filtered by the new one. A `ref` callback that sets the DOM
property fixes this.

**New texts** in all eight language files (561 keys, parity checked). The new
placeholders use `t(currentTab.label)` instead of a lower-cased tab name, so that
e.g. "No matches in Wikis." appears instead of "No matches in wikis.".

**Checked** (second dev instance on `127.0.0.1:5001` with a copy of the test
data, Playwright, 15 wikis / 15 bags / 12 roles / 6 users / 1 template, window
1600 px): all checks passed, among them search over slug **and** owner
(`meyer` → 3), umlaut folding (`schuler` → 3), search in email addresses and
roles, `ownWikiUsage` numerically (`1 / ∞`, `1 / ∞`, `1 / 2`, `2 / ∞`, `2 / 2`,
`6 / ∞`), sorting across page boundaries (10 + 5, page 2 as an exact
continuation), empty owners at the very bottom in both directions, grouping
returning after the third click, grid column widths and overflow unchanged.
`tsc --noEmit` and `tsup` clean, no runtime errors in the console.

For the **ß folding** an end-to-end bag named "Straßen-Projekt" was additionally
created: `strassen`, `STRASSEN`, `Straßen`, `straße`, `Strassen-Projekt` and
`projekt` find it (1 hit each), `strase` and `strassn` do not. The test bag was
then deleted again. Since the test data contains no "ß", the test suite checks
the normalization additionally via unit test against the real function source
(`Schüler`/`schuler`, `Straße`/`strasse`, `STRAẞE`/`strasse`, `Große`/`grosse`,
`Maße`/`masse`, `Füße`/`fusse`).

Known deliberate limits: the record editor has no escape shortcut (closing is
done via "Cancel"), and the older placeholders like "Create a {tab} to get
started." still use lower-cased tab names.


---

## 79. Search and sorting also in the "My files" tab

§78 had deliberately left out "My files". The justification was an assumption
and it did not hold: there is no changing folder context here that would make a
client-side search misleading. `/api/user-files/list` and
`/api/user-files/shared` query `userFile` without `take` and deliver **all**
files — the same starting position as `/admin/load` in the five record tabs.
The list is thus complete in the browser, and search as well as sorting apply to
everything, not to a silently truncated subset.

**One search field for both tables.** The tab shows own files and – for normal
accounts – below them "Shared with me". A file is a file whether it was uploaded
by oneself just now or is shared: an input field above both tables therefore
filters both, and the hit count counts over both sections together. The heading
of the shared section does not disappear when all of its rows drop out; instead
its own empty state appears there ("No matches in Shared with me."), so that it
is clear that the search is the reason and not an empty share.

**Sortable columns** like in the record tabs: click ascending, click again
descending, third click back to the server order ("Uploaded" descending, as
delivered by the server). Arrow, `aria-sort` and screen reader announcement
expressly the same as in §78, so that the handling stays the same throughout the
admin area. The action column (Share, Preview, Download, Delete) still has no
header and is not sortable.

**Large files first, as one expects.** The "Size" column shows "1.5 KB" to
"54.5 MB". If the formatted cell were sorted, "950.4 KB" would come before
"2.3 MB", because "9" comes before "2" alphabetically. Sorting is therefore done
by `sizeBytes`, the raw number, and by `createdAt`, the ISO timestamp — the same
idea as with "3 / ∞" in the users: sorting is done by the measured value, not by
its label.

**Owner only where there is one.** The own table carries the "Owner" column only
in the admin view; the shared one always. A normal account therefore sees four
sortable headers there, an admin five – as in the record tabs, where columns
are present or absent depending on the role.

**No duplicate logic.** Normalization, tri-state toggling, sorting and
comparison logic now live in `list-view.ts` and are used by both places.
`app.tsx` is correspondingly about 100 lines smaller; the folding from §78
thereby applies unchanged here as well (see below).

**Translations:** none new. All required keys ("Search", "Search {tab}…",
"Clear search", "{shown} of {total} shown", "Sort by {column}", "Sorted
ascending", "Sorted descending", "Clear sorting", "No matches in {tab}.") were
already present with §78; the tab name is inserted via `t("My files")` resp.
`t("Shared with me")`, so that the placeholder fits in every language.

**Checked** (second dev instance, Playwright): 124 checks passed, 24 of them for
this section. Sorting is done numerically by size (1.5 KB → 54.5 MB, "KB before
MB"), search and sorting work together, the third click restores the server
order, "Clear sorting" and the × button work, no horizontal overflow.
`tsc --noEmit` and `tsup` clean.

Two further checks secure a statement that only made it into the READMEs: the
badge columns are found via their **plain text**, not via their value. `private`
yields 10 rows and 10 Private badges, `shared` 3 rows and 3 Shared badges – in
the cell there is not a single word, what is searched is the label. The first
version of the test searched for `owner` and found nothing: as an admin all
wikis consistently have admin rights, there simply is no owner badge to find.
The test was corrected to what actually exists.

Additionally checked on a real non-admin account (test user created, a file named
"Straßennamen-Liste.txt" uploaded, then deleted again): `strassen`, `STRASSEN`,
`Straßen`, `straße`, `Strassennamen` and `liste` find it, `strase` and `strassn`
do not; the own table has four sortable headers; the shared section is searched,
sorted and shows its own empty state; and without own files it stays at "No
files yet. Upload something to get started." instead of a misleading "No
matches". Test user, test file and test bag from this measurement have been
removed again — the inventory is unchanged at 6 users and 23 files.


---

---

## Unchecked-in starter configuration (local, gitignored)

```json
[
  {
    "host": "0.0.0.0",
    "port": "5000"
  }
]
```

> Note: Port 8080, the default port, is already in use on the server by Apache2
> (Ubuntu default page), hence port 5000.

## 80. `CONTRIBUTING.md` and `AGENTS.md` written out

Both files existed in the repository but had never been touched in this fork:
`AGENTS.md` (7 lines) was last changed upstream on 6 July 2026,
`CONTRIBUTING.md` (4 lines) on 7 July 2026 — while `README.md`,
`README_features.md`, `ARCHITECTURE.md`, `PLANNING.md` and `CHANGELOG.md` were
all maintained here. Both were also empty of anything specific to this fork.
`CONTRIBUTING.md` was only the note that contributors have to sign the
TiddlyWiki CLA, pointing at `TiddlyWiki5/contributing.md`; upstream had itself
cut the file down in `f1ed053` ("add some notes about architecture", 93
deleted lines) and moved the content into `ARCHITECTURE.md`, so the fork
inherited a husk. `AGENTS.md` — the file with instructions for AI coding agents
— consisted of one behavioural rule and a list of VS Code/Cursor tool names
(`get_errors`, `vscode_*`, `lsp_*`) that exist in no agent setup at all: the
rule was useful, the tool list ballast.

**The CLA reference is gone, deliberately.** A contributor license agreement
grants the project the right to redistribute a contribution under other terms.
TiddlyWiki asks for one because the TiddlyWiki project needs that freedom for
its own codebase. This fork is BSD 3-Clause with a single maintainer, where the
repository license already covers what is contributed, so the requirement
produced an obstacle without a legal benefit. `CONTRIBUTING.md` now says that
plainly: pull requests are accepted under BSD 3-Clause and there is nothing to
sign.

**`CONTRIBUTING.md`: 4 → 288 lines, English and German.** The structure follows
the other user-facing documents, one half per language with matching headings.
It covers what to read before starting (`ARCHITECTURE.md`, `PLANNING.md`,
`CHANGELOG.md`), a setup block (`git clone`, `npm install`, `npm run certs`,
`npm start update-tiddlywiki`, `npm start init-store`, `npm start` →
<http://localhost:8080/>), a command table, and the traps that are only
learnable the hard way: `npm test` builds, packs, **deletes and recreates
`tests/`** and starts that instance on port 8080, so the dev server has to be
stopped first, and it is a smoke test without automated assertions;
`npm run tsc` is a tsup variant, the typechecker is `npm run tsc2`; the root
script `npm run tsc-client` still points at the removed
`packages/react-admin` and no longer works, so the admin app is typechecked with
`cd packages/admin-vanilla && npm run tsc`. The database comes from
`DATABASE_URL` (SQLite, Postgres, MSSQL), the schema is in
`prisma/schema.prisma`, and stores created before 27.09.2026 need the
additional tables (§70). The conventions are the ones used in this repository:
one topic per commit, German commit messages with a prefix and a §-reference,
no dependency without saying so, no generated artifacts. The documentation
contract has its own section: a new numbered CHANGELOG section in both language
halves with the same number, `README.md` and `README_features.md` mirrored,
wiki files are not Markdown, new UI strings in German and English. The release
checklist lists every version location (`package.json`, `package-lock.json`,
`tools/package-lock.json`, `README.md`, `README_features.md`,
`editions/mws-docs/tiddlers/Installation.md`, `create-package/README.md`),
`npm run build`, `npm pack` → `mws-wikiwise-X.Y.Z.tgz`, a commit as
`release: Version X.Y.Z`, the annotated tag `vX.Y.Z` and a GitHub release with
the tarball attached. Publishing to npm is not part of it and is called out as
deliberate, so that nobody adds it back.

**`AGENTS.md`: 7 → 125 lines, for agents.** What the repository is (the server
packages; the admin app in `packages/admin-vanilla` with `src/app.tsx`,
`src/list-view.ts`, `src/i18n.ts` and `src/locales/` on
`@tiddlywiki/jsx-runtime` — no React, no preact; the wiki-side client in
`plugins/client`), the mandatory reading with `grep -n "§N" CHANGELOG.md` as
the quick way into existing code, and the hard rules: never edit `dist/`,
TiddlyWiki files are not Markdown, new user-visible strings need both
languages, documentation is bilingual by contract, the CHANGELOG is the
development story (`§81` is next), the security invariants (the referer check
in `RequestState.ts` as a deliberate prefix test, the per-wiki CSP from
`RecipeResolver.ts`, public read access only via the `ANON` role, read-only
wikis never save), no silent dependencies, no secrets from `~/.npmrc`, never
push, tag, publish or bump a version unless asked, and a side tangent answered
as a comment before any file is edited. The upstream behavioural rule was kept
word for word. The command table replaces the dead tool list with the actual
scripts and their failure modes, the conventions section records that
verification is manual (CI only builds the documentation site on pushes to
`main`), and a definition-of-done checklist ends the file.

**Verified.** Both halves of `CONTRIBUTING.md` have the same nine headings in
the same order and at the same depth; every file path and every `npm` script
mentioned in both documents exists, checked mechanically against the working
tree and `package.json`; `npm run tsc2` is clean; `git status` shows only the
two documents plus this changelog and `PLANNING.md`. No runtime behaviour was
touched, so there was nothing to click through in a dev instance — the check
here was reading, the path and script check, and the typechecker. The open
point "sell people on contributing to the project" in `PLANNING.md` is now
done, and both documents name `§81` as the next section.

## 81. GitHub Actions verifies instead of publishing the upstream site

The workflow this fork inherited, `.github/workflows/ci.yml`, did not test
anything: on every push to `main` it built the documentation edition
`editions/mws-docs` and pushed the result to
`TiddlyWiki/mws.tiddlywiki.com-gh-pages`. That is the **upstream** website, and
overwriting it is not this fork's business — the push could never have worked
anyway, because the token it uses, `GITHUBPUSHTOKEN`, does not exist here. It
had also been red for a while: the build died inside
`markdown-it-tiddlywiki.js` with `Error: inline rule didn't increment
state.pos`, before the push step. That failure has nothing to do with the
fork's own code, which is why the two pushes before this one were red as well.

**What it is now:** a verification run and nothing else.

- `npm ci` for a lockfile-faithful install. The `prepare` hook runs
  `build:pack` during it, and `scripts.mjs` installs `tools/` on demand, so a
  fresh checkout needs no extra step.
- `npm run tsc2` — the typechecker over the server packages (the root script
  `npm run tsc` is a tsup variant, not a typechecker).
- `npm run tsc` in `packages/admin-vanilla` — the admin app with its own
  `tsconfig.json`, which the root configuration only covers in part.
- `npm run build` — the client bundle and the runtime bundle into `dist/`.

There is no deployment step, no secret and no write permission: the workflow
declares `permissions: contents: read`, so even a later addition of a deploy
step would fail instead of pushing somewhere. It runs on pushes to `main`, on
every `pull_request` (the check that matters is the one before a merge, and
this fork will get pull requests from outside) and on manual
`workflow_dispatch`. Node is pinned to 22, the version this fork is developed
and released with; `actions/checkout` and `actions/setup-node` were bumped from
`@v2` and `@v1` to `@v4`, which also removes the deprecation warning about
actions targeting Node 20. Superseded runs on the same ref are cancelled. The
job is called `build-and-typecheck`, because the old name
(`build-mws-tiddlywiki-com`) described a job that no longer exists.

`build-mws-site.sh` went with it. It existed only to serve that deployment, and
a script in this repository that pushes to TiddlyWiki's site is a trap for
whoever runs it next; it stays recoverable in the git history. **Deliberately
not fixed:** the `markdown-it-tiddlywiki` crash — it belongs to the rendering
of the upstream documentation site, which this fork does not publish, and
fixing it would mean carrying along a fork of TiddlyWiki's site build for a
page nobody asked for. Publishing our own documentation site is a separate
decision with its own hosting, recorded in `PLANNING.md` so that it is not
mistaken for an oversight.

**Verified.** `npm ci --dry-run` passes, so the lockfile is in sync with
`package.json`; `npm run tsc2`, `npm run tsc` in `packages/admin-vanilla` and
`npm run build` all run clean in that order, and `git status` stays empty after
the build because `dist/` is git-ignored. The workflow file parses as YAML and
every command it runs exists in `package.json`. Whether GitHub's own runners
agree is decided by the first run after the push — nothing is deployed, so a
red first run would be harmless and a green one means something. Not touched,
noticed on the way: the `exclude` list in `tsconfig.json` still names
`packages/admin-react` and `packages/admin-mdui`, two packages that do not exist
in this fork (it has `packages/admin-vanilla`). Those entries have no effect,
since nothing matches them.

## 82. GitHub Actions on `node24` instead of `node20`

The first run of §81 was green — and nevertheless carried a warning:
`Node.js 20 is deprecated. The following actions target Node.js 20 but are
being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4`.
The warning was not about the project but about the actions themselves:
`checkout` and `setup-node` in the fourth major release run internally on the
Node 20 runtime that GitHub is switching off. §81 had only raised them to `@v4`,
because that was the usual upgrade — by now those are the oldest available
major versions.

**Jumped to the current major version, not to `@v5`.** The actions were already
on `@v7` (`checkout` v7.0.1, `setup-node` v7.0.0), and `@v5` would only have
repeated the same mistake under a newer number. Both `action.yml` files say
`using: node24`, while the fourth major version ran on `node20`; the inputs
used (`node-version`, `cache`) are unchanged. Going to `@v7` instead of the
intermediate version is therefore the shorter and the future-proof choice —
SHA pinning remains an option if the workflow ever becomes security-relevant.

**Verified.** The workflow still parses as YAML, all six steps are unchanged,
and `git status` shows only the workflow and this changelog. Only the run on
GitHub can show whether the warning is really gone — and after the push it is:
the run is green and the annotation about `node20` is no longer there, only the
notice that `ubuntu-latest` migrates to Ubuntu 26 from 19.10.2026.

## 92. Snapshots get their own dialog: "Restore a snapshot"

**Why.** The snapshot list of §85 lived inside "Take over a wiki file". That
made it hard to find on purpose and easy to reach by accident: it appeared only
after picking an existing wiki *and* pressing "Check the file", so looking at the
history of a wiki required an import first. The list itself was never the
problem, the entrance was. Two details made it worse — the restore button was a
bare icon whose meaning had to be guessed from a tooltip, and the confirmation
was a `globalThis.confirm` alert that looked nothing like the admin app around it.

**What.** A second entry in the "Create a wiki" dropdown opens
`SnapshotRestoreDialog` (`packages/admin-vanilla/src/snapshot-restore.tsx`): its
own modal with a wiki picker, the snapshot list and the sentence that explains
what a restore does. A row shows date, tiddler count and origin, and carries a
written button "Restore this snapshot" instead of an icon. Clicking it expands
that row into an inline confirmation naming the wiki, the date, the count and
the fact that the current content is saved first, then offers "Keep the current
state" and "Restore now". The browser alert is gone.

The file dialog loses the snapshot list altogether, together with
`loadSnapshots`, `restore`, the `snapshots`/`snapshotsBusy`/`restoring`/`notice`
state and the whole `renderSnapshots` block. What is left is one undo button in
the result: after an import it reads "Restore a snapshot" and hands the imported
slug to the new dialog through `onRestoreSnapshots`. Two modals would stack, so
the import dialog steps aside — `openSnapshotRestore` closes it. The preview
hint was reworded because it pointed at a list "below" that no longer exists.
`PLANNING.md` records the move; the ⚖️ entries about the routes, the gate and
the snapshot bag are untouched.

**"Open the wiki" opens a new tab.** A restore throws the admin app away — the
wiki itself is the next thing one wants to see, and its history is what the
restore just changed. Both links, the one in the restore dialog and the one in
the import result, therefore carry `target="_blank"` with
`rel="noopener noreferrer"`, the same pair the wiki cards on the start page use
(`app-landing.tsx`). The dialog stays where it is; the wiki opens beside it.

The server side did not change: same `GET /api/wiki-file/snapshots`, same
`PUT /api/wiki-file/restore`, same permission — only those who may replace see
snapshots at all.

**i18n.** Eleven new keys in all eight languages, one reworded, one obsolete
removed with the alert, which leaves the eight base key sets at the same 648.

**The icons needed a size of their own.** `MaterialSymbol` strips `width` and
`height` from the SVG so that CSS can scale it, which means every occurrence has
to declare its own dimensions — `font-size` does not size an SVG. The new notice
carried an icon into `.wiki-file-notice`, which is not a flex container, so the
SVG took its undefined default and filled the whole card: 189 px of icon in a
752 px dialog for the undo button, and full width for the notice. Measuring all
`material-symbol` in both dialogs also turned up two icons from §85 that were
0 × 0 — the heading icons and the one on the snapshot line, which had only ever
had a `font-size`. All of them are sized now: 20 px for headings, notice and
snapshot line, 18 px for buttons, following the convention the other 30 icon
rules already use.

**Verified.** Headless Chromium against the dev instance, `fetch` stubbed: both
wikis in the picker and `initialSlug` preselecting `testwiki`; two rows with
German dates, "412 Tiddler" through the `#one` rule, and the second row falling
back to `sourceBagName` when `source` is empty; clicking the restore button
expanding the confirmation with both buttons; "Restore now" sending
`PUT /api/wiki-file/restore?wiki=testwiki` with
`{"snapshot":"snapshot-wiki-20260102T101500000Z"}`, reporting "Die Wiki
\"testwiki\" wurde vom 2.1.2026, 11:15:00 zurückgesetzt." with a "Wiki öffnen"
link, closing the panel and firing `onDone`. The file dialog: no
`.wiki-file-snapshots`, no icon-only restore button, requests to `inspect` and
`import` only — the `snapshots` request is gone — the new hint, and the undo
button calling `onRestoreSnapshots("testwiki")`. Every `material-symbol` in both
dialogs measures 20 × 20 or 18 × 18 afterwards, none 0. No exceptions in the
console.
Both "Open the wiki" links measure `href="/wiki/testwiki"`, `target="_blank"`
and `rel="noopener noreferrer"`; headless Chromium does not list the tab a
`_blank` click opens, so the effect was proven with the counterpart: an anchor
without `target` navigates the current tab (`/login` → `/main.js`), the same
anchor with `target="_blank"` leaves it on `/login`.
The dropdown entry itself needs a login, and the dev store has no password at
hand, so it was checked in the bundle: the compiled button carries
`onclick:()=>{this.openSnapshotRestore(),this.closeCreateWikiMenu()}`. `npm run
tsc2`, the admin typecheck, `npm run build` and the i18n audit (648 keys per
language, no orphans, no duplicates, no invented placeholders, no literal `t()`
without an entry) are clean.

## 98. Feature: the snapshot hint folds away, the sum stays

**Why.** The hint of §97 answered the right question but spent 122px on it, and
on a narrow screen it pushed the wikis it talks about further down the page. What
the eye needs first is a single number — "4 snapshots" — and everything else is
detail that only matters once you decide to deal with it. So the hint now shows
only its head line by default, and the head line is what you click.

The head is a real `<button>`, not a click handler on a paragraph: it is reachable
by keyboard, carries `aria-expanded` and `aria-controls`, and a chevron on the far
right rotates when it opens. Two new strings came with it ("Show details" /
"Hide details"), because a title tooltip that says nothing about what will happen
is worse than none.

No new icon: `keyboard_arrow_down.svg` was already imported as `expandIcon` for
the pinboard and is now used for the chevron too.

**Verified.** In the browser, with 4 snapshots on `neues-admin-empty`: closed 44px,
open 165px, the head stays 1408px wide in both states and the chevron keeps its
13px distance from the right edge instead of jumping next to the text; click, second
click and Enter all toggle, `aria-expanded` follows, and the wiki chip still opens
the snapshot dialog. At 420px the closed head wraps to 59px and the open one is
222px — no overflow, the chips stay inside. `npm run tsc2`, the admin typecheck,
`npm run build` and the i18n audit are clean.

The head came out content-width at first and the chevron jumped left when the hint
opened. `.field-callout` was defined **twice** in `app.inline.css`, the second copy
pasted in further down with spaces instead of tabs, and it won on source order —
so the hint was a two-column grid all along and `display: flex` never applied. The
second copy was declaration-for-declaration identical to the first, so it was
deleted instead of worked around; the layout is unchanged without it. The rest of
that pasted block (`.pinboard-hint`, `.error-banner`, `.primary-button`) is still
duplicated and still harmless.

## 97. Feature: the wikis page says how many snapshots are lying around

**Why.** A snapshot is written on every import that replaces a wiki, and nobody
notices them afterwards: they have no place in the list of wikis, no entry in the
menu you would think of, and their only way back is a dialog behind three clicks.
So a teacher who imported ten files in a row has ten copies of every wiki and no
indication of it. The information existed, it was just never asked for.

Counting per row was the obvious first idea and was dropped on purpose: a second
number on every line competes with the name and the size, and it would have to be
hidden whenever it is zero, which is the normal case. One hint above the list
says the sum, names the wikis involved, and disappears completely when there is
nothing to report.

`GET /api/wiki-file/snapshot-counts?wikis=a,b` returns `{counts, total, keep}` for
up to 200 slugs in one request, because the alternative is one request per wiki on
every visit of every admin page.

`resolveWikiTarget` is deliberately *not* used here. Its `assertRecipe()` ends the
request with an empty response when a wiki is missing or not accessible, so one
invisible wiki would have emptied the whole hint; the route therefore asks the same
two questions directly (`RecipeResolver.canWriteBag()`, `mayReplace()`) and skips
what the user may not replace. A hint must not report that something exists which
the reader is not allowed to see.

**Verified.** In the browser: 5 snapshots over `neues-admin-empty` produce a hint of
122px height directly above the list, no overlap; clicking the wiki chip and the
button both open the snapshot dialog with that wiki preselected and its 5 rows;
after removing the snapshots the hint is gone entirely. Without a session the
route answers 403 `ACCESS_DENIED`, a teacher gets `{"counts":[],"total":0}` and no
hint at all. `npm run tsc2`, the admin typecheck, `npm run build` and the i18n
audit (668 keys per language) are clean.

Two things only the browser could have told us. `.field-callout` is a grid with
two columns, so the four children of the hint were laid out as a 2x2 block and
the box grew to 383px — it is a flex column now. And the icon inside the button had
no intrinsic size, which stretched its grid row to 313px; both icons are fixed to
18px.

The first wording of the hint was wrong about the storage. It said the older
snapshots "stay in the database until you delete them here", but `createSnapshotBag`
calls `pruneSnapshotBags()` and drops everything below the newest {keep} on its
own — a hint promising storage that does not exist is worse than no hint. It now
says that only the newest {keep} of each wiki are kept and that the rest is worth
deleting.

## 96. Bug fix: restoring a snapshot left the wiki in a mixture with it

**Why.** Restoring a snapshot produced a wiki that was neither the snapshot nor
the wiki it had been: tiddlers that the wiki had gained after the snapshot was
taken were still there afterwards, and in the browser they showed up as leftovers
of a version that was supposed to be gone.

The reason was one rule, applied too widely. A replace — and a restore is a
replace — never *deletes* `$:/` tiddlers of the target bag, because those tiddlers
configure the wiki as a whole and an uploaded file that stays silent about them
must not wipe them. A restore is not such a file. A snapshot is a complete copy
of that wiki's own bag, `$:/` tiddlers included; it is not a source that stays
silent, it is the wiki's own former state. So the rule protected exactly the
things a restore is supposed to remove.

What made it hard to see was the asymmetry. An ordinary tiddler created after the
snapshot *was* deleted; a system tiddler created after the snapshot stayed. Two
tiddlers, same age, same bag, opposite outcomes — so a restore looked like it
worked most of the time and mixed leftovers in the rest.

**What.** `planTiddlers()` grew a `keepTargetSystem` option, default `true`, and
both restore paths — `restoreSnapshotBag()` for the admin dialog and the
`restore-wiki-snapshot` command — pass `false`. Everything else is untouched: an
import still keeps the `$:/` tiddlers of the target bag and still reports them as
`keptSystemTitles`. A restore therefore *replaces* the bag instead of merging into
it, and a restored wiki is byte-for-byte the snapshot's content.

**Verified.** `empty_deutsch.html` into `wiki-schuler-2`, then three tiddlers
created afterwards — `NormalerArtefakt`, `$:/SystemArtefakt`,
`$:/ArtefaktNachSnapshot` — then the restore of the earlier snapshot: `4 deleted`
instead of the `1 deleted` of before, all three leftovers gone, and the bag
compared field by field against the snapshot's content: identical. The import
path was re-checked in the same store and still reports the 12 system tiddlers of
the wiki as `kept as they are`. `npm run tsc2`, the admin typecheck,
`npm run build` and the i18n audit are clean; the dev store was restored
afterwards.

## 95. Bug fix: an imported wiki kept a start page that pointed nowhere

**Why.** Importing a single-file TiddlyWiki into a wiki MWS had created left
the wiki on its own welcome page. The plan said `$:/DefaultTiddlers` was
"kept as it is", the wiki opened `Willkommen` — and `Willkommen` was gone,
because the file had replaced the bag. Nothing was wrong with the import; the
start page was. `Willkommen` is what MWS writes into every wiki it creates
(`TabDataAdapter.ts`), so it was never the file's opinion about a start page.

The file does have an opinion, but not where the parser was looking. A
single-file TiddlyWiki practically never keeps `$:/DefaultTiddlers` in its
store: the stock edition leaves it in `$:/core`, where it reads
`GettingStarted`. Reading only the store therefore found nothing and kept the
MWS value, and the wiki opened a title no file had ever mentioned.

**What.** `parseWikiFile` reads `$:/DefaultTiddlers` out of the core the file
carries, but only when the file's own store says nothing about it — a file that
names its own start page has already had its say. The value is then treated as
a system tiddler of the file, so it travels *without* needing the
system-tiddler opt-in: a start page naming a tiddler nobody can open is the one
thing worse than the wrong one. `readCoreText()` parses the plugin payload
(`{"tiddlers": {...}}`) and yields nothing for a payload that is not that shape,
so a repacked or broken core leaves the previous behaviour alone.

Only `$:/DefaultTiddlers` gets this treatment. `$:/SiteTitle` is not moved into
the bag by the parser either — the import dialog reads it for the display name,
and `WikiShell` writes it — and the other core settings are not start pages.

**Verified.** `empty_deutsch.html` (5.4.1, no `$:/DefaultTiddlers` in the store,
`$:/core` carries `GettingStarted`) into `wiki-schuler-2`: the plan reports
`$:/DefaultTiddlers` as `changed` instead of keeping it, `Willkommen` lands in
`deleted`, and the bag afterwards holds `$:/DefaultTiddlers = GettingStarted`
with no `Willkommen` left. Against the running dev instance the wiki index
serves `$:/DefaultTiddlers` with `GettingStarted`, and the core it already
loads carries the `GettingStarted` tiddler itself, so the page renders rather
than falling back to an empty wiki. `npm run tsc2`, the admin typecheck,
`npm run build` and the i18n audit are clean; the dev store was restored
afterwards. A file whose store *does* carry `$:/DefaultTiddlers` is unaffected —
the core is not consulted.

## 94. Feature: import a file's core plugins, themes and libraries with version checking

**Why.** §86 deliberately forbade writing core plugins, themes and libraries
into a bag, because the plugins of a wiki come from its recipe and `$:/core`
alone is megabytes. A single-file wiki may nevertheless be meant to *be* that
version: a restored snapshot should be indistinguishable, and someone who saves
an empty.html of the same release may want the bag to hold what the file has.
The reactivation asked for a narrow, opt-in way that cannot let a 5.3.0 core
into a 5.4.1 wiki.

**What.** A new `include-plugins` flag. When set, `parseWikiFile` takes an
opt-in and a `targetVersion`; language packs are not affected. For non-language
plugin tiddlers ($:/core, themes, libraries) the parser:
- keeps a plugin in the bag only when its own `version` equals `targetVersion`,
- rejects a plugin with no `version` ("no-version"),
- rejects a plugin whose `version` differs ("version-mismatch"),
- reports rejected ones with a short reason in the plan.

The CLI (`import-wiki-file`) and the REST routes (`/api/wiki-file/inspect` and
`/api/wiki-file/import`) accept `?include-plugins=1`. The admin dialog shows a
new checkbox: "Also import the file's plugins: core, themes and libraries",
explaining that only those at the wiki's version travel with it, into snapshots
and another installation; the running wiki loads plugins from the installation's
cache so the cache copy wins when `externalPlugins` is true. The preview lists
kept plugins and shows reasons for skipped ones ("not asked for", "no version",
"different version"). The new export structure includes `includePlugins` and
`keptPluginTitles` and `skippedPlugins` (each with `title`, `reasonCode`,
`reason`).

**The shadowing is deliberate.** With `externalPlugins: true` (Blank Template)
the loaded page includes the cache versions as `$tw.preloadTiddler` scripts and
the DOM store's copies of `$:/core` etc. are replaced by the cache copies after
`loadTiddlersBrowser()`; the bag copy is still carried into snapshots and
survives a move to another installation. With `externalPlugins` off the bag
copy is what boots. No boot reordering was made — the cache copy is what the
client plugin of this installation expects.

**Verified.** `empty.html` (5.4.1) with `--include-plugins` writes `$:/core`,
`$:/themes/tiddlywiki/snowwhite`, `$:/themes/tiddlywiki/vanilla` into the bag;
without it none. A mismatch file where `$:/core` becomes `5.3.0` writes the two
themes but leaves `$:/core` out with the exact reason. A file with no version
field on the core is rejected with "names no version". `npm run tsc2`, the admin
typecheck, `npm run build` and the i18n audit all clean; the store used for the
live test was restored.
# 🇩🇪 CHANGELOG – MultiWikiServer-wikiwise

Dokumentation der Änderungen am MultiWikiServer-wikiwise-Fork von heino17.
Dieses Log erzählt die Entwicklungsgeschichte in umgekehrter
Reihenfolge der Features, Bug-Fixes und Umbauten seit dem Basis-Stand.

Stand: 2026-09-30 · Basis: `TiddlyWiki/MultiWikiServer` @ `3627482`

## Zusammenfassung

Dieser Fork enthält mehrere kleine Bug-Fixes sowie Features für den
HTTP-/Proxy-Betrieb von MWS: öffentliche Lesezugriffe via ANON-Rolle,
kein Phantom-Speichern in Lese-Wikis, Owner-Schutz für Wikis/Bags/
Templates/Rollen/User, `admin`-User-Management (Direkt-Passwort,
Löschen), Wiki-Erstellung & -Löschung per Knopfdruck sowie
nachträgliches Umbenennen von Wikinamen und Slugs (inkl. automatischer
Mitbenennung des Standard-Bags). Die Admin-App ist vollständig
zweisprachig (DE/EN), schützt die System-Rollen vor dem Löschen,
validiert Wiki-Kurznamen live (Format + Verfügbarkeit), bündelt die
Wiki-Erstellung in einem Dropdown, schaltet zwischen hellem
(warmem `#F3E6C5`) und dunklem Design um und ergänzt die
Passwort-Felder um einen sicheren Zufalls-Passwort-Generator mit
wählbarer Länge (8–32) und Kopieranzeige.

Seit September 2026 kommt ein kompletter **Lehrer-Bereich** hinzu
(§21–§27): Ein Schulbetreiber (Direktor/`admin`) legt Lehrer an; jeder
Lehrer verwaltet **nur seine eigene Klasse** und sieht die Wikis der
anderen Lehrer **nicht**. Die Trennung läuft über **persönliche
Rollen** (benannt nach dem Benutzernamen, z. B. `Frau Meyer`) statt über
die gemeinsame TEACHER-Systemrolle, ein serverseitiger Rollen-Guard verhindert das
Zuweisen fremder Lehrer-Rollen (sowie `ADMIN`/`TEACHER`), und das
Admin-UI blendet fremde persönliche Rollen im User-Dialog aus.
Gleichzeitig bleibt **Kooperation** möglich: Ein Lehrer kann einen
anderen Lehrer per Einladung in sein Wiki holen (`B_write`/`C_admin`),
und Klassen-Rollen geben Schülern gezielt Lesezugriff. Begleitend wird
die E-Mail-Spalte der User-Tabelle `nullable`, damit mehrere User ohne
E-Mail nicht mehr auf `""` kollidieren. Alle Änderungen sind bewusst
klein gehalten und rückwärtskompatibel.

Ergänzend kommt ein **Admin-Tab „Speicher"** hinzu (§39–§41): Er trennt
den **System-Festplattenstatus** klar von der **Speicherbelegung des
MultiWikiServer-wikiwise**, weist die **Binärinhalte (Blobs & Dateien)** aus
(Anzahl/Größe, Dateispeicher, Inbox, verwaiste Dateien) und zeigt den
**Speicherverbrauch pro User (Top 10)** inkl. Wiki-Inhalten und
Dateispeicher. Damit wird sichtbar, dass MWS Binärinhalte inline als
base64 in der SQLite-Datenbank hält (kein separater Blob-Store).

Neu ist außerdem ein Tab **„Meine Dateien"** (§44): Jeder eingeloggte
Nutzer lädt eigene Dateien hoch (Standardlimit 100 MB pro Datei,
übersteuerbar via `MWS_USERFILE_SIZE_LIMIT`), hält sie im Browser zum
Download und zur Inline-Vorschau ab (Bild, Audio, Video, PDF, Text,
Markdown und ODT-Textdokumente) und kann sie gezielt teilen —
Admin-Freigaben erreichen alle, Lehrer-Freigaben ihre Klassen(mitglieder)
und Admins, Schüler-Freigaben konkret gewählte Empfänger. Die Bytes
liegen content-addressed
(`store/files/<sha256>/`) auf der Festplatte, in einer SQLite-Tabelle
stehen nur Metadaten (`user_file` + `user_file_share`).

Dazu kommt in jeder Wiki-Werkzeugleiste ein **„Upload file"-Button**
(§45): Er lädt Dateien direkt aus dem geöffneten Wiki hoch — bei
Schreibzugriff in den Dateispeicher des **Wiki-Besitzers**, nicht des
Hochladenden.

Seit September 2026 gibt es außerdem einen **Security-Umbau „C"** (§47):
Personalisierte Bag-Namespaces gegen Namens-Squatting (C1), Wiki-
Klassifikation + CSP-Header + Existenz-Orakel (C2) und die gegliederte
„Meine Bereiche"-UI mit Vertrauens-Labeln (C3).

---

## Release 0.4.0 — 2026-09-30

26 Commits seit 0.3.3, 98 Dateien, +4554/−622. Das Schwergewicht liegt auf
Dateien und Listen: Upload in ein Wiki mit direkt einbindsbarem Ergebnis (§65)
sowie Suche und Sortierung in jeder Liste der Admin-App (§78, §79).

**Neu**

- **Dateien im Wiki** (§65): die Wiki-Werkzeugleiste lädt in den Dateispeicher
  des Wiki-Besitzers hoch – auch wenn man als Gast oder Lehrer im fremden Wiki
  schreibt. „Dateien in diesem Wiki" listet sie mit Vorschau und fertigem,
  kopierfertigem TiddlyWiki-Code (`[img[...]]`/`[ext[...]]`). Sichtbarkeit ist
  das Wiki-Leserecht; persönliche Dateien in „Meine Dateien" bleiben privat.
- **Suche und Sortierung in allen sechs Listen** (§78, §79): Wikis, Templates,
  Bags, Rollen, Benutzer und Meine Dateien haben je ein Suchfeld, das beim
  Tippen filtert (Schreibweise, Umlaute und „ß" egal), dazu anklickbare
  Spaltenköpfe. Zahlen zählen als Zahlen, Dateigrößen nach echten Bytes, und
  beim Sortieren werden die Wiki-Gruppen bewusst flach – sonst zerreißt die
  Gruppierung ein Ergebnis in drei Blöcke.
- **Die Wiki-Liste blättert** (§76): zehn Wikis pro Seite statt 15
  Vorschaubilder auf einmal zu rendern, unter „Einstellungen" konfigurierbar
  (0 = alle in einer Liste).

**Behoben**

- **Sicherheit:** Das 1-Klick-Wiki des `admin` war als einziges sofort für
  *alle* eingeloggten Benutzer und anonym öffentlich lesbar und erschien auf
  der Startseite; es startet jetzt wie alle anderen privat (§68). Das Modal
  schließt außerdem nach dem Anlegen (§69), und Willkommenstiddler wie
  „Dateien in diesem Wiki" zeigen eine Überschrift statt „1. …" (§70, §71).
- Thumbnails waren im Browser-Cache eingefroren und aktualisierten sich erst
  nach Strg+Shift+R (§74); die Vorschau bleibt jetzt beim Bearbeiten sichtbar
  und erneuert sich nach 30 s Schonfrist von selbst, statt zu verschwinden
  (§75).
- Die komplette „MWS Bedienungsanleitung" war in Markdown geschrieben und damit
  als Handbuch unbrauchbar (§72), und `load-wiki-folder --overwrite` war für
  vorhandene Bags grundsätzlich unbenutzbar (§73).
- Die Bags-Liste zeigt ihre Rollen untereinander statt als Kommaliste (§77).
- Wartung: Dependency-Reinigung, `hono` auf 4.13.10 und In-Range-Reparaturen
  (§67), README-Schnellstart vervollständigt (§66).

**Hinweise für den Betrieb**

- Eine additive Migration, `20260928_user_file_recipe`: sie ergänzt ein
  nullable `recipe_id` samt Index in `user_file`. Es werden keine Daten
  umgeschrieben. Hat eine Datenbank die Spalte schon, gilt die Migration nach
  §56 als angewandt, statt den Start mit „duplicate column name" abzubrechen –
  dieser Schutz greift damit erstmals real.
- Der erste Start nach dem Update baut einen frischen Plugin-Cache unter
  `cache/mws/0.4.0/`; ältere Verzeichnisse bleiben unangetastet und können
  gelöscht werden.
- Die `0.2.x`-Regel für den Datenordner und die API bleiben unverändert, und
  alle acht Sprachen sind vollständig.

---

## Release 0.4.1 — 2026-10-01

4 Commits seit 0.4.0. Ein Patch-Release: ein sichtbarer Bugfix im Wiki-Client,
drei Wartungs-Commits dahinter.

**Behoben**

- **Ein Verbindungsalarm statt einer Flut** (§83, Upstream-Issue #139): War das
  Netz weg, stapelte die Wiki Alarm nach Alarm — gemessen auf einer isolierten
  Instanz erschien der erste Alarm nach 61,9 s, danach zwei Alarme je
  fehlgeschlagenem Abruf mit einem Zähler bis 10, alle 5 s ein neuer Versuch, und
  beide Alarme blieben stehen, nachdem das Netz zurückkam. Jetzt gibt es
  **einen** Hinweis mit eigenem deutschen und englischem Text, er verschwindet,
  sobald wieder eine Aufgabe durchgeht, und die Wiederholungen gehen zurück
  (5 → 10 → 30 → 60 s), damit ein Laptop aus dem Schlafen nicht minutenlang
  den Server fragt. Ungespeicherte Änderungen bleiben erhalten. Ein Server, der
  wirklich mit einem Fehler antwortet (403, 503), meldet sich weiterhin als
  gewöhnliche Meldung.

**Wartung**

- `CONTRIBUTING.md` und `AGENTS.md` ausformuliert (§80).
- GitHub Actions prüfen, statt die Upstream-Website zu veröffentlichen (§81), und
  laufen auf `node24` mit `checkout`/`setup-node` v7 (§82).
- `scripts/syncer-alert-sim.mjs` misst das Alarmverhalten mit Playwright und ist
  die Regressionsprüfung für §83.

**Betriebshinweise**

- Keine Migration, keine Schemaänderung; die 0.2.x-Datenordnerregel und die API
  bleiben unverändert.
- Der erste Start nach dem Update baut einen frischen Plugin-Cache unter
  `cache/mws/0.4.1/`; `cache/mws/0.4.0/` bleibt unberührt und kann gelöscht
  werden.
- Der Syncer in der Wiki ist Client-seitiger Code: ein offener Wiki-Tab braucht
  ein Neuladen für das neue Verhalten.

---

## 1. Fehlende Dependency: `escape-string-regexp`

**Dateien:** `package.json` (root)

Der Server importierte `escape-string-regexp` in
`packages/mws/src/services/setupDevServer.ts`, aber das Paket fehlte in
allen `package.json`-Dateien → der Build (`tsup`) brach mit
`Could not resolve "escape-string-regexp"` ab.

**Fix:** Dependency zum Root-`package.json` hinzugefügt:

```json
"escape-string-regexp": "^5.0.0"
```

---

## 2. CSRF-Referer-Check blockierte Passwort-Änderung

**Datei:** `packages/mws/src/new-managers/sessions.ts`

**Problem:** Die Seiten `/login` und `/profile` sind Teil derselben
Admin-Oberfläche. Der „Update password"-Flow auf `/profile` führt intern
einen frischen Login über `/login/1` und `/login/2` aus. Deren
Referer-Check erlaubte aber nur Seiten unter `/login`:

```
ACCESS_DENIED → reason: "Referer check failed"
```

**Fix:** Die beiden Login-Endpunkte akzeptieren jetzt zusätzlich
`/profile` als Referer:

```ts
state.assertReferer(["/login", "/profile"]);
```

(Zeilen für `login1` und `login2`.)

---

## 3. `crypto.subtle` im Browser nicht verfügbar (HTTP)

**Datei:** `packages/admin-vanilla/src/passwords.ts`
**Package:** `packages/admin-vanilla/package.json`

**Problem:** `generateSessionSignature()` nutzte
`window.crypto.subtle.digest("SHA-256", …)`. `crypto.subtle` existiert
nur in einem *secure context* — also HTTPS oder `localhost`. Über
`http://192.168.x.x:5000` schlug die Passwort-Änderung daher fehl:

```
can't access property "digest", window.crypto.subtle is undefined
```

**Fix:** SHA-256 via `js-sha256` (pure JS, ohne secure context), mit
identischem Ergebnis wie die Server-Prüfung
(`sha256(session_key + session_id)` → base64):

```ts
import { sha256 } from "js-sha256";

async function generateSessionSignature(sessionKey: string, session_id: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(sessionKey + session_id);
  const hash = sha256.arrayBuffer(data);
  return await arrayBufferToBase64_viaBlob(hash);
}
```

---

## 4. Öffentliche (anonyme) Lesezugriffe via ANON-Rolle

**Dateien:**
- `packages/mws/src/new-managers/sessions.ts`
- `packages/mws/src/new-commands/init-store.ts`
- `packages/mws/src/new-managers/TabUpserts.ts`

**Problem:** MWS hat rein rollenbasierte ACLs. Wer nicht eingeloggt ist,
bekam hart `roles: []` zugewiesen (`sessions.ts`, `username: "(anon)"`)
— ein öffentlich lesbares Wiki war damit unmöglich. Zwar kommentiert der
AuthUser-Typ: „User role_ids may have length even if the user isn't
logged in, to allow ACL for anon", aber umgesetzt war das nie (im
Git-Verlauf gab es nie eine Rolle `ANON`; das frühere
„Allow anonymous reads/writes"-Flag stammt aus der alten TW5-Multi-Wiki
Version und ist längst auskommentiert).

**Fix:** Einführung einer statischen Rolle `ANON`, die jeder anonyme
User automatisch erhält:

1. `sessions.ts`: `static AnonRoleName = "ANON"`; die

   `roleLookup`-Query lädt die Rollen `ADMIN`, `USER`, `ANON`; der
   Anon-Fallback bekommt `roles: [{ role_id, role_name: "ANON" }]`
   (defensiv nur, falls die Rolle existiert).

2. `init-store.ts`: legt neben `ADMIN`/`USER` jetzt zusätzlich die Rolle
   `ANON` an (`description: "Anonymous users (not logged in)"`). Um
   bestehende Datenbanken (in denen bereits ein Admin-User existiert)
   mit `npm start init-store` nachrüsten zu können, sind Rollen + Blank
   Template jetzt idempotent angelegt — nur die Anlegung des
   `admin`-Users bleibt an die leere Users-Tabelle gekoppelt.

3. `TabUpserts.ts`: `ANON` ist — wie `ADMIN`/`USER` — eine geschützte
   statische Rolle (`CANNOT_WRITE_STATIC_ROWS`).

**Verwendung:** Analog zu anderen Rollen im Admin-UI bzw. direkt in der
DB. Beispiel: Rolle `ANON` auf Rezept *und* deren Bags mit `A_read`
vergeben → Wiki ist öffentlich lesbar (Schreiben bleibt gesperrt,
`canUserWrite: false`).

**Status:** Verifiziert gegen `mws-docs` (Rollback möglich, indem die
`ANON`-Einträge aus `recipe_permission`/`bag_permission` entfernt
werden).

---

## 5. Lese-Wikis: fehlerhafte „Speichern"-Banner für anonyme Nutzer

**Dateien:**
- `plugins/client/tiddlers/syncer/config-sync-filter.tid` (neu)
- `plugins/client/src/multiwikiclientadaptor.ts`
- `plugins/client/src/new-multiwikiclientadaptor.ts`

**Problem:** In einem öffentlichen (nur-lesbar) Wiki warf der Browser
beim Laden wiederholt
`Sync error while processing save task: ... 403 BAG_NO_WRITE_PERMISSION`
(„count: 3").

Ursache: Der TiddlyWeb-Standard-`$:/config/SyncFilter`
(`dev/wiki/tw5/5.4.1/core/wiki/config/SyncFilter.tid`) schließt zwar
`$:/status/`, `$:/state/`, `$:/temp/` usw. aus, aber **nicht** die
Story-Tiddler `$:/StoryList` und `$:/History`. Diese erzeugt bzw.
verändert der Browser beim Start lokal. Da sie kein `tiddlerInfo`
haben (bzw. `changeCount` gestiegen ist), gelten sie als „neu zu
speichern" → der Syncer schickt sie an den Server → 403 bei anonym.

Zusätzlich waren die Batch-Save-Pfade der beiden Sync-Adaptoren
(`saveTiddlers` → `rpcSaveRecipeTiddlerList` bzw. `PUT /batch/save`)
nicht abgesichert, obwohl die Einzel-Tiddler-Variante (`saveTiddler`)
längst `isReadOnly`/`$:/StoryList`/State-Tiddler ausfiltert.

**Fix:**
1. Neues Plugin-Tiddler `$:/config/SyncFilter`, das zusätzlich zum
   Core-Filter `[[$:/History]]` und `prefix[$:/StoryList]` ausschließt
   (bewusst nicht `[!is[system]]` — System-Tiddler wie `$:/SiteTitle`
   oder Paletten müssen weiter synchronisiert werden).
2. Beide `saveTiddlers`-Implementierungen filtern Tiddler, die auf dem
   Server nicht schreibbar sind (`isReadOnly`), die serverseitig
   verwaltete `$:/StoryList` und lokale State-Tiddler heraus. Diese
   werden lokal als „gespeichert" markiert (statt an den Server
   geschickt), damit der Syncer aufhört, sie zu wiederholen — ohne
   Fehler-Banner.

Der Client-Plugin-Cache (`dev/wiki/cache/mws/0.2.5/client/plugin.json`)
wird beim Serverstart automatisch regeneriert, wenn sich
`plugins/client` ändert (Hash-Vergleich) — ein `npm run build:client`
(`tsc`) + `pm2 restart MultiWikiServer-wikiwise` genügt. Anschließend im
Browser einmal hart neu laden (Strg+F5).

---

## 6. Rote Konsole-Nachricht: `XHR OPTIONS /wiki/<slug> → 405`

**Datei:** `packages/mws/src/new-managers/index.ts`

**Problem:** Beim Öffnen eines Wikis sendet der TW-Core-Saver
„PutSaver" einmalig ein `OPTIONS` an die aktuelle Wiki-URL, um zu testen,
ob der Server WebDAV-PUTs akzeptiert (Header `dav`, s.
`core/modules/savers/put.js`). MWS beantwortete `OPTIONS` auf
`/wiki/:slug` und `/tw5/:version` bewusst mit `405` → im Browser eine
rote (funktional harmlose) Netzwerkzeile.

**Fix:** `OPTIONS` antwortet jetzt mit leerem `200` und **ohne**
`dav`-Header. Der PutSaver bleibt dadurch deaktiviert (Status 2xx ist
nicht ausreichend, es muss zusätzlich der `dav`-Header gesetzt sein),
aber die Konsole bleibt sauber. Das Speichern läuft ohnehin über den
MultiWikiClient-Adaptor, nicht über den PutSaver.

---

## 7. Rote Konsole-Nachricht: `GET /wiki/favicon.ico → NS_BINDING_ABORTED`

**Datei:** `packages/mws/src/new-managers/index.ts`

**Problem:** Das gerenderte Wiki-HTML enthält `<link rel="shortcut icon"
href="favicon.ico">`. Da die Seite unter `/wiki/<slug>` (ohne
Trailing-Slash) liegt, löst der Browser `favicon.ico` relativ zu
`/wiki/favicon.ico` auf — und das traf die Rezept-Route `^/wiki/([^/]+)$`
mit `slug = "favicon.ico"` → 403. Firefox zeigt das als abgebrochenen
`favicon.ico`-Request (rote Konsole-Meldung). Der eigentliche Favicon
wird ohnehin später von TW Startup (`favicon.js`) als Data-URI aus
`$:/favicon.ico` gesetzt.

**Fix:** Dedizierte Route `^/wiki/favicon\.ico$` → **302 Redirect** auf
`/favicon.ico` (das der Server mit dem Default-Icon beantwortet, 200).
Die Rezept-Route wird nie mehr mit `favicon.ico` als Slug konfrontiert.

---

## 8. Login direkt im Wiki (`tc-password-wrapper` → beschreibbar, ohne `/login`)

**Ziel:** Der eingebaute TW-Login-Dialog („Login to TiddlySpace",
`tc-password-wrapper`) soll den Nutzer wirklich einloggen — ohne den
Umweg über die Admin-Seite `https://…/login`. Nach dem Login wird die
Wiki beschreibbar, wenn die Rolle des Nutzers Schreibrechte auf dem
Rezept hat (ADMIN/USER ja, ANON nur lesen).

**Dateien:**
- `plugins/client/build/build-opaque.mjs` — bündelt `@serenity-kit/opaque`
  (OPAQUE/PAKE-Login, WASM) per esbuild in einen Plugin-Tiddler
  `tiddlers/library/opaque.js` (`build:opaque`-Script, der beim
  `build:client` mitläuft).
- `plugins/client/src/new-multiwikiclientadaptor.ts` — neue Methoden
  `login(username, password, cb)` und `logout(cb)`: rufen `/login/1`,
  `/login/2` bzw. `/logout` auf, `startLoginRequest`/`finishLoginRequest`
  via OPAQUE-Client. Der Server setzt dabei die Session-Cookie
  (`path: "/"`), sodass alle folgenden Wiki-Requests (gleiche Origin)
  automatisch authentifiziert sind. Danach meldet `getStatus` die Wiki
  als beschreibbar.
- `packages/mws/src/new-managers/sessions.ts` — `login1`/`login2`
  erlauben jetzt zusätzlich Referer aus `/wiki` (vorher nur `/login` und
  `/profile`), damit der Login-Dialog aus der Wiki heraus funktioniert.

**Ablauf im Browser:** Login-Button/Klick lösen `tm-login` aus → der
TW-Syncer zeigt den Passwort-Dialog → Submit ruft `adaptor.login()` →
PAKE-11-Login gegen den Server → Session-Cookie gesetzt → `getStatus`
zeigt `isLoggedIn`/`canUserWrite` → Wiki beschreibbar.

**Hinweis:** Das Plugin-Bundle wird beim Serverstart aus dem
Plugin-Ordner neu aufgebaut (Cache `dev/wiki/cache/mws/…`); nach
Änderungen am Adaptor also `npm run build:client` + Neustart.

**Dialog-Text** (`Login to TiddlySpace` → „Log in to this wiki" /
`Login bei TiddlySpace` → „In dieses Wiki einloggen"): Der Wert kommt aus
`Syncer.prototype.getLoginServiceName()` in
`plugins/client/tiddlers/syncer/syncer.js` und richtet sich nach der
aktivierten Wiki-Sprache (`$:/language`). Unterstützte Codes (vollständiger
Code wir, sonst primärer Sprachcode; Unterstriche werden auf Bindestriche
normalisiert, `zh_CN` = `zh-cn`): `de` „In dieses Wiki einloggen", `en` „Log
in to this wiki", `es` „Iniciar sesión en este wiki", `fr` „Se connecter à ce
wiki", `ja` „このWikiにログイン", `ko` „이 위키에 로그인", `ru` „Войти в эту
вики", `zh-cn` „登录此 Wiki". Nicht gelistete Sprachen fallen auf Englisch
zurück. Weitere Sprachen einfach als Eintrag in `languageMap` ergänzen
(Key = Sprachcode, z. B. `"pl": "…"`). Ein Wiki kann den Text individuell
überschreiben mit dem Tiddler `$:/config/mws/LoginServiceName` (zieht vor
jeder Sprachlogik).

---

## 9. Type check: `npm run tsc2` meldete fehlenden `react`-Import

**Datei:** `packages/jsx-lit/src/JSXElement.tsx`

**Problem:** `npm run tsc2` (`tsc -p tsconfig.json --noEmit`, Type-Check
über die ganze Repo) meldete genau einen Fehler:

```
error TS2307: Cannot find module 'react'
```

Ursache war der reine Typ-Import `import type { Dispatch, SetStateAction }
from 'react'` in `JSXElement.tsx`. `react` (bzw. `@types/react`) ist im
Repo aber nirgends installiert und in keinem `package.json` gelistet —
nicht einmal als Dependency/DevDependency. Verifiziert per `git stash`,
dass der Fehler unabhängig von den inhaltlichen Änderungen auftrat.

**Fix:** Benötigt werden nur zwei triviale Typen → **lokal** definiert
statt `react`-Import (keine neue Dependency, keine Runtime-Änderung):

```ts
type Dispatch<T> = (value: T) => void;                    // wie React: (value: A) => void
type SetStateAction<T> = T | ((prev: T) => T);            // wie React: S | ((prevState: S) => S)
```

**Ergebnis:** `npm run tsc2` meldet 0 Fehler. Das Admin-Bundle
(`admin-vanilla`, nutzt `jsx-lit` via esbuild) baut unverändert sauber
(`/main.js` → 200). Es gibt keinen Build-/Restart-Hinweis; `react` bleibt
bewusst nicht installiert.

---

## 10. Feature „Neues Wiki per Knopfdruck" (`PUT /admin/wiki`)

Ein neues Wiki wird serverseitig atomar angelegt — nur ein Anzeigename
ist nötig. Der Slug leitet sich aus dem Benutzernamen des eingeloggten
Admins ab (`wiki-<benutzername>`, bei Kollision `-2`, `-3`, … erhöht).

**Backend** (`packages/mws/src/new-managers/TabDataAdapter.ts`, Route
`AdminCreateWiki`; registriert in `new-managers/index.ts` `ApiRoutes` +
`ClientRoutes`):

- eine `$transaction` erzeugt:
  - **Bag** `editions/<owner-id>/<slug>` (owner-namespaced, siehe C1;
    System-Wikis ohne Owner: `editions/<slug>`), Perms:
    `ADMIN → C_admin`, `USER → A_read`, `ANON → A_read`
  - **Recipe** (Slug `<slug>`, Template „Blank Template"), Perms:
    `ADMIN → B_write`, `USER → A_read`, `ANON → A_read`; einziges
    `writablePrefixBags`-Reading: `{prefix: "", bagName}`
  - **Start-Tiddler**: `$:/SiteTitle` (= Anzeigename), `$:/DefaultTiddlers`
    und Willkommen-Tiddler (Felder `created`/`modified` im
    `YYYYMMDDHHmmssmmm`-Format, `creator`/`modifier` = Benutzername)
- Response: `{slug, displayName, bagName, templateName, lastCompiledAt}`
- allein der Anzeigename wird validiert (`min 1` / `max 120`); Referer-
  und `X-Requested-With`-Check wie bei `AdminSave`; für Nicht-Admins
  greift der übliche `C_admin`/`B_write`-Zugriffsschutz.
- **Rechtevoraussetzung:** Das Anlegen von Bags/Recipes ist laut
  `TabUpserts.ts` (`checkExisting`) grundsätzlich an die `ADMIN`-Rolle
  gebunden (`isAdmin` = Rolle `ADMIN`). Ein normaler `USER` erhält daher
  beim Absenden `403 ACCESS_DENIED "You don't have permission to create
  bags."`. Weil die Wiki-Rechte ebenfalls rollenbasiert vergeben werden
  (`ADMIN → B_write`, `USER → A_read`), muss der Ersteller in der
  `ADMIN`-Rolle sein — dann kann er sein Wiki auch schreiben. Nutzer
  „Heino" hat die Rolle per regulärem `PUT /admin/save/users` erhalten
  (`userRoles: ["USER", "ADMIN"]`).

**Frontend** (`packages/admin-vanilla/src/app.tsx`):

- Button **„Neues Wiki"** (nur im Tab *Wikis*, neben „Create wiki")
  öffnet einen Dialog mit einem Eingabefeld, vorbelegt mit
  `<benutzername>s Wiki`
- Anlegen per `PUT pathPrefix + "/admin/wiki"` (Header
  `X-Requested-With: TiddlyWiki`); nach Erfolg wird der
  `InMemoryAdminStorage` neu geladen und ein Link auf
  `/wiki/<slug>` angezeigt.

**Verifikation** (per Test-Admin-Session gegen `127.0.0.1:5000`):

- Slug-Basis + Kollision (`wiki-admin` → `wiki-admin-2`) ✓
- anonymes `GET /wiki/<slug>` → 200 mit korrektem `<title>` (erstes
  Wort: Anzeigename aus dem echten `$:/SiteTitle`) ✓
- Permissions in der DB für Bag und Recipe korrekt ✓ (siehe oben)
- **als Nicht-Admin-User** (`Heino`, nach Rollenvergabe): One-Click
  `PUT /admin/wiki` → 200 (`wiki-heino`); anonymes `GET /wiki/wiki-heino`
  → 200 mit `<title>Heinos Wiki`; Heino kann schreiben
  (`PUT /recipe/wiki-heino/batch/save` → 200, `canWrite: true`) ✓
- `/main.js` liefert den neuen UI-Code (Markers `Neues Wiki`,
  `startNewWiki`, `/admin/wiki`) ✓

---

## 11. Feature „Wiki löschen" (`PUT /admin/wiki/delete`)

Zum One-Click-Anlegen gehört auch das Löschen. Serverseitig wird das
Wiki (Recipe) atomar entfernt; Bags, die **nur** dieses Wiki referenzierte,
werden samt Inhalt mit gelöscht (Kaskaden über FK, `RecipeBag.bag` ist
`onDelete: Restrict` → pro Bag wird geprüft, ob andere Recipes es noch
referenzieren, erst dann löschen). Shared Bags bleiben erhalten.

**Backend** (`TabDataAdapter.ts`, `AdminDeleteWiki`; registriert in
`new-managers/index.ts`): `PUT /admin/wiki/delete`, Body `{slug}`;
Admin-Rolle erforderlich (sonst `403 ACCESS_DENIED`), unbekannter Slug →
`404 RECIPE_NOT_FOUND`. Response `{slug, deleted: true}`.

**Frontend** (`admin-vanilla/app.tsx`): Im Bearbeiten-Dialog eines Wikis
(Tab *Wikis*, Modus „edit") erscheint links ein roter Button
**„Delete wiki"** neben Cancel/Save. Er fragt per `confirm()` nach,
ruft dann den Endpoint auf, lädt nach Erfolg die Liste neu
(`PerTabStore.reloadItems`) und schließt den Dialog. Fehler werden im
Dialog als rote Meldung angezeigt.

**Ownership-Schutz (Ersteller + admin-Konto):** Um zu verhindern, dass
ein Admin-User fremde Wikis löscht **oder bearbeitet**, trägt jedes neu
angelegte Wiki seinen Ersteller (`Recipe.owner_user_id`, gesetzt beim
Create in `AdminCreateWiki` und in `RecipeDataAdapter.saveRow`;
Bearbeitungen überschreiben den Owner **nicht**). **Speichern**
(`PUT /admin/save/wikis`) und **Löschen** (`PUT /admin/wiki/delete`)
darf nur `recipe.owner_user_id === user.user_id` **oder** das
Bootstrap-Konto `admin` (Super-Admin). Legacy-Wikis ohne Owner
(z. B. `mws-docs`) sind nur über das `admin`-Konto bearbeitbar/löschbar.
Der Owner-Check in `checkExisting` (`TabUpserts.ts`) zählt den Ersteller
dabei unabhängig von Rollen: Wer das Wiki/Bag besitzt, darf es auch
speichern, selbst wenn die Editor-Liste nur eine Rolle enthält, die der
Owner nicht hält (z. B. `ADMIN` bei geseedeten Wikis). Templates bleiben
beim strengen Rollenmodell (`templateAdmins`).
Der rote Button wird im Frontend nur angezeigt, wenn der eingeloggte
User Ersteller ist oder `admin` heißt. Im Wikis-Tab gibt es zusätzlich
die Spalte **„Created by"** (Server-Feld `ownerUsername`).

**Verifikation** (Test-Admin-Session + Heino-Session):

- Admin: Wiki anlegen → löschen → 200; `GET /wiki/…` danach 404 ✓
- Heino: eigenes Wiki anlegen → löschen → 200 ✓
- Heino: Löschversuch auf `mws-docs` → `403 ACCESS_DENIED`, Wiki bleibt ✓
- Heino: Speichern von `wiki-admin` (Owner `admin`) → `403 ACCESS_DENIED`, Definition in DB unverändert ✓
- Heino: Speichern von `mws-docs` (ownerless) → `403 ACCESS_DENIED` ✓
- Heino: Speichern des eigenen Wikis → 200 ✓
- Admin: `wiki-admin` speichern → 200 (Super-Admin) ✓
- Admin: löscht Heinos Wiki → 200 (Super-Admin) ✓
- `getList`/`/admin/load` liefert `ownerUsername` (Ersteller-Username) ✓
- unbekannter Slug → `404 RECIPE_NOT_FOUND {recipeName}` ✓
- Bestandswikis (`mws-docs`) unverändert 200 ✓

**Gleicher Schutz für Bags:** Auch die Bags tragen jetzt einen Ersteller
(`Bag.owner_user_id`, gesetzt in `AdminCreateWiki` und in
`BagDataAdapter.saveRow` beim Anlegen; Bearbeitungen überschreiben ihn
nicht). Im Admin-UI-Tab *Bags* darf einen Bag nur bearbeiten, wer ihn
erstellt hat oder das `admin`-Konto ist (`PUT /admin/save/bags` →
sonst `403 ACCESS_DENIED`); das Anlegen neuer Bags ist weiterhin jedem
Admin erlaubt (Anleger wird Owner). Spalte **„Created by"** im Bags-Tab
(Server-Feld `ownerUsername`).

**Verifikation Bags** (Heino-Session + admin-Session):

- Heino: `PUT /admin/save/bags` auf ownerlosen `editions/mws-docs` → 403, Beschreibung unverändert ✓
- Heino: eigenes Bag `editions/wiki-heino` bearbeiten → 200, Owner bleibt Heino ✓
- Heino: neues Bag anlegen → 200, `owner_user_id` = Heino ✓
- admin: darf Heinos Bag bearbeiten → 200 (Super-Admin) ✓
- `/admin/load` liefert `ownerUsername` für alle Bags ✓

**Gleicher Schutz für Templates, Rollen und User:** Wie Wikis und Bags
tragen auch Templates, Rollen und User-Accounts einen Ersteller
(`owner_user_id`; gesetzt beim Anlegen, Bearbeitungen überschreiben ihn
nicht). Überall gilt: Bearbeiten darf nur der Ersteller oder das
`admin`-Konto (`403 ACCESS_DENIED` sonst); System-/ownerlose Rows (z. B.
`Blank Template`, `ADMIN`/`USER`/`ANON`) sind nur über `admin` editierbar.
Neue User-Accounts sind **Ersteller-owned** (Anleger = Einladender ist
der Owner, siehe §12); die Eigen-Pflege des eigenen Kontos bleibt
möglich. Alle vier Tabs haben die Spalte **„Created by"**
(Server-Feld `ownerUsername`).

**Zusätzlich geschlossenes Security-Hole:** `PUT /admin/save/users`
verlangt jetzt zwingend die ADMIN-Rolle — vorher konnte sich ein
Nicht-Admin-User über die API selbst die ADMIN-Rolle geben
(Self-Promotion ohne UI-Zugang).

**Verifikation (Heino-Session + admin-Session):**

- Heino: `Blank Template` ändern → 403 ✓; eigenes Template anlegen/ändern → 200 (Owner Heino) ✓
- Heino: `ADMIN`-Rolle schreiben → 403/400 ✓; eigene Rolle anlegen/ändern → 200 ✓
- Heino: `admin`-Konto ändern → 403, E-Mail unverändert ✓; eigenes Konto → 200 ✓
- Heino: neuen User anlegen → 200, Owner = Heino (siehe §12) ✓
- Nicht-Admin: eigene Rolle per API zu ADMIN hochstufen → 403 ✓
- admin: darf alle Templates/Rollen/User ändern → 200 ✓
- `/admin/load` liefert `ownerUsername` für Templates, Rollen, User ✓

---

## 12. Nutzer-Verwaltung: Einladung, eigenes Passwort, Löschen

**Owner-Semantik („Einladender"):** Da sich User nicht selbst
registrieren, sondern von anderen angelegt werden, ist der **Anleger**
der Owner des Kontos (`Users.owner_user_id` = Ersteller, nicht
self-owned). Beispiel: Heino legt `Testuser` an → Spalte
**„Created by: Heino"**; Heino darf `Testuser` bearbeiten **und
löschen** (sein „Unter-User"). Der `admin`-Account darf jeden User
bearbeiten/löschen — außer **sich selbst** (`admin` ist nie löschbar,
Schutz gegen Lockout). Der angelegte User selbst darf über die
Admin-Oberfläche nur mit ADMIN-Rolle agieren; seine Eigen-Pflege läuft
über das Profil/Passwort-System (`/login/*`), nicht über den
Users-Tab.

**Direkt-Passwort (statt E-Mail):** Da keine E-Mails versendet werden,
haben die Felder **„New password"** und **„Confirm password"** im
Users-Dialog jetzt ein Client-seitiges Passwort-Matching
(`enter-password`/`confirm-password`-Renderer, Helper-Text „Passwords
do not match yet."). Der Server hasht das Klartext-Passwort serverseitig
via `PasswordService.PasswordCreation` (OPAQUE-aPAKE-Registrierungs-
Record) und speichert nur den Hash; es wird **nie** im Klartext
gespeichert und `password` kommt nie im Response zurück (`password: ""`).
Leer lassen = Passwort bleibt unverändert; bei neuen Accounts ohne
Passwort funktioniert weiterhin der Reset-Code-Flow.

**Löschen (`PUT /admin/user/delete`):**

- Body `{username}`; ADMIN-Rolle erforderlich (sonst 403).
- Berechtigung: Ersteller (Owner) des Kontos, das `admin`-Konto, oder
  der User selbst dürfen löschen. `admin` selbst ist **unlöschbar**.
- Kaskade: Rollenverknüpfungen (`_RolesToUsers`) und Sessions werden
  entfernt; **Wikis/Bags/Templates/Rollen des Users bleiben erhalten**
  (werden ownerlos → verwalten darf sie danach nur noch `admin`).
- Frontend: roter **„Delete user"**-Button im Bearbeiten-Dialog des
  Users-Tabs (nur sichtbar für Owner/Ersteller, `admin`, und nie für
  den `admin`-Account selbst).

**Verifikation (Heino-Session + admin-Session):**

- Heino legt User an → 200, `owner_user_id` = Heino, Passwort-Hash
  gespeichert ✓
- Heino bearbeitet eingeladenen User (leeres Passwort = unverändert) → 200 ✓
- Heino löscht eigenen Unter-User → 200; Rollenlinks + Sessions weg ✓
- Heino löscht `admin` → 403; `admin` löscht sich selbst → 403 ✓
- Heino löscht fremden (admin-angelegten) User → 403; `admin` löscht ihn → 200 ✓
- Nicht-Admin: Self-Edit/Self-Delete via Users-Tab → 403 (Hole bleibt zu) ✓
- `/admin/user/delete` zeigt `ownerUsername` korrekt (Heino→Heino,
  Testuser→Heino, admin→admin) ✓

---

## 13. Feature „Wiki umbenennen" (Slug, Display name, Bags)

Ein Wiki lässt sich im Verwalten-Tab (Wikis) nachträglich umbenennen —
getrennt in **Slug** (URL-Pfad) und **Display name** (Anzeigetitel).
Beide greifen serverseitig beim Speichern (`PUT /admin/save/wikis`) und
halten die abhängigen Daten konsistent mit.

**Slug-Änderung (URL des Wikis):**

- Der Slug ist der URL-Pfad-Anteil (`/wiki/<slug>`). Wird er geändert,
  wird die Recipe-Definition auf den neuen Slug umgeschrieben
  (`checkExisting` → `rename`).
- Das **Standard-Bag** `editions/<owner-id>/<alter-slug>` wird automatisch
  auf `editions/<owner-id>/<neuer-slug>` mit umbenannt
  (`followDefaultBagOnSlugRename` in `TabDataAdapter.ts`) — **Tiddler,
  Berechtigungen und RecipeBag-Verknüpfungen bleiben dabei über die
  unveränderte `bag_id` erhalten** (kein Datenverlust, keine „frisch
  angelegte" leere Bag).
- Sicherheits-Guards vor dem Umbenennen des Bags:
  - nur wenn die Bag exakt der `editions/<owner-id>/<slug>`-Konvention folgt
    (Custom-Bag-Namen werden nie angetastet);
  - nur wenn der Ziel-Bag-Name **nicht schon existiert** (sonst wird
    falls möglich der vorhandene verwendet);
  - nur wenn **kein anderes Wiki** die Bag noch referenziert
    (geteilte Bags werden nie umbenannt).
- Der Client zieht das Write-Target (`editions/<owner-id>/<slug>`) beim
  Slug-Edit automatisch mit (`syncDefaultBagOnSlugChange` in `renders.tsx`).

**Display name ändern (Anzeigetitel):**

- Ändert nur den Anzeigenamen, nicht die URL.
- Der wiki-interne Titel `$:/SiteTitle` und der Starter-Teaser
  **„Willkommen"** im Standard-Bag werden auf den neuen Anzeigenamen
  nachgezogen (`mirrorDisplayNameIntoStarterTiddlers`).
- Der Abgleich läuft bei **jedem** Save eines bestehenden Wikis — damit
  werden auch Tiddler geheilt, die von Umbenennungen **vor** Einführung
  des Syncs auf einem alten Namen stehen geblieben sind.
- Konservative Erkennung: Der „Willkommen"-Teaser wird nur neu
  geschrieben, wenn er noch wie der unveränderte Starter aussieht
  (Überschrift `# Willkommen in „…"` + Satz „per Knopfdruck");
  **selbstgeschriebene/angepasste Teaser bleiben unberührt**.

**Verifikation (Heino-Session):**

- Beide Umbenennungen in einem Save (Slug + Display name) → 200, Bag
  mitbenannt, Tiddler behalten ✓
- Edit nach vorherigem Save mit weiterem Display name → 200,
  `$:/SiteTitle` + „Willkommen" ziehen nach ✓
- Angepasstes `$:/SiteTitle` / „Willkommen" wird nicht überschrieben ✓
- Custom-Bag-Namen werden nicht umbenannt; geteilte Bags invalide ✓

---

## 14. Admin-App mehrsprachig: 8 Sprachen (`i18n`)

**Dateien:**
- `packages/admin-vanilla/src/i18n.ts` (neu)
- `packages/admin-vanilla/src/locales/en.ts` … `zh-cn.ts` (neu; en, de, es,
  fr, ja, ko, ru, zh-cn)
- `packages/admin-vanilla/src/app.tsx` (alle sichtbaren Strings via `t()`)

**Konzept:** Keys sind englische Strings (en.ts = Source-of-Truth); die
übrigen Übersetzungen stehen in je einer Datei pro Sprache. `t(key, params?)`
unterstützt `{name}`-Interpolation und fällt auf den Key selbst zurück, wenn
eine Übersetzung fehlt. Aktuell **472 Keys** in allen 8 Sprachen, 1:1
konsistent (per Checks verifiziert: gleiche Key-Menge, gleiche
Platzhalter). Plural-Varianten nutzen `Intl.PluralRules`: en/de/es/fr/ru
liefern für `#one` u. a. eine eigene Form; ja/ko/zh verwenden die Basisform.

**Umschalter:** `<select>` mit den Optionen `🇺🇸 English`, `🇩🇪 Deutsch`,
`🇪🇸 Español`, `🇫🇷 Français`, `🇯🇵 日本語`, `🇰🇷 한국어`, `🇷🇺 Русский`,
`🇨🇳 中文` in der Kopfzeile (Labels aus `localeLabels` in `i18n.ts`). Die
Auswahl wird in `localStorage` (`"mws.admin.locale"`) gespeichert und wirkt
sofort über `setCurrentLocale()` + `location.reload()`; ohne eigenen Eintrag
gilt die installationsweite Standard-Sprache (siehe §47), sonst die
Browser-Sprache (`navigator.language`) (`normalizeLocaleCode` mappt
`de`/`es`/`fr`/`ja`/`ko`/`ru`/`zh` auf die passende Sprache, alles andere auf
`en`).

**Detailfixes in diesem Zuge:**
- `description`/`headerDescription`/`footerDescription` werden jetzt
  tatsächlich durch `t()` gerendert (waren roh ohne Übersetzung).
- Temperaturanzeigen-Feld `title` wird als String erzwungen.
- Locale-`<select>` nutzt `ref` statt `value` (webjsx-`SimpleAttrs`).

---

## 15. Rollen löschen + Schutz der System-Rollen

**Backend** (`packages/mws/src/new-managers/TabDataAdapter.ts`, Route
`AdminDeleteRole`; registriert in `new-managers/index.ts`):
`PUT /admin/role/delete`, Body `{name}`.

- Berechtigt: Ersteller (Owner) der Rolle oder das `admin`-Konto.
- **System-Rollen `ADMIN`/`USER`/`ANON` sind unlöschbar** → `403`
  (`"The system role '<name>' cannot be deleted."`).
- Löscht die Rolle sowie zugehörige `recipe_permission`/
  `template_permission`/`bag_permission`-((`role_id`))-Zeilen
  (in der DB gibt es keine FK-Kaskade); User-Mitgliedschaften fallen
  über die `_RolesToUsers`-Kaskade weg.

**Frontend** (`app.tsx`): roter **„Delete role"**-Button im
Bearbeiten-Dialog des Rollen-Tabs (mit `confirm()`-Abfrage). Die
Berechtigungsprüfung (`canDeleteRole`) blendet ihn zusätzlich aus, wenn
der Rollenname einem System-Rollennamen (`roleNameIsReserved`)
entspricht. Das Anlegen von Rollen zeigt der Create-Button außerdem nur
dem eingeloggten `admin`-Konto (Server blockt Nicht-Admins ohnehin
längst in `TabUpserts.ts` — sonst könnte ein Nutzer sich per
Selbst-Zuweisung Privilegien geben).

---

## 16. Wiki-Kurzname (Slug): Live-Validierung + Verfügbarkeits-Check

**Ziel:** Beim Tippen im Slug-Feld (Wiki-Tab, anlegen/bearbeiten) wird
sofort angezeigt, ob der Kurzname das erlaubte Format hat und noch frei
ist — der Slug ist eine wichtige URL-Komponente.

**Format:** Nur Kleinbuchstaben, Zahlen und Bindestriche —
`^[a-z0-9]+(-[a-z0-9]+)*$` (also `mein-wiki`, **nie** `mein wiki`).
Der Wert wird absichtlich **nicht** getrimmt, damit abschließende
Leerzeichen auch im Client als ungültig erscheinen.

**Client** (`packages/admin-vanilla/src/definition/renders.tsx`,
`renderSlugLiveValidation`):
- leer → Hinweis auf das Format;
- ungültiges Format → rote Warnung;
- gültig + **bereits vergeben** → rot „This name is already taken." /
  „Dieser Name ist bereits vergeben." (gegen `itemsByTab.wikis`);
- gültig + frei → grün „This name is available." / „Dieser Name ist
  verfügbar."

Beim Bearbeiten ist der eigene aktuelle Slug von der Vergabe-Prüfung
ausgenommen („saved"-Vergleich). Neue i18n-Keys (en+de) und
CSS-Variable `--color-success` (light+dark) ergänzt.

**Server** (`packages/mws/src/new-managers/TabDataAdapter.ts`,
`RecipeDataAdapter.saveRow`): derselbe Regex prüft den Slug beim
Speichern — ungültige Formate werden mit klarer Meldung abgelehnt
(statt still speichern zu können). Eindeutigkeit sichert weiterhin
`checkExisting`.

**Dasselbe Verfügbarkeits-Signal für Bag-Namen:** Im Bags-Tab prüft
`renderBagNameLiveValidation` (`packages/admin-vanilla/src/definition/renders.tsx`)
live gegen `itemsByTab.bags`, ob der getippte Name schon vergeben ist —
gleiche grüne/rote Meldungen wie beim Slug (i18n-Keys werden
mitbenutzt). Beim Bearbeiten ist der eigene Name von der Prüfung
ausgenommen. Ein Format-Check entfällt bewusst: Bag-Namen sind freie
Bezeichner (Leerzeichen, Umlaute, Großschreibung erlaubt — 
wir testeten „Mein erstes Bag"), da sie nie in URLs auftauchen.
Eindeutigkeit erzwingt weiterhin der Server per `checkExisting`
(Fremde Bags → 403 „Only the user who created the bag …").

**Genauso für den Benutzername im Benutzer-Tab:**
`renderUsernameLiveValidation` gleicht live gegen `itemsByTab.users`
(Key `username`, bei Eindeutigkeit serverseitig `checkExisting` +
`username @unique`). Eigener Name ist beim Bearbeiten ausgenommen.

Die Live-Validierung läuft nur in den echten Admin-Editoren
(`liveValidation: true` in `createModalState`) — die
Login-/Profilformulare (`FomController`, `liveValidation: false`) zeigen
beim Tippen im Benutzernamen-Feld bewusst **keine**
Verfügbarkeits-Meldung.

---

## 17. Wiki-Erstellung als Dropdown (statt zweier Buttons)

**Vorher:** Zwei separate Buttons im Wiki-Tab: primärer „Neues Wiki"
(1-Klick) + Ghost-Button „Wiki anlegen" (volles Formular).

**Jetzt:** Ein Dropdown **„Ein Wiki erstellen"** (primärer Button,
`<details>`/`<summary>` wie das bestehende Account-Menü) mit zwei
Menüpunkten:
- **„1-Klick Wiki erstellen"** → Schnell-Anlegen (`startNewWiki`, vorher
  „Neues Wiki");
- **„Definiertes Wiki erstellen"** → volles Formular (`openCreate`,
  vorher „Wiki anlegen").

Der Ghost-Button rechts wurde entfernt; für die anderen Tabs
(Templates/Bags/Roles/Users) bleibt er unverändert. Das Dropdown klappt
nach links auf und überschreitet nie die Fensterbreite
(`right: 0`, `max-width: calc(100vw - 96px)`, kein horizontaler
Scrollbalken).

---

## 18. Hell-/Dunkel-Modus mit Umschalter

**Dateien:**
- `packages/admin-vanilla/src/theme.ts` (neu)
- `packages/admin-vanilla/src/main.tsx` (frühe Theme-Initialisierung)
- `packages/admin-vanilla/src/app.tsx` (Toggle-Button in der Kopfzeile)
- `packages/admin-vanilla/src/app.inline.css`

**Verhalten:** Standard = System folgen (`prefers-color-scheme`, kein
`data-theme`-Attribut → die Media-Queries greifen live). Ein Klick auf
den Kreis-Button (Sonne/Mond-Icon) neben dem Sprach-Umschalter fängt
die Wahl als `data-theme="light"|"dark"` auf `<html>` ein und speichert
sie in `localStorage` (`"mws.admin.theme"`). `initializeTheme()` in
main.tsx wendet eine gespeicherte Wahl **vor dem ersten Paint** an
(kein Flackern beim Laden).

**CSS:** Der Light-Block ist jetzt die Basis (`html { … }`); dunkel
greift über `@media (prefers-color-scheme: dark)` auf
`html:not([data-theme="light"])`, und am Datei-Ende erzwingt
`html[data-theme="dark"]` (Attribut-Selektor gewinnt per Spezifität)
explizit Dunkel. **Neue helle Grundierung:** `--color-surface-page-*`
wurden wärmer — Mid-Ton `#F3E6C5`, Top `#f7ecd2`, Bottom `#ecdab0`.

**Barrierefreiheit:** Button trägt `aria-label` + `title`
(„Switch to light/dark mode", DE/EN übersetzt).

---

## 19. Bug-Fix: Profile-Seite (`/profile`) zeigte keine Daten

**Problem:** Auf `https://…/profile` („User Profile") waren die Felder
**Username**, **Email** und **Roles** immer leer — im Formular stand
keine einzige Angabe.

**Ursache:** Das Profil-Formular wurde nie mit Serverdaten verdrahtet:
`ProfileForm.createDraft()` legte den Draft mit leeren Werten
(`username: ""`, `email: ""`, `roles: []`) an, und es gab nirgends eine
Stelle, die diese Felder aus den Serverdaten befüllte. Zudem enthielt
der eingebettete `userState` zwar `username` und `roles`, aber **kein**
`email` — die E-Mail konnte der Client also gar nicht kennen.

**Fix (zwei Stellen):**

1. **Server** (`packages/mws/src/new-managers/sessions.ts`): Das
   `AuthUser`-Interface und `parseIncomingRequest()` tragen jetzt auch
   die **`email`** (beim Session-Lookup mitgeladen; anon: `""`). Damit
   ist sie im `embeddedServerResponse` jeder Admin-Seite verfügbar.
2. **Client** (`packages/admin-vanilla/src/app-profile.tsx`):
   `createDraft()` liest die Profildaten jetzt direkt aus
   `embeddedServerResponse.userState`:
   - `username` = `userState.username`,
   - `email` = `userState.email`,
   - `roles` = `userState.roles` → nur noch die Rollennamen.

**Verifikation** (Test-Session von Nutzer `Heino` gegen Port 5000):

- `GET /profile` liefert `userState` mit `"email":"Heino@…
  das-buddhistische-haus.de"` und den Rollen des Users ✓
- UI zeigt Username, E-Mail und Rollen korrekt an ✓ (Nutzer-bestätigt)

---

## 20. Feature: Passwort-Generator für Passwort-Felder

**Wo?** Überall dort, wo ein **neues** Passwort festgelegt wird:

- **Users-Tab** (`Set password` / `Reset password`),
- **Profile-Seite** (`New password`),
- **Login-Reset-Flow** (`New password`).

Für reine Login- und „Aktuelles-Passwort"-Felder gibt es keinen Generator.

**Bedienung:** Unter dem Eingabefeld erscheinen ein Button **„🎲 Passwort
generieren"** und ein **Längen-Feld** (8–32, Standard 16; Eingaben außerhalb
8–32 werden direkt korrigiert). Rechts davon zeigt eine Anzeige laufend
die **Entropie** des gewählten Passworts („Entropie: 98.07 bit" bei
16 Zeichen) und ein **Farbbalken** die Passwortstärke (rot → gelb →
grün in 5 Stufen). Ein Klick erzeugt ein sicheres
Zufallspasswort, das

- in **Klartext in einer eigenen Zeile** angezeigt wird (mit
  `user-select: all` — per Klick markierbar, zum Kopieren/Abschreiben),
- automatisch ins Passwort-Feld **und** ins Bestätigungsfeld übernommen
  wird („Passwords match.").

**Zeichensatz „Sicher + einfach":** `A-Z a-z 0-9 !@#$%&*` mit garantierter
Mischung (mindestens je 1 Großbuchstabe, 1 Kleinbuchstabe, 1 Ziffer,
1 Sonderzeichen). Erzeugung ausschließlich über `crypto.getRandomValues`.

**Umsetzung:**

- `packages/admin-vanilla/src/password-generator.tsx` (neu): Custom
  Element `<mws-password-generator>` (🎲-Button) + `generatePassword()`
  (LOS/„rejection free"-Zufallsindex, Fisher-Yates-Shuffle) +
  Entropie-Anzeige (`Länge × log₂(70)`) + 5-stufiger Stärke-Farbbalken.
- `FieldDefinition` in `tabs.ts` hat ein neues optionales Feld
  `passwordGenerator?: string | true` (String = Key des Bestätigungsfelds,
  das mit gefüllt wird).
- `enter-password`-Renderer (`renders.tsx` `renderTextInputField`) hängt
  den Generator nur dann unter das Feld, wenn `passwordGenerator` gesetzt ist.
- Neue i18n-Keys `Generate password` (→ „Passwort generieren"),
  `Length` (→ „Länge"), `Entropy: {value} bit` (→ „Entropie:
  {value} bit") und `Password strength` (→ „Passwortstärke") —
  Parität jetzt **246/246**.
- `confirmPassword` / `confirmNewPassword` bleiben reine Client-Felder
  (Temp/Validierung); nur `password` / `newPassword` gehen an den Server
  und werden dort per OPAQUE gehasht — kein Klartext in der DB.

**Verifikation:**

- `npx tsc -p tsconfig.json --noEmit` ✓
- Generators **🎲-Button**, Entropie-Anzeige & Stärke-Balken mit der Länge
  stets up to date; Logik per Node-Smoke-Test: 18.000 Checks
  (Länge/Zeichensatz/Garantie-Mischung inkl. Clamping 8/32/Fallback) ✓
- Bundle (`main.js`) enthält Generator-Markup, `Passwort|Länge|-Texte`
  und `crypto.getRandomValues`-Logik ✓
- i18n-Parität en↔de: 246/246 ✓

---

## 21. Lehrer-Bereich: TEACHER-Rolle & `AuthUser.isTeacher`

**Datei:** `packages/mws/src/new-managers/sessions.ts`,
`packages/mws/src/new-commands/init-store.ts`

Ein Schulbetreiber (Direktor/`admin`) stellt Nutzer als Lehrer ein,
indem er ihnen die Systemrolle **`TEACHER`** zuweist (regulär über den
Users-Tab bzw. `PUT /admin/save/users`).

- `SessionManager.TeacherRoleName = "TEACHER"`; jede Session eines
  Nutzers mit dieser Rolle bekommt `AuthUser.isTeacher = true`.
- Ein Lehrer ist damit ein **delegierter User-Manager, kein Admin**:
  Er darf in seinem Users-Tab eigene (eingeladene) Schüler anlegen,
  bearbeiten und löschen, verwaltet aber **nicht** die Inhalte anderer
  Lehrer und überschreibt **nicht** die Content-ACLs. Es gibt bewusst
  **keinen** `isAdmin`-Bypass für Lehrer.
- `init-store.ts` legt die `TEACHER`-Rolle idempotent mit an
  (`description: "Teacher/team manager (delegated) – isTeacher"`).

**Verifikation:** User mit `TEACHER`-Rolle → `/admin/load` liefert
`isTeacher: true`; ohne die Rolle `false`. Lehrer sehen im Users-Tab
nur ihre eigenen Schüler + sich selbst (siehe §12/`getList`-Filter).

---

## 22. Content-Trennung: persönliche Rollen (benannt nach dem Benutzernamen)

**Datei:** `packages/mws/src/new-managers/TabDataAdapter.ts`
(`ensurePersonalRole`, aufgerufen in `AdminCreateWiki`)

**Warum nötig?** Die SET-Rolle `TEACHER` ist ein geteiltes
„Ding" — alle Lehrer teilen sie. Würde ein 1-Click-Wiki die `TEACHER`-Rolle
als Rezept-/Bag-Permission bekommen, könnten **alle** Lehrer alle
Lehrer-Wikis sehen (Datenleck). Deshalb bekommt jeder Lehrer eine
**eigene, private Rolle**:

- `ensurePersonalRole` legt/verknüpft genau eine Rolle an, benannt nach
  dem **Benutzernamen** (roh, z. B. `Frau Meyer`; Slugsuffix
  `-persoenlich` nur, wenn der Name mit einem reservierten
  Systemrollennamen kollidiert — `ADMIN`, `USER`, `ANON`, `TEACHER`,
  case-insensitive; belegt durch fremden Owner → Nummern-Suffix),
  Owner = der Benutzer selbst.
- Beim **1-Klick-Wiki** (`AdminCreateWiki`, `PUT /admin/wiki`) vergibt
  ein Lehrer **seine eigene** persönliche Rolle statt `ADMIN`:
  - Bag `editions/<owner-id>/<slug>` → `<Benutzername> → C_admin`
  - Recipe → `<Benutzername> → B_write`
  - **Keine** `USER`-/`ANON`-A_read mehr! Privat-Wikis eines Lehrers
    sind damit nur für ihn selbst lesbar — egal ob eingeloggt oder
    anonym. Öffentlich-Machen geschieht gezielt (§26).
  - Owner von Bag/Recipe bleibt der Lehrer (`owner_user_id`), sodass
    der bisherige Owner/`admin`-Schutz (§11) unverändert greift.
- Der Rollen-Guard (§23) verhindert, dass ein Lehrer sich diese Rolle
  selbst nimmt — es ist seine, er hat sie schon eigenständig via
  1-Click-Wiki.

**Verifikation** (Live-Test gegen lokale Instanz):

- frau-meyer erstellt `wiki-frau-meyer-2` → neue Rolle
  `Frau Meyer` (DB), Bag/Recipe mit `Frau Meyer`-
  Permissions; frau-meyer öffnet `/wiki/wiki-frau-meyer-2`: 200 ✓
- herr-schmidt öffnet dasselbe Wiki: **403**, und das Wiki taucht in
  seiner Admin-Wiki-Liste **nicht** auf ✓
- Schüler/anonym: 403 ✓

---

## 23. Rollen-Guard: Lehrer dürfen nicht alle Rollen vergeben

**Datei:** `packages/mws/src/new-managers/TabDataAdapter.ts`
(`UserDataAdapter.saveRow`)

Ein Lehrer kann über `PUT /admin/save/users` Rollen an seine Schüler
verteilen — aber nicht jede. Der Guard blockt:

1. **`ADMIN` und `TEACHER`** — ein Lehrer darf weder neue Admins noch
   neue Lehrer ernennen (sonst Selbsthochstufung-Sec-Hole, analog §11).
2. **Persönliche Rollen fremder Lehrer** — jede Rolle, deren Owner
   (`owner_user_id`) ein **anderer** Lehrer ist, darf nicht vergeben
   werden (das würde fremde Lehrer-Wikis an den Schüler leaken).
   Eigene Rolle (benannt nach dem eigenen Benutzernamen) ist erlaubt.

Technisch: Zuerst wird `normalizeLineList(data.userRoles)` gegen
`["ADMIN","TEACHER"]` geprüft; dann werden die gewählten Rollen je Owner
per `prisma.users.findMany` aufgelöst und die Owner, die selbst die
`TEACHER`-Rolle tragen (≠ aktueller User), als verboten markiert. Bei
Verstoß: `403 ACCESS_DENIED` mit klarem Grund.

**Verifikation** (herr-schmidt-Session):

- User mit `userRoles: ["USER", "Klasse 2"]` anlegen → 200 ✓
- User mit `userRoles` inkl. `Frau Meyer` → 403 ✓
- User mit `userRoles` inkl. `ADMIN`/`TEACHER` → 403 ✓

---

## 24. Admin-UI: fremde persönliche Rollen aus dem User-Dialog

**Dateien:**
- `packages/mws/src/new-managers/TabDataAdapter.ts`
  (`RoleDataAdapter.getList`/`saveRow` → neues Server-Feld
  `foreignTeacherRole`)
- `packages/admin-vanilla/src/definition/tabs.ts`
  (`RoleAdminRecord` + `roles`-Felddefinition, mode `"server"`)
- `packages/admin-vanilla/src/definition/renders.tsx`
  (`getLookupOptions`)

**Problem:** Der Server-Guard (§23) blockt fremde persönliche Rollen
zwar serverseitig (403 verifiziert), aber im Dropdown des Users-Dialogs
tauchten **alle** Rollen auf — inklusive `Frau Meyer` etc. Das
war verwirrend und ließ den Lehrer erkennen, dass der Kollege
`Frau Meyer` darüber überhaupt existiert (Leak der Existenz).

**Fix:** Der Server markiert pro Rolle, ob sie die persönliche Rolle
eines **anderen** Lehrers ist:

- `RoleDataAdapter.getList` berechnet `foreignTeacherRole` über
  `getTeacherOwnerIdSet` (ermittelt, welche Rollen-Owner selbst die
  `TEACHER`-Rolle tragen) und vergleicht mit dem aktuellen User.
- `tabs.ts`: neues Feld `foreignTeacherRole` (Typ `switch`,
  `mode: "server"`) auf dem Rollen-Record — erscheint nirgends im UI,
  da der Rollen-Tab keine Runtime-Feldgruppen hat, ist aber im
  Client-Datensatz verfügbar.
- `getLookupOptions`: **Nur** im Feld `userRoles` werden Rollen mit
  `foreignTeacherRole: true` für Nicht-Admins ausgeblendet.

**Wichtig:** Die Wiki-/Bag-/Template-Permissions-Dropdowns
(`recipeAdmins`, `recipeUsers`, `bagPermissions`, `templateAdmins`,
`templateUsers`) zeigen weiterhin **alle** Rollen — die Kooperation
(§25) braucht fremde persönliche Rollen dort, und der Server-Guard
sichert den Missbrauch.

**Verifikation** (`/admin/load`-Responses):

- Als herr-schmidt: `Frau Meyer` hat `foreignTeacherRole: true`,
  `Herr Schmidt` `false` ✓
- Als frau-meyer: umgekehrt genau richtig ✓
- Gebauter Client (`/main.js`) enthält
  `e.roles.filter(r=>r.foreignTeacherRole)` und wendet ihn nur bei
  `userRoles` an ✓

**Ergänzung — Sichtbarkeit in den Admin-Listen (`wikis`/`bags`):**

Die Listen-Filter von `RecipeDataAdapter.getList` und
`BagDataAdapter.getList` zählen nur noch **qualifizierte Rollen**
(`visibilityRoleIds`, Konstante `CORE_ROLE_NAMES =
["ADMIN","USER","ANON","TEACHER"]`): Wer ein Wiki/Bag nur über die
geteilten Systemrollen `USER`/`ANON`/`TEACHER` erreichen kann, sieht
es in der Admin-Ansicht **nicht**. Nur persönliche Lehrer-Rollen,
eingeladene Rollen und Klassen-Rollen erzeugen Sichtbarkeit.

**Verifikation** (Live-Test nach `2026-09-16`):

- frau-meyer (Rollen: `USER`, `TEACHER`, `Frau Meyer`) sieht in
  `wikis` **nur** `wiki-frau-meyer` + `wiki-frau-meyer-2` und in `bags`
  nur ihre eigenen (inkl. des für herr freigegebenen) — `wiki-heino`,
  `wiki-admin`, `wiki-admin-2` und die Demo-Wikis sind **nicht** mehr
  in der Liste ✓
- herr-schmidt (Rollen: `USER`, `TEACHER`, `Herr Schmidt`)
  sieht in `wikis` nur `wiki-herr-schmidt` und in `bags` sein eigenes
  plus das ihm freigegebene `Test-Bag-1-frau-meyer` ✓
- Admins behalten die ungefilterte Sicht (`isAdmin`-Zweig unverändert) ✓

Hinweis: Das betrifft nur die **Admin-Ansicht**. Der reale Lesezugriff
auf Alt-/Demo-Wikis mit `USER`/`ANON`-Permission via Wiki-URL bleibt
für eingeloggte User bestehen (bewusste Entscheidung, siehe §24).

---

## 25. Kooperation: Lehrer lädt Lehrer in sein Wiki ein

Weil die persönlichen Rollen transparent sind (§24, nur der
`userRoles`-Filter blendet sie aus), kann ein Lehrer seinen Kollegen
gezielt in ein gemeinsames Wiki holen:

1. herr-schmidt erstellt über den Wikis-Tab sein eigenes Wiki
   `wiki-herr-schmidt` → eigene Rolle `Herr Schmidt`.
2. frau-meyer speichert `wiki-frau-meyer-2` und trägt zusätzlich
   `Herr Schmidt` ein:
   - **Recipe-Admins** (`recipeAdmins`, Level `B_write`),
   - **Bag-Permissions** (`editions/wiki-frau-meyer-2`), Level `B_write`
     (Details ebenso über die Bag-/Template-Permission-Tabellen).

**Wirkung:** herr-schmidt sieht `wiki-frau-meyer-2` in seiner
Admin-Wiki-Liste und öffnet `/wiki/wiki-frau-meyer-2` mit 200 —
kann also mitlesen/-schreiben. Schüler und Anonyme: weiterhin 403.

**Verifikation** (Live-Test):

- herr öffnet fremdes, eingeladenes Wiki: 200 ✓
- Schüler/anonym auf demselben Wiki: 403 ✓
- umgekehrt öffnet schueler-a1 das Wiki von herr (`wiki-herr-schmidt`):
  403 ✓ (keine Querzugriffe)

---

## 26. Schüler-Freigabe: Klasse-Rollen geben Lesezugriff

Zusätzlich zur Kooperation lässt sich ein Lehrer-Wiki gezielt für die
**eigene Klasse** öffnen — ohne öffentlich zu werden:

1. Der Direktor/`admin` legt Klassen-Rollen an (z. B. `Klasse 1`,
   `Klasse 2`; Owner = `admin`).
2. Der Lehrer weist seine Schüler diesen Rollen zu (regulär über den
   Users-Tab, §23-Guard greift nur gegen fremde Lehrer-Rollen).
3. Im Wikis-Dialog trägt er die Klassen-Rolle bei **„Wer darf das Wiki
   lesen (A_read)"** (= `recipeUsers`) ein. Beim Speichern spiegelt
   `syncRecipePermissionsToBags` diese Freigabe automatisch auf die
   Bags des Wikis (§28). Ein manueller zweiter Schritt im Bags-Tab
   entfällt. (Bestehende Wikis heilen mit einem einfachen Re-Save.)

**Wirkung:** Eingeloggte Schüler der Klasse lesen das Wiki (200);
anonyme Besucher bleiben draußen (403), weil keine `ANON`-Permission
mehr existiert. Andere Klassen/Fremde: 403.

**Verifikation** (Live-Test, schueler-a1 mit Passwort `start123` von
frau-meyer gesetzt + `Klasse 1 → A_read` auf `wiki-frau-meyer-2`):

- schueler-a1 öffnet `wiki-frau-meyer-2`: 200 ✓
- anonym auf demselben Wiki: 403 ✓
- Kooperateur herr-schmidt: 200 ✓ (Rolle bleibt)
- schueler-a1 auf `wiki-herr-schmidt`: 403 ✓

---

## 27. Bug-Fix: `users.email` nullable (keine `""`-Kollision)

**Dateien:**
- `prisma/schema.prisma` (`Users.email String? @unique`)
- `prisma/migrations/20260916_email_nullable/migration.sql` (neu;
  RedefineTables-Rebuild der `users`-Tabelle, Daten/FKs erhalten,
  `email`-NOT-NULL entfernt)
- `packages/mws/src/new-managers/TabUpserts.ts`
  (`UserImportWriter.upsert`: leere E-Mail → `null`)
- `packages/mws/src/new-managers/TabDataAdapter.ts`
  (`saveRow`/`getList`: DB-`null` → `""` in der DataStore-Antwort)

**Problem:** `Users.email` war `String @unique` (NOT NULL). Ein User
ohne E-Mail wurde als `""` gespeichert. Der zweite User ohne E-Mail
kollidierte auf dem Unique-Index → `409`/UNIQUE-Fehler beim Anlegen.

**Fix:** Leere E-Mails werden jetzt **`NULL`** gespeichert; mehrere
`NULL`s sind im Unique-Index erlaubt. Die Zwei-Spalten-Migration
`20260916_email_nullable` baut die User-Tabelle Prisma-Stil neu auf und
wird vom Server beim Start automatisch angewendet
(`packages/mws/src/db/sqlite-adapter.ts`). Der Client sieht weiterhin
`""` (Zod erwartet `string`), der Rest des Codes bleibt unverändert.

**Verifikation** (Live-Test, herr-schmidt-Session):

- Zwei User **ohne** E-Mail nacheinander anlegen → beide 200 ✓
- In der DB als `email: null` gespeichert (nicht `""`) ✓
- Neue `users`-Tabelle: `email` nullable, `owner_user_id` bleibt
  nullable + erhalten ✓
- Test-User anschließend per `PUT /admin/user/delete` wieder entfernt ✓

---

## 28. Bug/Feature: Bags löschen (Owner + Admin)

**Dateien:**
- `packages/mws/src/new-managers/TabDataAdapter.ts` (neue Route
  `AdminDeleteBag`, `PUT /admin/bag/delete`)
- `packages/admin-vanilla/src/app.tsx` (`deleteBag`, Button „Delete bag"
  im Bags-Dialog), `locales/de.ts` + `locales/en.ts`
- `packages/mws/src/new-managers/index.ts` (Route registriert)

**Problem:** Der Bags-Tab hatte **kein** Löschen — weder Server-Endpoint
noch UI-Button. Ein Lehrer konnte sein selbst erstelltes Test-Bag nicht
mehr entfernen.

**Fix:** Neuer Endpoint `PUT /admin/bag/delete` mit Body `{name}`:

- **Berechtigung:** Nur der **Owner** (Bag-Owner == angemeldeter User;
  Lehrer dürfen nur ihre eigenen) oder der Site-Admin `admin`.
- **Schutz:** Bags, die von einem **Wiki-Rezept** referenziert werden
  (`recipeBag`), werden nicht gelöscht (Verhinderung eines
  Wiki-Kaputt-Machens) → 403 mit klarer Meldung.
- Löschen entfernt `bagPermission`- und `tiddlers`-Zeilen sowie den
  Bag selbst.

Im Client erscheint der Knopf **„Delete bag"** nur beim Bearbeiten
eines eigenen Bags (`canDeleteBag`, Owner-Vergleich über
`ownerUsername`), mit deutscher/englischer Bestätigung.

**Verifikation** (Live-Test, frau-meyer-Session `2026-09-16`):

- Eigenes freies Test-Bag löschen → 200 `{deleted:true}`, aus der DB
  und der Admin-Liste verschwunden ✓
- Fremdes Bag (`editions/wiki-heino`, Owner Heino) → 403 ✓
- Referenziertes eigenes Bag (`editions/wiki-frau-meyer-2`) → 403
  („used by a wiki recipe") ✓

---

## 29. Feature: Rezept-Freigaben automatisch auf die Bags

**Dateien:** `packages/mws/src/new-managers/TabDataAdapter.ts`
(`syncRecipePermissionsToBags`, aufgerufen in
`RecipeDataAdapter.saveRow`)

**Problem:** MWS prüft beim Öffnen eines Wikis Rezept **und** jeden Bag
(`RecipeResolver.assertRecipe`). Wenn ein Lehrer die Klassen-Rolle nur
in `recipeUsers` (Rezept-A_read) einträgt, fehlte die Bag-Freigabe →
schueler sah das Wiki in der Admin-Liste, bekam beim Öffnen aber
403 (`BAG_NO_READ_PERMISSION`). Dieselbe Lücke betraf auch
`B_write`-Kooperationen.

**Fix:** Beim Speichern eines Wikis erhalten alle Bags des Recipes
automatisch die Freigaben, die auf Rezept-Ebene vergeben sind:

- `A_read` am Rezept → `A_read` am Bag;
- `B_write` am Rezept → `B_write` am Bag;
- Bestehende höhere Rechte bleiben (Owner-`C_admin` wird nie
  herabgesetzt), der Sync ist ein reines Upsert („nur erhöhen").

Damit ist die Freigabe mit **einem** Eintrag vollständig
(Recipe + Bags konsistent). Bestehende Wikis, deren Bags noch fehlen,
heilen automatisch beim nächsten Speichern.

**Verifikation** (Live-Test `2026-09-16`, frau-meyer-Session):

- Vorher: `editions/wiki-frau-meyer` hatte nur
  `Frau Meyer → C_admin`; schueler-a1 (Rollen `Klasse 1`,
  `USER`) → `/wiki/wiki-frau-meyer` **403**.
- Re-Save des Wikis (recipeUsers `Klasse 1`) → Bag bekommt
  `Klasse 1 → A_read` (Owner `C_admin` bleibt) ✓
- schueler-a1 öffnet `/wiki/wiki-frau-meyer` → **200** ✓

---

## 30. Feature: Klarnamen statt „Recipe" im Admin-UI

**Dateien:** `packages/admin-vanilla/src/definition/tabs.ts`
(Feldgruppen-Titel), `packages/admin-vanilla/src/locales/en.ts` /
`locales/de.ts`

**Problem:** Intern heißen die Wiki-Berechtigungen „Recipe Users" /
„Recipe Admins" (deutsch „Rezept-User" / „Rezept-Admins"). Für Lehrer
waren die Begriffe verwirrend und technisch.

**Fix:** Die zwei Feldgruppen im Wiki-Einstellungen-Dialog heißen jetzt
**„Readers" / „Leser"** (Wer darf das Wiki öffnen — Lesezugriff) und
**„Editors" / „Bearbeiter"** (Wer darf Änderungen vornehmen). Die
Server-Feldnamen `recipeUsers`/`recipeAdmins` bleiben unverändert;
nur die Anzeige wurde umbenannt.

**Verifikation:** `npx tsc --noEmit` (admin-vanilla) grün; im gebauten
`public/admin-vanilla/main.js` sind die neuen Schlüssel ("Readers",
"Leser", "Bearbeiter" …) enthalten.

---

## 31. Feature: Verständliche, übersetzte Fehlermeldungen

**Dateien:** `packages/admin-vanilla/src/app.tsx`
(`formatStorageErrorForDisplay`, `renderErrorBanner`,
`STORAGE_ERROR_REASON_KEYS` …), `app.inline.css` (`.error-banner`),
`locales/en.ts` / `locales/de.ts`

**Problem:** Fehler aus dem Admin-API wurden roh angezeigt, z. B.
`{"status":403,"reason":"ACCESS_DENIED","details":{…}}`. Das ist für
Lehrer nicht lesbar und war nicht lokalisiert.

**Fix:**

- `formatStorageErrorForDisplay(storageError, t)` übersetzt jetzt
  bekannte Server-Gründe (`details.reason` / `reason`) über eine
  Mapping-Tabelle in i18n-Schlüssel (EN/DE). Variable Gründe (z. B.
  „The system role '…' cannot be deleted." oder verbotene
  Rollenzuweisungen) werden über Präfixe erkannt; unbekannte Codes
  erhalten einen generischen, lokalisierten Fallback plus `reason`-Code.
- Die Fehlerdarstellung (Delete-Fehler im Dialog, Speicher-Fehler im
  Modal-Footer, globaler `mainStorageError`, Neues-Wiki-Fehler) nutzt
  ein modernes `.error-banner` (Icon-Kreis in Danger-Farbe, abgerundete
  Fläche, optionaler Dismiss-Button) statt roher `<pre>`-JSON-Blöcke.

**Verifikation:** `npx tsc --noEmit` (admin-vanilla) grün; der
Server-Reason `"This bag is used by a wiki recipe and cannot be deleted
on its own."` kommt exakt aus `AdminDeleteBag`, der Mapping-Schlüssel
existiert im gebauten `public/admin-vanilla/main.js`; Anzeige im Client
nun: „Dieses Bag wird von einem Wiki verwendet und kann nicht gelöscht
werden."

---

## 32. Feature: Schüler-Wiki-Limit (Lehrer legt pro Schüler fest)

**Dateien:** `prisma/schema.prisma` (`Users.wiki_limit Int?`),
`prisma/migrations/20260916_wiki_limit/migration.sql`,
`packages/mws/src/new-managers/sessions.ts` (`AuthUser.wikiLimit`),
`wiki-contract.ts` (`UpsertUserInput.wikiLimit`), `TabUpserts.ts`
(`UserImportWriter`), `TabDataAdapter.ts` (`ensurePersonalRole`,
`AdminCreateWiki`), `new-commands/init-store.ts`,
`packages/admin-vanilla/src/definition/tabs.ts` (Feld `wikiLimit`),
`packages/admin-vanilla/src/app.tsx` (Render-Flags, Tab-Filter,
Create-Menü, Empty-State), `locales/en.ts` / `locales/de.ts`

**Problem:** Schüler konnten beliebig viele eigene Wikis anlegen. Die
Lehrerin soll pro Schüler festlegen dürfen, wie viele eigene Wikis dieser
erstellen darf (0…unbegrenzt) — und Schüler-Wikis sollen standardmäßig
privat sein (geteilte Wikis über Readers/Editors).

**Fix:**

- Neues DB-Feld `Users.wiki_limit Int? @default(0)` mit Migrationsskript
  (`ALTER TABLE "users" ADD COLUMN "wiki_limit" INTEGER DEFAULT 0;`),
  Prisma-Client regeneriert.
- **Limit-Semantik:** `NULL` = unbegrenzt, `0` = gesperrt, `N` = maximal
  `N` eigene Wikis. Durchgesetzt in `AdminCreateWiki` **nur für
  Nicht-Lehrer/Nicht-Admins**: zählt die eigenen `recipe`-Zeilen und
  antwortet 403 mit `"Your administrator has not allowed you to create
  your own wikis."` (bei 0) bzw. `"You have reached your limit of {N} own
  wiki(s)."` (bei erreichtem Limit). Admins und Lehrer sind ausgenommen.
- `AuthUser` trägt `wikiLimit`, die Session-Abfrage selektiert
  `wiki_limit`; anonyme Benutzer erhalten fest 0.
- In der Admin-UI erscheint im Users-Tab ein Zahlenfeld „Own wiki limit"
  (leer = unbegrenzt); nur Lehrer/Admins sehen den Users-Tab.
- **Privatheit:** `AdminCreateWiki` vergibt Schülern/Lehrern eine
  persönliche Rolle (`ensurePersonalRole`) statt der System-ADMIN-Rolle;
  dadurch erscheinen Schüler-Wikis für andere (auch die Lehrerin) nicht
  automatisch, Sichtbarkeit entsteht nur über geteilte Readers/Editors.
- Unterrichtssteuerung im Client: Tab-Filter blendet Bags/Templates für
  Nicht-Admin/Lehrer aus; das „Create a wiki"-Menü wird nur bei
  `canCreateOwnWiki` angezeigt; Empty-States erklären Sperre bzw.
  erreichtes Limit.
- Admin-Bootstrap-User (init-store) bekommt `wikiLimit: null`.

**Verifikation:** Typechecks (Root + admin-vanilla) grün, `tsup`-Build
ok; Live-Test gegen `dev/wiki/store/database.sqlite`:

- frau-meyer setzt für schueler-a1 „Own wiki limit" auf `2` → dies
  entspricht seiner Bestandszahl (2 eigene Wikis); 3. Erstellung →
  `403 ACCESS_DENIED` „You have reached your limit of 2 own wiki(s)."
- Limit auf `0` → Erstellung → `403 …` „Your administrator has not
  allowed you to create your own wikis."
- Limit leer (unbegrenzt) → Erstellung → `200`, neues
  `wiki-schueler-a1-3`, danach wieder gelöscht und Limit auf `2`
  zurückgesetzt.
- Privatheit: frau-meyer sieht schueler-a1s Wikis **nicht** im
  `/admin/load` und erhält auf `/wiki/wiki-schueler-a1` `403`;
  schueler-a1 selbst erreicht sein Wiki mit `200`.
- Gebauter Client enthält die neuen Strings
  (`Own wiki limit`, Fehlertexte EN/DE).

---

## 33. Feature: Lehrer-Capability am Rollen-Flag statt am Namen

**Dateien:** `prisma/schema.prisma` (`Roles.is_teacher Boolean @default(false)`),
`prisma/migrations/20260916_roles_is_teacher/migration.sql`,
`packages/mws/src/new-managers/sessions.ts` (`isTeacher` per `is_teacher`-Flag),
`wiki-contract.ts` (`UpsertRoleInput.isTeacher`), `TabUpserts.ts`
(`RoleImportWriter`), `TabDataAdapter.ts` (`getTeacherOwnerIdSet`,
`RoleDataAdapter.saveRow`, `UserDataAdapter.saveRow`-Rollen-Schutz,
`visibilityRoleIds`), `new-commands/init-store.ts`,
`packages/admin-vanilla/src/definition/tabs.ts` (Feld `isTeacher`, `switch`),
`packages/admin-vanilla/src/definition/renders.tsx` (Rollen-Auswahl für
Nicht-Admins), `locales/en.ts` / `locales/de.ts`

**Problem:** Die Lehrer-Hierarchie hing am hart-codierten Rollen-**Namen**
„TEACHER" (`isTeacher` wurde per Namensvergleich bestimmt). Ein Umbenennen
in z. B. „Gruppenleiter 1" hätte sofort alle Lehrer-Rechte entzogen.

**Fix:**

- Neue Spalte `Roles.is_teacher Boolean @default(false)`; Migration setzt
  sie für die bestehende Rolle `TEACHER` auf `true`.
- Die Erkennung prüft jetzt das **Flag** auf einer der Benutzerrollen
  (`sessions.ts`), nicht mehr den Namen. Damit ist die Capability vom
  Namen entkoppelt und **übersteht jedes Umbenennen**; auch mehrere
  Leiter-Rollen („Gruppenleiter 1", „Gruppenleiter 2", …) sind möglich.
- `RoleDataAdapter.saveRow`: `isTeacher` wird über `RoleImportWriter` in
  `update`/`create` persistiert; nur **Admins** dürfen das Flag setzen
  (403 `"You must be an admin to grant teacher capabilities."`).
- `UserDataAdapter.saveRow`-Schutz: Lehrer dürfen keine Rolle zuweisen,
  deren Flag gesetzt ist (statt pauschal dem Namen „TEACHER").
- `getTeacherOwnerIdSet`/`foreignTeacherRole` erkennen fremde
  Leiter-Rollen über das Flag.
- `visibilityRoleIds` filtert Lehrer-Capabilities per Flag statt Name —
  auch nach Umbenennung erzeugen sie keine Admin-Listen-Sichtbarkeit.
- `getLookupOptions` (Client) versteckt geflaggte Rollen in der
  Rollenwahl für Nicht-Admins.
- Neues UI-Feld „Teacher role" (switch) im Rollen-Tab; i18n EN/DE.

**Verifikation:** Typechecks (Root + admin-vanilla) grün, `tsup`-Build ok,
Migration wird beim Start automatisch angewendet. Live-Test:

- Admin benennt `TEACHER` in „Gruppenleiter 1" um → herr-schmidt bleibt
  `isTeacher: true` (Session liest das Flag); zurückbenannt.
- Admin legt neue Rolle „Gruppenleiter 2" mit Flag an und weist sie
  schueler-a1 zu → schueler-a1 (Limit 2, 2 bestandene Wikis) erhält sofort
  die Lehrer-Ausnahme und erstellt ein weiteres Wiki.
- Nicht-Admin (Lehrerin frau-meyer) kann das Flag nicht setzen → 403.
- Test-Artefakte danach wieder entfernt (Rolle gelöscht, Rollen-Zuweisung
  zurück, Test-Wiki gelöscht, TEACHER unverändert).

---

## 34. Feature: Ersteller sehen ihre eigenen Wikis immer

**Dateien:** `packages/mws/src/new-managers/TabDataAdapter.ts`
(`RecipeDataAdapter.getList`)

**Problem:** Ein nicht-Admin-User sah eigene Wikis nur, wenn eine
„qualifizierte" Rolle (persönliche/eingeladene/Klassen-Rolle) in den
Rezept-Permissions steckte. Geseedete Wikis (z. B. `buch-vorlage`,
`dein-tiddlywiki`, `wiki-heino`) haben nur Core-Rollen (`A_read → USER/ANON`,
`B_write → ADMIN`) — der Ersteller Heino (Rolle nur „USER") bekam seine
eigene Wiki-Liste leer angezeigt. Für andere blieben sie aber gleich
unsichtbar.

**Fix:** `RecipeDataAdapter.getList` fragt für Nicht-Admins per `OR` zusätzlich
`{ owner_user_id: this.user.user_id }` ab. Damit sieht ein Ersteller seine
eigenen Wikis immer — unabhängig davon, welche Rollen in den Permissions
stehen. Für andere Nutzer bleibt die Sichtbarkeit rein rollenbasiert
(privat).

**Verifikation:** Typecheck grün, `tsup`-Build ok, `pm2 restart`. Live-Test:
Heino (nur „USER") sieht seine 6 eigenen Wikis in der Liste; frau-meyer und
schueler-a1 sehen diese Wikis weiterhin **nicht**; frau-meyer/schueler-a1
sehen weiterhin nur ihre eigenen bzw. freigegebenen Wikis.

---

## 35. Feature: Lehrer-Rollen unlöschbar + „erstellt von: —"

**Dateien:** `packages/mws/src/new-managers/TabDataAdapter.ts`
(`AdminDeleteRole`), Dev-DB (`roles.owner_user_id` der TEACHER-Rolle)

**Problem:** Die TEACHER-Rolle (bzw. jede Lehrer-Rolle) trug einen
Besitzer („erstellt von: <User>") und konnte vom Site-Admin gelöscht
werden — im Gegensatz zu den Systemrollen ADMIN/USER/ANON, die per
Namens-Check geschützt sind.

**Fix:**

- `AdminDeleteRole` blockt zusätzlich jede Rolle mit `is_teacher=true`
  (Reason: `"A teacher role cannot be deleted."`). Der Schutz hängt am
  **Capability-Flag**, nicht am Namen — er übersteht das Umbenennen von
  „TEACHER" zu z. B. „Gruppenleiter 1" (konsistent zum `is_teacher`-
  Feature, §33).
- Die TEACHER-Rolle bekommt `owner_user_id = NULL`, damit „erstellt von"
  wie bei den Systemrollen „—" zeigt und nur noch der Site-Admin sie
  bearbeiten kann.

**Verifikation:** Typecheck grün, `tsup`-Build ok, `pm2 restart`
(online). Live-Test als Admin: `role/delete` auf TEACHER → 403 („A teacher
role cannot be deleted."); auf ADMIN → weiterhin 403 (Systemrolle);
temporäre Rolle ohne Flag („Loeschtest") → angelegt und gelöscht (200).
TEACHER-Datensatz: `owner_user_id IS NULL`, `is_teacher=1`.

---

## 36. Feature: Admin-Backup (Datenbank + Schlüssel + Config)

**Dateien:** `packages/mws/src/new-managers/BackupRoutes.ts` (neu),
`packages/mws/src/new-managers/index.ts` (Registrierung),
`packages/admin-vanilla/src/app.tsx` (Admin-Menü „Backups"),
`packages/admin-vanilla/src/app.inline.css`,
`packages/admin-vanilla/src/locales/en.ts` / `de.ts`

**Problem:** Es gab keine Möglichkeit, den kompletten Wiki-Bestand
(Tiddler, Bags, Rezepte, Rollen, Benutzer) zu sichern. Alles steckt in der
einen SQLite-Datei `store/database.sqlite`; ein simples Kopieren im
laufenden Betrieb kann durch das WAL inkonsistent sein.

**Fix:**

- Neue Admin-Routen `PUT /admin/backup` und `GET /admin/backup/list`
  (nur `isAdmin`, `requestedWithHeader` + Referer-Check).
- `GET /admin/backup/download?name=<name>` liefert das komplette Backup
  als ZIP (`Content-Disposition: attachment`). Das ZIP wird ohne
  Zusatzpaket mit Node-`zlib` gebaut (CRC32 + optionales Deflate).
  Diese Route läuft bewusst **ohne** `requestedWithHeader`, damit ein
  normaler `<a download>`-Link funktioniert (Schutz über `okAdmin` +
  Referer-Check; backup-Name wird per Regex gegen Pfad-Traversal geprüft).
- `PUT /admin/backup/delete` (Body `{ name }`) löscht ein Backup.
- Wichtig: Die Backup-Routen werden in `ApiRoutes` **vor** `AdminSave`
  (`/admin/:op/:tab`) registriert, sonst fängt die generische Route
  `PUT /admin/backup/delete` ab (`op`/`tab`-Validierung schlägt fehl).
- Snapshot per SQLite `VACUUM INTO` — läuft im laufenden Betrieb, ist
  konsistent und enthält den WAL-Stand. Bewusst **außerhalb** einer
  Transaktion (`VACUUM` ist dort verboten), daher direkt über
  `state.engine`.
- Ziel: `backups/mws-<YYYYMMDD-HHMMSSmmm>/` neben `store/` (also in der
  Daten-Instanz, nicht web-ausgeliefert). Enthält `database.sqlite` sowie
  — falls vorhanden — `passwords.key`, `package.json`,
  `package-lock.json`, `mws*.json` (Config) und `tw5-versions.txt`,
  plus `backup.json` (Name, Zeitpunkt, Dateien, Größe).
- Aufbewahrung: die neuesten 10 Backups bleiben, ältere werden gelöscht.
- Admin-UI: Dropdown „Backups" im Kopfbereich (nur Admin) mit
  „Backup jetzt erstellen" und der Liste der letzten Backups. Jeder
  Eintrag ist ein Download-Link (ZIP) und hat einen kleinen Lösch-Button
  (mit Sicherheitsabfrage).

**Restore:**

1. Server stoppen (`pm2 stop MultiWikiServer-wikiwise`).
2. Aktuellen `store/`-Ordner wegsichern.
3. `database.sqlite` aus dem Backup nach `store/database.sqlite` kopieren
   (ggf. zusätzlich `passwords.key` und `mws*.json` zurückspielen).
4. Server starten (`pm2 start MultiWikiServer-wikiwise`).

**Verifikation:** Typecheck grün, `pm2 restart`. Live-Test als Admin:
Backup erstellt → 200, Ordner enthält valide DB (`PRAGMA integrity_check`
= ok; gleiche Zeilenzahlen für `Recipe`/`recipe_bag`/`recipe_permission`/
`users`/`roles` wie live), `passwords.key`/`package.json`/
`tw5-versions.txt` kopiert; Liste zeigt die Backups; nach 11 Backups
bleiben 10 (ältestes entfernt). Download als Admin → 200
(`application/zip`, `unzip -t` fehlerfrei, entpackte DB valide);
Löschen als Admin → 200, Ordner weg; nicht-existenter Name und
Path-Traversal (`../../etc`) → 404. Nicht-Admin und ohne Session → 403.
Test-Session und eigenes Test-Backup nach dem Test entfernt.

---

## 37. Feature: Anzeige „X von Y eigene Wikis"

**Dateien:** `packages/admin-vanilla/src/definition/tabs.ts` (Spalte + Feld
`ownWikiUsage`, `UserAdminRecord`),
`packages/mws/src/new-managers/TabDataAdapter.ts` (`UserDataAdapter`),
`packages/admin-vanilla/src/app.tsx` (Banner im Wiki-Tab),
`packages/admin-vanilla/src/app.inline.css`,
`packages/admin-vanilla/src/locales/en.ts` / `de.ts`

**Problem:** Obwohl das Schüler-Wiki-Limit (§32) serverseitig durchgesetzt
wird, sah man nirgends, wie viele eigene Wikis man bereits angelegt hat und
wie viele noch erlaubt sind. Auch Admins/Lehrkräfte konnten den Verbrauch
eines einzelnen Nutzers nicht auf einen Blick erkennen.

**Fix:**

- **Banner im Wiki-Tab:** Für angemeldete Nutzer ohne Admin-Rolle — also
  auch Lehrkräfte — erscheint über der Wikis-Liste ein kompakter Hinweis
  (`wiki-limit-banner`, kleinere Schrift/Padding als ein normaler Callout):
  - mit Limit: „Du hast X von Y eigenen Wikis erstellt — noch Z weitere
    möglich." (bei erreichtem Limit die bestehende „Limit erreicht"-Meldung,
    bei Limit 0 die „noch nicht freigegeben"-Meldung),
  - ohne Limit (und bei Lehrkräften, für die das Limit serverseitig nicht
    gilt): „Du hast X von ∞ eigenen Wikis erstellt — unbegrenzt weitere
    möglich."
  Admins sehen keinen Banner.
- **Spalte in der User-Liste:** Neue Server-Spalte „Eigene Wikis" mit der
  Anzeige `erstellt / limit` (z. B. `1 / 2`). Kein Limit bzw. Admins/Lehrer
  (von der Regel ausgenommen) zeigen `n / ∞`.
- Die Zählung erfolgt serverseitig in `UserDataAdapter.getList` direkt über
  `prisma.recipe.owner_user_id` (eine `findMany` + Map-Tally), damit Lehrer
  auch Wikis mitzählen, die in der Wiki-Liste für sie nicht sichtbar sind.
  `saveRow` zählt analog via `prisma.recipe.count`, damit die Zeile nach dem
  Speichern korrekt aktualisiert wird.
- `ownWikiUsage` ist ein reines Server-Feld (`mode: "server"`), also nicht
  im Speicher-Formular editierbar. Die Ausnahme für Admins/Lehrer wird wie
  in der Session-Logik über `role_name === "ADMIN"` bzw. `is_teacher`
  ermittelt.

**Verifikation:** Typecheck (Server + Client) grün, Server neu gebaut
(`tsup`), `pm2 restart`. Live als Admin: `GET /admin/load` liefert für
jeden Nutzer `ownWikiUsage` (Schüler mit Limit 2 und 1 Wiki → `1 / 2`,
Admin/Lehrer → `n / ∞`). Client-Bundle enthält Banner-Logik (mit und ohne
Limit), die neuen Locale-Texte und das kompakte `wiki-limit-banner`-CSS.
Keine Test-Artefakte in der DB angelegt.

---

## 38. Fix: Ersteller dürfen ihre eigenen Wikis auch bearbeiten

**Dateien:** `packages/mws/src/new-managers/RecipeResolver.ts`
(`assertRecipe`, `canWriteBag`)

**Problem:** Heino (nur Rolle „USER") konnte seine eigenen Wikis nicht
bearbeiten — die Wiki-Seite meldete „You are logged in as Heino
(read-only)". Ursache: Die betroffenen Wikis (`buch-vorlage`,
`dein-tiddlywiki`, …) wurden angelegt, als Heino noch Admin war. Ihre Bags
haben daher nur Core-Rollen (`ADMIN → C_admin`, `USER/ANON → A_read`).
Nach der Degradierung zum „USER" blieb nur noch Lesen. §34 hatte zwar die
**Sichtbarkeit** eigener Wikis im Admin-Panel repariert, aber nicht die
**Schreib-/Leserechte** im Resolver, der die eigentliche Wiki-Seite bedient.

**Fix:** Der Resolver kennt jetzt zusätzlich `owner_user_id` von Rezept und
Bags und behandelt den Ersteller wie einen Berechtigten:

- `assertRecipe`: Ist der Nutzer Eigentümer des Rezepts oder eines seiner
  Bags, entfällt die rollenbasierte Lese-Schranke (eigene Wikis bleiben
  lesbar, auch wenn die Rollen später geändert werden).
- `canWriteBag`: Ist der Nutzer Eigentümer des Ziel-Bags, darf er schreiben —
  unabhängig von den Rollen. Für alle anderen gilt weiter strikt die
  rollenbasierte Prüfung.

**Verifikation:** Typecheck grün, `tsup`-Build + `pm2 restart`. Live als
Heino: `GET /recipe/buch-vorlage/status` → `canUserWrite: true`; Test-Tiddler
per `batch/save` speichern → 200, danach per `batch/delete` wieder entfernt
(kein Rest in der `tiddler`-Tabelle). Gegenprobe als schueler-a1 (fremdes
Wiki): `canUserWrite: false`, `batch/save` → 403 `BAG_NO_WRITE_PERMISSION`.

---

## 39. Feature: Admin-Tab „Speicher" (Speicherübersicht)

**Dateien:** `packages/mws/src/new-managers/StorageRoutes.ts` (neu),
`packages/mws/src/new-managers/index.ts` (Registrierung),
`packages/admin-vanilla/src/app.tsx`,
`packages/admin-vanilla/src/app.inline.css`,
`packages/admin-vanilla/src/locales/en.ts` / `de.ts`,
`prisma/schema.prisma` (nur lesende Abfragen)

**Problem:** Es gab keine Stelle, an der ein Admin auf einen Blick sieht,
wie voll die System-Festplatte ist und wie viel Platz jeder einzelne
Bestandteil des MultiWikiServer-wikiwise belegt. Für den Betrieb (Backups,
Aufräumen, Kapazitätsplanung) fehlte diese Transparenz komplett.

**Fix:**

- Neue Admin-Route `GET /admin/storage` (`zodRoute`, `state.okAdmin()`,
  `securityChecks: { requestedWithHeader: true }`, `state.assertReferer`
  gegen die eigene Herkunft). Registriert als `AdminStorage` in
  `new-managers/index.ts`.
- Antwort `StorageInfo` mit:
  - `disk` (`statfsSync(wikiPath)` → `totalBytes`/`usedBytes`/
    `availableBytes`, Belegung in Prozent + Ampel-Status),
  - `lastScan` (Zeitstempel der letzten Erhebung),
  - `recordCounts` (Prisma-Counts für Tiddler/Bags/Wikis/Templates/User),
  - `categories` (rekursive Verzeichnis-Scans via `getDirStats`:
    Datenbank, Anwendungsdaten, Attachments, temporäre Daten, Backups,
    Cache, System & Konfiguration — je Dateien, Verzeichnisse, Größe,
    Änderungsdatum),
  - `blobs` und `topUsers` (siehe §40/§41).
- Admin-UI: Der neue Tab **„Speicher"** erscheint rechts neben
  „Benutzer" und ist **nur für Admins** sichtbar (Tab-Button und
  `loadStorage` prüfen `userState.isAdmin`). Da es sich um keinen
  CRUD-Tab handelt (keine `TabId`), wird im Frontend eine synthetische
  `storageTabDefinition` verwendet; `activeTab` wurde auf
  `TabId | "storage"` erweitert und der List-Panel-Zweig über einen
  `isStorageTab`-Ternary abgezweigt.
- Darstellung (von oben nach unten):
  - **„System-Festplatte" / „Speicherstatus der Festplatte"** — Karte mit
    Fortschrittsbalken, Ampel-Status, „Letzter Scan" und
    `{free} frei`. Die frühere Überschrift `System disk` wurde bewusst
    umbenannt bzw. getrennt, damit Festplattenplatz und App-Belegung
    nicht verwechselt werden.
  - **„Speicherbelegung MWS-wikiwise"** — eigener Abschnitt
    (`storage-records-section`) mit den Counts für Tiddler, Bags, Wikis,
    Templates und Benutzer.
  - **Datenübersicht** — Tabelle über die Verzeichnis-Kategorien mit
    Spalten Pfad/Kategorie/Dateien/Verzeichnisse/Gesamtgröße/
    Änderungsdatum.
  - **Legende** — erklärt die Kategorien und Farben.
  - **Aktualisieren/Erneut versuchen** im Abschnittskopf.
- Alle Bezeichnungen sind zweisprachig (EN/DE) als i18n-Keys hinterlegt
  (u. a. „Storage"/„Speicher", „System disk"/„System-Festplatte",
  „Disk storage status"/„Speicherstatus der Festplatte",
  „MWS-wikiwise storage usage"/„Speicherbelegung MWS-wikiwise").

**Verifikation:** Typecheck (Root + `admin-vanilla`) grün, `tsup`-Build
ok. Live-Test gegen `dev/wiki/store/database.sqlite`: `GET /admin/storage`
liefert valide Disk-Werte, Counts und Kategorien; die neuen Strings und
CSS-Klassen sind im gebauten Client-Bundle enthalten; Nicht-Admin und
Session ohne `X-Requested-With`-Header → abgewiesen. (Ein vollständiger
HTTP-End-to-End-Test als Admin war per `curl` wegen des OPAQUE-Passworts
nicht möglich, siehe Betrieb/Ausblick.)

---

## 40. Feature: „Blobs & Dateien"-Sektion im Speicher-Tab

**Dateien:** `packages/mws/src/new-managers/StorageRoutes.ts`,
`packages/admin-vanilla/src/app.tsx`,
`packages/admin-vanilla/src/app.inline.css`,
`packages/admin-vanilla/src/locales/en.ts` / `de.ts`

**Hintergrund:** MWS speichert Binärinhalte (Bilder, Videos, PDFs) **nicht
wie Rails/ActiveStorage in separaten Dateien**, sondern **inline als
base64-Text im Feld `Tiddler.fields`** der SQLite-Datenbank. Der alte
`AttachmentService` (`store/files/<hash>/`) existiert zwar in
`attachments.ts`, ist aber **inaktiv** (`attachmentsEnabled=false`, kein
`attachment_hash` im Schema, keine Importe). Deshalb gab es bisher keine
Anzeige, wie viel Platz die eigentlichen Binärinhalte belegen.

**Fix:**

- Der `blobs`-Block der Route klassifiziert Binär-Tiddler über
  MIME-Muster (`BINARY_TYPE_PATTERNS` = `image/%`, `video/%`, `audio/%`,
  `application/pdf`, `application/octet-stream`, `font/%`), geprüft per
  SQL über `json_extract(fields, '$.type')`. `application/json` u. Ä.
  zählen **nicht** als Blob.
- Geliefert werden: `blobCount`/`blobBytes` (Anzahl und Byte-Summe der
  Binärinhalte), `contentBytes` (`sum(length(fields))` über alle
  Tiddler), `tiddlerCount`, `storeFiles` (Dateien/Verzeichnisse/Größe/
  Änderungsdatum von `store/files/`), `inbox` (`store/inbox/`) und
  `orphanedStoreFiles` (verwaiste Dateien).
- **Verwaist-Erkennung:** Als gültig gilt ein Verzeichnis unter
  `store/files/`, das einem 64-stelligen Hex-/SHA256-Namen entspricht und
  sowohl `meta.json` als auch eine `data*`-Datei enthält. Alles andere
  (fremde Dateien, unvollständige oder nicht referenzierte Ordner) wird
  als verwaist gezählt.
- UI: eigener Abschnitt **„Blobs & Dateien"** (`storage-blobs-section`)
  mit sechs Kacheln: **Blobs**, **Dateispeicher**, **Wiki-Inhalte**,
  **Dateianhänge auf der Platte**, **Inbox**, **Verwaiste Dateien**
  (Klassen `is-blobs`/`is-store`/`is-content`/`is-disk`/`is-inbox`/
  `is-orphan`). Die Kacheln „Blobs" und „Wiki-Inhalte" zeigen
  zusätzlich einen Hinweis („{count} Dateien", „in store/files/" usw.).

**Verifikation:** SQL-Logik wurde isoliert per `better-sqlite3` gegen
`dev/wiki` geprüft: `blobCount 23`, `blobBytes 7.865.187`,
`contentBytes 17.957.395`, `tiddlerCount 1088`. Die
Verwaist-Erkennung wurde mit Test-Ordnern isoliert getestet (3 von 4
korrekt erkannt). Typecheck und Build grün.

---

## 41. Feature: „Speicherverbrauch pro User (Top 10)"

**Dateien:** `packages/mws/src/new-managers/StorageRoutes.ts`,
`packages/admin-vanilla/src/app.tsx`,
`packages/admin-vanilla/src/app.inline.css`,
`packages/admin-vanilla/src/locales/en.ts` / `de.ts`

**Problem:** Unbekannt, welche Benutzer wie viel Speicher belegen —
wichtig, um z. B. ausufernde Schüler-Wikis zu erkennen.

**Fix:**

- Der `topUsers`-Block ermittelt die Top 10 über einen SQL-Join
  `Users → Recipe (owner_user_id) → recipe_bag → Bag → Tiddler`
  (pro User werden nur Wikis gezählt, bei denen er Eigentümer ist:
  `HAVING count(DISTINCT r.id) > 0`; Sortierung `total_bytes DESC
  LIMIT 10`). Felder: `username`, `wikiCount`, `wikiContentBytes`,
  `fileStoreBytes`, `totalBytes`.
- **Ohne Doppelzählung:** Da Binärinhalte in den Tiddler-Feldern
  stecken, würde man sie sonst doppelt zählen. Die Tabelle weist daher
  aus: **Dateispeicher** = Binär-Blob-Bytes, **Gesamt** = alle
  Tiddler-Feld-Bytes des Users, **Wiki-Inhalte** = Gesamt − Dateispeicher.
- UI: eigener Abschnitt **„Speicherverbrauch pro User (Top 10)"** mit
  Spalten **Benutzer | Wikis | Wiki-Inhalte | Dateispeicher | Gesamt**
  (Klassen `storage-user-table`, `storage-user-name`,
  `storage-user-total`); numerische Spalten rechtsbündig, „Gesamt" fett.

**Verifikation:** SQL-Logik per `better-sqlite3` gegen `dev/wiki`
getestet (Top-User u. a. Heino: 5 Wikis, 17.191.550 B Gesamt,
7.612.135 B Blobs, 9.579.415 B Wiki-Inhalte). Das generierte SQL wurde
im gebauten `dist/mws.js` und die UI-Strings/CSS-Klassen im Client-Bundle
verifiziert. i18n ist mit **353/353** Keys zwischen EN und DE synchron.
Letzter Build: `public/admin-vanilla/main-6SOOAJ4R.js`.

---

## 42. Feature: Pinnwand (Pinboard) – gemeinsames „Zettel anpinnen"

**Ziel:** Ein niedrigschwelliger Austauschplatz für alle eingeloggten Nutzer
(Admin, Lehrer, Schüler). Jeder darf Zettel (Post-its) anpinnen; Sichtbarkeit
läuft über drei Zielgruppen (Scope): **GLOBAL** (alle), **Klasse/Rolle**
(Rolle), **einzelne Person** (User). Das Feature ist rein UI + API + DB –
keine Änderungen am TW-Core, am Sync oder an ACLs nötig.

### Backend

**Schema** (`prisma/schema.prisma`, Migration `20260917_pinboard`):

- `PinboardNote`: `id`, `author_user_id`, `author_name` (Snapshot),
  `scope_type` (`GLOBAL`/`ROLE`/`USER`), `scope_id?`, `body` (max 1700
  Zeichen, serverseitig `MAX_BODY` in `PinboardRoutes.ts`), `color`
  (6 Farben), `is_important`, `is_active`,
  `created_at`/`updated_at`, `expires_at?`
- `PinboardNoteRead`: `note_id`, `user_id`, `read_at?`,
  `dismissed_at?` (PK = `(note_id, user_id)`). Nur *privat*:
  Lese-Quittung für das eigene Badge, **keine** Rückmeldung an den Autor.

**Routen** (`packages/mws/src/new-managers/PinboardRoutes.ts`,
registriert in `new-managers/index.ts`):

| Route | Methode | Beschreibung |
|-------|---------|--------------|
| `/api/pinboard` | GET | Liste aller sichtbaren Zettel + `unreadCount` + Targets |
| `/api/pinboard/unread-count` | GET | Nur Badge-Zahl (Polling alle 30 s) |
| `/api/pinboard/note` | PUT | Erstellen / Aktualisieren (Body, Farbe, Wichtig, Scope, Ablauf) |
| `/api/pinboard/note/delete` | PUT | Entfernen (Autor, Admin, Lehrer auf Klassenwänden) |
| `/api/pinboard/read` | PUT | `read` / `dismissed` toggeln |

**Sichtbarkeit & Moderation** (`canSee`, `canEdit`, `canDelete` in
`PinboardRoutes.ts`):

- Ein Zettel ist sichtbar, wenn `is_active=true`, nicht abgelaufen **und**
  Zielgruppe passt: `GLOBAL` → alle Eingeloggten; `ROLE` → Mitglieder
  dieser Rolle; `USER` → genau diese Person. Autoren sehen eigene Zettel
  immer; Admins sehen alles.
- Löschen/Abnehmen: **Autor** seinen eigenen, **Admin** alles; **Lehrer**
  auf ihren Klassenwänden (Rollen, die sie erstellt haben).
- **Globale Wand schreiben** nur Admin/Lehrer (Schüler nicht) — sonst
  Spam-Gefahr. Klassen-/Personen-Zettel darf jeder pinnen.

**Ungelesen-Badge:** `unreadCount` = sichtbare Zettel ohne `read_at` **und**
ohne `dismissed_at` für den aktuellen User, aber **nicht** eigene Zettel.
Polling im Client alle 30 s (`loadPinboardUnread`).

### Frontend

**Komponente** (`packages/admin-vanilla/src/pinboard.tsx`,
Custom Element `<mws-pinboard>`):

- **Tab „Pinnwand"** in der Admin-Leiste (für alle Rollen sichtbar),
  Badge mit Anzahl ungelesener Zettel.
- **Kork-/Filz-Hintergrund** (Light: warmes Beige `#d4b896` mit
  Leinen-Textur; Dark: dunkles Filz `#2d2218`).
- **Post-it-Karten**: stabile Neigung pro ID (`tiltForId`: –3°…+3°);
  Hover richtet gerade + hebt an (Scale 1.02, stärkerer Schatten); oben
  Klebeband-Streifen; wichtige Zettel = rote Reißzwecke, sortiert ganz oben.
- **Vorschau auf der Wand**: Jeder Zettel zeigt nur die ersten **130 Zeichen**
  (`BODY_PREVIEW_CHARS`, an einer Wortgrenze abgeschnitten + „…") — der
  Volltext liegt hinter einem Klick im Viewer (s. u.), die Wand bleibt ruhig
  und **verschiebt sich beim Öffnen nicht** (kein Canvas-Wachstum mehr).
- **Breite Zettel**: Ab **200 Zeichen** (`BODY_WIDE_CHARS`) wird der Zettel
  doppelt so breit dargestellt (`is-wide`: 340 px statt 220 px,
  `grid-column: span 2`), damit lange Vorschauen besser lesbar sind.
- **Farben**: Gelb/Rosa/Blau/Grün/Orange/Lila (CSS-Variablen, Dark-Mode
  angepasst).
- **Filterchips**: *Alle · Ungelesen · Meine*.
- **Composer** (Neu/Edit): Textarea (**1700 Zeichen**, darüber ein
  **Zeichenzähler** `NNN/1700`, rot bei Erreichen des Limits), Farb-Swatches,
  Wichtig-Checkbox, Zielgruppen-Dropdown (nur erlaubte Optionen),
  optionales Ablaufdatum. Das serverseitige Zod-Limit (`<=1700`) wird
  übersetzt angezeigt („Zu lang: höchstens 1700 Zeichen erlaubt.").
- **Viewer-Modal**: Ein Klick auf einen Zettel öffnet den Volltext in einem
  zentrierten Modal (`.pinboard-viewer`, farbige Zetteloptik passend zur Notiz,
  `pre-wrap`, bei sehr langen Texten scrollbar, max. 62vh Höhe). Kopf mit
  Autor + Empfänger-Kreis („Alle"/„Für {name}"), Meta-Leiste (Zeit,
  Ablaufdatum „Läuft ab am …", „Meine"). Schließen per ×, „Schließen"-Button
  oder Klick auf den Hintergrund.
- **Aktionen**: Pro Zettel auf Hover (kleine Pills) *und* im Viewer-Modal:
  Als gelesen/ungelesen markieren, „Für mich abheften" (dismissed),
  Bearbeiten (Autor/Admin), Entfernen (Autor/Admin/Lehrer auf Klassenwänden).
  Neu im Modal: **„In Zwischenablage kopieren"** — kopiert den Volltext
  via Clipboard API (secure context, User-Gesture) und zeigt 1,6 s lang
  „Kopiert"-Feedback mit Häkchen-Icon; Fehler erscheinen als rote Meldung.
- **Filed-away-Bereich** (eingeklappt am Ende) für dismissed Zettel.
- Vollständig **i18n** (EN/DE, **57 Keys**, Parität 57/57).

**Integration** (`packages/admin-vanilla/src/app.tsx`):

- Tab-Button in der Leiste (`pinboard`), Badge `pinboardUnread`.
- Rendert `<mws-pinboard onUnreadChange={…} />` im Content-Bereich.
- Unread-Polling alle 30 s, Live-Update beim Öffnen eines Zettels.

**CSS** (`packages/admin-vanilla/src/app.inline.css`):

- `pinboard-wall` (Korkhintergrund, Dark-Variante), `pinboard-wall-grid`
  (responsive Masonry-ähnlich), `pinboard-note` (Karte, Tilt, Hover,
  Farben), `pinboard-note-tape` (Klebeband), `pinboard-note-pin`
  (Reißzwecke), `pinboard-note.is-wide` (breite Zettel), Filterchips,
  Composer inkl. `pinboard-char-count`/`.is-full`, `.pinboard-viewer`
  (Modal + Farbvarianten), Actions, Empty/Filed-away-States.

### Migration & Daten

- `prisma/migrations/20260917_pinboard/migration.sql`:
  `CREATE TABLE pinboard_note` + `pinboard_note_read` + Index
  `(is_active, scope_type)`. FK `note_id → pinboard_note` (Cascade).
- Prisma Client generiert ohne Fehler (`npx prisma generate`).

### Verifikation

- `npm run tsc2` → 0 Fehler.
- `npm run build` → ESM Server (`dist/mws.js`) + Client Bundle
  (`public/admin-vanilla/main-*.js` / `*.css`) erfolgreich.
- Manuelle Smoke-Tests (Admin + Lehrer + Schüler-Sessions gegen
  localhost:5000):
  - Lehrer pinnt global → sichtbar für alle ✓
  - Schüler pinnt in Klasse (Rolle) → nur Klassenmitglieder sehen es ✓
  - Schüler pinnt an Mitschüler (USER) → nur Empfänger sieht es ✓
  - Schüler **kann nicht** global pinnen → 403 `ACCESS_DENIED` ✓
  - Ungelesen-Badge zählt korrekt (eigene Zettel nicht, dismissed nicht,
    mark-as-read funktioniert) ✓
  - Wichtige Zettel (rote Pin) sortieren zuerst ✓
  - Edit/Delete-Rechte greifen (Autor/Admin/Lehrer-Klassenwand) ✓
  - Ablaufdatum: abgelaufene Zettel verschwinden aus Sichtbarkeit ✓
  - Vorschau: >130 Zeichen → abgeschnittener Teaser mit „…" (Wortgrenze);
    ≥200 Zeichen → Zettel wird doppelt breit (`is-wide`, 340 px) ✓
  - Viewer-Modal: Klick öffnet Volltext in Zetteloptik; **die übrigen
    Zettel verschieben sich nicht** (keine Canvas-Höhenänderung) ✓
  - „In Zwischenablage kopieren" liefert den Volltext; kurzzeitiges
    „Kopiert"-Feedback; Fehlerfall zeigt rote Meldung ✓
  - Zeichenzähler: `NNN/1700` rot bei Limit; 1701 Zeichen → übersetzte
    Zod-Meldung „Zu lang: höchstens 1700 Zeichen erlaubt." ✓
  - Dark-Mode-Optik stimmt (Filz, Post-it-Farben angepasst) ✓
  - i18n EN/DE komplett (Tab-Label, Tooltips, Fehlermeldungen, Composer,
    Viewer-Modal, Kopieren; 57/57) ✓
  - Polling 30 s aktualisiert Badge ohne Reload ✓

---

## 43. Feature: Thumbnail-Anzeige (Wiki-Vorschaubilder)

**Ziel:** Die Wiki-Liste im Admin-Tab *Wikis* zeigt zu jedem Wiki ein
**Vorschaubild** (Headless-Screenshot der echten Wiki-Seite) statt nur
Textspalten. Ein Klick öffnet das Bild groß in einem Modal. Das Bild wird
**pro User** gerendert — es zeigt genau das, was der eingeloggte Betrachter
auf der Wiki-Seite sehen würde (inkl. seiner Sicht- und Leseberechtigungen).

### Backend

**Datei:** `packages/mws/src/new-managers/WikiThumbnailRoutes.ts` (neu),
Route registriert in `packages/mws/src/new-managers/index.ts` vor der
allgemeinen Rezept-Route (`REGEX_WIKI_THUMBNAIL`):

| Route | Methode | Beschreibung |
|-------|---------|--------------|
| `/wiki/<slug>/thumbnail` | GET/HEAD/OPTIONS | PNG des Wikis (640×400) |

- **Zugriffsbedingung:** eingeloggt (`user.isLoggedIn`) **und**
  `RecipeResolver.assertRecipe` — dieselben Leserechte wie beim Öffnen des
  Wikis selbst (anonym → 403, keine Rechte → 403). Damit ist die Vorschau
  kein Seitenkanal für Inhalte.
- **Rendering:** `playwright-core` + Chromium (headless, `--no-sandbox`).
  Der Browser-Pfad wird **einmal** gesucht (und gecacht) über eine
  Fallback-Kette: `MWS_CHROMIUM_PATH` → `CHROME_PATH` → Playwright-Browser-
  Cache (`~/.cache/ms-playwright`, z. B. samt `firefox`/`ffmpeg` nach einmal
  `npx playwright install chromium`; neue und alte Verzeichnis-Layouts
  inkl. `chrome-headless-shell`) → `/usr/bin/chromium(-browser)` →
  `/snap/bin/chromium`. Fehlende Kandidaten werden übersprungen — nur wenn
  keiner existiert, meldet der Render-Aufruf den fehlenden Browser.
  Der Browser wird lazy gestartet und **wiederverwendet**. Er rendert die
  echte Seite `/wiki/<slug>` mit **Viewport 1280×800** und nimmt nach dem
  Boot des TiddlyWiki-Clients (networkidle + 2500 ms Wartepause) einen
  Screenshot; dieser wird über eine Hilfsseite auf **640×400
  (`object-fit: cover`)** herunterskaliert (besseres Antialiasing als eine
  native Low-Res-Aufnahme). **Parallelität begrenzt:** Es laufen höchstens
  **2** Renders gleichzeitig (jeder öffnet einen eigenen Browser-Kontext;
  `MWS_THUMBNAIL_RENDER_CONCURRENCY`, geklemmt 1…8). Nach einem TTL-Ablauf
  re-rendert die ganze Wiki-Liste beim ersten Öffnen — statt einer unbegrenzten
  CPU/RAM-Spitze reihen sich die Renders FIFO aneinander (Verifikation mit
  Limit 1: 12 gleichzeitig angefragte Wikibilder nacheinander in ~51 s, alle
  200 `image/png`).
- **Session-Kontext:** Das Session-Cookie des aufrufenden Users wird dem
  Browser-Kontext mitgegeben → das Bild entspricht dessen Sicht. Der Cache
  wird aber bewusst **userübergreifend geteilt** (ein Slot je Slug): Die
  Zugriffsprüfung läuft serverseitig in `assertRecipe` (ohne Rechte gibt es
  gar keine PNG), und das Vorschaubild ist für alle erlaubten User inhaltlich
  identisch — personalisierte Elemente entstehen client-seitig im Browser und
  tauchen im Screenshot nicht auf. Wer nach TTL-Ablauf zuerst anfragt,
  definiert also das Bild für alle, bis zur Invalidierung. Ein echter
  Per-User-Cache (`<slug>.<userId>.png`) wäre N×M Render-Slots und würde die
  Render-Begrenzung (s. o.) konterkarieren — deshalb bewusst nicht.
- **Cache:** Ergebnis liegt unter `store/thumbnails/<slug>.png` im
  Daten-Store (außerhalb der Web-Auslieferung). TTL standardmäßig **24 h**;
  Auflösung: `MWS_THUMBNAIL_TTL_HOURS` (Umgebungsvariable) →
  `admin.thumbnailTtlHours` (Einstellungen-Seite, §47) → 24 h (`thumbnailTtlMs`
  in `WikiThumbnailRoutes.ts`). Schreiben atomar (`…png.tmp` +
  `rename`), eine In-Flight-Queue verhindert parallele Doppel-Render für
  denselben Pfad. Response: `image/png`, `Cache-Control: private,
  max-age=<TTL in s>` (stets per Session privat, Wert folgt der Server-TTL),
  dazu **`ETag`** (aus mtime+size) und **`Last-Modified`**. Konditionale
  Requests werden beantwortet: `If-None-Match` (auch in ETag-Listen oder
  `*`) und `If-Modified-Since` → **304** ohne Body; der Vergleich läuft auf
  Sekundenauflösung, damit die Last-Modified-Runde nicht durch
  Sub-Sekunden-mtime verfehlt wird.
- **Invalidierung (debounced):** Nach `batch/save`/`batch/delete` auf einem Wiki
  (`RecipeRoutes.ts` → `invalidateThumbnail`) wird das gecachte PNG erst
  **gedrosselt** gelöscht: Jede Änderung setzt einen Timer zurück, und die Datei
  fällt erst **kurz nach der letzten Änderung** weg (Standard **180 s**,
  `MWS_THUMBNAIL_DEBOUNCE_SECONDS` übersteuerbar). Damit zerstören die
  TiddlyWiki-Autosaves (ein `batch/save` je Tiddler-Wechsel) die Vorschau nicht
  mehr laufend, während ein Wiki bearbeitet wird — das nächste Bild nach dem
  Timer-Ablauf wird automatisch neu gerendert (kurzes Staleness-Fenster nach
  der letzten Bearbeitung ist beabsichtigt).
- **Aufräumen:** Wird ein Wiki gelöscht (`AdminDeleteWiki` — Owner **oder**
  Site-Admin), fällt seine Vorschau **sofort** weg (`deleteThumbnail`, bricht
  auch einen evtl. laufenden Debounce-Timer ab, damit ein späteres
  Neu-Anlegen desselben Slugs die frische PNG nicht verliert). Zusätzlich
  räumt ein **Sweep beim Serverstart** (`sweepOrphanedThumbnails` auf
  `mws.config.init.after`) alle Dateien aus `store/thumbnails/`, die zu keinem
  aktuellen Rezept mehr gehören (gelöschte Wikis, `.png.tmp`-Reste von
  Abstürzen) — die zuvor liegengebliebenen Waisen werden damit entfernt.
  Der Dateiname ist die verlustbehaftete Slug-Sanitisierung
  (`[^a-zA-Z0-9_-] → _`); der Sweep baut die gültige Dateimenge daher aus den
  **sanitisierten** Slugs aller Rezepte — eine Kollision kann nur eine Datei
  behalten, nie eine lebende löschen.

### Frontend

**Dateien:** `packages/admin-vanilla/src/definition/tabs.ts` (Spalte
`thumbnailUrl`, macht die erste Spalte breiter als früher),
`packages/admin-vanilla/src/definition/store.ts` (URL-Bau),
`packages/admin-vanilla/src/app.tsx` (`renderListCellValue` +
Vorschau-Modal), `packages/admin-vanilla/src/app.inline.css`,
`packages/admin-vanilla/src/locales/en.ts` / `de.ts`

- **Spalte:** `thumbnailUrl` (leeres Label, Breite 3) steht direkt hinter
  `slug`. Der Wert wird **clientseitig** aus dem Slug gebaut
  (`${pathPrefix}/wiki/<slug>/thumbnail`), es kommt **nichts** Neues aus dem
  Server-JSON.
- **Miniatur:** `<img class="wiki-thumbnail">` — 128×80, `object-fit: cover`,
  abgerundet, `loading="lazy"` + `decoding="async"` (Scroll-Performance),
  Zahnrad-/Streifen-Grundmuster solange das Bild lädt, `cursor: zoom-in`.
- **Modal:** Klick auf das Bild (`stopPropagation`, öffnet nicht den
  Slugs-Link) → zentriertes `.thumbnail-modal` (`.modal-shell-centered` /
  `.modal-card`) mit Kopf „Vorschaubild" / „Wiki-Vorschau",
  `.close-button` (×), Klick auf den Hintergrund schließt ebenfalls; großes
  `.wiki-thumbnail-full` (640×400, `object-fit: cover`,
  `max-height: calc(100vh - 220px)`).
- **i18n:** Keys `Thumbnail` → „Vorschaubild" und `Wiki preview` →
  „Wiki-Vorschau" (EN/DE, Parität 1:1).

### Verifikation

- `npm run tsc2` grün; `npm run build` (ESM Server + Client-Bundle)
  erfolgreich; Route in `dist/mws.js` enthalten.
- Live-Test gegen localhost:5000:
  - eingeloggt + Leserecht auf `wiki-<slug>` → `GET /wiki/<slug>/thumbnail`
    → 200, `image/png`, Kantenmaße 640×400 ✓
  - anonym → 403 `ACCESS_DENIED` „User not authenticated" ✓
  - ohne Leserecht → 403 (gleiche Schranke wie die Wiki-Seite selbst) ✓
  - HEAD → 200 ohne Body; OPTIONS → 200 leer ✓
  - Cache: zweiter Call dient aus `store/thumbnails/`, nach `batch/save`
    wird neu gerendert ✓
  - Client: Spalte erscheint im Wikis-Tab, Modal öffnet/schließt (×,
    Hintergrund-Klick) ✓

> **Betriebshinweis:** Für das erste Rendern eines Wikis muss Chromium auf
> dem Server vorhanden sein. Einfachste Option: einmalig
> `npx playwright install chromium` (legt alles in `~/.cache/ms-playwright`
> ab, wird von der Fallback-Kette automatisch gefunden); alternativ ein
> System-Chromium (`apt install chromium` o. ä.) oder explizit
> `MWS_CHROMIUM_PATH`/`CHROME_PATH`. Ist kein Browser erreichbar, schlägt
> **nur das Generieren** fehl — die Wiki-Daten selbst sind nicht betroffen,
> und ein fehlgeschlagener Render wird nicht gecacht.

---

## 44. Feature: „Meine Dateien" (per-Konto Datei-Upload)

**Ziel:** Jeder eingeloggte Nutzer (Admin, Lehrer, Schüler) verwaltet in
einem eigenen Tab **eigene Dateien**: hochladen, herunterladen, inline
ansehen (Bild, Audio, Video, PDF, Text, Markdown und ODT) und gezielt
teilen.
Die Bytes liegen content-addressed auf der Festplatte unter
`store/files/<sha256>/` — exakt das Layout, das der Admin-Tab „Speicher"
(§40) auswertet —, die SQLite-Tabellen `user_file`/`user_file_share`
halten nur Metadaten und Empfänger. Das Feature ist rein UI + API + DB,
keine Änderungen am TW-Core, an Sync oder an ACLs.

### Backend

**Dateien:** `packages/mws/src/new-managers/UserFileRoutes.ts` (neu),
Routen registriert in `packages/mws/src/new-managers/index.ts`;
Limit-Vorgabe in `packages/mws/src/ServerState.ts` (Default **100 MB**
pro Datei, übersteuerbar via `MWS_USERFILE_SIZE_LIMIT`).

| Route | Methode | Beschreibung |
|-------|---------|--------------|
| `/api/user-files/upload` | PUT | Multipart in die Inbox **streamen**, `sha256` während des Streamens, danach Adoption nach `store/files/<sha256>/`; über Limit → 413, Body wird verworfen |
| `/api/user-files/list` | GET | Eigene Dateien (Metadata); Admins sehen alle, mit Owner-Spalte |
| `/api/user-files/shared` | GET | „Mit mir geteilt": fremde sichtbare Dateien (mit Owner); für Admins leer |
| `/api/user-files/share-targets` | GET | Zulässige Empfänger-Optionen („Alle", Rollen, User) je Kontotyp |
| `/api/user-files/share` | PUT | Freigabe-Scopes ersetzen (`GLOBAL`/`ROLE`/`USER`), serverseitig auf erlaubte Optionen normiert; leere Liste beendet das Teilen |
| `/api/user-files/download` | GET/HEAD | Stream als `attachment` mit korrektem Dateinamen |
| `/api/user-files/preview` | GET/HEAD | Stream `inline` mit `Accept-Ranges: bytes`, Range-Unterstützung (206 + `Content-Range`, sonst 416 `bytes */<größe>`) — für Seek bei Audio/Video |
| `/api/user-files/delete` | PUT | Löschen einer eigenen Datei (Admin: alle); Bytes entfallen erst, wenn keine `user_file`-Zeile mehr auf den Hash zeigt |

**Rechte-Matrix** (`shareGrantsVisibility`): Besitzer sehen ihre Dateien
immer, Admins sehen alles. Sonst entscheidet der Kontotyp des
**Teilenden**: Admin-Freigaben erreichen alle; Lehrer-Freigaben erreichen
Admins und Mitglieder der gewählten Rollen — **andere Lehrer nie**;
Schüler-Freigaben erreichen nur konkret gewählte Empfänger
(Klassenkameraden/Lehrer). Empfänger-Optionen (`collectShareTargets`) und
eingereichte Scopes (`normalizeShareScopes`) werden je Benutzer gefiltert,
unzulässige Einträge serverseitig verworfen.

**Speicherung:** `store/files/<sha256>/data.<ext>` (eine Daten-Datei pro
Content-Hash; Extension aus einer MIME-Tabellen) + `meta.json`
(contentHash, Dateiname, Typ, Originalname, `user_id`, Zeitstempel). Der
Upload streamt ohne Speicherpuffer über die Inbox; Reste werden bei
Abbruch aufgeräumt. GET/HEAD-Pfade prüfen dieselbe Sichtbarkeit
(`fetchAuthorizedFile`) — eine nicht geteilte Datei ergibt 404.

### Frontend

**Datei:** `packages/admin-vanilla/src/user-files.tsx` (Custom Element
`<mws-user-files>`), Styles in `app.inline.css`, i18n in
`locales/en.ts`/`de.ts`.

- **Tab „Meine Dateien"** in der Admin-Leiste; Tabelle mit Name, Typ,
  Größe und Zeitstempel; Admins sehen zusätzlich den Besitzer
  (Owner-Spalte). Die Admin-Erkennung (`isAdminView`) prüft **beide**
  Mount-Arten — `hasAttribute("admin")` (String-Tag
  `<mws-user-files admin>`) **oder** `props.admin === true` —, da der
  JSX-String-Tag-Mount keine `props` befüllt.
- **Upload** per Ghost-Button (Upload-Icon) → Multipart-PUT; danach
  automatische Aktualisierung der Liste.
- **Vorschau-Modal:** Bild (eigenes `<img>`), Audio/Video mit Controls
  (`autoplay`, Seek über Range-Requests), PDF in einem iframe;
  **ODT** (`application/vnd.oasis.opendocument.text`, `.odt`) wird
  **clientseitig** mit `odf-kit/reader` zu HTML konvertiert
  (`odtToHtml(bytes, { fragment: true })`) und in einer sandboxed
  iframe (Custom Element `OdtPreviewDocument`, `srcdoc` als Property)
  mit hell-/dunkler Optik (`mws-light`/`mws-dark`) dargestellt —
  `.doc`-Dateien bewusst **ohne** Vorschau (Download angeboten);
  Textdateien als `<pre>`; **Markdown** (`text/markdown`, `.md`) rendert
  ein schlanker Client-Renderer (`renderMarkdownToJSX`: Überschriften
  h1–h5, Listen, Code, Blockzitat, `hr`, inline `**fett**` / `__fett__` /
  `*kursiv*` / `_kursiv_` / `~~durch~~` / `` `code` `` / Links). Inhalt
  wird ausschließlich als **Textknoten** gerendert (nie als HTML geparst)
  → kein XSS; Links nur `http(s)`/`mailto`.
- **Download** über `/api/user-files/download` (Browser speichert die
  Datei) — auch für „Mit mir geteilte" Dateien.
- **Teilen** (Share-Icon): Auswahl aus `/api/user-files/share-targets`
  (Alle/Klasse-Personen), Speichern via `/api/user-files/share`.
- **Löschen** (Papierkorb-Icon): nur eigene Dateien (Admin: alle).
- Vollständig **i18n** (DE/EN), Hell-/Dunkel-Modus (Vorschau-Flächen
  nutzen `--color-surface-modal`/`--color-surface-field`), Icons im
  Vorschau-Header 16×16.

### Migration & Daten

- `prisma/migrations/20260920120000_user_file` (Tabelle `user_file`:
  `id`, `user_id` (Owner, ohne FK), `filename`, `type`, `extension`,
  `sha256`, `sizeBytes`, `created_at`/`updated_at`, Index auf `user_id`)
- `prisma/migrations/20260920150000_user_file_share` (Tabelle
  `user_file_share`: `file_id` → `user_file` (Cascade), `scope_type`,
  `scope_id`; Indizes auf `file_id` und `(scope_type, scope_id)`)

### Verifikation

- `npm run tsc2` → 0 Fehler; `npm run build` → ESM Server + Client-Bundle.
- Live-Tests gegen localhost:5000 (Admin/Lehrer/Schüler-Sessions):
  - Upload (PUT, Multipart) → Datei in Liste + `store/files/` ✓
  - Download: `attachment`-Header, Browser speichert korrekt ✓
  - Preview: Bild/Audio/Video/PDF/Text/Markdown/ODT; Markdown-Datei rendert
    (z. B. `TiddlyWiki-Setup.md`) strukturell korrekt, kein HTML-Injekt ✓
  - ODT-Vorschau: hochgeladene `.odt` (Dateiname mit Leerzeichen) rendert
    in der sandboxed iframe — Überschrift + Tabelle erscheinen im
    `srcdoc`, die iframe-Breite folgt der Detailfläche
    (`odt-preview-document { width: 100% }`) ✓
  - Admin-Besitzer-Spalte: Admin-Session zeigt in „Meine Dateien" alle
    Dateien mit Owner-Username (z. B. „Schüler 2"); über den
    String-Tag-Mount `<mws-user-files admin>` verifiziert ✓
  - Range: `Range: bytes=…` → 206 + `Content-Range`, ungültig → 416 ✓
  - Teilen: berechtigte Empfänger sehen die Datei, nicht geteilte →
    404; Lehrer sehen Lehrer-Freigaben anderer Lehrer nicht ✓
  - Löschen entfernt die Zeile und, sobald kein Verweis mehr existiert,
    auch die Bytes ✓

---

## 45. Feature: Datei-Upload direkt im Wiki (landet beim Wiki-Besitzer)

**Ziel:** Jedes Wiki bekommt in seiner Werkzeugleiste einen Button
**„Upload file"**. Ein Klick lädt eine Datei in den **Dateispeicher des
Wiki-Besitzers** (`recipe.owner_user_id`), nicht in den des
Hochladenden: Öffnet z. B. ein Lehrer ein Wiki, das einem Schüler/einer
Kollegin gehört, und hat dort **Schreibzugriff**, landet die Datei in
„Meine Dateien" des Besitzers. Ohne Wiki-Kontext (kein `recipe`-Parameter)
bleibt der Upload wie bisher beim eigenen Konto (§44).

### Frontend

**Dateien (neu):** `plugins/client/tiddlers/upload-file.js`
(Startup-Modul), `plugins/client/tiddlers/status/upload-file-button.tid`
(Button in `$:/tags/PageControls`), `plugins/client/tiddlers/status/icon-upload.tid`;
Texte in `plugins/client/tiddlers/en-US.multids`.

- Der Button dispatcht `tm-upload-file`; das Startup-Modul lauscht am
  Root-Widget. Nicht eingeloggt (`$:/status/IsLoggedIn ≠ yes`) → Hinweis
  „You must be logged in to upload files".
- Eingeloggt: verstecktes `<input type=file multiple>`; jede gewählte
  Datei wird **sequenziell** per Multipart-`PUT` an
  `api/user-files/upload?recipe=<slug>` gesendet (`X-Requested-With:
  fetch`). Der Slug stammt aus `$:/config/multiwikiclient/recipe`.
- Notifier: eigener Upload → „Uploaded "X" to your files"; fremdes Wiki →
  „Uploaded "X" to <Besitzer>'s wiki"; fehlendes Schreibrecht → „You do
  not have write access to this wiki"; über Limit → 413-Meldung; sonst
  generischer Fehler.

### Backend

**Datei:** `packages/mws/src/new-managers/UserFileRoutes.ts`
(Route `/api/user-files/upload`, jetzt mit `zodQueryKeys: ["recipe"]`).

- Optionaler Query-Parameter `recipe`: `RecipeResolver.assertRecipe`
  löst das Wiki auf; Schreibrecht gilt bei **Admin**, **Wiki-Besitzer**,
  `B_write` auf der Recipe **oder** Schreibrecht auf einem writable Bag
  (`RecipeResolver.canWriteBag`). Sonst **403** mit
  `x-reason: no write access to this wiki`.
- Ziel-Owner = `recipe.owner_user_id` (Fallback: Hochladender). Dieser
  Wert landet in `user_file.user_id` **und** im `meta.json` der Bytes.
- Antwort: `{ file, owner: { user_id, username } }` — der Client nutzt
  `owner.username` für die Notifier-Formulierung.
- Ohne `recipe`-Parameter unverändertes Verhalten (Datei beim
  Hochladenden).

### Verifikation

- `npm run tsc2` → 0 Fehler; Server-Bundle via `tsup` neu gebaut.
- E2E (zweite Instanz auf `:5001`, Admin öffnet `wiki-schuler-2` von
  „Schüler 2"): Klick auf „Upload file" → `PUT …/upload?recipe=wiki-schuler-2`
  → **200**, Antwort `owner.username = "Schüler 2"`; Notifier „Uploaded
  "klassenfoto.txt" to Schüler 2's wiki"; `user_file.user_id` = Schüler 2,
  Bytes unter `store/files/<sha256>/`. Testdatei danach über
  `/api/user-files/delete` entfernt (Zeile + Bytes weg) ✓
- Der laufende Dev-Server auf `:5000` muss nach dem Build neu gestartet
  werden (Node hält das alte Bundle im Speicher).

---

## 46. Übersetzung: MWS-Client-Texte folgen automatisch der Wiki-Sprache

### Befund

- Alle MWS-Client-Strings sind übersetzbare Tiddler mit dem Titel
  `$:/language/MWS/...`. Sie werden als **Shadow-Tiddler** vom Plugin
  `$:/plugins/mws/client` mitgeliefert und sind in
  `plugins/client/tiddlers/en-US.multids` nur auf Englisch definiert.
- Das Core-Sprachplugin (`$:/languages/de-DE`) übersetzt ausschließlich
  Core-Strings, **nicht** die `MWS/...`-Keys. Ein Automatik-Fallback auf
  `de-DE` existiert daher nicht; `$tw.language.getString(title)` schlägt nur
  `$:/language/<title>` nach.
- Ein normaler Wiki-Tiddler mit gleichem Titel (`$:/language/MWS/...`)
  **überschreibt** den Shadow; `$tw.wiki.isShadowTiddler(title)` bleibt dabei
  `true`. Damit ist die Übersetzung rein datenseitig möglich — ohne Code.

### Automatik (umgesetzt)

`plugins/client/tiddlers/language.js` ist ein `module-type: startup`-Modul. Es
sammelt beim Start alle übersetzten Strings über
`[all[shadows+tiddlers]prefix[$:/plugins/mws/client/i18n/]]` (Shadows sind im
Standard-`prefix[]`-Quellfilter nicht enthalten — deshalb der explizite
Quellant). Jede Übersetzungsdatei `tiddlers/i18n/<code>.multids` erzeugt so
Shadow-Tiddler `$:/plugins/mws/client/i18n/<code>/<key>`; der Code wird aus
dem letzten `$:/language`-Pfadsegment abgeleitet (kleingeschrieben, `_`→`-`).
Auflösung: erst exakter Code (`de-DE` → `de-de`), dann Primärsprache
(`de-DE` → `de`, `zh-Hans`/`zh-CN`/`zh_CN` → `zh`). Bei Treffer schreibt das
Modul echte Tiddler `$:/language/MWS/<key>` mit dem übersetzten Text; ein
`change`-Listener auf `$tw.wiki` wendet die Sprache erneut an, sobald
`$:/language` eintrifft oder umgestellt wird.

Wichtig: Beim Umschalten auf eine nicht unterstützte Sprache (bzw. Englisch)
wird **nicht** gelöscht (`deleteTiddler` hinterlässt eine leere Hülle
`{title, type}` statt den Shadow sichtbar zu machen), sondern der englische
Text wird aus einem Start-Snapshot der Shadows explizit geschrieben. Reale
Tiddler `$:/language/MWS/...`, die beim Start bereits existieren, gelten als
pro-Wiki-Override und werden nie angefasst.

Bereits geliefert: `de`, `ru`, `es`, `fr`, `ja`, `ko`, `zh` (Englisch liefert
die `en-US.multids`-Shadows als Quelldatei). Eine weitere Sprache ergänzt man
durch eine neue Datei `tiddlers/i18n/<code>.multids` mit den gleichen Keys.
Das Client-Plugin liefert keine feste Sprache mit — jedes Wiki entscheidet
selbst über sein `$:/language` (ohne `$:/language` bleibt es Englisch).

Damit die injizierten Overrides nicht über den Syncer zurück zum Server
geschrieben werden, schließt der Sync-Filter `$:/language/MWS/` aus:
`$:/config/SyncFilter` endet auf `-[prefix[$:/language/MWS/]]`
(`plugins/client/tiddlers/syncer/config-sync-filter.tid`).

### String-Set (23 Keys)

`BagInfo/Heading`, `Login/ServiceName`, `SaveWiki/{ButtonCaption,
ButtonTooltip}`, `Sidebar/ConnectionStatus`, `Syncer/{CopyLogs, LoggedIn,
LoggedInAs, Login, Logout, ReadOnly, Refresh, RefreshTooltip, SaveSnapshot}`
sowie `UploadFile/{ButtonCaption, ButtonTooltip, Description, ResultSuccess,
ResultSuccessToWiki, ResultError, ResultNotLoggedIn, ResultNoWikiWriteAccess,
ResultTooLarge}`. Alle acht Sprachdateien verwenden dieselbe Key-Menge
(Verifikation per Skript in der Testphase). Die Buttons „Serverstatus",
„Server anmelden/abmelden", „Aktualisieren", „Momentaufnahme", „Protokolle
kopieren", der Anmelde-Status und der Logindialog lesen ihre Strings über
`{{$:/language/MWS/...}}` bzw. `syncer.getLoginServiceName()` aus
`$:/language/MWS/Login/ServiceName` (`syncer.js`); nur noch
`GettingStarted.tid` bleibt bewusst Inhalt und wird nicht übersetzt.

### Wiki-Eigentümer im Button-Text (`<<owner>>`)

Der Upload-Button heißt nicht mehr neutral „Datei hochladen", sondern nennt den
Eigentümer: „Eine Datei für Schüler 2 hochladen". Dazu liefert der Server beim
Kompilieren einen realen Konfig-Tiddler `$:/config/multiwikiclient/owner` mit
dem `username` des Recipe-Eigentümers aus (`RecipeIndexSender.ts`,
`writeFinalTiddlers`; gelesen in `serveWikiIndex`). Die MWS-Client-Übersetzungen
`UploadFile/{ButtonCaption, ButtonTooltip, Description}` enthalten den
Platzhalter `<<owner>>`.

Ersetzt wird der Platzhalter in `language.js`: Beim Schreiben der realen
`$:/language/MWS/...`-Tiddler wird `<<owner>>` durch den Owner-Namen ersetzt
(und Doppel-Leerzeichen entfernt, wenn kein Owner bekannt ist, z. B. im
Docs-Wiki `mws-docs`). Das ist nötig, weil TiddlyWiki in Attributwerten
(`tooltip=`, `aria-label=`) Transklusionen nicht als Wikitext auflöst —
`<<owner>>` als Makro in einer Shadow-Transklusion bliebe dort literal stehen.
Da `$:/config/multiwikiclient/owner` erst mit dem Server-Sync eintrifft, lauscht
`language.js` zusätzlich auf dessen Änderung und schreibt die Strings nach.

### Warum nicht über das Template?

Der naheliegende Weg — ein gemeinsamer `readonlyBags`-Bag im Template, damit
alle Wikis erben — ist hier **nicht** möglich:

- `compileRecipeSimpleV1` würde die `readonlyBags` zwar in jedes Recipe
  übernehmen (`TabUpserts.ts:519`), aber das `Blank Template` ist absichtlich
  unveränderlich: Beim Speichern über die Admin-API wird bei `isDefault` die
  bestehende `definition` beibehalten und `readonlyBags` ignoriert
  (`TabDataAdapter.ts:546`), abhängige Recipes werden nicht neu kompiliert.
- In einen Readonly-Bag lässt sich über die Wiki-API nicht schreiben
  (`RecipeResolver.saveTiddlers` zielt nur auf den schreibbaren Bag,
  `RecipeResolver.ts:330`).
- Alle 17 Wikis nutzen dieses Default-Template; `AdminCreateWiki` verwendet es
  fest (`TabDataAdapter.ts:1419`).

### Verworfen: forcierte deutsche Overrides

Ein früherer Ansatz bündelte Deutsch fest (Start-Tiddler für neue Wikis via
`wiki-language-defaults.ts` + `.multids`, plus einmaliges Einspielen in den
Bestand). Das zwang allen Wikis Deutsch auf und ist ersetzt durch die
Automatik oben; `wiki-language-defaults.ts` und `translations/de-DE.multids`
sind entfernt, ebenso die zuvor in den Bestand geschriebenen Tiddler.

---

## 47. Security-Umbau „C" (Namespace-Partition C1 + Vertrauensgrenzen C2 + Meine-Bereiche C3)

**C1 · Namespace-Partition pro Owner (Squatting-Schutz):**

- Standard-Bag eines Wikis heißt jetzt `editions/<owner-id>/<slug>` statt
  `editions/<slug>` (`defaultBagName` in `TabDataAdapter.ts`). Damit ist
  der persönliche Namensraum kollisionsfest: Kein anderer Nutzer kann das
  Bag vorab anlegen, auf das das Wiki beim Speichern angewiesen ist
  (vorher: Lehrer legte `editions/<schueler-slug>` an → Schüler erhielt
  rätselhafte 403er).
- **URL bleibt unverändert** (`/wiki/<slug>`): Die Namensraum-Id steckt
  nur im internen Bag-Namen, nicht im Public-Slug. System-Wikis ohne
  Owner (`mws-docs`, `bedienungsanleitung`) behalten `editions/<slug>`.
- `name` bleibt global `@unique`; es ist **keine** Prisma-Schema-Migration
  nötig (kein `@@unique([owner_user_id, name])`, keine NULL-Owner-Falle).
- Bestandsdaten migrieren:

  ```
  node scripts/c1-namespace-migrate.mjs            # dev store
  node scripts/c1-namespace-migrate.mjs --dry-run  # nur anzeigen
  node scripts/c1-namespace-migrate.mjs --db <pfad>
  ```

  Das Skript benennt persönliche Standard-Bags um, schreibt die Bag-
  Referenzen in allen `recipe.definition`/`template.definition`-JSONs neu
  (Bag-IDs, Tiddler, Permissions und RecipeBag-Verknüpfungen bleiben
  unangetastet) und ist idempotent. Es bereinigt zusätzlich den alten
  Bug-Owner `"undefined"` (aus §44-Ära) zu `NULL`.
- Slug-Umbenennung folgt mit (`followDefaultBagOnSlugRename`, siehe §13).

**C2 · Vertrauensgrenzen + CSP** (Bestand aus dem Umbau): Klassifikation
privat vs. kollaborativ (fremd-beschreibbare Bags), Warnung im Admin-UI,
CSP-Header auf Wiki-Seiten, Existenz-Orakel (`404` statt `403`).

**C3 · „Meine Bereiche"-UI** (Bestand aus dem Umbau): Gruppierung
„Meine Wikis / Für mich freigegeben / Klassenbereiche / System" +
Vertrauens-Label + Bag-Owner im Admin-UI.

---

## 47. Admin-App: Standard-Sprache und Theme fürs 1. Laden (`Einstellungen`)

**Ziel:** Der Betreiber legt installationsweit fest, in welcher Sprache und
in Hell oder Dunkel die Admin-App beim **ersten** Seitenaufruf ausgeliefert
wird — und welche Features für alle sichtbar sind. Die eigene Wahl eines
Besuchers (Sprach-/Theme-Umschalter im Header, `localStorage`) behält bei
Sprache/Theme immer Vorrang — die Vorgabe ist nur der Fallback.

**Ablage (server-seitig):** Keys in der `settings`-Tabelle, verarbeitet in
`packages/mws/src/new-managers/PrefsRoutes.ts` (`readPrefs`):

| Key | Bedeutung | Default |
|-----|-----------|---------|
| `admin.defaultLocale` | Sprache beim 1. Laden | Browser-Sprache |
| `admin.defaultTheme` | Hell/Dunkel beim 1. Laden | System-Theme |
| `admin.showPinboard` | Pinnwand-Tab (+ 30-s-Badge-Poll) | `true` |
| `admin.showUserFiles` | „Meine Dateien"-Tab | `true` |
| `admin.showWikiUpload` | „Upload file"-Button in der Wiki-Werkzeugleiste (§45) | `true` |
| `admin.showLocaleSelect` | Sprach-Dropdown im Header | `true` |
| `admin.showThumbnails` | Vorschaubild-Spalte in der Wikis-Liste (§43) | `true` |
| `admin.thumbnailTtlHours` | Vorschaubild-Cache-Zeit in Stunden (§43) | `null` (= 24 h) |
| `admin.showLanding` | Öffentliche Startseite (`/`) für anonyme Besucher (§48) | `true` |
| `admin.landingMessage` | Begrüßungstext auf der öffentlichen Startseite (Markdown) | `null` |
| `admin.landingNews` | Neuigkeiten auf der öffentlichen Startseite (Markdown) | `null` |

Bools werden als `"true"`/`"false"` gespeichert; ein fehlender Eintrag
bedeutet `true` (Rückwärtskompatibilität).

- `GET /api/prefs` — jeder eingeloggte Nutzer liest die aktuellen Vorgaben.
- `PUT /api/prefs` — nur `admin` (`state.okAdmin()`), Body enthält **alle**
  Felder: `{ defaultLocale: string|null, defaultTheme: "dark"|"light"|null,
  showPinboard: boolean|null, …, thumbnailTtlHours: number|null,
  showLanding: boolean|null, landingMessage: string|null,
  landingNews: string|null }`; `null`
  löscht die Vorgabe (→ Default). `thumbnailTtlHours` ist auf 1..2160
  (Stunden) begrenzt, `landingMessage` auf 2000 und `landingNews` auf 10000
  Zeichen.

**Abhängigkeit:** „Dateien aus Wikis hochladen" (2.1) erfordert „Meine
Dateien": Ist `showUserFiles` aus, ist der Switch 2.1 auf der
Einstellungen-Seite ausgegraut (`is-disabled`-Row, Hinweis „Erfordert
'Meine Dateien'."), und serverseitig werden **beide** Keys als
Upload-Erlaubnis gewertet (`isWikiUploadEnabled`: `showWikiUpload &&
showUserFiles`, oben in `RecipeIndexSender.ts`).

**Auslieferung vor dem 1. Paint:** `serveIndex`
(`services/setupDevServer.ts`) liest die Prefs pro Request und injiziert sie
doppelt:
- als `prefs` in `window.embeddedServerResponse` (genutzt von `i18n.ts`
  `getCurrentLocale()` und `theme.ts` `getEffectiveTheme()` beim Start) und
- als kleines Objekt in `window.embeddedServerPreflight` in `index.html` —
  ein winziges Inline-`<script>` ganz oben im `<head>` setzt daraus
  `data-theme` (+ passenden Hintergrund) **bevor** das CSS greift, damit es
  keinen falschen Falsch-Flash gibt. `initializeTheme()` räumt das Inline-
  Hintergrund-Style-Objekt nach dem App-Start wieder weg.

Die Admin-HTML-Antwort geht mit `Cache-Control: no-store` raus (kein
Zwischenspeichern, kein Back-Forward-Cache), damit beim erneuten Öffnen
immer der aktuelle Stand geliefert wird. Zusätzlich holt die
Einstellungen-Seite beim Öffnen (`connectedCallback` → `GET /api/prefs`)
den aktuellen Stand nach und setzt die Auswahlfelder entsprechend —
die Anzeige spiegelt also immer die tatsächlich gespeicherten Werte.

**Auflösungsreihenfolge:**
- Sprache: `localStorage` (`mws.admin.locale`) → `prefs.defaultLocale` →
  `navigator.language` → `en`
- Theme: `localStorage` (`mws.admin.theme`) → `prefs.defaultTheme` →
  `prefers-color-scheme` (OS)

**UI:** ⚙-Button (`settings.svg`) im Header, nur für Admins sichtbar, öffnet
`/settings` (`app-settings.tsx`, Route in `main.tsx`). Zwei Auswahlfelder
(Sprache mit „Browser-Sprache folgen", Theme mit „System-Theme folgen") sowie
ein Abschnitt **„Funktionen"** mit sechs Schaltern (Pinnwand, Meine Dateien,
Aus-Wikis-Hochladen, Sprachwahl anzeigen, Vorschaubilder, Öffentliche
Startseite) + Zahlenfeld „Vorschaubild-Cache-Zeit (Stunden)" (leer = Standard
24 h) + zwei Markdown-Textfelder „Landing welcome message" / „Landing news"
+ Speichern-Button.
Nicht-Admins sehen die Seite schreibgeschützt mit dem Hinweis „Nur
Administratoren …". Die Funktions-Schalter gelten installationsweit (ein
persönliches Ausblenden pro Nutzer ist bewusst nicht vorgesehen — im
Einzelnutzer-Betrieb ist der Betreiber gleichzeitig der Nutzer).

**Anwendung der Schalter (Client):** In `app.tsx` liest `featurePref(name)`
die Prefs aus `embeddedServerResponse.prefs`: Pinboard-/Dateien-Tab und
deren Panels werden ausgeblendet, der Pinboard-Poll startet nur bei
aktivem Pinboard, das Sprach-`<select>` im Header entfällt, und die
Thumbnail-Spalte wird aus `listColumns` gefiltert. Im Wiki bleibt der
„Upload file"-Button serverseitig verborgen: `RecipeIndexSender` schreibt
bei deaktiviertem Wiki-Upload den Config-Tiddler
`$:/config/multiwikiclient/hide-upload-file` (text `yes`) in den Store;
`upload-file-button.tid` versteckt den Button über `<$reveal state="..."
type="nomatch" text="yes">`, und `upload-file.js` registriert den
`tm-upload-file`-Listener dann gar nicht erst. Neue i18n-Keys (23) in allen
8 Sprachen (Sektion `#region admin settings`).

---

## 48. Feature: Öffentliche Startseite (`/`) für anonyme Besucher

**Ziel:** Wer den Server ohne Login aufruft, landet nicht mehr direkt auf dem
Login-Formular, sondern auf einer einladenden Startseite mit Hero-Text,
Statistik-Kacheln, der Liste der öffentlich lesbaren Wikis (mit
Vorschaubildern) und — optional — einem Begrüßungstext und News-Block des
Betreibers. Der Login-Button („Log in") führt zum gewohnten Formular.
Der Admin kann die Startseite per Schalter abschalten (dann greift wieder der
bisherige Redirect nach `/login`).

### Backend

- **`GET /api/landing`** — öffentlich (`securityChecks.requestedWithHeader:
  false`), kein Login nötig. Liefert:
  - `versions`: `{ mws, tw5[] }` (Versions-Ecke im Footer),
  - `stats`: `{ publicWikis, tiddlers, users, online }` — `online` = aktive
    Sessions mit `last_accessed` < 15 min (throttled Touch in §sessions),
  - `wikis`: `[{ slug, displayName, description }]` — **nur** Wikis, deren
    Rezept **und** alle Bags dem ANON-Lesezugriff erlauben
    (gleicher Filter wie das `assertRecipe`-Read-Gate; private Wikis werden
    nicht geleakt, auch nicht als Name). Der Owner kann ein öffentlich
    lesbares Wiki zusätzlich von der Startseite nehmen (§ „Pro-Wiki-Sichtbarkeit"),
  - `message` / `news`: die Prefs `admin.landingMessage` / `admin.landingNews`.
  - Routen-Registrierung in `new-managers/index.ts` (`LandingData`).
  - Implementierung: `packages/mws/src/new-managers/LandingRoutes.ts`.

- **Pro-Wiki-Sichtbarkeit auf der Startseite:** Pro Wiki steuert eine
  Checkbox im **Wiki-Editor** (Feld `landingVisible`, Gruppe „Landing page"),
  ob ein öffentlich lesbares Wiki anonymen Besuchern angezeigt wird. Die
  Checkbox erscheint nur, solange `ANON` unter den Readers (`recipeUsers`)
  steht — ist das nicht der Fall, wird stattdessen ein Hinweis gerendert.
  Kein Template-Fork nötig: Templates sind reiner Startinhalt, die
  Sichtbarkeit ist eine reine Wiki-Einstellung. Speicherung als
  `landing.hidden.<recipeId>` = `"true"` in der `settings`-Tabelle (Zeile
  fehlt ⇒ Standard „anzeigen"); geschrieben/gelesen in
  `new-managers/TabDataAdapter.ts` (`saveRow` upsert/delete, `getList`
  invertiert in `landingVisible`, `AdminDeleteWiki` räumt die Zeile ab).
  `GET /api/landing` filtert diese aus `wikis` und `stats.publicWikis`
  heraus. Die Änderung wird mit dem regulären „Änderungen speichern" des
  Editors persistiert. Ein dedizierter `/api/landing/wikis`-Endpunkt
  existiert nicht mehr (entfernt, zusammen mit dem `/settings`-Bereich).

- **Anon-Thumbnails nur aus dem Cache:** `WikiThumbnailRoutes` dient
  Vorschaubilder für anonyme Besucher nur noch aus dem existierenden
  Thumbnail-`<canvas>`-Snapshot aus (`store/thumbnails/<slug>.png`); ein
  serverseitiges **Rendern des Wikis für Anon ist ausdrücklich untersagt**
  (DoS-Schutz). Eingeloggte Nutzer rendern wie gehabt. Die Rezept-Prüfung
  (`assertRecipe`) gilt für alle — privates Wiki ⇒ `404` für Anon.

- **`last_accessed`-Touch:** `sessions.ts` aktualisiert `last_accessed` jetzt
  throttled (~5 min) in `parseIncomingRequest`, damit der Online-Zähler
  stimmt, ohne bei jedem Request auf die DB zu schreiben.

### Frontend

- **Routing (`main.tsx`):** Anonym + `prefs.showLanding !== false` + Pfad
  `/` ⇒ `new LandingPage()`. Alle übrigen Pfade (und Anon mit abgeschalteter
  Startseite) verhalten sich wie bisher (Redirect zu `/login`).
- **`app-landing.tsx` (neu):** Header (Branding + Theme-Umschalter +
  Sprachauswahl + „Log in"), optionaler Willkommens-`message`, vier
  Statistik-Kacheln (Tiddler total, öffentliche Wikis, Nutzer, Online),
  Sektion „Öffentliche Wikis" als Kartenraster mit `image`-Thumbnails
  (Fallback-Gradient wenn kein Bild), optionaler `news`-Block und ein
  Versions-Footer („MWS {version}" / „TiddlyWiki {version}" + Link zu den
  TiddlyWiki-Docs). Markdown im `message`/`news` wird nach dem
  `escapeHtml`-Muster gerendert (Headings, Listen, Blockquote, Code,
  Links — XSS-sicher, da roher HTML-Ausgabe zuerst escapt wird).
  Beim Laden ruft sie `GET /api/landing`; Fehler ⇒ „The overview could not
  be loaded."
- **Einstellungen (§47):** Schalter „Show the public landing page" +
  zwei Textfelder „Landing welcome message" / „Landing news" (Markdown,
  max. 2000 / 10000 Zeichen). Schalter aus ⇒ anonyme `/`-auflösung entfällt.
  Der frühere Bereich „Public wikis on the landing page" wurde entfernt —
  die Pro-Wiki-Sichtbarkeit ist in den Wiki-Editor gewandert (§ „Pro-Wiki-
  Sichtbarkeit").
- **i18n:** neue Keys 21 in allen 8 Sprachen (Sektionen `#region admin
  settings` und `#region landing page`); später −4 Settings-Keys der
  Pro-Wiki-Sichtbarkeit +3 Editor-Keys („Landing page", Callout, Hinweis)
  und +2 für die `/landing`-Vorschau („Public start page",
  „Back to the wiki overview"). Aktuelle Parität: 521 Keys.
- **`/landing`-Route (eingeloggt die Startseite sehen):** Eingeloggte landen
  auf `/` in der Verwaltung. Eine eigene Route `/landing` rendert dieselbe
  öffentliche Startseite für anonyme **und** eingeloggte Besucher. Wichtig:
  `/api/landing` löst die ANON-Rolle login-unabhängig aus der
  `roles`-Tabelle auf (nicht aus `state.user.roles` — ein eingeloggter
  Nutzer trägt keine ANON-Rolle, sonst war die Liste leer). Im
  Verwaltungs-Header erscheint ein Globe-Button „Öffentliche Startseite"
  (nur wenn `showLanding` aktiv ist), der `/landing` im selben Fenster
  öffnet — exakt die Anonym-Vorschau. Auf der Landing zeigt der Header bei
  eingeloggten Nutzern „Zurück zur Wiki-Übersicht" statt „Log in".

### Verifikation

- `GET /api/landing` anonym: 200 mit 8 öffentlichen Wikis, Stats (Tiddler
  1127, 6 Nutzer, online 0 ohne aktive Sessions), Versions, `message`/`news`
  aus den Prefs.
- Anonym `GET /` headless: rendert Landing (Stat-Kacheln, Wiki-Karten,
  Thumbnails via `/wiki/<slug>/thumbnail`), kein Redirect nach `/login`.
  Wiki-Karten öffnen mit `target="_blank" rel="noopener noreferrer"`.
  Mit `showLanding=false` (per `PUT /api/prefs`) ⇒ `/` leitet wieder nach
  `/login`; danach zurückgesetzt auf `true`.
- `/landing` headless: anonym ⇒ Landing mit „Log in"-Button; eingeloggt
  (Admin-Session) ⇒ Landing mit „Zurück zur Wiki-Übersicht"; Verwaltungs-
  Header zeigt den Globe-Link `href="/landing"`, der im selben Fenster
  zur Landing navigiert.
- Anon-Thumbnail `/wiki/bedienungsanleitung/thumbnail` ⇒ `200 image/png`
  (nur Cache); willkürliches privates Wiki ⇒ `404`.
- Eingeloggter Admin (`/settings` headless): Schalter + beide Textfelder
  sichtbar und bedienbar; `PUT`/`GET`/DB-Zeilen für die 3 neuen Keys
  verifiziert (`null` löscht die Zeile), Werte danach auf den
  Ausgangszustand zurückgesetzt.
- Pro-Wiki-Sichtbarkeit (Wiki-Editor, Admin headless): „Landing page"-
  Schalter nur bei `ANON` in Readers; AUS + speichern ⇒ `settings`-Zeile
  `landing.hidden.<recipeId>`=`"true"` und `GET /api/landing` zeigt 7
  (Wiki + Zähler weg), AN + speichern ⇒ Zeile verschwindet, 8. Privates
  Wiki ohne ANON ⇒ Callout statt Schalter. `/settings` ohne den alten Bereich.
- `tsc` (admin-vanilla) + `tsc2` (Root) grün; Locale-Parität 521/521.

---

## 49. Repo: Docker-Support entfernt

**Ziel:** Dieser Fork wird nicht als Container ausgeliefert. Die
Docker-Dateien waren damit tote Last — und laut Prüfung nicht bloß
ungenutzt: vier unabhängige Defekte hätten dafür gesorgt, dass eine
Docker-Installation das falsche Produkt liefert, gar nicht startet oder
Daten verliert.

### Befunde

- **Das Image lief das Upstream, nicht den Fork.** `Dockerfile:6`
  installierte `npm install @tiddlywiki/mws@latest -g` — den
  *Upstream*-Paketnamen —, während der Kommentar darüber
  "(wikiwise fork)" behauptete. Ein Image für diesen Fork wurde
  ohnehin nie veröffentlicht: `.github/workflows/ghcr.yml:18` knüpfte
  den Publish-Job an `github.repository ==
  'TiddlyWiki/MultiWikiServer'`, lief in
  `heino17/MultiWikiServer-wikiwise` also nie.
- **Auch `DOCKER.md` zeigte auf das Upstream.** Der Quick-Start holte
  Compose-Datei und Dockerfile per `curl` aus
  `raw.githubusercontent.com/TiddlyWiki/MultiWikiServer/main/…` — wer
  der Doku folgte, bekam Upstream-MWS ohne ein einziges Fork-Feature.
- **Beide Compose-Dateien verweigerten den Start.** `ENTRYPOINT ["mws"]`
  zusammen mit `command: ["npx", "mws", "listen", …]` ergibt
  `mws npx mws listen …`; `runCLI.ts:42` liest den Befehlsnamen aus
  `process.argv[2]`, der Prozess beendet sich mit `Command "npx" not
  found` (lokal reproduziert). `docker run` mit dem CMD des Images
  funktionierte, `docker compose up` nie.
- **Die Mounts verloren Daten.** Persistiert wurde nur `/data/store`,
  Backups landen aber in `backups/<timestamp>/` *neben* `store`
  (`BackupRoutes.ts:29-31`), und `passwords.key` liegt im
  Instanz-Wurzelverzeichnis (`startup.ts:89`). Im Volume-Modus landeten
  die Backups im Container-Layer, im Directory-Modus tauchten sie
  überhaupt nicht auf dem Host auf; beides ist nach `down`, Neuerzeugung
  oder Update weg. `passwords.key` geht genauso verloren, womit jedes
  Nutzerpasswort unbrauchbar wird.
- **Thumbnails können im Image nicht funktionieren.** `findChromium()`
  durchsucht `MWS_CHROMIUM_PATH`, `CHROME_PATH`, den Playwright-Cache,
  `/usr/bin/chromium(-browser)` und `/snap/bin/chromium`;
  `node:24-alpine` bringt keinen Browser mit, jede
  Wiki-Vorschau-Anfrage schlägt fehl.
- Dazu zwei Doku-Fehler: `DOCKER.md:194` behauptete Node 22 Alpine, das
  Image ist `node:24-alpine`, und `ghcr.yml:57` übergab
  `build-args: MWS_VERSION=…`, obwohl das Dockerfile kein `ARG` dieses
  Namens deklariert. `DOCKER.md:58` vermerkte selbst, dass Dateien und
  Seite von GitHub Copilot geschrieben und von niemandem getestet
  wurden, der Docker kennt.

### Entfernt

- `Dockerfile`, `docker-compose.volume.yml`,
  `docker-compose.directory.yml`
- `DOCKER.md`
- `.github/workflows/ghcr.yml`

### Verifikation

- Nach der Entfernung keine Referenz auf `docker` oder `ghcr` in
  eigenen Dateien mehr; der Docker-Block war geschlossen, nichts anderes
  zeigte darauf.
- Das `files`-Array in `package.json` (Inhalt des npm-Pakets) enthielt
  keine der entfernten Dateien, das Packaging ist unverändert.
- `ci.yml` und `.github/scripts/build-mws-site.sh` unberührt; die
  native Installation aus der README ist nicht betroffen.

---

## 50. Fix: Der Fork war überhaupt nicht installierbar

**Ziel:** Die README ließ alle `npm init @tiddlywiki/mws@latest my-folder`
ausführen. Dieser Befehl installiert nicht den Fork – und bei der Prüfung,
was er tatsächlich erzeugt, kamen zwei Fehler zum Vorschein, die eine
Neuinstallation von vornherein unmöglich machten.

### Befund: Der Schnellstart installierte das Upstream

- `npm view @tiddlywiki/mws version repository.url` liefert
  `0.2.5` und `git+https://github.com/TiddlyWiki/MultiWikiServer.git`, also
  das **Upstream**-Paket. Dieser Fork ist nicht auf npm, und unter
  demselben Namen kann er es auch nie sein: Die Root-`package.json` heißt
  ebenfalls `@tiddlywiki/mws`.
- Ein Testlauf des dokumentierten Befehls erzeugte eine funktionierende
  Instanz – mit den zwei Upstream-Migrationen (`20260708160259_init`,
  `20260731035054_rb_pk`) und ohne ein einziges Fork-Feature. In den beiden
  Bundles kommt die Zeichenkette `ANON` (Fork, §4) 15-mal im Fork und
  **0-mal** in Upstream 0.2.5 vor.
- Der Mechanismus steckt in npm selbst: `npm init <pkg>` schreibt den
  Namen zu `create-<pkg>` um (`npm/lib/commands/init.js:117`), der Befehl
  führt also `@tiddlywiki/create-mws` aus, und dessen `create.js:44`
  installiert `@tiddlywiki/mws@latest` aus der Registry. Der Fork kann
  keinen der beiden Namen veröffentlichen, es gibt also bis zu einer
  Veröffentlichung unter eigenem Namen keine Ein-Zeilen-Installation.
  `create-package/` ist ohnehin nicht Teil des veröffentlichten Pakets
  (steht nicht in `files`).

### Fehler 1: Eine frische Datenbank war nicht initialisierbar

`npx mws init-store` auf einem leeren Store brach mit
`DriverAdapterError: ColumnNotFound` beim Anwenden von
`20260916_email_nullable` ab: Diese Migration baut die Tabelle `users` neu
und selektiert `owner_user_id`, doch die offizielle Init-Migration
`20260708160259_init` legt die Spalte nie an. Datenbanken, die es vor der
ersten Fork-Migration gab, hatten die Spalte bereits – deshalb fiel der
Fehler nur bei Neuinstallationen auf.

- Neue Migration `prisma/migrations/20260915_owner_user_id/migration.sql`
  ergänzt die Spalte in allen fünf Tabellen, die sie verwenden: `users`,
  `roles`, `bag`, `recipe`, `template`. Einfache nullable `TEXT`-Spalten,
  kein Index, kein Fremdschlüssel, genau wie in `schema.prisma`.
- Ein Spalten-für-Spalten-Vergleich der migrierten frischen Datenbank
  gegen `schema.prisma` findet jetzt keinen Unterschied mehr; vor dem Fix
  fehlten fünf Spalten.

### Fehler 2: `init-store` stürzte beim zweiten Wiki ab

`init-store` lädt zwei Wikis (`init-store.ts:96` und `:103`): die
Dokumentation und das fork-eigene `editions/bedienungsanleitung`. Letzteres
stand nicht im `files`-Array der `package.json`, im installierten Paket
existiert der Ordner also nicht, `loadWikiFolder` liefert keine Bags, und
`load-wiki-folder.ts:168` scheitert mit
`TypeError: Cannot read properties of undefined (reading 'bagName')`.

- `files` enthält jetzt `editions/bedienungsanleitung/tiddlers` und
  `editions/bedienungsanleitung/tiddlywiki.info`. Das 2,5 MB große
  Build-Artefakt `output/index.html` bleibt außen vor.
- Der Runner in `init-store.ts` überspringt einen Wiki-Ordner, der nicht
  zur Installation gehört, und sagt das, statt den ganzen Befehl
  abstürzen zu lassen.

### Packaging: `prepare`

Eine Installation des Forks über eine Git-URL oder das Packen erzeugte ein
Paket ohne `dist`, denn `/dist` steht in `.gitignore` und es gab kein
`prepare`-Skript – das Server-Bundle fehlte schlicht.

- Neues Skript `prepare` → `node scripts/scripts.mjs build:pack`, das bei
  Bedarf die `tools`-Abhängigkeiten installiert und den normalen Build
  ausführt. Es wird übersprungen, wenn `dist/mws.js` schon existiert, damit
  ein `npm install` im Arbeitsverzeichnis schnell bleibt. `npm run build`
  baut auf Bedarf neu.
- `ci.yml` ist nicht betroffen: Es baut die Dokumentations-Edition mit
  TiddlyWiki 5 und führt im Repository-Root kein `npm install` aus.

### Dokumentation

- `README.md` (beide Sprachen), `README_features.md` (beide Sprachen) und
  `editions/mws-docs/tiddlers/Installation.md` beschreiben jetzt den Weg
  des Forks: `git clone` → `npm install` → `npm start` für das
  Entwicklungs-Wiki, und `npm pack` plus Tarball-Installation für einen
  eigenen Datenordner. An jeder Stelle steht derselbe Hinweis, dass
  `@tiddlywiki/mws` auf npm das Upstream ist.

### Verifikation

Alles auf einem frischen Clone und einer frischen Instanz, nicht auf einem
bestehenden Store:

- `git clone` → `npm install` → `prepare` baut `dist/mws.js` (2,04 MB),
  Exit 0.
- `npm pack` → `tiddlywiki-mws-0.1.0.tgz`; das Tarball enthält die 55
  Dateien von `editions/bedienungsanleitung`, und `repository.url` zeigt auf
  den Fork.
- Instanz: `npm install <tarball>`, `npx mws update-tiddlywiki`,
  `npx mws init-store` → Exit 0, alle 9 Migrationen angewandt (inklusive der
  Fork-Migrationen `pinboard`, `user_file` und `roles_is_teacher`),
  Admin-Nutzer angelegt, beide Wikis geladen.
- `npx mws listen --listener` → `/`, `/admin` und
  `/wiki/bedienungsanleitung` antworten mit 200; `GET /api/landing`
  meldet `publicWikis: 1` mit der Anleitung, die öffentliche Startseite aus
  §48 listet sie also für anonyme Besucher.
- Vor den beiden Fixes endete dieselbe Folge in `ColumnNotFound` und
  danach im `bagName`-TypeError.

### Weiterhin offen

- Das lokale `main` liegt **72 Commits vor `origin/main`**: Keine Arbeit des
  Forks ist bisher auf GitHub, `npm install github:heino17/…` würde also den
  Fork ohne seine Funktionen installieren.
- Für eine echte Ein-Zeilen-Installation muss der Fork das Server-Paket und
  ein passendes `create-*`-Paket unter einem eigenen Namen veröffentlichen.
  Das erfordert eine Namensentscheidung und npm-Zugang;
  `create-package/create.js:44` verdrahtet weiterhin
  `@tiddlywiki/mws@latest` und muss dieser Entscheidung folgen.

---

## 51. Repo: Der Fork bekommt seinen eigenen Paketnamen `@mws/wikiwise`

**Ziel:** §50 endete mit der Frage, unter welchem Namen der Fork
veröffentlicht werden soll. Entschieden: `@mws/wikiwise`, dazu das
Init-Paket `@mws/create-wikiwise`, das `npm init` ausführt.

### Der Name

- Die Root-`package.json` hieß `@tiddlywiki/mws`, von Upstream geerbt. Der
  Name gehört dem TiddlyWiki-Projekt, und die Scope `@tiddlywiki` kann nur
  von dort publiziert werden – ein `npm publish` mit dem geerbten Namen ist
  also unmöglich.
- `@mws-wikiwise` ist überhaupt kein gültiger Paketname: npm akzeptiert nur
  `@scope/name` oder einen einfachen Namen und lehnt einen Namen, der mit
  `@` ohne Schrägstrich beginnt, mit `EINVALIDPACKAGENAME` ab. Das fiel beim
  Installieren des gepackten Tarballs auf. `@mws/wikiwise` behält die Scope,
  die der Fork mit `@mws/admin-vanilla` ohnehin schon nutzt.
- Geändert: Root-`package.json` → `@mws/wikiwise`, `tools/package.json` →
  `@mws/tools` (trug den Namen der Root und zeigte mit `repository` auf das
  Upstream; ist jetzt `private`), `create-package/package.json` →
  `@mws/create-wikiwise`, dazu `package-lock.json`.
- Die Workspace-Pakete behalten ihre internen Namen
  (`@tiddlywiki/server`, `@tiddlywiki/events`, `@mws/admin-vanilla`, …). Sie
  werden nach `dist` gebündelt und nie aus der Registry installiert; ein
  Umbenennen wäre nur zusätzlicher Churn.
- `create-package/create.js` installierte `@tiddlywiki/mws@latest` und legte
  `npm init @tiddlywiki/mws@latest` nahe; beides nennt jetzt
  `@mws/wikiwise`, sodass `npm init @mws/wikiwise@latest <ordner>` einen
  Ordner mit dem Fork darin anlegt.

### Version 0.3.0

- Die Serverversion war `0.1.0` – *niedriger* als die `0.2.5` des Upstreams,
  was für einen funktional weiter entwickelten Fork irreführend ist. Sie ist
  jetzt `0.3.0`, damit die eigene Nummerierung des Forks eindeutig hinter der
  0.2.x-Linie des Upstreams liegt.
- Die Vorlage für den **Datenordner** bleibt bewusst bei `0.2.0`.
  `packages/mws/src/index.ts:79` verlangt, dass die `package.json` des
  Datenordners mit `0.2` beginnt, und jede bestehende Installation trägt
  `0.2.x`. Ein Anheben der Vorlage auf `0.3.0` hieße, diese Prüfung zu
  lockern, und jeder bestehende Store mit `0.2.x` müsste weiterhin
  akzeptiert werden. Serverversion und Datenordner-Version sind unabhängig
  voneinander: `ServerState.ts:66` liest die Serverversion aus der
  Root-`package.json`, das Gate sieht nur den Datenordner an.
- `create-package` steht auf `0.1.0`, seiner ersten Veröffentlichung unter
  eigenem Namen.

### Dokumentation

- `README.md` (beide Sprachen), `README_features.md` (beide Sprachen),
  `editions/mws-docs/tiddlers/Installation.md` und
  `create-package/README.md` nennen das neue Paket und den neuen
  Tarball-Namen. npm benennt den Tarball eines Scoped-Pakets
  `scope-name-version`, `npm pack` erzeugt also `mws-wikiwise-0.3.0.tgz`.

### Verifikation

Frischer Clone, frische Instanz, mit dem umbenannten Paket:

- `npm install` → `prepare` baut `dist/mws.js`; `npm pack` erzeugt
  `mws-wikiwise-0.3.0.tgz` (3,47 MB).
- Instanz: `npm install <tarball>` → Exit 0, die Abhängigkeit der Instanz
  ist `@mws/wikiwise`, `repository.url` zeigt auf den Fork.
- `npx mws update-tiddlywiki`, `npx mws init-store` → Exit 0, beide Wikis
  geladen, `ANON` 15-mal im Bundle vorhanden.
- `npx mws listen --listener` → `/`, `/admin` und
  `/wiki/bedienungsanleitung` antworten mit 200, `GET /api/landing` meldet
  `"mws": "0.3.0"` und die Anleitung als einziges öffentliches Wiki.

### Weiterhin offen

- **Veroeffentlicht ist noch nichts.** Das braucht eine npm-Anmeldung, 2FA
  und die Scope `mws` auf npm – die Scope lässt sich ohne Konto nicht
  prüfen, und `mws` ist eine kurze, generische Bezeichnung. Gehoert sie
  jemand anderem, sind `mws-wikiwise` ohne Scope (geprueft frei) oder
  `@heino17/wikiwise` die Alternativen. Ein veroeffentlichter Name ist
  endgueltig, deshalb sollte das vor dem ersten `npm publish` geklaert sein.
- `packages/mws/src/db/sqlite-adapter.ts:45` und `:78` nennen in den
  Meldungen fuer 0.0.x-Alpha-Datenbanken weiterhin `@tiddlywiki/mws`. Diese
  Datenbanken kann der Fork ohnehin nicht verwenden, und der Vorschlag
  `npm install @tiddlywiki/mws@0.0` laesst sich nicht auf den Fork-Namen
  umschreiben, weil es keine 0.0.x-Veröffentlichung des Forks gibt – daher
  bewusst unverändert.

---

## 52. Repo: Verteilung als GitHub-Release statt über die npm-Registry

**Ziel:** §51 ließ eine Frage offen: Wie bekommt jemand diesen Fork ohne
funktionierendes `npm publish`? Die Antwort: gar nicht nötig.

### Warum nicht die Registry

- Fürs Publizieren auf npm braucht man ein npm-Konto, und npm verlangt fürs
  Publizieren einen zweiten Faktor. Das ist für die Maintainerin hier ein
  echtes Hindernis, und das gehört ehrlich benannt statt als nebensächliches
  Problem behandelt.
- Den Namen legen npm-Regeln und Verfügbarkeit fest, nicht wir:
  `@mws-wikiwise` ist überhaupt kein gültiger Paketname
  (`EINVALIDPACKAGENAME`, weil npm nur `@scope/name` oder einen einfachen
  Namen akzeptiert), und die Scope `mws` ist auf npm **bereits vergeben** – das
  Profil existiert mit null Paketen, während ein nicht existierender Name 404
  liefert. `@mws/wikiwise` wäre also nur publizierbar, wenn der Inhaber von `mws`
  uns als Mitglied aufnimmt.
- Die Einzeiler-Form `npm init <name>@latest` lässt sich ohne Registry nicht
  nachbauen. `npm init` mit Pfad oder URL scheitert an `EUNSUPPORTED`
  ("Unrecognized initializer"), es gibt also auch für ein reines Repository
  keinen `npm init`-Kurzbefehl.
- Fazit: Das Paket behält den Namen `@mws/wikiwise` für seine eigene Identität
  (daran lösen `require`s auf, so steht es im Tarball-Manifest und so steht es
  in der `package.json` der Instanz), wird aber nicht veröffentlicht.
  `create-package` ist entsprechend als unbrauchbar dokumentiert, solange es die
  Registry nicht gibt.

### Was an ihre Stelle tritt

- **Jedes Release enthält ein fertiges Paket.**
  `npm install https://github.com/heino17/MultiWikiServer-wikiwise/releases/download/v0.3.0/mws-wikiwise-0.3.0.tgz`
  funktioniert, weil npm jedes HTTPS-Tarball installiert – geprüft an einem
  GitHub-Tarball, das npm entpackt und mit allen Abhängigkeiten aufgelöst hat,
  `better-sqlite3` eingeschlossen. Ohne Konto, ohne zweiten Faktor, und die
  Version steckt fest in der URL.
- Das Paket enthält das fertige `dist/mws.js`, es muss also nichts kompiliert
  werden. Ein Clone baut es weiterhin über `npm install`, weil `prepare`
  `build:pack` ausführt und `dist/` in `.gitignore` steht.
- `README.md` (beide Sprachen), `README_features.md` (beide Sprachen) und
  `editions/mws-docs/tiddlers/Installation.md` führen jetzt mit dem
  Release-Weg, behalten den Clone-Weg als Alternative für alle, die den Code
  ändern oder den aktuellen Stand verfolgen wollen, und erklären die
  `sha256sum`-Prüfung. Die erwartete Prüfsumme steht in den Release-Notizen.
- Das Release wird von Hand in der GitHub-Oberfläche angelegt; `gh` steht in
  dieser Umgebung nicht zur Verfügung, Tag und Asset-Upload sind also manuelle
  Schritte.

---

## 53. Fix: Die Release-Installation braucht einen Befehl mehr

**Ziel:** §52 hat den Release-Weg mit vier Befehlen beschrieben. Genau so
ausgeführt, in einem frischen leeren Ordner, verweigerte der Server den Start:

```
Error: The wiki path package.json file is not named '@tiddlywiki/mws-instance'.
```

### Was passiert ist

- `npm install <tarball-url>` in einem leeren Ordner lässt npm eine
  `package.json` schreiben – und benennt sie nach dem Ordner, nicht nach der
  Vorlage des Datenordners. MWS verlangt aber, dass diese Datei
  `@tiddlywiki/mws-instance` heißt, `private: true` ist und eine `0.2.x`-Version
  trägt, und prüft das bei jedem Start (`packages/mws/src/index.ts:66-81`). Die
  Prüfung ist Absicht: Genau diese Datei hält die Tiddler eines Datenordners aus
  einer öffentlichen Registry heraus, also verweigert der Server, statt zu raten.
- Das Create-Paket kopiert diese Vorlage normalerweise – deshalb laufen der
  Clone-Weg und der `npm pack`-Weg nie in dieses Problem: beide starten bei
  `create-package/files`. Ein Weg, der mit `npm install` beginnt, hat diesen
  Schritt nicht.

### Die Lösung, ohne Eingriff in die Laufzeit

- Zwei Befehle machen aus der Datei von npm das Manifest des Datenordners und
  behalten den Dependency-Eintrag, damit `npm ls` und spätere Updates weiter
  wissen, woher der Server kam:
  ```
  npm pkg set private=true --json
  npm pkg set name="@tiddlywiki/mws-instance" version=0.2.0
  ```
- Es müssen zwei Befehle sein, und die Trennung ist nicht kosmetisch. `npm pkg
  set` speichert Werte als Strings, aus `private=true` würde also der **String**
  `"true"`, während `packages/mws/src/index.ts:83` mit dem Boolean `true`
  vergleicht – der Server bricht mit `PACKAGE_JSON_PRIVATE` ab. Das Flag
  `--json` erzeugt den Boolean, lässt npm aber **alle** Werte als JSON parsen,
  und `@tiddlywiki/mws-instance` ist kein gültiges JSON:
  `npm error Unexpected token '@', "@tiddlywik"... is not valid JSON`.
  Der Boolean kommt also in seinen eigenen `--json`-Befehl, Name und Version in
  einen zweiten ohne das Flag.
- `README.md` (beide Sprachen), `README_features.md` (beide Sprachen) und
  `editions/mws-docs/tiddlers/Installation.md` enthalten den Befehl jetzt und
  erklären, warum es ihn gibt. Die Release-Notizen wurden ebenfalls berichtigt.

### Am veroeffentlichten Release geprueft

Von der Release-Seite geholt, nicht aus einem lokalen Build:

1. `npm install https://github.com/heino17/MultiWikiServer-wikiwise/releases/download/v0.3.0/mws-wikiwise-0.3.0.tgz`
   → Exit 0, `@mws/wikiwise@0.3.0` in `node_modules`
2. Die `sha256sum` der heruntergeladenen Datei entspricht der in den
   Release-Notizen
3. beide `npm pkg set`-Befehle → `name`, `private` und `version` korrekt,
   Abhaengigkeit erhalten
4. `npx mws update-tiddlywiki` → Exit 0
5. `npx mws init-store` → Exit 0, beide Wikis geladen, Admin `1234`
6. `npx mws listen --listener` → `/`, `/admin` und `/wiki/bedienungsanleitung`
   antworten mit 200, `GET /api/landing` meldet `"mws": "0.3.0"`

---

## 54. `npx mws init-data-folder` ersetzt den `npm pkg set`-Umweg

**Ziel:** §53 hat den Release-Weg mit einem Umweg dokumentiert, der nur
deshalb funktioniert, weil `npm pkg set` an einem nicht-JSON-fähigen Wert
scheitert. Zwei Befehle, davon einer mit `--json` und einer ohne, sind genau
die Art Stolperstein, die in einer Anleitung für Erstinstallationen nicht
gehört. Der Schritt gehört in das Werkzeug, das die Regel ohnehin kennt.

### Was geändert wurde

- Neues Kommando `npx mws init-data-folder`
  (`packages/mws/src/new-commands/init-data-folder.ts`), das die
  `package.json` des Datenordners schreibt. Quelle ist bewusst
  `create-package/files/package.json` – dieselbe Datei, die das Create-Paket
  kopiert und der `npm pack`-Weg verwendet, inzwischen als einziger Ort im
  Paket (`package.json` → `files`).
- Es schreibt genau die drei Felder, an denen die Startprüfung scheitert
  (`name`, `private`, `version`) und übernimmt das `start`-Skript. Bestehende
  `dependencies` und eigene Skripte des Ordners bleiben erhalten.
- Der Befehl darf in einem Ordner ohne Server laufen: Er ist von der
  Datenordner-Prüfung ausgenommen (`packages/mws/src/index.ts`) und läuft vor
  dem Zugriff auf `passwords.key` und Datenbank (`startup.ts`). Erst dadurch
  kann er in dem Ordner überhaupt etwas anlegen.
- **Datenordner-Mantel bleibt `@tiddlywiki/mws-instance`, Version `0.2.0`** –
  unverändert, weil die Startprüfung weiterhin genau darauf besteht.

### Sicherheitsverhalten

Der Befehl überschreibt nichts blind:

- `package.json` fehlt → wird aus der Vorlage angelegt.
- Vorhandene Datei ist bereits ein gültiges Instanz-Manifest → Meldung, keine
  Änderung (idempotent, auch im laufenden Betrieb unbedenklich).
- Datei ist kein gültiges JSON → Abbruch mit Exit 1, Datei bleibt unverändert.
- Datei trägt einen anderen, bewusst gewählten Namen (z. B. aus `npm init -y`,
  wo npm den Ordnernamen nimmt) → **kein** Überschreiben, Exit 1 mit Hinweis.
  Wer den Namen loswerden will, benennt die Datei vorher selbst um.

Der letzte Fall ist Absicht: Ein fremder Paketname in einem Ordner, in dem
MWS später installiert wird, ist kein Versehen, sondern eine Entscheidung des
Nutzers, und die darf der Installer nicht stillschweigend kippen.

### Doku

`README.md` (EN/DE), `README_features.md` (EN/DE),
`editions/mws-docs/tiddlers/Installation.md` und `create-package/README.md`
nennen jetzt `npx mws init-data-folder` statt der beiden `npm pkg set`-Zeilen
und verlinken das Asset von 0.3.1. §53 bleibt als Historie stehen, wie der
Umweg aussah und warum er nötig war.

### Getestet

Frische Installation aus dem lokal gebauten 0.3.1-Tarball:

1. `npm install <tgz>` → `npx mws init-data-folder` → `name`, `private: true`,
   `version: 0.2.0` und `start`-Skript korrekt, Abhängigkeit erhalten
2. zweiter Aufruf → unverändert (idempotent)
3. kaputtes JSON → Exit 1, Datei byte-identisch
4. absichtlich benanntes `package.json` → Exit 1, Datei byte-identisch
5. echte Instanz aus `tests/` → Meldung „is already a data folder", Prüfsumme
   von `store/` und `passwords.key` unverändert
6. danach `update-tiddlywiki` → `init-store` → `listen`: `/`, `/admin` und
   `/wiki/bedienungsanleitung` antworten mit 200, `GET /api/landing` meldet
   `"mws": "0.3.1"`
7. **Regression des Schutzes:** In einem Ordner mit falscher oder fehlender
   `package.json` verweigern `update-tiddlywiki`, `init-store` und `listen`
   weiterhin den Start – der neue Befehl hat die Prüfung nicht aufgeweicht
8. `npx mws help` führt `init-data-folder` mit Beschreibung

---

## 55. Fix: Ein totes Chromium hat alle Wiki-Vorschaubilder dauerhaft blockiert

**Ziel:** Nach der Installation aus dem 0.3.1-Release meldete eine echte
Installation:

```
GET /wiki/wiki-admin/thumbnail browser.newContext: Target page, context or browser has been closed
    at renderThumbnail (.../WikiThumbnailRoutes.ts:282:19)
```

Die Admin-Liste zeigte danach für **keine** Wiki mehr ein Vorschaubild, und ein
Neustart des Servers war nötig, damit überhaupt wieder eines entstand.

### Was passiert ist

- Chromium wird beim ersten Bedarf gestartet und danach in einem
  Modul-globalen `browserPromise` gehalten
  (`packages/mws/src/new-managers/WikiThumbnailRoutes.ts`, vor dieser Änderung
  Zeile 193). Das gecachte Objekt wurde **nie** wieder geprüft.
- Playwright hält ein Browser-Objekt auch dann noch für gültig, wenn der
  Prozess dahinter längst beendet ist. Nur `isConnected()` sagt die Wahrheit.
  Stirbt Chromium – Absturz, OOM-Killer, ein `kill` von außen –, dann wirft
  jedes weitere `browser.newContext()` auf diesem Objekt
  `Target page, context or browser has been closed`.
- `getBrowser()` fing nur **Start**fehler ab (`browserPromise = null`), nicht
  den Tod des gestarteten Browsers. Ergebnis: ein einziger Absturz poisons den
  Cache, und jede spätere Vorschau scheitert identisch, bis der Server neu
  startet. Die Korrektur war damit wirkungslos.

### Die Lösung

- `startBrowser()` prüft vor jeder Weitergabe `isConnected()` und startet
  Chromium neu, wenn er nicht mehr lebt. Ein gestarteter, aber inzwischen
  toter Browser wird nie weiterverwendet.
- Die Starts laufen über eine Promise-Kette. Ohne sie würden zwei parallel
  eintreffende Vorschau-Anfragen je ein Chromium starten und das zweite
  dauerhaft herrenlos im Hintergrund stehen lassen.
- Stirbt der Browser **während** des Renderns, gibt es genau einen Retry mit
  frischem Browser statt einer dauerhaft kaputten Vorschau.
- Ein dauerhaft scheiterndes Rendern ist jetzt kein Anfragefehler mehr. Die
  Route antwortet wie für eine Wiki ohne Vorschaubild mit `404` und schreibt
  eine verständliche Zeile ins Log, statt ein Playwright-Fehlerobjekt zu
  werfen. In der Wiki-Liste erscheint ein Platzhalter, die Wiki selbst ist
  davon nicht betroffen.

### Getestet

Am laufenden Server, mit Anmeldung und echter Admin-Liste. Test war: einmal
 rendern, alle Chromium-Prozesse des Servers per SIGKILL beenden, Vorschau-Cache
 löschen, neu laden.

| Durchlauf | vorher (0.3.1) | nachher |
| --- | --- | --- |
| 1, frisch | `200 image/png`, 2 Dateien | `200 image/png`, 2 Dateien |
| 2, Chromium war tot | `500 application/json`, 0 Dateien | `200 image/png`, 2 Dateien |
| 3 | `500 application/json`, 0 Dateien | `200 image/png`, 2 Dateien |

Gegenprobe mit dem unveränderten 0.3.1-Bundle auf demselben Test: Der
`500`-Fehler samt identischem Stacktrace bleibt dauerhaft bestehen, der
Vorschau-Ordner bleibt leer. Der Chromium-Aufruf selbst ist nicht das Problem
– Start, Seitenausgabe und Screenshot funktionieren auf demselben Rechner
fehlerfrei, es ist allein die Wiederverwendung des toten Browsers.

---

## 56. Fix: Datenbanken von vor dem 27.09. starten nicht mehr

**Ziel:** `npm start` bricht ab, sobald ein Wiki benutzt wird, das **vor** dem
27.09. angelegt wurde – inklusive des Entwicklungs-Wikis im Repository:

```
New migrations found [ '20260915_owner_user_id' ]
Applying migration 20260915_owner_user_id
SqliteError: duplicate column name: owner_user_id
    at Database.exec (node_modules/better-sqlite3/lib/methods/wrappers.js:9:14)
```

### Was passiert ist

- §50 (Commit `2190cfa`, 27.09.) hat die Migration `20260915_owner_user_id`
  ergänzt, damit **frische** Datenbanken die fünf `owner_user_id`-Spalten
  bekommen. SQLite kann Spalten nur mit `ALTER TABLE ... ADD COLUMN` hinzufügen
  und kennt kein `ADD COLUMN IF NOT EXISTS`. Ein erneutes Ausführen ist damit
  unmöglich.
- Datenbanken von **vor** dem 27.09. haben diese Spalten bereits, weil sie dort
  seit jeher zum Schema gehören. Der Eintrag in `_prisma_migrations` fehlt
  naturgemäß – die Migration existierte zu dem Zeitpunkt noch gar nicht.
- Beim ersten Start nach dem Update gilt sie deshalb als ausstehend, das
  `ALTER TABLE` läuft erneut, und SQLite bricht mit `duplicate column name` ab.
  Die Migrationsschleife endet beim ersten Fehler, es bleibt bei diesem einen
  Fehler: **jeder** weitere Start scheitert identisch, das Wiki ist nicht mehr
  erreichbar und die Datenbank lässt sich nur von Hand reparieren.
- Betroffen ist jede Installation, die vor dem 27.09. angelegt wurde, nicht nur
  Entwicklungs-Wikis. Frische Installationen sind unauffällig – deshalb fiel der
  Fehler beim Testen mit frischen Datenordnern nicht auf. Für die Versionsfolge
  0.3.0 bis 0.3.2 ist das ein startverhindernder Fehler.
- Der Sonderfall war bei `20260916_email_nullable` bereits bekannt und dort per
  Hand abgefangen worden (`owner_user_id` … „it already exists on live
  databases and is carried over as-is"). Das galt aber nur für die
  `users`-Tabelle, die übrigen vier Tabellen blieben ungeschützt.

### Die Lösung

- `packages/mws/src/db/sqlite-adapter.ts` analysiert vor dem Ausführen einer
  ausstehenden Migration deren Skript. Besteht es ausschließlich aus
  `ALTER TABLE … ADD COLUMN`-Anweisungen, wird jede Spalte per
  `PRAGMA table_info` gegen das tatsächliche Schema geprüft.
- Sind **alle** Spalten bereits vorhanden, entfällt das DDL. Die Migration wird
  mit einer erklärenden Logzeile als angewandt verbucht: Das Schema ist genau
  das, was die Migration herstellen wollte, es fehlt nur der Protokolleintrag.
- Der Erkennungspfad greift ausschließlich im belegten Fall. Fehlt auch nur eine
  Spalte (frische Datenbank), oder macht das Skript mehr als Spalten hinzufügen
  (Tabelle neu bauen, Daten kopieren, Indizes anlegen), läuft die Migration
  unverändert. `parseAddedColumns` liefert dann `null` und das Skript wird
  wie zuvor ausgeführt – geprüft an allen zehn Migrationen, davon zwei als
  reine Spalten-Migration erkannt (`20260915_owner_user_id`,
  `20260916_wiki_limit`).
- Am Entwicklungs-Wiki lautet die Logzeile:

  ```
  New migrations found [ '20260915_owner_user_id' ]
  Skipping the schema change of migration 20260915_owner_user_id, this
  database already has users.owner_user_id, roles.owner_user_id,
  bag.owner_user_id, recipe.owner_user_id, template.owner_user_id
  Migrations applied [ '20260915_owner_user_id' ]
  ```

### Getestet

- **Altbestand, exakt der gemeldete Fall:** Entwicklungs-Wiki vor dem Fix mit
  `SqliteError: duplicate column name: owner_user_id` abgebrochen. Nach dem Fix
  startet der Server, verbucht die Migration und liefert `/api/landing` mit
  `200`. Vorher 9, nachher 10 Zeilen in `_prisma_migrations`,
  `PRAGMA integrity_check` = `ok`, Nutzer (6), Bags (14), Recipes (14) und
  Templates (1) unverändert.
- **Gegenprobe, kein Datenverlust:** Vor dem Testlauf Sicherung der Datenbank
  über die SQLite-Backup-API (9 Migrationen, 6 Nutzer, `integrity_check` `ok`),
  danach Abgleich der Zeilenzahlen.
- **Frische Datenbank, Gegenprobe:** Komplette Neuinstallation aus dem
  0.3.3-Paket nach/create-package-Ablauf (`npm install` → `update-tiddlywiki` →
  `init-store`) auf einem leeren Ordner. Dort fehlen die Spalten, also läuft die
  Migration **unverändert** – die Logzeile lautet durchgehend `Applying
  migration …`, keine einzige `Skipping`-Zeile. Ergebnis: alle fünf Spalten
  vorhanden, 10 Zeilen in `_prisma_migrations`, `integrity_check` `ok`.
  anschließender Start auf Port 5099: `/api/landing` meldet `mws: 0.3.3`, 1 Wiki,
  54 Tiddler, 1 Nutzer, keine Fehlermeldung. Damit ist der übliche Weg einer
  Neuinstallation unberührt.
- **Erkennung, synthetisch:** `parseAddedColumns` gibt für
  `ADD COLUMN` + `CREATE TABLE`, `ADD COLUMN` + `INSERT`, reines `CREATE TABLE`,
  ein reines Kommentar-Skript und ein leeres Skript konsequent `null` zurück,
  für ein `ADD COLUMN`-Skript mit und ohne abschließendem Semikolon die Spalte.

---

## 57. Fix: Das Sprachmenü der Startseite lag halb unter dem Inhalt

**Ziel:** Auf der Startseite `/` war das Sprachmenü im Kopfbereich unten
angeschnitten: Der aufklappbare Teil wurde vom Inhaltsbereich übermalt, die
unteren Sprachoptionen waren nicht mehr klickbar.

### Was passiert ist

- Der Kopfbereich `.landing-header` nutzt `backdrop-filter: blur(12px)`.
  `backdrop-filter` – wie `filter`, `transform` oder `opacity` unter 1 – erzeugt
  einen **eigenen Stacking Context**. Ein `z-index` innerhalb des Kopfbereichs
  gilt damit nur noch innerhalb dieses Containers und hebt das Element nicht mehr
  gegenüber dem restlichen Dokument an.
- Der Kopfbereich selbst hatte kein eigenes `z-index` und lag deshalb auf Ebene
  0. Die direkt folgende News-Box `.landing-news` steht im DOM danach und
  übermalte ihn. Gemessen: 180 × 168 px Überlappung; `elementFromPoint()` in der
  Mitte des Menüs traf den Titel `h2.landing-section-title`, nicht das Menü.
- Betroffen waren alle Sprachoptionen im unteren Drittel, unabhängig von der
  gewählten Sprache und ohne JavaScript-Beteiligung – reines Stapeln von Ebenen.
- Das Muster war im Adminbereich bereits richtig gelöst: `.hero-panel` führt
  `position: relative; z-index: 1`. Die Anmeldeseite hat kein Sprachmenü, dort
  gibt es nichts zu korrigieren.

### Die Lösung

- `.landing-header` in `packages/admin-vanilla/src/app.inline.css` bekommt
  `position: relative; z-index: 1`. Damit liegt der Kopfbereich über der
  News-Box, und das `z-index` der Sprachoptionen wirkt wieder wie gedacht –
  beides innerhalb des einen Kommentars benötigt wurde.

### Getestet

- **Messung vorher/nachher:** Vorher überlappte `.landing-news` das
  Sprachmenü auf einer Fläche von 180 × 168 px, alle drei Messpunkte im
  Menübereich trafen Inhaltselemente darunter. Nachher lagen alle drei
  Messpunkte auf dem Dropdown oder auf einer Sprachoption, die Überlappung ist
  weg.
- **Beide Seiten mit dem Kopfbereich geprüft:** Startseite `/` und Impressums-
  Seite, jeweils aufgeklapptes Menü in deutscher und englischer Fassung.

---

## 58. Fix: Der Standard-Schreib-Bag folgt dem Slug beim Umbenennen wieder

**Ziel:** Wird im Admin der Slug eines Wikis geändert, folgt der abgeleitete
Schreib-Bag `editions/<owner-id>/<slug>` dem neuen Slug nicht mehr. Das Wiki
zeigt danach weiterhin auf den alten Bag-Namen – der Slug wird zwar umbenannt,
der Standard-Bag behält aber für immer den alten Slug im Namen.

### Was passiert ist

- Die Kopplung war an zwei Stellen unabhängig voneinander hinterlegt, und die
  beiden Stellen kannten unterschiedliche Namensschemata:
  - Der Admin-Client (`syncDefaultBagOnSlugChange` in
    `packages/admin-vanilla/src/definition/renders.tsx`) baute den neuen Namen
    beim Tippen als `editions/<slug>` – **ohne** den Owner-Anteil.
  - Der Server (`followDefaultBagOnSlugRename` in
    `packages/mws/src/new-managers/TabDataAdapter.ts`) benannte den Bag nur um,
    wenn die **eingereichte** Zielzeile bereits den neuen abgeleiteten Namen
    enthielt.
- Seit die Owner-Schreibweise eingeführt ist, lautet der tatsächliche Zielwert
  aber `editions/<owner-id>/<slug>`. Der Client-Vergleich
  `editions/<slug>` traf deshalb nie zu, das Zielfeld blieb unverändert – und
  damit auch die Bedingung des Servers (`alter Name !== neuer Name`) nie zu.
  Der Bag-Rename war für alle Wikis mit Owner-Namespacing, also für praktisch
  jedes Wiki, still wirkungslos.
- Ein Test dazu existierte nicht: weder für `followDefaultBagOnSlugRename` noch
  für `defaultBagName`.

### Die Lösung

- **Eine Quelle der Wahrheit, auf dem Server.** Die Namenskonvention steht nur
  noch in `defaultBagName(ownerUserId, slug)`. Der Client-Helfer und sein Aufruf
  sind entfallen; das Zielfeld folgt dem Slug beim Tippen nicht mehr. Das ist
  Absicht: der Client kennt die Owner-ID nicht, und nach dem Speichern schreibt
  der Server den korrigierten Wert ohnehin in dasselbe Feld zurück.
- **Der Server folgt dem Slug, wenn das Feld den alten Namen noch trägt.**
  `followDefaultBagOnSlugRename` leitet beide Namen aus `defaultBagName` ab und
  behandelt einen Zielwert, der dem alten *oder* dem neuen abgeleiteten Namen
  entspricht, als „folge dem Slug“ – auch wenn der Client das Feld gar nicht
  angefasst hat. Ein Zielwert, der weder der alte noch der neue abgeleitete Name
  ist, wurde bewusst gewählt und bleibt unangetastet.
- **Die Funktion liefert die zu speichernden Zeilen zurück** statt nur den Bag
  umzubenennen. `authoredDefinition`, die kompilierte Rezept-Bag-Zuordnung, das
  Spiegeln des Anzeigenamens und die Antwort an den Admin verwenden damit
  denselben Namen. Vorher konnte die gespeicherte Definition auf einen
  umbenannten Bag zeigen, den es unter diesem Namen nicht mehr gab.
- **Unveränderte Schutzbedingungen:** Kein Rename bei Namenskonflikt (der
  vorhandene Bag behält seinen Namen), bei fehlendem altem Bag oder wenn der Bag
  noch von anderen Rezepten benutzt wird. Die Prüfung der Slug-Eindeutigkeit
  läuft weiterhin vor dem Rename in derselben Transaktion, ein abgelehnter
  Slug nimmt den Bag-Rename also mit zurück.
- **Der Bag wird an Ort und Stelle umbenannt** (`bag.update`), nicht neu
  angelegt: `bag_id`, Tiddler und Berechtigungen bleiben erhalten.

### Getestet

- **Der Kernfall, ohne Eingriff am Zielfeld:** Wiki angelegt, Slug auf
  `…-umbenannt` geändert und gespeichert, ohne das Zielfeld anzufassen. Ergebnis
  in der Datenbank geprüft: Definition zeigt auf
  `editions/<owner>/…-umbenannt`, der Bag existiert unter dem neuen Namen mit
  **derselben** `bag_id` wie vorher (`01a0e74a-…` → `01a0e74a-…`), die 3
  Tiddler sind unverändert im selben Bag, `recipe_bag` verweist auf den neuen
  Namen, der alte Name ist frei.
- **Bewusstes Fremd-Bag:** Ein Wiki wurde auf den Bag eines anderen Wikis
  gezielt und anschließend umbenannt. Der Zielwert bleibt unverändert gespeichert,
  der Bag des anderen Wikis behält Name und ID, und es entsteht kein zusätzlicher
  Bag aus dem Feld.
- **Keine Zielzeile:** Speichern ganz ohne Zeile mit leerem Präfix ändert nichts –
  es wird keine erfunden, der Bag bleibt unbenannt.
- **Oberfläche, Chromium gegen die frische Testinstallation:** Slug-Feld
  geändert, das Zielfeld zieht sichtbar **nicht** mit, nach dem Speichern steht
  der vom Server nachgezogene Wert im Feld, nach dem Neuladen steht er im
  Wiki. Keine JS-Fehler auf der Admin-Seite.
- Für den Test wurde in der Wegwerf-Installation `admin.showLoginPuzzle`
  abgeschaltet, weil das Emoji-Rätsel der Anmeldung keinen automatisierten
  Klick zulässt; die Serverlogik ist davon unberührt.

---

## 59. Fix: Die Plugin-Bibliothek ließ sich in keinem Wiki öffnen

**Ziel:** In jedem Wiki ist unter *Einstellungen → Plugins → „Get more
plugins“* keine Plugin-Bibliothek zu öffnen gewesen. Firefox meldete
`Error loading plugin library: https://tiddlywiki.com/library/v5.4.1/index.html`,
Chromium blieb stumm. Damit ließ sich **kein** Plugin installieren – auch keine
Sprache.

### Was passiert ist

- TiddlyWiki lädt die Bibliothek in einem **versteckten Cross-Origin-iframe**
  (`$:/core/modules/startup/browser-messaging.js`) und handelt über
  `postMessage` mit ihm. Auch der Download eines Plugins
  (`tm-load-plugin-from-library`) läuft über dieselbe Frame.
- MWS sendet für Wiki-Seiten eine strenge CSP mit `frame-src 'self'`
  (`buildCspPolicy` in `packages/mws/src/new-managers/RecipeResolver.ts`).
  Genau diese eine Direktive blockiert den Zugriff auf die Bibliothek. Das ist
  kein Netzwerkproblem: `https://tiddlywiki.com/library/v5.4.1/index.html`
  antwortet mit HTTP 200.
- Der Ausweg wäre `cspAllow` pro Wiki, das `frame-src` erweitert. In der
  Entwicklungsumgebung war er nirgends gesetzt (0 von 13 Wikis), und im
  Admin-Formular gibt es **kein Eingabefeld** dafür – die Ausnahme war also
  weder gesetzt noch erreichbar.
- **Zwei verschiedene Symptome, eine Ursache:** Firefox feuert bei einer per CSP
  blockierten Frame `onerror`, der Kern macht daraus den Alert mit der
  genannten Meldung. Chromium feuert stattdessen `load`, der Status bleibt
  „loaded“, die Bibliothek bleibt leer – **ohne jede Meldung**. Der stille Fall
  ist der unangenehmere, weil er nicht als Fehler auffällt.

### Die Lösung

- `frame-src` enthält fest `https://tiddlywiki.com`
  (Konstante `PLUGIN_LIBRARY_ORIGIN` in `packages/mws/src/new-managers/RecipeResolver.ts`).
  Damit funktioniert die Bibliothek in jedem Wiki ohne Eingriff.
- Das ist eine **bewusste Abweichung** vom strengen Standard und gilt für alle
  Wikis, nicht nur für die, deren Admin es entschieden hat. Begründung:
  Sprachpakete und Plugins sollen ohne Zusatzschritt verfügbar sein, und die
  eingebettete Seite ist TiddlyWikis eigene Bibliothek – sie kann nur Nachrichten
  an den Elternframe senden und im Wiki-Ursprung kein Skript ausführen. Ein
  selbst gehostetes Bibliotheks-URL (`$:/config/PluginLibrary/URL` anders
  gesetzt) muss weiterhin pro Wiki in `cspAllow` stehen; die Liste wird
  dahinter angehängt. Skript-Quellen bleiben unverändert auf `same-origin`.
- Der Kommentar an der Funktion beschreibt die progressive Grundidee weiter und
  benennt die Ausnahme samt Begründung, damit sie später bewusst entfernt
  werden kann.

### Getestet

- **Vorher, am selben Wiki, beide Browser:** Firefox liefert die CSP-Meldung
  („blocked the loading of a resource (frame-src)“) **und** den Alarm mit
  wortgleicher Meldung wie im Gemeldeten, Status bleibt „loading“, 0 Einträge.
  Chromium meldet denselben Verstoß, zeigt aber keinen Alarm (Status „loaded“,
  0 Einträge) – exakt der stille Fehler.
- **Nachher, mit leerem `cspAllow`:** Header `frame-src 'self'
  https://tiddlywiki.com`, keine CSP-Verstöße, Status „loaded“, **105
  Bibliothekseinträge davon 34 Sprachpakete** – in Chromium und in Firefox
  identisch.
- **Auch der Downloadpfad:** `$:/languages/de-DE` aus der Bibliothek angefordert,
  das Sprachpaket kommt vollständig an (182 498 Zeichen JSON, Typ
  `application/json`), ebenso ein reguläres Plugin (`$:/plugins/tiddlywiki/async`).
  Damit ist der gemeldete Weg – Sprache installieren – vollständig geprüft.
- Geprüft wurde auf der frischen Wegwerf-Installation mit leerem `cspAllow`,
  also genau dem Zustand aller 13 Wikis der Entwicklungsumgebung.

---

## 60. Fix: Leerer Button im Kopfbereich von „Pinboard" und „Meine Dateien"

**Ziel:** In den Tabs *Pinboard* und *Meine Dateien* stand ganz rechts im
Kopfbereich ein leerer Button (28 × 20 px) – ohne Beschriftung, ohne Tooltip und
ohne erkennbare Funktion.

### Was passiert ist

- Der Kopfbereich rendert für jeden Tab einen „Anlegen"-Button, ausgenommen
  `wikis` (und `roles` bei Nicht-Admins). Die Beschriftung liefert
  `getCreateLabel(currentTab)`.
- *Pinboard* und *Meine Dateien* sind reine Anzeige-Tabs ohne Datensätze. Sie
  werden über synthetische Definitionen
  (`pinboardTabDefinition`, `userFilesTabDefinition`) beschrieben und tragen
  deshalb **bewusst** ein leeres `createLabel: ""`.
- Die Bedingung prüfte allein die Tab-ID, nicht die Beschriftung. Ergebnis: ein
  Button ohne Text – sichtbar blieben nur die Innenabstände, also 28 × 20 px.
  Ein Klick rief `openCreate("pinboard"/"files")` auf und damit ins Leere.
- Betroffen waren **beide** Tabs, nicht nur einer. *Storage* war nicht
  betroffen, weil dieser Tab schon einen eigenen Zweig mit „Refresh" besitzt.
- Für Nutzer war das nur ein leerer Fleck am rechten Rand: keine Fehlermeldung,
  keine Folge – aber sichtbar falsch.

### Die Lösung

- Die Bedingung verlangt zusätzlich eine **nichtleere** Anlegen-Beschriftung
  (`!!getCreateLabel(currentTab)`). Damit erhalten alle Anzeige-Tabs automatisch
  keinen Button, auch künftige – sie müssen nicht einzeln ausgeschlossen werden.
- Es geht keine Funktion verloren: *Meine Dateien* hat die Dropzone mit
  Dateiauswahl und „Refresh" im Panel, *Pinboard* die Notiz-Erstellung.

### Getestet

- Alle acht Tabs nacheinander angeklickt und die Aktionsleiste ausgelesen:
  *Wikis* behält seine beiden Dropdowns (Backups, Create a wiki) und keine
  nackten Buttons, *Templates* „Create template", *Bags* „Create bag",
  *Roles* „Create role", *Users* „Create user", *Storage* „Refresh" –
  alle unverändert. *Pinboard* und *Meine Dateien*: kein Button mehr, die
  `.user-files-dropzone` ist weiterhin vorhanden. Keine JS-Fehler.

## 61. Fix: Der Footer der Startseite stand in der Luft

**Ziel:** Auf der Startseite `/` stand der Footer bei 1920 × 1080 rund 187 px
über dem unteren Rand. Er sollte unten kleben und dabei seine volle Breite
behalten.

### Was passiert ist

- `.landing-shell` war ein Grid mit `align-content: start`. Das packt alle
  Zeilen nach oben; der Rest der `min-height: 100vh` blieb als Leerraum
  **unterhalb** des Footers stehen. Die vermutete Ursache stimmte also: Der
  Inhalt der Sections war nicht hoch genug, und das Grid sorgte dafür, dass
  dieser Freiraum nicht vom Footer aufgefüllt wurde.
- Gemessen bei 1920 × 1080: Shell 1080 px, Footer ab y = 860, 33 px hoch,
  187 px Abstand zum unteren Rand.
- Die volle Breite war nicht das Problem, sie ist gewollt: Der Footer ist ein
  Block mit `border-top`, der über `align-items: stretch` die Innenbreite des
  Shells annimmt (1920 px minus 2 × 32 px Padding = 1856 px).

### Die Lösung

- `.landing-shell` ist jetzt `display: flex; flex-direction: column`. Das
  Flex-Kind `.landing-footer` bekommt `margin-top: auto` und nimmt damit den
  Freiraum auf. Das funktioniert unabhängig davon, wie viele Sections
  vorhanden sind – anders als eine feste `grid-template-rows`.
- Die Breite bleibt unangetastet: `align-self` steht weiter auf `auto`, es
  wurde bewusst **kein** `width: fit-content` gesetzt.

### Getestet

- **Vorher/nachher bei 1920 × 1080:** Footer von y = 860 auf y = 1029, Abstand
  zum unteren Rand 187 → 18 px (genau das `padding` des Shells). Die Breite
  bleibt 1856 px, der Rand links wie rechts 32 px.
- **Acht Fenstergrößen geprüft,** jeweils gemessen statt geraten: 1920 × 1080,
  1440 × 900, 1024 × 768, 800 × 600, 390 × 844, 1920 × 420 und 1000 × 360 auf
  `/landing` sowie 1920 × 1080 auf `/legal-notice`. In **keinem** Fall
  horizontaler Scroll; bei passender Seite exakt 18 px Abstand, bei Überlauf
  liegt der Footer korrekt unterhalb der Falz und die Seite scrollt.
  **Volle Breite in allen sieben Fällen** geprüft: Der Footer misst exakt die
  Innenbreite des Shells, links wie rechts 32 px Rand, kein `max-width`.
- **Ohne Regressionsfolgen:** `.landing-header` behält seinen `z-index: 1`,
  das Sprachmenü (§57) ist weiterhin nicht übermalt – 0 px Überlappung zur
  News-Box, alle 8 Optionen per `elementFromPoint` an ihrer Position
  getroffen. Keine JS-Fehler.

---

## 62. Kosmetik: ein Herz vor der Versionszeile im Footer

**Ziel:** Der Footer begann mit der nüchternen Zeile
`MWS-wikiwise 0.3.3 · TiddlyWiki 5.4.1`. Gewünscht war ein ❤️ davor, ohne den
Eintrag selbst anzutasten.

### Die Lösung

- Das Herz ist ein **eigener `<span class="landing-footer-heart">`** direkt vor
  der Versionszeile, nicht Teil von ihr. Grund: Der Text entsteht aus dem
  Übersetzungsschlüssel `MWS-wikiwise {version}`, der in allen Locale-Dateien
  steht. Ein Emoji im Schlüssel hätte in jeder Sprache angepasst werden
  müssen – und wäre trotzdem nicht übersetzbar gewesen, weil es kein Text ist.
  So bleiben alle Sprachdateien unberührt.
- `aria-hidden="true"`: Das Herz ist Dekoration. Vorlese-Software liest
  weiterhin nur die Versionsangabe, nicht „rotes Herz“.
- CSS: `flex: 0 0 auto`, `font-size: 0.85em`, `line-height: 1` und
  `translateY(calc(0.06em - 2px))`. Emoji sitzen in kleiner Schrift sichtbar zu
  hoch und werden etwas zu groß gezeichnet; beides wird so korrigiert. Die
  Höhenkorrektur steht bewusst in `px` und nicht in `em`, damit sie
  unabhängig von der Schriftgröße immer dieselbe bleibt. `0.06em` ist die
  Grundkorrektur, damit das Herz nicht ganz aus dem Satz fällt. Zuerst mit
  5 px umgesetzt, nach Ansicht im laufenden Betrieb auf 2 px nachjustiert –
  gemessen `matrix(1, 0, 0, 1, 0, -1.37168)`, also 2 px plus 0,63 px
  Grundkorrektur.
- Eingetragen in **alle drei** Footer: Startseite (`app-landing.tsx`),
  Verwaltung (`app.tsx`, `.admin-footer`) und Impressum (`legal-notice.tsx`).
  Der Impressums-Footer hatte zuvor keine Versionszeile; sie wurde mit
  Herz davor ergänzt. Quelle ist `embeddedServerResponse` (`mwsVersion` und
  `tw5Versions`), die die Seite ohnehin schon mitbringt – es war kein
  zusätzlicher Abruf nötig.

### Getestet

- **DOM:** Genau ein Herz-Span, Inhalt ausschließlich das Herz
  (`U+2764 U+FE0F`), 13 × 10 px, `aria-hidden="true"`. Die Versionszeile
  lautet unverändert `MWS-wikiwise 0.3.3 · TiddlyWiki 5.4.1` – in allen
  Sprachfassungen.
- **Ausrichtung:** Das Herz ragt 1 px über die Text-Oberkante und 2 px über
  die Text-Unterkante. Die Footerhöhe bleibt 33 px wie vorher, kein
  zusätzlicher Umbruch.
- **Impressum:** Der Footer führt nun `❤️`, die Versionszeile und
  „Zurück zur Startseite" – 4 Einträge statt vorher 3. Auch dort in sieben
  Sprachen geprüft: Herz durchgehend 10 px hoch, Text identisch.
- **Sieben Sprachen** (en, de, fr, es, ko, ru, zh-cn) durchgeklickt: Das Herz
  ist überall 13 × 10 px, der Text identisch. Keine JS-Fehler.
- **Bundle-Kontrolle:** Das ausgelieferte `main.js` enthält alle drei
  Herz-Spans mit `children:"❤️"` – der Builder hat das Paar
  korrekt als Escape-Sequenz erhalten und nicht die textförmige Variante
  ohne Variation-Selector daraus gemacht.

## 63. Der Footer sitzt auch in allen Admin-Tabs am unteren Rand

**Ziel:** Der Footer klebt auf der Startseite am unteren Bildschirmrand, in der
Verwaltung stand er dagegen direkt hinter dem Inhalt. Auf einem Tab mit zwei
Einträgen wie „Pinboard" (0 Notizen) schaute das aus wie eine halbe Seite: Der
Fuß mit Versionszeile, Versionslink, Impressum und Cookie-Knopf stand nach
350 px Inhalt mitten auf der Seite, darunter 335 px nichts.

### Die Lösung

- `.admin-shell` ist jetzt wie `.landing-shell` eine Flex-Spalte
  (`display: flex; flex-direction: column`). Der Footer bekommt
  `margin-top: auto` und nimmt damit den Leerraum eines kurzen Tabs auf.
  Bewusst **kein** `gap` auf dem Container: Der vertikale Rhythmus der
  Verwaltung entsteht bisher aus dem `margin-top` der einzelnen Sektionen
  (Hero −17 px, Tab-Leiste 24 px, Abschnittskopf 26 px), ein `gap` würde sich
  darauf addieren und alle Abstände verfälschen. Die Modals dazwischen sind
  `position: fixed` und damit aus dem Flex-Fluss heraus.
- **Der feste Abstand von 28 px liegt jetzt auf dem Vorgänger statt am
  Footer** – `.admin-shell > :has(+ .admin-footer) { margin-bottom: 28px; }`.
  Grund: `margin-top: auto` schluckt einen eigenen Außenabstand, sobald die
  Seite überläuft – bei langen Tabs wäre der Abstand auf 0 weggefallen. Der
  Außenabstand des Elements *über* dem Footer wird davon nicht berührt. Da je
  nach Tab ein anderes Element direkt vor dem Footer steht, wird er über
  `:has()` adressiert; die Pseudo-Klasse ist mit `body:has(.modal-shell[open])`
  ohnehin schon im Einsatz.
- `margin-bottom` des Abschnittskopfes (16 px) wird dabei auf 28 px erhöht, wo
  er direkt vor dem Footer steht. Ergebnis ist derselbe Abstand wie auf den
  Tabs mit Inhalt – vorher waren es dort 44 px.

### Getestet

Alle acht Tabs im Browser durchgeklickt (Wikis, Templates, Bags, Roles, Users,
Storage, Pinboard, Meine Dateien), jeweils vorher und nachher gemessen:

| Tab | vorher: Footer über dem Rand | nachher: Footer über dem Rand | Abstand darüber |
| --- | --- | --- | --- |
| Wikis | 402 px | **32 px** | 398 px |
| Templates | 600 px | **32 px** | 596 px |
| Bags | 554 px | **32 px** | 550 px |
| Roles | 461 px | **32 px** | 457 px |
| Users | 600 px | **32 px** | 596 px |
| Storage | −710 px | −710 px | **28 px** |
| Pinboard | 335 px | **32 px** | 331 px |
| Meine Dateien | 368 px | **32 px** | 364 px |

- **Storage** ist der einzige Tab, dessen Inhalt über den Bildschirm hinausragt
  (1822 px Seiteninhalt bei 1080 px Fensterhöhe). Dort bleibt der Footer
  naturgemäß unterhalb der Falz, und der feste Abstand von 28 px bleibt
  erhalten – genau der Fall, an dem eine reine `margin-top: auto`-Lösung
  kaputtgegangen wäre.
- **32 px** ist der untere Innenabstand von `.admin-shell`; der Footer klebt
  also am Content-Rand und nicht direkt am Fensterrand. Auf der Startseite sind
  es entsprechend 18 px. Footerhöhe in allen Tabs 33 px wie vorher.
- **Schmale Fenster** 1920 / 1280 / 900 / 420 px: kein horizontaler Überlauf in
  allen Breiten. Bei 420 px ragt der Inhalt über den Bildschirm, der Footer
  steht erwartungsgemäß darunter und bricht auf zwei Zeilen um (47 px hoch).
- **Startseite und Impressum** unverändert: Footer 18 px über dem Rand, 33 px
  hoch, Herz vorhanden. Keine JS-Fehler.

## 64. „MWS-wikiwise 0.3.3" im Footer verlinkt

**Ziel:** Der Produktname mit Versionsnummer in den drei Footern (Startseite,
Verwaltung, Impressum) soll auf das Projekt-GitHub-Repository zeigen.

### Die Lösung

- Statt eines eigenen Konstanten-Moduls ist die URL als hartes Literal in den
  drei Dateien eingetragen – das entspricht dem Projektstil, es gibt bisher
  keine URL-Konstanten.
- **Nur der Produktname** wird zum Link, nicht die TiddlyWiki-Angabe:
  `MWS-wikiwise 0.3.3` (verlinkt) · `TiddlyWiki 5.4.1` (unverlinkt). Der Link
  sitzt also um den ersten `t()`-Aufruf des Versions-Spans. Die Übersetzungen
  bleiben unberührt, weil in JSX verlinkt wird – der Schlüsselwert selbst
  bleibt reiner Text.
- `target="_blank" rel="noreferrer"` wie bei allen externen Links der App
  (TiddlyWiki-Doku-Link, Vorschau, Wiki-Links). Die Content-Security-Policy
  greift hier nicht: Sie betrifft nur die eingebettete Wiki-Seite
  (RecipeResolver) und enthält kein `navigate-to` – eine Navigation in einen
  neuen Tab wird nicht blockiert.
- Optisch benutzt der Link automatisch das `.landing-footer a`-Stil (Akzentfarbe
  + Unterstreichung), identisch zu den Fußzeilen-Links „TiddlyWiki-Dokumentation"
  und „Impressum". Keine CSS-Änderung nötig.

### Getestet

Alle drei Footers über eine frische Testinstanz (mit Login inklusive
Emoji-Rätsel) im Browser geprüft:

- **Startseite** (öffentlich): Link-Text exakt `MWS-wikiwise 0.3.3`,
  `href` exakt `https://github.com/heino17/MultiWikiServer-wikiwise`,
  `target="_blank"`, `rel="noreferrer"`.
- **Impressum** (öffentlich): identisch.
- **Verwaltung** (angemeldet): identisch; der Versions-Span bleibt vollständig
  `MWS-wikiwise 0.3.3 · TiddlyWiki 5.4.1`.
- **Kein Umbruch:** Footerhöhe weiterhin 33 px, Herzposition unverändert
  (y = 1049), der Link sitzt 1048–1062 px in der Akzentfarbe
  `rgb(227, 201, 131)` mit Unterstreichung wie die übrigen Footer-Links.
- Keine JS-Fehler.

---

## 65. In ein Wiki hochgeladene Dateien einbinden („Dateien in diesem Wiki")

**Ziel:** Dateien, die über die Wiki-Werkzeugleiste hochgeladen werden, sollen
sich direkt im Wiki nutzen lassen — Bilder als Bild, andere Dateien als Link —
ohne dass das Wiki einen „Ordner" kennen muss oder eine separate Freigabe
nötig wäre. Die Doku behauptete das schon länger (`Datei-in-einem-Wiki-verwenden`),
technisch fehlte aber die Zuordnung.

### Die Lösung

**Server (Schritte 1–4, Commit `5b68a69`):**

- `user_file.recipe_id` (Recipe-id, nullable, mit Index) via Prisma-Schema +
  Migration `20260928_user_file_recipe`. `NULL` = persönliche Datei.
- Der Upload mit `?recipe=<slug>` schreibt ab jetzt diese `recipe_id`
  (`UserFileUpload`); Uploads aus „Meine Dateien" bleiben `NULL`.
- Neue Routen, beide mit `assertReferer(["/", "/wiki"])`:
  - `GET/HEAD /api/user-files/wiki-file?recipe=<slug>&id=<id>` — streamt die
    Datei **inline** (Bilder/Audio/Video/PDF/…) mit **Range-Support**
    (Suchen/Seeken). Die Range-Logik von `UserFilePreview` wurde dafür in den
    gemeinsamen Helper `streamInline` extrahiert und von beiden Routen genutzt.
  - `GET /api/user-files/wiki-files?recipe=<slug>` — die Liste aller Dateien
    des Wikis (fürs Verzeichnis-Modal).
- **Sichtbarkeit = Wiki-Leserecht:** Beide Routen nutzen dasselbe Read-Gate wie
  die Wiki-Seite selbst (`RecipeResolver.assertRecipe`). Wer das Wiki öffnen
  darf, sieht die Dateien — bewusst **ohne `okUser`**, damit auch anonyme Leser
  eines öffentlichen Wikis die Inhalte laden. Nutzer ohne Beziehung zum Wiki
  bekommen exakt das gleiche 404 wie fürs Wiki selbst (kein Existenz-Orakel).
  Nur Dateien, die tatsächlich in *dieses* Wiki hochgeladen wurden
  (`recipe_id`-Match), sind erreichbar; persönliche Dateien bleiben privat.

**Client (Schritt 5, Commit `1d1379a`):**

- Nach einem Upload **im Wiki** öffnet sich ein Modal mit dem fertigen
  TiddlyWiki-Code zum Einfügen: `[img[…]]` bei Bildern, `[ext[…]]` sonst.
  (Persönliche Uploads bekommen weiter nur die Erfolgsnotiz.)
- Neuer Werkzeugleisten-Button **„Dateien in diesem Wiki"** (Ordner-Icon,
  `$:/tags/PageControls`, `tm-mws-wiki-files`): lädt `/api/user-files/wiki-files`
  und zeigt je Datei Vorschau (`[img]`/`[ext]`), Dateinamen und das kopierbare
  Code-Schnipsel in einem Modal.
- Die Upload-Antwort reicht nun `id` und `type` durch; 8 neue i18n-Strings in
  allen 8 Sprachen.

### Getestet

- `tsc2` und Client-`tsc` fehlerfrei; Server- und Client-Bundle bauen.
- Migration wird vom `SqliteAdapter` beim Start automatisch angewendet
  („Applying migration 20260928_user_file_recipe"); Spalte + Index
  `user_file_recipe_id_idx` per `PRAGMA table_info` verifiziert.
- **End-to-End gegen eine frische Instanz** (Port 5099, mit eingebauter `dist/`):
  Login über das echte OPAQUE-Protokoll (`@serenity-kit/opaque`, `/login/1` +
  `/login/2`), dann `PUT /api/user-files/upload?recipe=bedienungsanleitung` mit
  einem Test-PNG. Verifiziert: `200` mit `id/type/sizeBytes`; in der DB steht
  `user_file.recipe_id` exakt auf der Recipe-Id des Wikis; `GET
  /api/user-files/wiki-files?recipe=…` listet die Datei; `GET
  /api/user-files/wiki-file?recipe=…&id=…` liefert `200 image/png` mit
  byteidentischem Inhalt und mit `Range: bytes=0-9` → `206` + `Content-Range:
  bytes 0-9/70`. Gate: anonym liefert die Datei-Route exakt den gleichen Status
  wie die Wiki-Seite selbst (hier `200`, weil die Wiki ANON-Leserecht hat),
  unbekanntes `recipe` → `404` (kein Existenz-Orakel).

### Nachtrag: URL-Auflösung im Wiki-Client repariert

Im Browser-Test (Wiki `wiki-frau-meyer`, Bild `TAvatar2.jpg`) zeigte das
Verzeichnis-Modal kein Bild, und das eingefügte Snippet lud die Datei als
`http://localhost:5000/wiki/api/user-files/…` → `400 NO_ROUTE_MATCHED`. Der
Grund: Das Snippet begann mit `api/user-files/…` (ohne führenden Slash), und
TiddlyWiki löst relative URLs gegen die Wiki-Seiten-URL `/wiki/<slug>` auf —
daraus wurde `/wiki/api/…`. Außerdem war `[ext[…]]` gar kein TW-Makro (es gibt
kein Core-Makro `ext`), Nicht-Bilder wären als Literal gerendert worden.

**Fix (`plugins/client/tiddlers/upload-file.js`):**

- Neuer Helper `wikiFileUrl()` liefert die **domain-independent** URL
  `/api/user-files/wiki-file?recipe=…&id=…` (führender Slash statt Host):
  TiddlyWiki löst sie gegen den aktuellen Ursprung auf, es wird also keine
  Host/Port in den Tiddler gebacken und das Snippet überlebt einen Server-
  Adresswechsel. Die XHR-Pfade (Upload, Verzeichnis-Liste) nutzen weiter
  `getHost()`/`$:/config/multiwikiclient/host`.
- Nicht-Bilder bekommen statt des toten `[ext[…]]` einen echten Wiki-Link
  `[[Dateiname|url]]` (Sonderzeichen `]`/`|` im Namen werden entfernt).
- Da der Dev-Server die Client-Tiddler beim Start aus `plugins/client/tiddlers/`
  einliest (Plugin-Cache `mws/<version>/client`), greift der Fix nach einem
  Neustart des Dev-Servers.

---

## 66. README: Quick-Start „Aus dem Repository" um Initialisierungsschritte ergänzt

Nach `git clone` + `npm install` + `npm start` auf einem frischen Klon blieb der
Server mit `Error: You need to run update-tiddlywiki first` hängen, weil `dev/`
gitignored ist und der Klon daher weder `dev/wiki/tw5/<version>` noch
`dev/wiki/store/` enthält — die Schritte standen nur im Development-Abschnitt,
der Quick-Start ließ sie aus. Außerdem zeigte der Quick-Start auf
`localhost:5000/dev/`, was nur mit einer lokalen `dev/mws.dev.json` gilt; ein
frischer Klon lauscht ohne diese Datei auf Port `8080`.

**Fix (`README.md`, EN und DE):** Quick-Start um `npm start update-tiddlywiki`
und `npm start init-store` ergänzt, mit Hinweis, dass `dev/` nicht in Git liegt;
Adresse auf <http://localhost:8080/> korrigiert.

---

## 67. Dependency-Reinigung: hono auf 4.13.10, in-Range-Reparaturen

`npm audit` meldete u. a. hono-Advisories (CORS-ReDoS, `memo()`-SSR-Datenleck,
Proxy-Helper, Language-Middleware, `parseBody()`, Query-Parser) — hono 4.12.27
war exakt gepinnt in `@tiddlywiki/server` und als `"*"` in `@mws/wikiwise`
aufgelöst, daher kein Fix möglich. In-Range bereinigt:

- `packages/mws/package.json: "hono": "*"` → `"hono": "^4.13.10"`, und
  `packages/server/package.json: "hono": "4.12.27"` → `"hono": "^4.13.10"`.
  hono ist der Core-Router des serverseitigen TW-Servers (`new Hono<HonoEnv>()`,
  `@hono/node-server`, `serve-static`); 4.13.10 behebt alle gelisteten Advisories.
- `npm audit fix` zog zusätzlich in-Range: `@hono/node-server` 2.0.8 → 2.1.1
  (WS-Handshake-DoS), `uuid` 11.1.0 → 11.1.1, `picomatch` 2.3.1 → 2.3.2,
  `micromatch` 3.1.3 → 3.2.3.
- **Verifiziert:** E2E (17 Checks, Login/Upload/wiki-file/wiki-files/Recipe-Gate)
  gegen eine frische Instanz mit dem neu gebauten `dist/mws.js` → **ALL PASS**.
- **Verbleibend:** nur `esbuild`/`html-jsx` (moderate, reines Build-Dev-Tooling,
  nicht im Server-Paket; Fix nur per Breaking-Change `html-jsx@0.3.7`).

---

## 68. Fix: 1-Klick-Wiki des `admin` startet jetzt ebenfalls privat

Beim 1-Klick-Wiki-Anlegen (`PUT /admin/wiki`, Button **„1-Klick Wiki erstellen"**)
bekam nur der **Site-Admin** zusätzlich `USER → A_read` und `ANON → A_read`
eingetragen. Lehrer und Schüler bekamen — seit §22 — nur ihre **persönliche**
Rolle und damit bewusst **keinen** Lesezugriff für alle. Der Admin war damit
der einzige Benutzer, dessen per Knopfdruck angelegtes Wiki sofort für *alle*
eingeloggten Benutzer **und** anonym öffentlich war; es erschien damit
zusätzlich auf der öffentlichen Startseite `/` (§48, gleiche ANON-Regel wie
`LandingRoutes.ts`).

**Ursache:** `AdminCreateWiki` in
`packages/mws/src/new-managers/TabDataAdapter.ts` hat die Rollen bedingt
gewählt:

```ts
const commonRole = isAdmin ? rolesMapper("USER") : undefined;
const anonRole   = isAdmin ? rolesMapper("ANON") : undefined;
```

und diese beiden Variablen in beide Permission-Listen (Bag `C_admin` +
Recipe `B_write`) als `A_read` eingespreizt.

**Fix (`TabDataAdapter.ts`):** Die Sonderbehandlung für `isAdmin` entfällt
komplett — jetzt wird **für niemanden** ein Lesezugriff eingetragen:

- `commonRole`/`anonRole` und die beiden `...(… ? [{ level: "A_read" }] : [])`-Spreizungen entfernt; die Permission-Listen bestehen nur noch aus der Creator-Rolle.
- `NEW_WIKI_ROLES` von `["ADMIN", "USER", "ANON"]` auf `["ADMIN"]` verkleinert — `USER`/`ANON` werden gar nicht mehr aufgelöst, der Kommentar dort und an der Rollenwahl erläutert das.

**Ergebnis:** Das 1-Klick-Wiki ist für **alle** Benutzer privat — identisch zu
dem von Frau Meyer und Heino. Der Admin behält vollen Zugriff: `ADMIN → C_admin`
(Bag) bzw. `ADMIN → B_write` (Recipe) sowie der `isAdmin`-Bypass in
`RecipeResolver.assertRecipe` (`RecipeResolver.ts:200`). `owner_user_id` bleibt
der Admin, der Owner-Schutz (§11) greift unverändert.

**Freigeben:** bewusst wie bisher beim Lehrer über den Wiki-Dialog
(„Definiertes Wiki erstellen" → *Lesbar durch* / `recipeUsers`, §26) bzw. per
Einladung (§25) — also **nicht** über den 1-Klick-Knopf.

**Verifiziert:** `tsc -p tsconfig.json --noEmit` fehlerfrei.

**Hinweis:** Bereits angelegte Admin-Wikis behalten ihre bisherigen
`USER`/`ANON`-Rechte (die Änderung wirkt nur auf neu angelegte Wikis). Wer sie
privat ziehen will, entfernt die beiden Rollen im Wiki-Dialog unter
*Lesbar durch*.

---

## 69. Fix: Das 1-Klick-Wiki-Modal schließt nach dem Anlegen

Nach einem erfolgreichen 1-Klick-Anlegen blieb der Dialog **„Wiki auf einen
Klick anlegen"** offen und zeigte zusätzlich den Hinweis
„Fertig — dein Wiki ist da:" mit dem Link auf das neue Wiki. Der Dialog
verschwand erst, wenn man ihn per *Schließen* / ✕ wegklickte — obwohl die
Aktion längst fertig war.

**Fix (`packages/admin-vanilla/src/app.tsx`, `submitNewWiki`):** Im
Erfolgsfall wird der Dialog jetzt geschlossen (`newWikiOpen = false`) und das
Namensfeld geleert — genau wie beim Wiki-Löschen (`deleteWiki` →
`store.closeModal()`), das denselben Ablauf schon so handhabt. Bei einem
Fehler bleibt der Dialog wie bisher offen und zeigt den Fehler im
`error-banner`.

**Folge:** Der Bestätigungs-Links „Fertig — dein Wiki ist da:" im Dialog ist
überflüssig geworden und wurde entfernt — samt `@state() newWikiSlug` (wird
nicht mehr gesetzt) und dem jetzt ungenutzten Textschlüssel in allen acht
Sprachdateien (`de`, `en`, `es`, `fr`, `ja`, `ko`, `ru`, `zh-cn`). Der Link
geht nicht verloren: `store.reload()` lädt die Liste, das neue Wiki steht
sofort unter *Meine Wikis* — die Slug-Spalte ist dort ein Link auf
`/wiki/<slug>` (`getListColumnLinkMappers`, `app.tsx:2492`).

**Verifiziert:** `tsc -p tsconfig.json --noEmit` fehlerfrei.

---

## 70. Fix: Willkommen-Tiddler zeigte „1. Willkommen in …" statt einer Überschrift

Das Start-Tiddler des 1-Klick-Wiki enthielt als erste Zeile
`# Willkommen in „<Wiki-Name>" 🎉`. Das ist **Markdown**, der Tiddler ist aber
`text/vnd.tiddlywiki` — und dort ist `#` **keine** Überschrift, sondern das
Zeichen für einen **nummerierten Listenpunkt**. TW rendert die Zeile deshalb
als `<ol><li>` → in der Wiki-Ansicht stand ein kleines „1." vor dem Text statt
der fett gesetzten Überschrift.

**Fix (`packages/mws/src/new-managers/TabDataAdapter.ts`, `welcomeText`):**
`#` → `!`. Die TW-Syntax für Überschriften ist `!` (h1) bis `!!!!!!` (h6)
(`core/modules/parsers/wikiparser/rules/heading.js`, Regexp `(!{1,6})`);
`#` gehört zur Liste `list.js` (`ordered`). Die beiden Aufzählungspunkte
unten bleiben `*` (ungesortete Liste) — das war schon richtig.

**Migration bestehender Wikis (`mirrorDisplayNameIntoStarterTiddlers`):**
Der Guard, der den automatisch erzeugten Willkommen-Text am unveränderten
Starter erkennt (und ihn beim Umbenennen des Wikis mitzieht), prüfte auf
`startsWith("# Willkommen in …")`. Da der Starter-Text sich geändert hat,
wäre er für bestehende Wikis ins Leere gelaufen und der Text hätte beim
Umbenennen **nicht** mehr aktualisiert. Der Guard akzeptiert deshalb jetzt
beide Formen (`#` **und** `!`); beim nächsten Umbenamen wird ein altes Wiki
automatisch auf `!` mitgezogen. Selbst geschriebene Willkommen-Texte bleiben
weiterhin unangetastet (Zusatzbedingung „per Knopfdruck für dich angelegt").

**Verifiziert:** TW-5.4.1-Quellcode der Regeln `heading.js` (`!`) und der
Listenregel (`#`) gelesen; `tsc -p tsconfig.json --noEmit` fehlerfrei.

**Noch offen (nicht angefasst):** Die 54 `.tid`-Dateien der Edition
`bedienungsanleitung` (Wiki *MWS Bedienungsanleitung*) sind ebenfalls in
Markdown geschrieben (`#` Überschrift, `-` Listen, `**fett**`), haben aber
**kein** `type:`-Feld — sie erben damit `text/vnd.tiddlywiki` und werden
genauso falsch gerendert. (Zum Vergleich: `editions/mws-docs` macht es
richtig, `.md`-Dateien mit `.meta`-Dateien auf `type: text/markdown`.)

---

## 71. Fix: „Dateien in diesem Wiki" zeigte „1. Dateien in diesem Wiki"

Dieselbe Markdown-statt-TW-Syntax wie in §70, diesmal im **Client-Plugin**
beim Wiki-Toolbar-Knopf **„Dateien in diesem Wiki"**. Der Knopf legt den
Tiddler `$:/state/mws/WikiFiles` an und zeigt ihn als Modal; dessen Überschrift
war mit `# ` gebaut und erschien deshalb als nummerierter Listenpunkt
(„1. Dateien in diesem Wiki") statt als fetter Überschrift.

**Datei:** `plugins/client/tiddlers/upload-file.js`

Darin wurden **drei** Stellen mit Markdown-Syntax für `text/vnd.tiddlywiki`
gebaut, **zwei** davon Überschriften:

- `renderWikiFiles` (`:250`) — `var body = "# " + …` → `"! " + …`. Das ist der Tiddler `$:/state/mws/WikiFiles`.
- `showUploadSnippet` (`:203`) — `text: "# " + …` → `"! " + …`. **Dieselbe** Überschrift, aber im Erfolgs-Modal, das nach einem Datei-Upload in ein Wiki erscheint — die war denselben Fehler wert und wird mit korrigiert.
- `renderWikiFiles` (`:248`) — `"**" + file.filename + "**"` → `"''" + file.filename + "''"`. TW-Fett ist `''` (`rules/emphasis/bold.js`, Regexp `/''/mg`); `**` blieb als **zwei sichtbare Sternchen** stehen. Betraf jeden Listeneintrag, also den Dateinamen jeder Datei im Modal.

Die Sprachtexte selbst (`en-US.multids` und die sieben `i18n/*.multids`) sind
reiner Fließtext ohne Markup — sie waren nie betroffen.

**Verifiziert:** TW-5.4.1-Regeln `heading.js` (`!`), `emphasis/bold.js` (`''`),
`list.js` (`#`/`*`) gelesen. Der Code-Teil des Repos ist damit vollständig
geprüft: die Sweep über alle `addTiddler`/`setText`/`saveTiddler`-Stellen
findet **keine** weitere Stelle mehr, die Wiki-Text aus Markdown baut. Die
übrigen Treffer sind entweder Durchreichung von Client-Text
(`attachments.ts`, `RecipeResolver.ts`, `save-tiddler-text.ts`), JSON/`"yes"`-/
`"no"`-Statuswerte oder bewusst Markdown für die Admin-Oberfläche
(`app-landing.tsx`, `legal-notice.tsx`, `user-files.tsx` — die wird serverseitig
zu HTML gerendert, TW-Wiki-Text wäre dort wirkungslos).

**Bleibt offen** (statische Inhalte, nicht angefasst, siehe Rückfrage):
`editions/bedienungsanleitung/tiddlers/*.tid` (49 von 54 Dateien, §70) und
drei `editions/mws-docs/tiddlers/*.tid` mit einfachem Backtick statt
Doppel-Backtick für Inline-Code (`Allowed Methods.tid`, `Usage.tid`,
`system/$__mws_cssvar-macro.tid`).

---

## 72. Fix: die komplette „MWS Bedienungsanleitung" war in Markdown geschrieben

Nach §70/§71 dieselbe Ursache in der Edition
`editions/bedienungsanleitung` (dem Wiki *MWS Bedienungsanleitung*, 54
`.tid`-Dateien, angelegt in `new-commands/init-store.ts`): Die Tiddler sind
**ohne** `type:`-Feld, erben also `text/vnd.tiddlywiki` — geschrieben waren sie
in **Markdown**. Überschriften erschienen als „1. Titel", Aufzählungen als
wörtliche Bindestriche, Fettungen als sichtbare `**`.

**Entscheidung:** TW-Syntax statt `type: text/markdown`. Ein Markdown-Parser
ist im Standard-Setup nicht vorhanden (er ist nur in `editions/mws-docs`
verfügbar) — mit `text/markdown` wäre die Anleitung im Normalbetrieb unlesbar
gewesen.

**Umgestellt (49 der 54 Dateien, 354 Zeilen):**

- `# Titel` → `! Titel`
- `- Punkt` → `* Punkt` (alle 220 Listenpunkte standen auf Spalte 0, keine Verschachtelung, keine Fortsetzungszeilen)
- `**fett**` → `''fett''` (155 Stellen)
- `` `code` `` → ```` ``code`` ```` (8 Stellen)

Unangetastet blieben die 5 Dateien ohne Markdown: `$:/core/ui/TagTemplate`
(Widget/HTML), `$:/TagLanguageStyles` (CSS), `$:/DefaultTiddlers`, `$:/SiteTitle`,
`$:/SiteSubtitle`. Der Konverter hat **nur den Body** angefasst (nie den
Header) und liefert 368/354 Zeilen — die Differenz sind ausschließlich 14 neu
eingefügte Leerzeilen.

**Zweite, nur durch Rendern sichtbare Fehlerklasse:** In Markdown darf eine
Liste einen Absatz unterbrechen, in TW nicht. In `Übersicht`/`Overview`
standen die Abschnitts-Überschriften (`''Anmelden & Konto''`) unmittelbar
über ihrer Liste, wodurch alle Punkte als Text in einem `<p>` landeten. 14
Leerzeilen eingefügt (7 pro Datei).

**Verifiziert mit dem echten Renderer** (`node dev/wiki/tw5/5.4.1/tiddlywiki.js
editions/bedienungsanleitung --rendertiddler … text/html`), alle 54 Seiten:

- `<h1>`, `<strong>`, `<ul><li>`, `<code>` — keine wörtlichen `- `, `# `,
  `**`, kein sichtbarer Backtick, kein `<ol>` mehr
- alle Links lösen auf (`tc-tiddlylink-resolves`)

**Zwei Korrekturen an meiner eigenen Analyse:** Ein erster Sweep meldete drei
Fehlalarme in `editions/mws-docs` (`Allowed Methods.tid`, `Usage.tid`,
`system/$__mws_cssvar-macro.tid`) — „einfacher statt doppelter Backtick für
Inline-Code". Der Renderer widerlegt das: die Regel
`codeinline.js` matcht `/(``?)/mg`, **ein** Backtick ist in TW 5.4.1 ein
gültiger Inline-Code-Begrenzer (ebenso wie der doppelte). Diese drei Dateien
sind daher **unverändert** geblieben. Ebenso waren die 4 Backtick-Stellen in
der Anleitung bereits korrekt; die Umstellung auf Doppel-Backtick ist
kosmetisch.

Für die Code-Dateien aus §70/§71 gilt dasselbe: die verwendeten TW-Konstrukte
(`!`, `''`, `*`, ``````) sind am echten Renderer verifiziert.

---

## 73. Fix: `load-wiki-folder --overwrite` war für vorhandene Bags grundsätzlich unbenutzbar

Beim Aktualisieren der Anleitung aus §72 im lokalen Store (`load-wiki-folder
editions/bedienungsanleitung --overwrite`) brach der Befehl mit einem 403 ab:

```
SendError: {"status":403,"reason":"ACCESS_DENIED",
  "details":{"reason":"Only the user who created the bag (or the site admin
  'admin') may edit it."}}
  at BagDataAdapter.saveRow (TabDataAdapter.ts:905)
  at LoadWikiFolderCommand.execute (new-commands/load-wiki-folder.ts:142)
```

**Ursache:** Zwei Autorisierungspfade im selben `saveRow` widersprachen sich.
`BagDataAdapter.saveRow` prüfte den Besitzer über den hartkodierten Vergleich
`user.username === "admin"`, während der vorgeschaltete
`checkExisting()` (TabUpserts.ts:97) `user.isAdmin` auswertet. Der CLI-Befehl
identifiziert sich als Admin, hat aber gar keinen `username`
(`new BagDataAdapter({ isAdmin: true } as any)`), also schlug die Inline-Prüfung
immer fehl — und zwar für **jeden** bereits existierenden Bag. `init-store`
kam daran vorbei, weil er neue Bags anlegt (`existing === null`); ein
`--overwrite` konnte also nie funktionieren. Betroffen war auch jeder
ADMIN-Rollen-Benutzer, dessen `username` nicht exakt `admin` lautet.

**Fix (ohne Semantikänderung der Rechte):** Die Inline-Prüfung zugunsten des
kanonischen Helpers `assertCanEdit()` entfernt, den es bereits für Templates
gibt, und dessen `isSiteAdmin` um `user.isAdmin` erweitert. `isAdmin` wird vom
SessionManager aus der ADMIN-Rolle abgeleitet und ist damit verlässlich;
`checkExisting` vertraute bereits ausschließlich darauf. Beide Pfade urteilen
jetzt identisch, die Fehlermeldung ist einheitlich.

**Zweite, kleine CLI-Korrektur:** `recipe-users` und `owner-roles` waren im
Commander-Info mit `<string>` (also **einzelwertig**) deklariert, während
Beschreibung, Typ (`string[]`) und `init-store` mehrere Rollen vorsahen. Der
Parser lehnt daher `--recipe-users ANON USER` mit
`The option "recipe-users" may only have a single value` ab. Deklariert als
`<string...>` (variadic) sind beide Optionen nun mehrwertig, wie dokumentiert.
Ohne das hätte der Import die bestehende `USER`→`A_read`-Freigabe der Anleitung
verloren — angemeldete Benutzer bekommen die `ANON`-Rolle nämlich *nicht*
(`SessionManager.parseIncomingRequest`), der Zugriff wäre stillschweigend auf
Administratoren beschränkt gewesen.

**Nebeneffekt des Imports, geprüft und bewusst übernommen:** Die
Rezept-Definition der Anleitung enthält jetzt explizit
`plugins: ["$:/themes/tiddlywiki/vanilla", "$:/themes/tiddlywiki/snowwhite"]`
(statt `[]`). Das ist ein **No-op**: `requiredPlugins`
(plugin-cache/index.ts:22-26) enthält dieselben beiden Themes bereits, und
`RecipeResolver.getPluginList()` vereinigt beide Listen über ein `Set`.
Darstellung und Zugriff ändern sich nicht.

**Ebenfalls vom Import betroffen, wiederhergestellt:** `load-wiki-folder`
schreibt `landingVisible: true` fest (load-wiki-folder.ts:176, TabDataAdapter.ts:463),
löscht damit ein gesetztes `landing.hidden.<recipeId>` und hätte die Anleitung
auf der öffentlichen Startseite sichtbar gemacht. Da die CLI diesen Zustand
nicht ausdrücken kann, wurde das Flag nach dem Import gesetzt zurück (die
Checkbox *Landing page* im Wiki-Editor steuert dasselbe). Ebenso wurden die
8 handgeschriebenen Tiddler des Bags gelöscht (`saveLoadedTiddlers` entfernt
jeden Titel, der nicht im Ordner liegt) — darunter `$:/language`,
`$:/languages/de-DE`, das Markdown-Plugin und der Entwurf
`Entwurf: 'Start' von admin`.

**Verifiziert:** Vollvergleich der SQLite-Datenbank vor/nach dem Import über
Rezepte, Rezept-Definitionen, Recipe-Bag-Zuordnung, Recipe- und Bag-Rechte,
Bags, Templates, Benutzer und Rollen: **alle 14 anderen Wikis bitidentisch**,
Rezept- und Bag-Rechte der Anleitung unverändert, nur der Anleitungs-Bag
62 → 54 Tiddler. Alle 54 importierten Tiddler wurden auf Markdown-Reste geprüft:
0 Treffer.

---

## Nicht eingecheckte Start-Konfiguration (lokal, gitignored)

```json
[
  {
    "host": "0.0.0.0",
    "port": "5000"
  }
]
```

> Hinweis: Standard-Port 8080 ist auf dem Server bereits von Apache2
> belegt (Ubuntu-Default-Page), deshalb Port 5000.

## Datenschutz / Privacy

- **Keine externen Fonts/Assets:** Die Verwaltungsoberfläche lädt weder
  Google Fonts noch Material-Icons-Fonts von fremden Servern. Die
  Icons sind eingebettete SVGs (`@material-symbols/svg-400`); die
  Roboto-Variable-Font (latin/latin-ext, normal/kursiv) wird lokal aus
  `packages/admin-vanilla/public/fonts/` ausgeliefert (→ `/fonts/*.woff2`).
  Damit entfällt z. B. der Google-Fonts-abhängige Cookie-Hinweis.
  Roboto ist unter der **SIL Open Font License 1.1** lizenziert; die
  Lizenz liegt als `OFL.txt` bei `packages/admin-vanilla/public/fonts/`
  aus (unveränderte Nutzung, keine Reservierten Font-Namen berührt).
- **Cookie-Hinweis (Consent-Banner, kategorienbasiert):** Am unteren
  Bildschirmrand blendet ein Hinweis weich ein. Kategorien: `essential`
  (Session-Cookie `session`, technisch erforderlich, immer), `preferences`
  (lokal in `localStorage`: Design/Sprache, immer) und `external`
  (Dienste Dritter wie z. B. Google Fonts — **standardmäßig aus**, laden
  nur nach gesonderter Zustimmung). Buttons: „Alle Cookies akzeptieren",
  „Nur notwendige Cookies" und „Cookie-Einstellungen" (Detail-Panel mit
  Kippschaltern). Der Zustand liegt als versioniertes Objekt in
  `localStorage` (`mws-cookie-consent`, `{version:"v2",…}`); die alte
  `v1`-Annahme wird konservativ migriert (external=false, kein erneutes
  Nachfragen). Umsetzung: `consent.ts` (zentrale API: `getConsent`,
  `hasConsent`, `setExternalConsent`, `onConsentChange`,
  `applyExternalStylesheet` als zukünftiger Einbindepunkt für externe
  Ressourcen), `cookie-consent.tsx` + `.cookie-consent` in
  `app.inline.css`, global in `main.tsx` eingebunden (Landing, Login,
  Verwaltung). Die Zustimmung ist jederzeit änderbar:
  `openCookieConsent(true)` in `cookie-consent.tsx` öffnet das Banner
  erneut direkt auf dem Einstellungs-Panel; erreichbar über
  „Cookie-Einstellungen" im Footer der Startseite — derselbe Footer ist
  auch in die Verwaltungsansicht übernommen (dafür entfiel der frühere
  Cookie-Icon-Button im Verwaltungs-Header). Dazu liefert die embedded
  Server-Response nun `mwsVersion` für die Versionsanzeige im Footer.
- **Impressum (eigene Seite, kein Modal):** Für den Live-Betrieb liefert
  die App eine öffentliche Seite unter `/legal-notice` (anonyme und
  eingeloggte Besucher gleichermaßen). Der Inhalt ist eine einzige
  Markdown-Textarea in den admin-„Einstellungen" (`admin.legalNotice`),
  bewusst **eine** für alle Sprachen — wer es braucht, trägt den Text in
  seiner Sprache ein. Gerendert wird mit demselben escaped Mini-Markdown
  wie Willkommens-/News-Text: rohe HTML-Tags (`<b>`, `<center>`, …)
  erscheinen als Literaltext und werden nie als aktive Elemente
  injiziert (Defense-in-depth). Der Kopf der Seite zeigt für alle den
  Button „Zurück zur Wiki-Übersicht". Ein-/Ausschalter
  `admin.showLegalNotice` (Standard: an, auch im Install-Seeding):
  deaktiviert verschwinden die Links „Impressum" aus den Footers der
  Startseite und der Verwaltung, die API `GET /api/legal-notice`
  liefert `content: null`, und ein direkter Aufruf von `/legal-notice`
  fällt auf Login/Übersicht zurück. Umsetzung: `legal-notice.tsx`
  (Komponente + `.legal-notice-card` in `app.inline.css`),
  `LegalNoticeRoute` in `LandingRoutes.ts`, `admin.legalNotice`/
  `admin.showLegalNotice` in `PrefsRoutes.ts`, Text + Schalter in
  `app-settings.tsx`, Link „Impressum" in `app-landing.tsx` und
  `app.tsx`.

---

## 74. Fix: Thumbnails im Browser-Cache eingefroren (Bild aktualisiert sich erst nach Strg+Shift+R)

Nach §43 (Thumbnail-Anzeige) kam die Meldung: ein neu angelegter Tiddler
erscheint nicht im Vorschaubild, ein `Strg+Shift+R` zeigt ihn aber sofort.
Die Serverlogik aus §43 arbeitet dabei korrekt — der Fehler lag an zwei
Response-Headern in `serveWikiThumbnail()`
(`WikiThumbnailRoutes.ts`).

**Ursache 1 — `Cache-Control: private, max-age=<TTL>`:** Die Bild-URL ist pro
Wiki stabil (`/wiki/<slug>/thumbnail`, `store.ts:316`), und `max-age` stand auf
dem **Server-TTL** (24 h). Der Browser stellte die Anfrage also bis zu 24 Stunden
gar nicht erst — die Revalidierung über `ETag`/`If-Modified-Since`, die direkt
darunter bereits vollständig implementiert ist, wurde nie erreicht. Der Server
konnte das PNG noch so oft neu rendern: das im Browser liegende Exemplar blieb
stehen. `max-age` war hier doppelt falsch — der TTL steuert, **wann der Server
neu rendert**, nicht, wie lange ein Browser ein *byteidentisches* Bild behalten
darf. Verifiziert am Beispiel `wiki-heino`: Tiddler `New Tiddler` um 08:07
gespeichert, PNG serverseitig um 10:19 neu gerendert, HTTP-Header davor
`cache-control: private, max-age=86400` bei unveränderter URL.

**Fix:** `private, no-cache` (statt `max-age`) für 200 und 304. Der Browser
fragt damit bei jedem Anzeigen nach, bekommt bei Unverändertheit aber nur einen
304 ohne Body — der ETag wird aus `mtime`+`Größe` der PNG-Datei gebildet, ist
also nach einem Re-Render garantiert neu.

**Ursache 2 — der 404 ohne Cache-Header:** Für ein Wiki ohne PNG antwortete die
Route mit `writeHead(404, {contentType})` und **ohne** `Cache-Control`. Ein 404
ohne Frische-Informationen ist laut HTTP heuristisch cachebar, der Browser
konnte sich also den „kein Bild"-Zustand merken und lange weiter ausliefern,
nachdem das PNG längst existierte. Genau das ist beim Wiki *MWS
Bedienungsanleitung* passiert: Das Vorschaubild fehlte über Stunden in der
Admin-Liste, obwohl die Route es jederzeit hätte rendern können — der Browser
wollte es nur nicht mehr laden. **Fix:** `404` antwortet jetzt mit
`cache-control: no-store`.

**Bleibende, gewollte Verzögerung:** Der 180-s-Debounce aus §43 (TiddlyWiki
autosavet bei jedem Tipp) und das Rendern erst beim nächsten Listenaufruf
bleiben unverändert. Erwartetes Verhalten ist damit: Tiddler speichern → ca.
3 min warten → Wikis-Tab (neu) laden → neues Bild. Kein Neuladen der Seite und
kein Hard-Reload mehr nötig. *(Diese Verzögerung ist in §75 auf 60 s verkürzt und
das Löschen des PNG abgeschafft — die Abschnitte 74 und 75 gehören zusammen.)*

**Verifiziert** gegen den laufenden Server:

| Fall | vorher | nachher |
| --- | --- | --- |
| Abruf | `200`, `max-age=86400` | `200`, `private, no-cache` + `ETag` |
| `If-None-Match` = aktuell | — | `304 Not Modified` (kein Body) |
| `If-None-Match` = veraltet | — | `200` mit neuem Bild |
| PNG fehlt | `404` ohne Header | `404`, `no-store` |

Zwei kleinere Beobachtungen aus demselben Durchgang (kein Fehler, nur
Erklärung): `recipe.compiledAt` wird nur beim Speichern der
Wiki-**definition** aktualisiert, nicht beim Speichern eines Tiddlers — es taugt
deshalb nicht als Cache-Buster, wohl aber `lastEventId`/`tiddler.updated`, falls
man später einmal versionierte URLs (`?v=…`) statt Revalidierung will. Und
`bedienungsanleitung.png` existierte bis zum Hard-Reload gar nicht: die Datei
entstand erst um 10:19, also durch die erzwungene Neuanfrage.

---

## 75. Fix: Vorschau veraltet nicht mehr, statt zu verschwinden (kein Leerbild mehr beim Tippen)

Der Cache-Fix aus §74 hat die Anzeige zuverlässig gemacht, aber die Wartezeit
blieb unverändert: 180 s Debounce plus Rendern erst beim nächsten Listenaufruf.
Grund: TiddlyWiki sendet bei jedem Tastendruck einen Sync (`syncer.js`
`throttleInterval = 1000`), und §43 ließ das PNG **löschen**, sobald nach 180 s
Ruhe ein Tiddler gespeichert worden war. In diesem Zeitfenster war das Bild weg —
bei einem echten Render (etwa 2,5 s Chromium) hatte die Wiki-Liste für alle
Besucher ohne Schreibrecht eine leere Zelle, denn nur angemeldete Nutzer
rendern überhaupt.

**Ursache der 3 Minuten, in Zahlen:** `syncer.js` drosselt Saves auf einen pro
Sekunde (`throttleInterval = 1000`), der Task-Timer des Servers läuft mit 250 ms,
also nach der letzten Änderung summa 1,25 s. Der Debounce in §43 war deshalb auf
180 s gesetzt, damit ein tippender Benutzer nicht jedes Vorschaubild neu rendert.
Der Preis: bis zu drei Minuten bis zur Aktualisierung.

**Änderung — Freshness aus der Datenbank statt Timer:**
`serveWikiThumbnail()` vergleicht jetzt das `mtime` desliegenden PNG mit dem
neuesten `tiddler.updated` über die Bags des Recipes (`isStaleAfterEdit()`,
eine `aggregate`-Abfrage auf `_max(updated)`). Der Aufrufer `RecipeRoutes.ts`
ruft nach `batch/save` und `batch/delete` **gar nichts** mehr auf, es gibt keine
`invalidationTimers` mehr und das PNG wird nie gelöscht. Neu gerendert wird nur
noch, wenn

1. kein PNG existiert,
2. das Server-TTL (§43, `admin.thumbnailTtlHours`) abgelaufen ist, oder
3. das PNG älter als der letzte Tiddler-Save ist **und** das Wiki seitdem
   `thumbnailGraceMs()` ms Ruhe hat (Default **30 s**,
   `MWS_THUMBNAIL_GRACE_SECONDS`; der alte Name
   `MWS_THUMBNAIL_DEBOUNCE_SECONDS` entfällt).

Damit bleibt ein veraltetes Vorschaubild sichtbar und wird nach 60 s Schreibpause
beim nächsten Abruf ersetzt — statt zu verschwinden. Der Vergleich überlebt
außerdem einen Neustart: der Debounce-Timer aus §43 lebte nur im Prozess, und ein
Neustart innerhalb des Fensters ließ ein veraltetes Bild bis zum TTL (24 h)
stehen. Gelöscht wird weiterhin nur beim **Löschen des Wikis**
(`deleteThumbnail()`), und der Aufräumlauf über verwaiste Dateien beim Start
(`sweepOrphanedThumbnails()`) bleibt unverändert.

**Verifiziert** gegen den laufenden Server, echte `batch/save`-Aufrufe inklusive
(die Messung entstand mit dem damals eingestellten Grace von 60 s, der Default
ist inzwischen auf 30 s gesenkt):

| Fall | Ergebnis |
| --- | --- |
| PNG neuer als letzter Save | `200` in 19 ms, kein Render |
| Save, Abruf sofort (innerhalb der Grace) | `200` in 19 ms, PNG unverändert, altes Bild sichtbar |
| Save, Abruf anonym während der Grace | `200`, PNG vorhanden |
| Abruf nach 62 s Ruhe | `200` in 4,6 s, PNG neu gerendert |
| Tiddler neuer als PNG, Grace 0 | `200` in 4,0 s, PNG neu gerendert |
| Header unverändert | `200`/`304`: `private, no-cache`; `404`: `no-store` |

**Grace-Default von 60 s auf 30 s gesenkt**, `MWS_THUMBNAIL_RENDER_CONCURRENCY`
bleibt bei **2**. Beides sind reine Defaults, per Umgebungsvariable weiterhin
überschreibbar; die Parallelität wird einmal beim Start gelesen, ein Neustart
genügt also.

Warum die Grace kein Last-Treiber ist: Ein Render wird ausschließlich
angefordert — es gibt keinen Hintergrund-Job, der alle Wikis neu rendert. „Viele
Wikis im Einsatz" erzeugt für sich genommen keine Last, nur „viele Wikis, die
gerade veraltet sind **und** angesehen werden". Verlängerte Denkpausen von 30–60 s
werden jetzt gerendert; das kostet Renders, aber keine RAM/CPU ohne Anlass. Der
inhaltliche Preis: häufiger entsteht ein Bild aus einem halbfertigen
Bearbeitungsstand.

Warum die Parallelität bei 2 bleibt — gemessen auf 4 Kernen / 8 GB mit 15 Wikis,
alle Thumbnails entfernt und alle 15 parallel neu gerendert:

| | Wert |
| --- | --- |
| RAM in Ruhe | 463 MB (151 MB Node + 312 MB untätiger Browser) |
| RAM-Spitze bei 4 gleichzeitigen Renders | 883 MB (+420 MB, ~14 % des freien Speichers) |
| CPU beim Voll-Render | 26,9 CPU-Sekunden = **29 % von 4 Kernen** |
| Wandzeit Voll-Render aller 15 Wikis (4 Slots) | 89,95 s |

Das Rendern ist **warte-, nicht CPU-gebunden**: `page.goto(…, networkidle)` mit
60 s Timeout plus 2,5 s Wartezeit vor dem Screenshot, dazu
Software-Rendering (`--disable-gpu`) — im Node-Prozess selbst landen 0,00 s CPU,
die Last steckt vollständig in Chromium. Derselbe Auftrag mit vier kleinen Wikis,
zweimal ausgeführt:

| | Wandzeit | je Render |
| --- | --- | --- |
| 4 parallel (Concurrency 4) | **12,24 s** | 5,6 – 12,2 s |
| nacheinander (Concurrency 1) | **18,27 s** | 4,0 – 4,8 s |

Faktor **1,5** für doppelten Speicherbedarf. Hochgerechnet auf die 15er-Burst ist
der Zeitgewinn entsprechend klein (seriell ~70–90 s, mit 4 Slots 90 s), weil sich
die einzelnen Renders von ~4,5 s auf 5,6–12,2 s dehnen. Auf dieser Maschine
lohnt die höhere Parallelität also nicht; sie bleibt deshalb bei 2 und ist für
Installationen mit viel RAM weiterhin per Umgebungsvariable bis 8 anhebbar. Was
hier überhaupt spürbar war, ist die Wandzeit des Voll-Renders selbst: 90 s bis
das letzte Bild einer Wiki-Liste da ist.

Nebenbefund beim Messen: Der 404 der **Rechteprüfung** (privates Wiki, anonymer
Abruf) trägt weiterhin keinen `Cache-Control`. Das ist das generische MWS-Verhalten
für alle Routen, nicht thumbnailspezifisch; ein pauschales `no-store` als Default
wurde verworfen, weil `Cache-Control` beim Antworten *merge* statt ersetzt wird
und daraufhin jede erfolgreiche Antwort widersprüchlich
`no-store, private, no-cache` ausgeliefert hätte.

## 76. Wiki-Liste blättern statt 15 Vorschaubilder auf einmal rendern

Mit aktivierten Vorschaubildern (§73/§74) lädt die Wiki-Liste **alle** Wikis
auf einmal: eine Zeile pro Wiki, jede mit eigenem PNG. Bei 15 Wikis sind das
15 HTTP-Anfragen und 15 Bilder im DOM — sichtbar sind zunächst nur die oberen,
der Rest rendert trotzdem im Hintergrund mit (2 Slots, §75).

**Warum clientseitig und nicht serverseitig:** `/admin/load` liefert die
Wiki-Liste bereits als einzelnes Response mit, und Sortierung wie Gruppierung
passieren ohnehin im Client. Ein serverseitiger Seitenabruf würde daran nichts
ändern, sondern nur einen weiteren Roundtrip pro Blätterbewegung einführen. Die
Liste ist zudem klein und nach oben begrenzt (eine Zeile pro Wiki) — es gibt
nichts, was serverseitig wegließe.

**Verhalten:** Standard sind 10 Wikis pro Seite, einstellbar über
`admin.wikisPerPage` (0–200; `0` = alle Wikis in einer Liste, leeres Feld =
Standard 10). Der Pager zeigt Zurück/Weiter, „Seite X von Y" und die Gesamtzahl.
Die Gruppen „Meine Wikis", „Für dich freigegeben" und „System-Wikis" bleiben;
setzt sich eine Gruppe auf der Folgeseite fort, wird ihre Überschrift dort
wiederholt. Die Seitenzahl wird geklemmt (keine leere Seite, wenn die Liste
kürzer wird) und beim Tabwechsel zurückgesetzt; ein Klick auf Zurück/Weiter holt
den Listenkopf zurück in den sichtbaren Bereich.

**Wirkung:** Der eigentliche Gewinn ist nicht die Seitenanzahl, sondern die Zahl
der Vorschaubilder: bei 15 Wikis und 10 pro Seite liegen 10 PNGs im DOM statt
15 — und gerendert wird nur die Seite, die man tatsächlich ansieht.

**Einstellung:** Neues Feld „Wikis pro Seite" in den Admin-Einstellungen, mit
derselben 0–200-Prüfung wie im Server-Schema.

**Getestet** (zweite Dev-Instanz auf Port 5001, 15 Wikis, Chromium headless):
10 → 2 Seiten (10 + 5), 7 → 3 Seiten, 5 → 3 Seiten, 0 → kein Pager mit allen
drei Gruppen in einer Liste; Speichern über das Formular (7) und Leeren des
Feldes (Zeile wird gelöscht, der Default 10 greift); 999, −3 und `"abc"` werden
mit 400 abgewiesen, der gespeicherte Wert bleibt unverändert.


## 77. Bags-Tab: Rollen untereinander statt als Kommaliste

Die Spalte „Berechtigungen" im Bags-Tab zeigte die Rollen eines Bags als **eine**
kommaseparierte Zeile („ADMIN, USER, ANON"). Jede weitere Rolle machte die Zeile
breiter, und weil die Spalte ganz rechts steht, war genau sie diejenige, die aus
dem Fenster rutschte – man musste horizontal scrollen, um sie zu sehen.

**Wie in der Wiki-Liste:** Dort stehen `recipeUsers`, `recipeAdmins` und
`groupRoles` schon länger als untereinander gesetzte Badges (`list-access-names`),
und genau das fehlte hier. Der Bags-Tab nutzt diese Darstellung jetzt ebenfalls –
eine Rolle pro Zeile statt nebeneinander.

Der Wert kommt unverändert als kommaseparierter String aus der Aufbereitung
(`summarizePermissionRoles()` in `definition/store.ts`) und wird nur noch in der
Listen-Zelle aufgeteilt; am Datensatz ändert sich nichts, damit Export und
Detailansicht unberührt bleiben.

**Gemessen** (zweite Dev-Instanz, 1600 px breites Fenster): Spalte
„Berechtigungen" 347 → 156 px, der horizontale Overflow der Liste schrumpft von
245 px auf 55 px. Der Templates-Tab hat dieselbe Kommasepalte („Readonly bags"),
ist hier aber unauffällig (153 px, kein Überlauf), weil die installierte Vorlage
keine Readonly-Bags führt.


---

## 78. Suche und Sortierung in allen fünf Listen-Tabs

Bei 15 Wikis, 15 Bags und 12 Rollen war die Admin-Liste die einzige Stelle, in der
man noch wusste, wie ein Datensatz heißt: kein Suchfeld, keine sortierbaren
Spalten, und die Reihenfolge war die Reihenfolge aus `/admin/load`. Wer „die
Rezeptsammlung" oder „den Wiki von Frau Meyer" suchte, musste die Liste
durchscrollen und von oben und unten gegenlesen.

Alle fünf generischen Tabs (**Wikis, Templates, Bags, Rollen, Benutzer**) haben
jetzt dieselbe Kopfleiste mit Suchfeld und anklickbaren Spalten. „Meine Dateien"
ist hier noch nicht dabei — das folgt in §79.

**Suche.** Ein `type="search"`-Feld pro Tab filtert die Liste während des
Tippens, dazu ein Klick-Button (×) und die Trefferzahl („3 of 15 shown"). Die
Suche ist **case-, umlaut- und eszettunabhängig**: „schuler" findet „Schüler",
„strasse" findet „Straße". Groß-/Kleinschreibung und Diakritika werden per
`normalize("NFD")` entfernt. Für „ß" (und das große „ẞ") hat Unicode keine
Zerlegung — `NFD` lässt es unverändert, und `toLowerCase` macht daraus vorher
ein kleines „ß" —, deshalb wird es von Hand zu „ss" ersetzt. Ohne das würde die
Suche bei deutschen Daten genau an der üblichsten Art, ein Umlaut zu umgehen,
scheitern.

Gefaltet wird nur in der **Suche**, nicht in der Sortierung: eine Sortierung ist
eine feste Ordnung und `localeCompare` faltet „ß" ebenfalls nicht, die Suche
darf dagegen verzeihlich sein. „Schuler" findet deshalb „Schüler" (Umlaut
weggelassen), „Schueler" aber nicht — das ist ein anderes Wort.

Durchsucht werden nur **benannte, sichtbare** Spalten. Die Thumbnail-Spalte hat
keine Überschrift und ihre URL sagt nichts über den Datensatz aus, deshalb zählt
sie nicht mit. Die Badge-Spalten sind über ihren sichtbaren Wortlaut auffindbar
(„Owner", „Private", „Shared"), abgeschnittene Spalten in voller Länge — ein
Treffer, den man nicht sieht, ist besser als einer, den man nicht findet.

**Sortierung.** Ein Klick auf eine Spalte sortiert aufsteigend, der zweite absteigend,
der dritte nimmt die Sortierung wieder weg. Aktive Spalten bekommen einen Pfeil
(▲/▼), `aria-sort` und eine Screenreader-Angabe („Sorted ascending"); die Kopfzeile
ist als `columnheader` ausgezeichnet, der Sortierbutton heißt „Sort by Slug".

Sortiert wird nach dem, was in der Zelle *steht*:
- Zahlen in Textfeldern numerisch, damit „10 Bags" hinter „9 Bags" landet und nicht davor.
- ISO-Daten chronologisch.
- „Eigene Wikis" in der Form „3 / 5" bzw. „3 / ∞" nach der aktuellen Nutzung (der ersten Zahl).
- Text mit `localeCompare(..., { numeric: true, sensitivity: "base" })`, also inklusive Ziffern im Text („Klasse 2" nach „Klasse 10").

**Leere Werte bleiben unten** – in *beiden* Richtungen. Ein unbekannter Wert ist
„nicht bekannt" und nicht „am kleinsten"; sonst würden die beiden System-Wikis
ohne Eigentümer beim Abwärtssortieren nach oben springen. Bei Gleichstand entscheidet
die ID, damit die Reihenfolge stabil bleibt.

**Gruppierung weicht der Sortierung.** Die Wiki-Liste ist sonst in „My wikis",
„Shared with you" und „System wikis" gruppiert. Sobald eine Spalte aktiv sortiert
wird, erscheint **eine** flache Liste über alle Gruppen — sonst würde die
Gruppierung das Sortierergebnis in drei Blöcke zerreißen. Ein dritter Klick auf
den Header stellt die Gruppen wieder her. Auch die Seitennavigation aus §76
arbeitet mit gefilterten und sortierten Daten, der Pager zählt also das, was
tatsächlich zu sehen ist.

**Je Tab eigener Zustand, nur im Arbeitsspeicher.** Wer den Tab wechselt und
zurückkommt, findet Query und Sortierung vor. Bewusst *nicht* in `localStorage`:
eine gespeicherte Sortierung überlebt ein Update, in dem die Spalte umbenannt
wurde, und sortiert dann nach einer nicht mehr existierenden Spalte.

**Ein JSX-Fund dabei:** Das verwendete JSX-Runtime schreibt `value={...}` per
`setAttribute`. Ein Attribut aktualisiert aber kein `search`-Feld, in dem schon
getippt wurde — beim Tabwechsel blieb deshalb der alte Text stehen, während die
Liste nach dem neuen gefiltert wurde. Ein `ref`-Callback, der die DOM-Property
setzt, behebt das.

**Neue Texte** in allen acht Sprachdateien (561 Schlüssel, Parität geprüft). Die
neuen Platzhalter benutzen `t(currentTab.label)` statt eines kleingeschriebenen
Tab-Namens, damit z. B. „Keine Treffer in Wikis." und nicht „No matches in
wikis." erscheint.

**Geprüft** (zweite Dev-Instanz auf `127.0.0.1:5001` mit Kopie der Testdaten,
Playwright, 15 Wikis / 15 Bags / 12 Rollen / 6 Benutzer / 1 Template, Fenster
1600 px): alle Checks bestanden, darunter Suche über Slug **und** Eigentümer
(`meyer` → 3), Umlautfaltung (`schuler` → 3), Suche in E-Mail-Adressen und
Rollen, `ownWikiUsage` numerisch (`1 / ∞`, `1 / ∞`, `1 / 2`, `2 / ∞`, `2 / 2`,
`6 / ∞`), Sortierung über Seitengrenzen hinweg (10 + 5, Seite 2 als exakte
Fortsetzung), leere Eigentümer in beiden Richtungen ganz unten, Gruppierung kehrt
nach dem dritten Klick zurück, Grid-Spaltenbreiten und Overflow unverändert.
`tsc --noEmit` und `tsup` sauber, keine Laufzeitfehler in der Konsole.

Für das **ß-Falten** wurde zusätzlich Ende-zu-Ende eine Bag namens
„Straßen-Projekt" angelegt: `strassen`, `STRASSEN`, `Straßen`, `straße`,
`Strassen-Projekt` und `projekt` finden sie (je 1 Treffer), `strase` und
`strassn` dagegen nicht. Die Test-Bag wurde danach wieder gelöscht. Weil der
Testbestand kein „ß" enthält, prüft die Testsuite die Normalisierung zusätzlich
per Unit-Test gegen die echte Funktionsquelle (`Schüler`/`schuler`,
`Straße`/`strasse`, `STRAẞE`/`strasse`, `Große`/`grosse`, `Maße`/`masse`,
`Füße`/`fusse`).

Bekannte bewusste Grenzen: Der Datensatz-Editor hat keinen Escape-Shortcut
(geschlossen wird über „Cancel"), und die älteren Platzhalter wie „Create a {tab}
to get started." verwenden weiterhin kleingeschriebene Tab-Namen.


---

## 79. Suche und Sortierung auch im Tab „Meine Dateien"

§78 hatte „Meine Dateien" bewusst ausgelassen. Die Begründung war eine
Annahme und hat nicht gehalten: Es gibt hier keinen wechselnden
Ordner-Kontext, der eine clientseitige Suche irreführend machen würde.
`/api/user-files/list` und `/api/user-files/shared` fragen `userFile` ohne
`take` ab und liefern **alle** Dateien — dieselbe Ausgangslage wie
`/admin/load` in den fünf Datensatz-Tabs. Die Liste ist damit vollständig
im Browser, und Suche wie Sortierung gelten für alles, nicht für eine
stillschweigend gekappte Teilmenge.

**Ein Suchfeld für beide Tabellen.** Der Tab zeigt eigene Dateien und – für
normale Konten – darunter „Shared with me". Eine Datei ist eine Datei, ob
sie jetzt selbst hochgeladen wurde oder geteilt ist: ein Eingabefeld über
beiden Tabellen filtert deshalb beide, und die Trefferzahl zählt über beide
Abschnitte zusammen. Die Überschrift des geteilten Abschnitts verschwindet
nicht, wenn ihre Zeilen alle herausfallen; stattdessen erscheint dort ein
eigener Leerzustand („No matches in Shared with me."), damit klar ist,
dass die Suche der Grund ist und nicht eine leere Freigabe.

**Sortierbare Spalten** wie in den Datensatz-Tabs: Klick aufsteigend, nochmal
absteigend, dritter Klick zurück zur Serverreihenfolge („Uploaded" absteigend,
wie vom Server geliefert). Pfeil, `aria-sort` und Screenreader-Angabe
ausdrücklich dieselben wie in §78, damit die Bedienung im ganzen Admin
gleich bleibt. Die Aktionsspalte (Teilen, Vorschau, Download, Löschen) hat
weiterhin keinen Header und ist nicht sortierbar.

**Große Dateien zuerst, wie man es erwartet.** Die Spalte „Size" zeigt
„1.5 KB" bis „54.5 MB". Würde man die formatierte Zelle sortieren, stünde
„950.4 KB" vor „2.3 MB", weil „9" alphabetisch vor „2" kommt. Sortiert wird
deshalb nach `sizeBytes`, der rohen Zahl, und nach `createdAt`, dem
ISO-Zeitstempel — dieselbe Idee wie bei „3 / ∞" in den Benutzern: es wird
nach dem Messwert sortiert, nicht nach seiner Beschriftung.

**Eigentümer nur, wo es ihn gibt.** Die eigene Tabelle führt die Spalte
„Owner" nur in der Admin-Sicht; die geteilte immer. Ein normaler Account
sieht dort also vier sortierbare Header, ein Admin fünf – wie in den
Datensatz-Tabs, wo Spalten je nach Rolle vorhanden sind oder nicht.

**Keine doppelte Logik.** Normalisierung, Tristate-Umschaltung, Sortier-
und Vergleichslogik liegen jetzt in `list-view.ts` und werden von beiden
Stellen benutzt. `app.tsx` ist entsprechend um rund 100 Zeilen kleiner; die
Faltung aus §78 gilt dadurch unverändert auch hier (siehe unten).

**Übersetzungen:** keine neuen. Alle benötigten Schlüssel („Search",
„Search {tab}…", „Clear search", „{shown} of {total} shown", „Sort by
{column}", „Sorted ascending", „Sorted descending", „Clear sorting",
„No matches in {tab}.") waren mit §78 schon vorhanden; der Tab-Name wird per
`t("My files")` bzw. `t("Shared with me")` eingesetzt, damit der Platzhalter
in jeder Sprache passt.

**Geprüft** (zweite Dev-Instanz, Playwright): 124 Checks bestanden, davon 24
für diesen Abschnitt. Sortiert wird numerisch nach Größe (1.5 KB → 54.5 MB,
„KB steht vor MB"), Suche und Sortierung wirken zusammen, der dritte Klick
stellt die Serverreihenfolge wieder her, „Clear sorting" und der ×-Button
funktionieren, kein horizontaler Overflow. `tsc --noEmit` und `tsup` sauber.

Zwei weitere Checks sichern eine Aussage, die erst in die READMEs kam: die
Badge-Spalten werden über ihren **Klartext** gefunden, nicht über ihren Wert.
`private` liefert 10 Zeilen und 10 Private-Badges, `shared` 3 Zeilen und
3 Shared-Badges – in der Zelle steht kein Wort, gesucht wird die Beschriftung.
Die erste Fassung des Tests suchte `owner` und fand nichts: als Admin haben
alle Wikis durchgehend Admin-Rechte, es gibt schlicht keine Owner-Badge zu
finden. Der Test wurde auf das korrigiert, was tatsächlich vorhanden ist.

Zusätzlich am echten Nicht-Admin-Konto geprüft (Testnutzer angelegt, eine
Datei namens „Straßennamen-Liste.txt" hochgeladen, danach wieder gelöscht):
`strassen`, `STRASSEN`, `Straßen`, `straße`, `Strassennamen` und `liste`
finden sie, `strase` und `strassn` nicht; die eigene Tabelle hat vier
sortierbare Header; der geteilte Abschnitt wird durchsucht, sortiert und
zeigt seinen eigenen Leerzustand; und ohne eigene Dateien bleibt es bei
„No files yet. Upload something to get started." statt eines irreführenden
„No matches". Testnutzer, Testdatei und Test-Bag aus dieser Messung sind
wieder entfernt — der Bestand ist unverändert bei 6 Benutzern und 23 Dateien.


---


## 80. `CONTRIBUTING.md` und `AGENTS.md` ausformuliert

Beide Dateien gab es im Repository, waren in diesem Fork aber nie angefasst
worden: `AGENTS.md` (7 Zeilen) wurde zuletzt am 6. Juli 2026 upstream geändert,
`CONTRIBUTING.md` (4 Zeilen) am 7. Juli 2026 — während `README.md`,
`README_features.md`, `ARCHITECTURE.md`, `PLANNING.md` und `CHANGELOG.md` hier
alle gepflegt wurden. Beide enthielten zudem nichts, das diesen Fork betrifft.
`CONTRIBUTING.md` war nur der Hinweis, Beitragende müssten die TiddlyWiki-CLA
unterschreiben, mit Verweis auf `TiddlyWiki5/contributing.md`; Upstream hatte
die Datei in `f1ed053` selbst ausgedünnt („add some notes about architecture",
93 gelöschte Zeilen) und den Inhalt nach `ARCHITECTURE.md` verschoben, der Fork
ererbte also eine leere Hülse. `AGENTS.md` — die Datei mit Anweisungen für
KI-Coding-Agenten — bestand aus einer Verhaltensregel und einer Liste von
VS-Code-/Cursor-Werkzeugnamen (`get_errors`, `vscode_*`, `lsp_*`), die in
keinem Agent-Setup existieren: die Regel war nützlich, die Werkzeugliste
Ballast.

**Die CLA-Referenz ist bewusst weg.** Eine Contributor License Agreement
gibt dem Projekt das Recht, einen Beitrag unter anderen Bedingungen weiterzugeben.
TiddlyWiki verlangt eine, weil das TiddlyWiki-Projekt diese Freiheit für seine
eigene Codebasis braucht. Dieser Fork ist BSD 3-Clause mit einer einzelnen
Maintainerin, wo die Repository-Lizenz das Beigesteuerte bereits abdeckt — die
Anforderung erzeugte also ein Hindernis ohne rechtlichen Gegenwert.
`CONTRIBUTING.md` sagt das jetzt ausdrücklich: Pull Requests werden unter
BSD 3-Clause angenommen, und es gibt nichts zu unterschreiben.

**`CONTRIBUTING.md`: 4 → 288 Zeilen, Englisch und Deutsch.** Die Struktur folgt
den anderen nutzersichtbaren Dokumenten, eine Hälfte je Sprache mit
übereinstimmenden Überschriften. Behandelt werden, was vor dem Beginn zu lesen
ist (`ARCHITECTURE.md`, `PLANNING.md`, `CHANGELOG.md`), ein Setup-Block
(`git clone`, `npm install`, `npm run certs`, `npm start update-tiddlywiki`,
`npm start init-store`, `npm start` → <http://localhost:8080/>), eine
Befehlstabelle und die Fallstricke, die man nur auf dem harten Weg lernt:
`npm test` baut, packt, **löscht und neu anlegt `tests/`** und startet diese
Instanz auf Port 8080, der Entwicklungsserver muss also vorher beendet werden,
und es ist ein Smoke-Test ohne automatisierte Prüfungen; `npm run tsc` ist
eine tsup-Variante, der Typechecker ist `npm run tsc2`; das Root-Skript
`npm run tsc-client` zeigt noch auf das entfernte `packages/react-admin` und
funktioniert nicht mehr, die Admin-App wird deshalb mit
`cd packages/admin-vanilla && npm run tsc` geprüft. Die Datenbank kommt aus
`DATABASE_URL` (SQLite, Postgres, MSSQL), das Schema liegt in
`prisma/schema.prisma`, und Datenbestände von vor dem 27.09.2026 brauchen die
zusätzlichen Tabellen (§70). Die Konventionen sind die in diesem Repository
gepflegten: ein Thema pro Commit, deutsche Commit-Nachrichten mit Präfix und
§-Verweis, keine Abhängigkeit ohne Ansage, keine erzeugten Artefakte. Der
Dokumentationsvertrag hat einen eigenen Abschnitt: neuer nummerierter
CHANGELOG-Abschnitt in beiden Sprachhälften mit gleicher Nummer, `README.md`
und `README_features.md` gespiegelt, Wiki-Dateien sind kein Markdown, neue
Oberflächentexte auf Deutsch und Englisch. Die Release-Checkliste nennt alle
Versionsorte (`package.json`, `package-lock.json`, `tools/package-lock.json`,
`README.md`, `README_features.md`,
`editions/mws-docs/tiddlers/Installation.md`, `create-package/README.md`),
`npm run build`, `npm pack` → `mws-wikiwise-X.Y.Z.tgz`, einen Commit als
`release: Version X.Y.Z`, den annotierten Tag `vX.Y.Z` und ein GitHub-Release
mit angehängtem Tarball. Eine Veröffentlichung auf npm gehört nicht dazu und
ist als Absicht benannt, damit sie niemand wieder einführt.

**`AGENTS.md`: 7 → 125 Zeilen, für Agenten.** Was das Repository ist (die
Server-Pakete; die Admin-App in `packages/admin-vanilla` mit `src/app.tsx`,
`src/list-view.ts`, `src/i18n.ts` und `src/locales/` auf
`@tiddlywiki/jsx-runtime` — kein React, kein preact; der Wiki-Client in
`plugins/client`), die Pflichtlektüre mit `grep -n "§N" CHANGELOG.md` als
schnellem Weg in bestehenden Code, und die harten Regeln: `dist/` nie
bearbeiten, TiddlyWiki-Dateien sind kein Markdown, neue nutzersichtbare Texte
brauchen beide Sprachen, Dokumentation ist vertraglich zweisprachig, das
CHANGELOG ist die Entwicklungsgeschichte (`§81` ist der nächste), die
Sicherheitsinvarianten (die Referer-Prüfung in `RequestState.ts` als bewusster
Präfixtest, das CSP pro Wiki aus `RecipeResolver.ts`, öffentliches Lesen nur
über die Rolle `ANON`, schreibgeschützte Wikis speichern nie), keine stillen
Abhängigkeiten, keine Secrets aus `~/.npmrc`, nie pushen, taggen, veröffentlichen
oder Version hochsetzen ohne Aufforderung, und ein Side Tangent wird als Kommentar
beantwortet, bevor eine Datei angefasst wird. Die Verhaltensregel aus dem
Upstream ist wortgleich erhalten geblieben. Die Befehlstabelle ersetzt die tote
Werkzeugliste durch die tatsächlichen Skripte und ihre Fehlerfälle, der
Abschnitt zu den Konventionen hält fest, dass die Verifikation manuell ist
(CI baut auf Pushes nach `main` nur die Dokumentationsseite), und eine Checkliste
„before a change counts as done" beendet die Datei.

**Verifiziert.** Beide Hälften von `CONTRIBUTING.md` haben dieselben neun
Überschriften in derselben Reihenfolge und Tiefe; jeder in beiden Dokumenten
genannte Dateipfad und jedes `npm`-Skript existiert, maschinell gegen den
Arbeitsbaum und `package.json` geprüft; `npm run tsc2` ist sauber; `git status`
zeigt nur die beiden Dokumente, dieses Changelog und `PLANNING.md`. Am
Laufzeitverhalten wurde nichts geändert, es gab also nichts in einer
Entwicklungsinstanz durchzuklicken — geprüft wurde hier durch Lesen, den Pfad-
und Skriptabgleich und den Typechecker. Der offene Punkt „sell people on
contributing to the project" in `PLANNING.md` ist damit erledigt, und beide
Dokumente nennen `§81` als den nächsten Abschnitt.


## 81. GitHub Actions prüft, statt die Upstream-Website zu veröffentlichen

Der geerbte Workflow `.github/workflows/ci.yml` hat nichts geprüft: Er hat bei
jedem Push auf `main` die Dokumentations-Edition `editions/mws-docs` gebaut und
das Ergebnis nach `TiddlyWiki/mws.tiddlywiki.com-gh-pages` geschoben. Das ist
die **Upstream**-Website, und sie zu überschreiben gehört nicht zu diesem
Fork — der Push hätte ohnehin nie funktioniert, weil das dafür benutzte Token
`GITHUBPUSHTOKEN` hier nicht existiert. Länger rot war er auch: Der Build
stürzte in `markdown-it-tiddlywiki.js` mit `Error: inline rule didn't increment
state.pos` ab, noch vor dem Push-Schritt. Dieser Fehler hat nichts mit dem Code
des Forks zu tun, weshalb auch die beiden Pushes davor rot waren.

**Was es jetzt ist:** eine Prüfung und sonst nichts.

- `npm ci` für eine lockfile-getreue Installation. Der `prepare`-Hook läuft
  dabei `build:pack`, und `scripts.mjs` installiert `tools/` bei Bedarf, ein
  frischer Checkout braucht also keinen zusätzlichen Schritt.
- `npm run tsc2` — der Typechecker über die Server-Pakete (das Root-Skript
  `npm run tsc` ist eine tsup-Variante, kein Typechecker).
- `npm run tsc` in `packages/admin-vanilla` — die Admin-App mit ihrem eigenen
  `tsconfig.json`, die die Root-Konfiguration nur teilweise abdeckt.
- `npm run build` — das Client-Bundle und das Runtime-Bundle nach `dist/`.

Es gibt keinen Deployment-Schritt, kein Secret und keine Schreibrecht: Der
Workflow deklariert `permissions: contents: read`, sodass auch ein später
hinzugefütgter Deployment-Schritt scheitern würde, statt irgendwohin zu
schieben. Er läuft bei Pushes auf `main`, bei jedem `pull_request` (die
Prüffung, die zählt, ist die vor dem Merge, und dieser Fork wird
Pull-Requests von außen bekommen) und manuell über `workflow_dispatch`. Node
ist auf 22 gepinnt, die Version, mit der dieser Fork entwickelt und ausgeliefert
wird; `actions/checkout` und `actions/setup-node` wurden von `@v2` und `@v1` auf
`@v4` gehoben, was zugleich die Deprecation-Warnung zu Actions mit Node 20
beseitigt. Überholte Läufe auf demselben Ref werden abgebrochen. Der Job
heißt `build-and-typecheck`, denn der alte Name
(`build-mws-tiddlywiki-com`) beschrieb einen Job, den es nicht mehr gibt.

`build-mws-site.sh` ist mit verschwunden. Es existierte nur für dieses
Deployment, und ein Skript in diesem Repository, das auf TiddlyWIKIs Website
schiebt, ist eine Falle für die nächste Person, die es ausführt; im
Git-Verlauf bleibt es wiederherstellbar. **Bewusst nicht behoben:** der
`markdown-it-tiddlywiki`-Absturz — er gehört zum Rendern der
Upstream-Dokumentationsseite, die dieser Fork nicht veröffentlicht, und ein
Fix würde bedeuten, einen Fork von TiddlyWikis Site-Build für eine Seite
mitzuschleppen, nach der niemand gefragt hat. Unsere eigene Dokumentationsseite
zu veröffentlichen ist eine eigene Entscheidung mit eigenem Hosting, in
`PLANNING.md` festgehalten, damit sie nicht für ein Versehen gehalten wird.

**Verifiziert.** `npm ci --dry-run` läuft durch, das Lockfile ist also synchron
zu `package.json`; `npm run tsc2`, `npm run tsc` in `packages/admin-vanilla` und
`npm run build` laufen in dieser Reihenfolge sauber durch, und `git status`
bleibt nach dem Build leer, weil `dist/` git-ignoriert ist. Die Workflow-Datei
parst als YAML, und jeder Befehl, den sie ausführt, existiert in `package.json`.
Ob die GitHub-Runner das genauso sehen, entscheidet der erste Lauf nach dem
Push — es wird nichts deployt, ein roter erster Lauf wäre also harmlos und
ein grüner würde etwas bedeuten. Nicht angefasst, dabei bemerkt: Die
`exclude`-Liste in `tsconfig.json` nennt weiterhin `packages/admin-react` und
`packages/admin-mdui`, zwei Pakete, die es in diesem Fork nicht gibt (er hat
`packages/admin-vanilla`). Diese Einträge haben keine Wirkung, weil nichts darauf
passt.

## 82. GitHub Actions auf `node24` statt `node20`

Der erste Lauf von §81 war grün — und trotzdem mit einer Warnung:
`Node.js 20 is deprecated. The following actions target Node.js 20 but are
being forced to run on Node.js 24: actions/checkout@v4, actions/setup-node@v4`.
Die Warnung galt nicht dem Projekt, sondern den Actions selbst: `checkout` und
`setup-node` in der vierten Hauptversion laufen intern auf der Node-20-Laufzeit,
die GitHub abschaltet. §81 hatte sie nur auf `@v4` gehoben, weil das die
übliche Aktualisierung war — inzwischen sind das die ältesten verfügbaren
Hauptversionen.

**Auf die aktuelle Hauptversion gesprungen, nicht auf `@v5`.** Die Actions
lagen schon bei `@v7` (`checkout` v7.0.1, `setup-node` v7.0.0), und `@v5` hätte
denselben Fehler nur mit neuerer Nummer wiederholt. In beiden `action.yml` steht
`using: node24`, während die vierte Hauptversion auf `node20` lief; die
verwendeten Inputs (`node-version`, `cache`) sind unverändert. Ein Sprung auf
`@v7` statt auf die Zwischenversion ist damit die kürzere und die zukunftssichere
Wahl — SHA-Pinning bleibt eine Option, wenn der Workflow einmal sicherheits-
relevant wird.

**Verifiziert.** Der Workflow parst weiterhin als YAML, alle sechs Schritte sind
unverändert, und `git status` zeigt nur Workflow und dieses Changelog. Ob die
Warnung wirklich verschwunden ist, kann nur der Lauf auf GitHub zeigen — nach
dem Push ist sie es: der Lauf ist grün und die Annotation über `node20` nicht
mehr vorhanden, nur noch der Hinweis, dass `ubuntu-latest` ab 19.10.2026 auf
Ubuntu 26 migriert.

## 92. Snapshots bekommen ihr eigenes Fenster: „Snapshot wiederherstellen"

**Warum.** Die Snapshot-Liste aus §85 steckte in „Wiki-Datei übernehmen". Damit
war sie gezielt schwer zu finden und versehentlich leicht zu treffen: Sie erschien
erst, nachdem eine bestehende Wiki gewählt *und* „Datei prüfen" gedrückt war —
man brauchte also einen Import, um überhaupt in die Historie einer Wiki zu
sehen. Die Liste war nie das Problem, der Einstieg war es. Zwei Details
verschärften es: Der Wiederherstellen-Knopf war ein nacktes Symbol, dessen
Bedeutung man am Tooltip erraten musste, und die Bestätigung war ein
`globalThis.confirm`-Alert, der überhaupt nicht in die Admin-Oberfläche passte.

**Was.** Ein zweiter Eintrag im „Wiki anlegen"-Menü öffnet
`SnapshotRestoreDialog` (`packages/admin-vanilla/src/snapshot-restore.tsx`): ein
eigenes Fenster mit Wiki-Auswahl, Snapshot-Liste und dem Satz, der erklärt, was
ein Restore tut. Eine Zeile zeigt Datum, Tiddlerzahl und Herkunft und trägt einen
beschrifteten Knopf „Diesen Snapshot wiederherstellen" statt eines Symbols. Ein
Klick darauf klappt die Zeile zu einer Bestätigung auf, die Wiki, Datum, Anzahl
und den Hinweis auf den Sicherheits-Snapshot nennt, und bietet „Aktuellen Stand
behalten" und „Jetzt wiederherstellen". Der Browser-Alert ist weg.

Der Datei-Dialog verliert die Snapshot-Liste samt `loadSnapshots`, `restore`, den
States `snapshots`/`snapshotsBusy`/`restoring`/`notice` und dem ganzen Block
`renderSnapshots`. Übrig bleibt ein Undo-Knopf im Ergebnisbereich: Nach einem
Import steht dort „Snapshot wiederherstellen" und übergibt die importierte Slug
über `onRestoreSnapshots` an das neue Fenster. Zwei Modalitäten würden sich
stapeln, deshalb tritt der Import-Dialog zurück — `openSnapshotRestore` schließt
ihn. Der Hinweis in der Vorschau wurde umformuliert, weil er auf eine Liste
„unten" verwies, die es nicht mehr gibt. `PLANNING.md` hält die Verlagerung
fest; die ⚖️-Einträge zu Routen, Berechtigung und Snapshot-Bag bleiben
unberührt.

**„Wiki öffnen" öffnet einen neuen Tab.** Ein Restore wirft die Admin-Oberfläche
beiseite — die Wiki selbst ist das Nächste, was man sehen will, und ihre Historie
hat der Restore gerade verändert. Beide Links tragen deshalb `target="_blank"`
mit `rel="noopener noreferrer"`, das gleiche Paar wie die Wiki-Karten auf der
Startseite (`app-landing.tsx`). Das Fenster bleibt stehen, die Wiki öffnet sich
daneben.

Serverseitig ändert sich nichts: gleiches `GET /api/wiki-file/snapshots`, gleiches
`PUT /api/wiki-file/restore`, gleiche Berechtigung — wer nicht ersetzen darf,
sieht ohnehin keine Snapshots.

**i18n.** Elf neue Schlüssel in allen acht Sprachen, einer umformuliert, einer
mit dem Alert überflüssig — die acht Basisschlüsselmengen bleiben dieselben 648.

**Die Icons brauchten eine eigene Größe.** `MaterialSymbol` entfernt `width` und
`height` aus dem SVG, damit es über CSS skaliert — jedes Vorkommen muss die
Maße also selbst setzen, denn `font-size` skaliert kein SVG. Die neue Meldung
brachte ein Icon in `.wiki-file-notice`, und das ist kein Flex-Container: Das SVG
fiel damit auf seinen undefinierten Standard zurück und füllte die ganze Karte —
189 px Icon in einem 752-px-Dialog beim Undo-Knopf, volle Breite bei der Meldung.
Beim Messen aller `material-symbol` in beiden Fenstern kamen zusätzlich zwei
Icons aus §85 heraus, die 0 × 0 groß waren: die Icons in den Überschriften und das
auf der Snapshot-Zeile, die es nie anders als nur mit `font-size` gab. Alle sind
jetzt vermessen: 20 px für Überschriften, Meldung und Snapshot-Zeile, 18 px für
Knöpfe, nach der Konvention, die die anderen 30 Icon-Regeln schon benutzen.

**Geprüft.** Headless Chromium gegen die Dev-Instanz, `fetch` gestubbt: beide
Wikis in der Auswahl und `initialSlug` wählt `testwiki` vor; zwei Zeilen mit
deutschen Daten, „412 Tiddler" über die `#one`-Regel und einem Rückfall auf
`sourceBagName`, wenn `source` leer ist; ein Klick auf den Restore-Knopf klappt
die Bestätigung mit beiden Knöpfen auf; „Jetzt wiederherstellen" sendet
`PUT /api/wiki-file/restore?wiki=testwiki` mit
`{"snapshot":"snapshot-wiki-20260102T101500000Z"}`, meldet „Die Wiki
\"testwiki\" wurde vom 2.1.2026, 11:15:00 zurückgesetzt." mit „Wiki öffnen",
schließt das Panel und löst `onDone` aus. Der Datei-Dialog: kein
`.wiki-file-snapshots`, kein Knopf ohne Text, nur Aufrufe an `inspect` und
`import` — die `snapshots`-Anfrage ist weg — der neue Hinweistext und der
Undo-Knopf mit `onRestoreSnapshots("testwiki")`. Jedes `material-symbol` in beiden
Fenstern misst danach 20 × 20 oder 18 × 18, keines 0. Keine Ausnahmen in der
Konsole.
Beide „Wiki öffnen"-Links messen `href="/wiki/testwiki"`, `target="_blank"` und
`rel="noopener noreferrer"`; Headless Chromium listet den Tab, den ein
`_blank`-Klick öffnet, nicht auf. Deshalb wurde die Wirkung am Gegenbeispiel
geprüft: Ein Anker ohne `target` navigiert den aktuellen Tab (`/login` →
`/main.js`), derselbe Anker mit `target="_blank"` lässt ihn auf `/login`.
Der Menüeintrag selbst liegt hinter dem Login, und für den Dev-Store lag kein
Passwort vor, deshalb wurde er im Bundle geprüft: Der übersetzte Knopf trägt
`onclick:()=>{this.openSnapshotRestore(),this.closeCreateWikiMenu()}`. `npm run
tsc2`, der Admin-Typecheck, `npm run build` und das i18n-Audit (648 Schlüssel je
Sprache, keine Waisen, keine Dubletten, keine erfundenen Platzhalter, kein
literaler `t()` ohne Eintrag) sind sauber.


## 98. Feature: der Snapshot-Hinweis klappt sich weg, die Summe bleibt

**Why.** Der Hinweis aus §97 beantwortet die richtige Frage, kostet dafür aber
122px — und auf einem schmalen Schirm schiebt er genau die Wikis, über die er
redet, weiter nach unten. Was das Auge zuerst braucht, ist eine einzige Zahl —
„4 Snapshots" — und alles andere ist Detail, das erst interessiert, wenn man sich
daran machen will. Der Hinweis zeigt deshalb von Haus aus nur seine Kopfzeile, und
die Kopfzeile ist das, was man anklickt.

Die Kopfzeile ist ein echtes `<button>` und kein Klickhandler auf einem Absatz: per
Tastatur erreichbar, mit `aria-expanded` und `aria-controls`, und ein Chevron am
rechten Rand dreht sich beim Öffnen. Zwei neue Texte sind dazugekommen („Mehr
anzeigen" / „Weniger anzeigen"), weil ein Tooltip, der nicht sagt, was passiert,
schlimmer ist als keiner.

Kein neues Symbol: `keyboard_arrow_down.svg` war als `expandIcon` für die Pinnwand
schon importiert und dient jetzt auch als Chevron.

**Verified.** Im Browser, mit 4 Snapshots auf `neues-admin-empty`: zu 44px, auf
165px, die Kopfzeile bleibt in beiden Zuständen 1408px breit und der Chevron
behält seine 13px Abstand zum rechten Rand, statt beim Öffnen neben den Text zu
springen; Klick, zweiter Klick und Enter schalten um, `aria-expanded` läuft mit,
und der Wiki-Chip öffnet weiter das Snapshot-Fenster. Bei 420px bricht die
geschlossene Kopfzeile auf 59px um, die offene ist 222px hoch — kein Überlauf, die
Chips bleiben drin. `npm run tsc2`, der Admin-Typecheck, `npm run build` und das
i18n-Audit sind sauber.

Die Kopfzeile war zuerst textbreit und der Chevron sprang nach links, wenn der
Hinweis aufging. `.field-callout` stand **zweimal** in `app.inline.css`, die zweite
Kopie weiter unten mit Leerzeichen statt Tabs eingefügt, und die gewann nach
Quellreihenfolge — der Hinweis war also die ganze Zeit ein zweispaltiges Grid und
`display: flex` griff nie. Die zweite Kopie war deklarationsweise mit der ersten
identisch und wurde deshalb gelöscht statt herumzuarbeiten; ohne sie sieht es
genauso aus. Der Rest dieses kopierten Blocks (`.pinboard-hint`, `.error-banner`,
`.primary-button`) ist weiterhin doppelt und weiterhin harmlos.

## 97. Feature: die Wikis-Seite sagt, wie viele Snapshots herumliegen

**Why.** Ein Snapshot entsteht bei jedem Import, der eine Wiki ersetzt, und
anschließend bemerkt ihn niemand: er hat keinen Platz in der Wikis-Liste, keinen
Eintrag in dem Menü, in dem man ihn suchen würde, und nur einen Weg zurück – ein
Fenster hinter drei Klicks. Wer zehn Dateien nacheinander importiert hat, hat
zehn Kopien jeder Wiki und keinen Hinweis darauf. Die Information gab es, es
wurde nur nie abgefragt.

Zählen pro Zeile war die naheliegende erste Idee und wurde bewusst verworfen: eine
zweite Zahl auf jeder Zeile konkurriert mit Name und Größe, und sie müsste
ausgeblendet werden, sobald sie null ist — und das ist der Normalfall. Ein Hinweis
über der Liste nennt die Summe, benennt die betroffenen Wikis und verschwindet
ganz, wenn es nichts zu melden gibt.

`GET /api/wiki-file/snapshot-counts?wikis=a,b` liefert `{counts, total, keep}` für
bis zu 200 Slugs in einer Anfrage, weil die Alternative eine Anfrage je Wiki bei
jedem Besuch jeder Admin-Seite wäre.

`resolveWikiTarget` wird hier bewusst *nicht* benutzt. Dessen `assertRecipe()`
beendet die Anfrage mit einer leeren Antwort, wenn eine Wiki fehlt oder nicht
zugänglich ist — eine unsichtbare Wiki hätte damit den ganzen Hinweis geleert.
Die Route fragt dieselben beiden Sachen deshalb direkt (`RecipeResolver.
canWriteBag()`, `mayReplace()`) und überspringt, was der Nutzer nicht ersetzen
darf. Ein Hinweis darf nicht melden, dass es etwas gibt, das der Leser nicht sehen
darf.

**Verified.** Im Browser: 5 Snapshots über `neues-admin-empty` ergeben einen Hinweis
von 122px Höhe direkt über der Liste, ohne Überlappung; Klick auf Wiki-Chip und
auf den Knopf öffnen beide das Snapshot-Fenster mit vorausgewählter Wiki und
ihren 5 Zeilen; nach dem Entfernen der Snapshots ist der Hinweis ganz weg. Ohne
Sitzung antwortet die Route 403 `ACCESS_DENIED`, eine Lehrkraft bekommt
`{"counts":[],"total":0}` und gar keinen Hinweis. `npm run tsc2`, der
Admin-Typecheck, `npm run build` und das i18n-Audit (668 Schlüssel je Sprache)
sind sauber.

Zwei Dinge konnte nur der Browser sagen. `.field-callout` ist ein Grid mit zwei
Spalten, damit lagen die vier Kinder des Hinweises als 2x2-Block und die Box wuchs
auf 383px — sie ist jetzt eine Flex-Spalte. Und dem Symbol im Knopf fehlte die
eigene Größe, was seine Grid-Zeile auf 313px dehnte; beide Symbole sind auf 18px
festgelegt.

Die erste Fassung des Hinweises loggte falsch über den Speicher. Sie sagte, ältere
Snapshots „bleiben in der Datenbank, bis Sie sie hier löschen" — `createSnapshotBag`
ruft aber `pruneSnapshotBags()` auf und wirft alles unterhalb der neuesten {keep}
selbst weg; ein Hinweis, der Speicher verspricht, den es nicht gibt, ist schlimmer
als gar keiner. Jetzt steht dort, dass von jeder Wiki nur die neuesten {keep}
bleiben und der Rest löschenswert ist.

## 96. Bugfix: Zurückspielen eines Snapshots hinterließ eine Mischung aus Wiki und Snapshot

**Warum.** Nach dem Zurückspielen eines Snapshots war die Wiki weder der
Snapshot noch die Wiki, die es vorher war: Tiddler, die die Wiki seit der
Aufnahme des Snapshots dazugekommen waren, standen danach noch da und zeigten
sich im Browser als Reste einer Version, die eigentlich verschwunden sein
sollte.

Der Grund war eine Regel, die zu breit angewandt wurde. Ein Replace — und ein
Restore ist ein Replace — löscht die `$:/`-Tiddler des Zielbags nie, weil diese
Tiddler die Wiki als Ganzes konfigurieren und eine hochgeladene Datei, die dazu
schweigt, sie nicht wegwischen darf. Ein Restore ist keine solche Datei. Ein
Snapshot ist eine vollständige Kopie des Bags dieser Wiki, `$:/`-Tiddler
eingeschlossen; er ist keine schweigende Quelle, er ist der frühere Zustand der
Wiki selbst. Die Regel schützte also genau das, was ein Restore entfernen soll.

Schwer zu sehen war die Asymmetrie. Ein gewöhnlicher Tiddler, der nach dem
Snapshot entstanden war, *wurde* gelöscht; ein Systemtiddler, der nach dem
Snapshot entstanden war, blieb. Zwei Tiddler, gleich alt, gleicher Bag,
gegensätzliches Ergebnis — so wirkte ein Restore, als klappt er meistens und
mischte im Rest der Fälle Reste hinein.

**Was.** `planTiddlers()` bekam die Option `keepTargetSystem`, Standard `true`,
und beide Restore-Pfade — `restoreSnapshotBag()` für den Admin-Dialog und der
Befehl `restore-wiki-snapshot` — reichen `false` weiter. Alles andere bleibt
unberührt: Ein Import behält die `$:/`-Tiddler des Zielbags weiter und meldet sie
weiterhin als `keptSystemTitles`. Ein Restore *ersetzt* den Bag damit, statt in
ihn hineinzumergen, und eine zurückgespielte Wiki ist Feld für Feld der Inhalt
des Snapshots.

**Verifikation.** `empty_deutsch.html` nach `wiki-schuler-2`, danach drei
nachträglich angelegte Tiddler — `NormalerArtefakt`, `$:/SystemArtefakt`,
`$:/ArtefaktNachSnapshot` —, dann das Zurückspielen des früheren Snapshots:
`4 deleted` statt der bisherigen `1 deleted`, alle drei Reste weg, und der Bag
Feld für Feld mit dem Snapshot-Inhalt verglichen: identisch. Der Import-Pfad
wurde im selben Store nachgeprüft und meldet die 12 Systemtiddler der Wiki
weiterhin als „kept as they are“. `npm run tsc2`, Admin-Typecheck,
`npm run build` und i18n-Audit sind sauber; der Dev-Store wurde danach
zurückgesetzt.

## 95. Bugfix: eine importierte Wiki behielt eine Startseite, die ins Leere zeigte

**Warum.** Der Import einer Single-File-TiddlyWiki in eine von MWS angelegte Wiki
ließ die Wiki auf ihrer eigenen Willkommensseite stehen. Der Plan meldete
`$:/DefaultTiddlers` als „behalten wie er ist“, die Wiki öffnete `Willkommen` —
und `Willkommen` war weg, weil die Datei den Bag ersetzt hatte. Am Import war
nichts falsch; an der Startseite. `Willkommen` ist, was MWS in jede selbst
angelegte Wiki schreibt (`TabDataAdapter.ts`), also war es nie die Aussage der
Datei über eine Startseite.

Eine Aussage hat die Datei durchaus, nur nicht dort, wo der Parser gesucht
hat. Eine Single-File-TiddlyWiki führt `$:/DefaultTiddlers` praktisch nie in
ihrem Store: Die Standard-Edition lässt es in `$:/core`, wo
`GettingStarted` steht. Wer nur den Store liest, findet also nichts und behält
den MWS-Wert — und die Wiki öffnet einen Titel, den keine Datei je erwähnt
hatte.

**Was.** `parseWikiFile` liest `$:/DefaultTiddlers` aus dem Core, den die Datei
mitbringt — aber nur, wenn der Store der Datei dazu schweigt; eine Datei, die
ihre eigene Startseite nennt, hat sich schon Gehorsam verschafft. Der Wert wird
dann als Systemtiddler der Datei behandelt und reist deshalb *ohne* das
Systemtiddler-Opt-in: Eine Startseite, die einen Tiddler nennt, den niemand öffnen kann, ist das
Einzige, was schlimmer ist als die falsche. `readCoreText()`
liest die Plugin-Nutzlast (`{"tiddlers": {...}}`) und liefert für eine
Nutzlast, die nicht diese Form hat, nichts — ein umgepackter oder kaputter Core
lässt also das alte Verstehen stehen.

Nur `$:/DefaultTiddlers` bekommt diese Behandlung. `$:/SiteTitle` wird vom
Parser ebenfalls nicht in den Bag geschrieben — der Import-Dialog liest es für
den Anzeigenamen, und `WikiShell` schreibt es —, und die übrigen
Core-Einstellungen sind keine Startseiten.

**Verifikation.** `empty_deutsch.html` (5.4.1, kein `$:/DefaultTiddlers` im
Store, `$:/core` trägt `GettingStarted`) nach `wiki-schuler-2`: Der Plan meldet
`$:/DefaultTiddlers` als `changed`, statt es zu behalten, `Willkommen` steht
unter `deleted`, und der Bag enthält danach `$:/DefaultTiddlers = GettingStarted`
ohne `Willkommen`. Gegen die laufende Dev-Instanz liefert der Wiki-Index
`$:/DefaultTiddlers` mit `GettingStarted`, und der Core, den die Wiki ohnehin
lädt, enthält den Tiddler `GettingStarted` selbst — die Seite rendert also, statt
auf eine leere Wiki zurückzufallen. `npm run tsc2`, Admin-Typecheck,
`npm run build` und i18n-Audit sind sauber; der Dev-Store wurde danach
zurückgesetzt. Eine Datei, deren Store `$:/DefaultTiddlers` doch enthält, ist
unberührt — der Core wird dann nicht befragt.

## 94. Feature: Plugins, Themes und Bibliotheken der Datei importieren – mit Versionsprüfung

**Warum.** §86 verbot es bisher, Core-Plugins, Themes und Bibliotheken in einen
Bag zu schreiben, weil die Plugins einer Wiki aus ihrem Rezept kommen und schon
`$:/core` allein Megabyte groß ist. Ein Einzeldatei-Wiki kann aber genau jene
Version sein, die man wiederherstellen will: ein Snapshot soll
unterscheidungslos wieder einsatzfähig sein, und wer eine `empty.html` derselben
Release importiert, will die Plugins der Datei im Bag finden.

**Was.** Ein neuer Schalter `include-plugins`. Bei Aktivierung nimmt
`parseWikiFile` ein Opt-in und eine `targetVersion` entgegen; Sprachpakete sind
nicht betroffen. Bei Nicht-Sprach-Plugins ($:/core, Themes, Bibliotheken) gilt:
- nur wenn das Plugin selbst `version` genau gleich `targetVersion` ist, wird es
  in den Bag geschrieben,
- Plugins ohne `version` werden abgewiesen ("keine Version"),
- Plugins mit abweichender `version` werden abgewiesen ("Versionsunterschied"),
- die Gründe stehen im Plan.

CLI (`import-wiki-file`), die REST-Routen (`/api/wiki-file/inspect` und
`/api/wiki-file/import`) akzeptieren `?include-plugins=1`. Der
Admin-Dialog zeigt ein neues Kontrollkästchen „Auch die Plugins der Datei
importieren: Core, Themes und Bibliotheken“ mit dem Hinweis, dass nur die zur
Versionsnummer der Wiki passenden mitreisen – in Snapshots und in eine andere
Installation. Die Vorschau listet übernommene Plugins und zeigt für
ausgelassene den Grund („nicht angefordert“, „keine Version“,
„andere Version“). Die Antwort enthält `includePlugins`, `keptPluginTitles`
und `skippedPlugins` (mit `title`, `reasonCode`, `reason`).

**Das Shadowing ist beabsichtigt.** Bei `externalPlugins: true` (Blank Template)
lädt die Seite die Cache-Versionen als `$tw.preloadTiddler`-Skripte; der
DOM-Store wird nach `loadTiddlersBrowser()` durch die Cache-Kopien ersetzt. Die
im Bag liegende Kopie reist trotzdem mit (Snapshots, andere Installation). Bei
`externalPlugins: false` bootet die Wiki aus dem Bag. Die Bootreihenfolge wurde
nicht geändert – der Cache ist diejenige Kopie, für die das Client-Plugin der
Installation gebaut ist.

**Verifikation.** `empty.html` (5.4.1) mit `--include-plugins` schreibt
`$:/core`, `$:/themes/tiddlywiki/snowwhite` und
`$:/themes/tiddlywiki/vanilla` in den Bag; ohne den Schalter bleibt alles weg.
Ein Muster mit `$:/core` auf `5.3.0` schreibt die beiden Themes, lässt `$:/core`
jedoch mit Begründung weg. Ein File ohne `version` beim Core wird mit dem
entsprechenden Grund abgewiesen. `npm run tsc2`, Admin-Typecheck, `npm run build`
und i18n-Audit sind sauber; der Dev-Store wurde nach dem Test zurückgesetzt.


## 91. Spanisches `#many`: der letzte offene Pluralfall

§89 hat Spanisch `many` mit einem Argument offen gelassen: es greife ab
`1000000` und verlange ein *de* vor dem Nomen, und ein `#many`, das die
einfachen Zählnomen deckt, aber nicht die Wendungen mit Artikel, wäre
schlechter als gar keines. Damit stand die Bedingung fest — alles oder nichts —
und dieser Abschnitt liefert das Ganze.

**Die Kategorie ist enger, als §89 sagte.** Spanisch `many` greift nicht ab
`1000000` aufwärts; `Intl.PluralRules("es").select()` antwortet `many` nur für
exakte ganzzahlige Vielfache einer Million — `1000000`, `2000000`,
`21000000` — und `other` für `999999`, `1500000` und jedes andere
Nichtvielfache.
§89 hat also zu weit gegriffen, zufällig in die nützliche Richtung: Die Menge,
für die CLDR eine Variante will, ist genau die Menge, für die Spanisch ein *de*
will, *un millón de archivos* und *veintiún millones de archivos*. Eine Zahl
`1500000` bleibt in `other` und behält die schlichte Form; das ist eine
CLDR-Grenze, die die App nicht erweitern kann.

**Zwölf Schlüssel brauchen die Variante, vier dürfen sie nicht haben.** Alle
sechzehn `{count}`-Schlüssel wurden danach sortiert, ob im spanischen Text ein
Nomen auf die Zahl folgt. Bei zwölf ist das so, auch bei den beiden mit
Artikel — `Mostrar los {count} títulos eliminados` und `Encuentra todos los
{count} animales.` — und diese bekommen ein `#many` als Geschwister mit *de*
direkt hinter `{count}`: `{count} de archivos`, `Mostrar los {count} de títulos
eliminados`, `Instantánea {name} con {count} de tiddlers`. Bei vier steht hinter
der Zahl nichts — `Deleted: {count}`, `Unchanged: {count}`, `Written: {count}`
und `System tiddlers in the file ({count})` — und ein `#many` würde dort nur den
Basisschlüssel kopieren, denn *Escritos: 1.000.000* ist bereits richtig und
*1.000.000 de escritos* wäre falsch. Eine überflüssige Variante würde die
§89-Regel brechen, dass der Basisschlüssel die `many`-Form hält, also liefern
diese vier nichts.

**Geprüft.** Das echte `t()` gebündelt und alle sechzehn Schlüssel bei `0`, `1`,
`2`, `21`, `999999`, `1000000`, `1500000`, `2000000` und `21000000` gerendert
ergibt 144 Kombinationen, in denen keine Zahl verloren geht und kein Schlüssel
auf seinen nackten Namen zurückfällt. Geprüft wird die zweiteilige Regel, die
die Übersetzungen kodieren: *de* steht genau dann, wenn die Kategorie `many`
ist **und** ein Nomen auf die Zahl folgt — der erste Versuch dieser Assertion
war falsch und meldete zwölf richtige Zeichenketten, weil er *de* auch für
`Written: {count}` verlangte. Englisch bleibt unberührt, 144 von 144
Kombinationen behalten ihre Zahl. Spanisch ist jetzt die einzige Datei mit
`#many` (12
Einträge), die acht Basisschlüsselmengen sind weiterhin dieselben 639, keine
Variante hat ihre Basis verloren, und `npm run tsc2`, der Admin-Typecheck und
`npm run build` sind sauber. Der `t()`-Dok-Kommentar, der die gelieferten
Kategorien aufzählte, nennt jetzt das spanische `#many` und die *de*-Regel und
sagt, warum ein unvollständiges `#many` schlechter ist als keines.

## 90. Aufräumen: zwölf Waisen raus, zwei fehlende Schlüssel rein

§89 endete auf `{count} new`, einer Waise in allen acht Sprachdateien ohne
Aufrufer. Einen veralteten Schlüssel zu löschen ist billig — aber nur, wenn man
weiß, dass er der einzige ist, und der erste Versuch, das herauszufinden, lag
weit daneben. Zählt man die Stringliterale, die an `t()` übergeben werden,
meldet das 189 unbenutzte Schlüssel, und auf der Liste stehen offensichtlich
sichtbare Labels: `Storage overview`, `Access denied.`, `Light theme`. Die
Admin-App ist datengetrieben: die Tab-Definitionen, Felddefinitionen und
Fehlercode-Maps in `src/definition/*.ts` und `src/helpers.tsx` tragen den
englischen Text als einfache Daten und übergeben ihn erst beim Rendern an
`t()` (`t(selectedTab.eyebrow)`, `t(field.description)`, `t(reason)`).
„Nicht mit einem Literal an `t()` übergeben" ist also nicht dasselbe wie
„ungenutzt". Ein Schlüssel gilt erst dann als Waise, wenn sein exakter Text
nirgends im Quelltext vorkommt, und dieser Test lässt **13** übrig, nicht 189.

**Eine der dreizehn war keine Waise, sondern ein Fehler.** Das Feld
`The field {key} is not defined in the draft record` war in allen acht
Sprachen übersetzt, während `getAdminRecordValue` und `setAdminRecordValue`
genau denselben Satz durch Verkettung bauten — `"The field " + field.key + "
is not defined in the draft record"` — und diesen englischen Text warfen. Acht
Übersetzungen einer Meldung, die niemand lesen konnte. Beide Aufrufer rufen
jetzt `t()` mit dem Parameter `{key}`, damit der defensive Fehler in der
Sprache der lesenden Person ankommt.

**Die anderen zwölf waren echte Altlasten**, jede davon durch einen längeren
oder genaueren Schlüssel abgelöst: `Storage status` → `Disk storage status`,
`Caution` und `Important notice` → die Meldungsstufen `neutral`, `info`,
`success`, `warning`, `danger`, `A visitor's own language or theme choice
always wins.` → derselbe Satz plus `Feature switches apply to everyone.`,
`Default bag`, `Prefix rules` und `Bag` → längere Feldlabels, die beiden
`You must be an admin to … teacher capabilities.` → generische
Berechtigungsmeldungen, dazu `Enter password`, `Settings saved.` und
`{count} new`. Alle zwölf sind aus allen acht Dateien entfernt: 96 Einträge,
in jeder Datei dieselben zwölf.

**Dieselbe Prüfung hat den entgegengesetzten Fehler gefunden: zwei benutzte,
aber nie übersetzte Schlüssel.** `t("Audience")` ist der Tooltip am
Sichtbarkeitsbereich einer Pinnwand-Notiz, `t("Size")` die Spaltenüberschrift
der Dateiliste; `t()` fiel auf den Schlüssel zurück, also stand beides in
allen acht Sprachen auf Englisch. Beide sind jetzt vorhanden — `Audience` wird
zu *Sichtbarkeit*, *Público*, *Public*, *閲覧対象*, `Size` zu *Größe*,
*Tamaño*, *Taille*, *Размер*. Beim Tooltip war die wörtliche Lesart von
*Audience* in den meisten Sprachen falsch: die Beschriftung daneben nennt, wer
die Notiz sieht, deshalb sagt Deutsch *Sichtbarkeit* und nicht *Publikum*.

**Geprüft.** Das echte `t()` mit esbuild gebündelt und alle drei Schlüssel in
allen acht Locales gerendert ergibt 24 richtige Zeichenketten, darunter *Das
Feld slug ist im Entwurf nicht definiert* und seine sieben Übersetzungen. Alle
acht Dateien enthalten wieder genau dieselben 639 Basisschlüssel, keine Datei
hat einen doppelten Schlüssel, keine `#variante` hat ihre Basis verloren, der
Platzhaltervergleich findet keine Abweichung, kein an `t()` übergebenes
Stringliteral ohne Übersetzung, und `npm run tsc2`, der Admin-Typecheck und
`npm run build` sind sauber.
## 89. Bugfix: Zahlen folgten nicht der Sprache, in der sie gezählt wurden

§88 hat einen russischen Tiertext korrigiert, der sein `{count}` verlor, und
dabei auf das verwiesen, was der Fix sichtbar machte: Russisch las `2` als
*2 заметок*, wo Russisch *2 заметки* will, denn `few` ist eine eigene Kategorie
in `Intl.PluralRules`, und die App lieferte nur `#one`-Varianten. Die
russischen `few`-Formen auszufüllen war der kleine Teil der Arbeit. Wer dem
nachgeht, stößt auf drei weitere Fehler derselben Art — alle drei sind behoben.

**`count` wurde an drei Stellen als vorformatierter String übergeben.**
`app.tsx` reichte `t("{count} files", { count: count.toLocaleString() })` und
die beiden Kandidatenzeilen an die Speicheranzeige. `typeof count` war also
nicht `"number"`, `t()` suchte gar nicht erst nach einer Pluralvariante, und
diese drei Texte waren in jeder Sprache falsch, auch im Englischen. Die Aufrufer
übergeben jetzt die Zahl, und `t()` formatiert numerische Parameter selbst
mit `value.toLocaleString(locale)` — so bleibt das Tausendertrennzeichen, das
diese Kacheln überhaupt zeigt, und ein Aufrufer kann die Mehrzahl nicht mehr
versehentlich verlieren, indem er zu früh formatiert.

**Zehn Texte hatten kein `#one` in `en`, `de`, `es` oder `fr`.**
`{count} files`, `{count} items`, `{count} wikis in total`,
`Show {count} titles`, `Show the {count} deleted titles`,
`System tiddlers in the file ({count})`,
`Snapshot {name} with {count} tiddlers`, die beiden Kandidatenzeilen und für
Spanisch und Französisch zusätzlich `Deleted: {count}`, `Unchanged: {count}`
und `Written: {count}`. Englisch — die Vorgabe und die Sprache, in der die
Schlüssel geschrieben sind — sagte **1 files** und **Found 1 candidates**. Alle
haben jetzt den Singular.

**Welche Kategorien eine Datei mitbringt, entscheidet die Sprache und nicht die
Symmetrie.** `Intl.PluralRules` gibt `ja`, `ko` und `zh-cn` für ganze Zahlen
genau eine Kategorie, ihre vorhandenen `#one`-Einträge können also nie gewählt
werden, und es kam keine hinzu. Russisch ist die einzige unterstützte Sprache
mit `few`, also liegen alle acht `#few`-Einträge in `ru.ts`. Deutsch braucht für
*Titel* und *Systemtiddler* gar keine Variante, weil sie invariant sind, und
Spanisch für invariante Wörter wie `вики` ebensowenig. Der Basisschlüssel muss
deshalb die `many`/`other`-Form halten — russisch ist `{count} notes` *заметок*,
nicht *заметка* — und diese Regel steht jetzt im Doku-Kommentar von `t()`
zusammen mit der Kategorientabelle.

Die Wortstellung folgt der Sprache und nicht dem englischen Original: Deutsch
*Die gelöschten Titel zeigen* wird zu *1 gelöschten Titel zeigen* und nicht zu
*Die 1 gelöschten Titel*, weil Artikel und Adjektivendung zur Mehrzahl gehören.
Keine Sprache bekommt einen Artikel vor einer Ziffer, die englischen Singularen
lesen sich deshalb *Show 1 title* und *Found 1 candidate* statt *Show the 1
title*, und die französischen *Afficher 0 titre*, weil Französisch auch bei `0`
den Singular nimmt.

**Verifiziert** durch Bündeln des echten `t()` mit esbuild und Aufrufen: jeder
der 16 pluralrelevanten Texte in allen acht Locales, bei
`0, 1, 2, 3, 5, 11, 21, 22, 25` und `1000000` — die interessanten Ecken, denn
Russisch fasst `21` und `101` zu `one`, aber nicht `11`, `few` umfasst `2` bis
`4` aber nicht `22` allein, und `many` ist bei `5` mit beiden gleich. In keiner
der 1280 Kombinationen geht eine Zahl verloren, und keine Sprache fällt auf den
nackten Schlüssel zurück. Die 649 Basisschlüssel sind über alle acht Dateien
identisch, keine Datei hat einen doppelten Schlüssel, und ein
Platzhaltervergleich aller 662 Einträge findet keine Abweichung. `npm run tsc2`,
`cd packages/admin-vanilla && npx tsc --noEmit` und `npm run build` sind sauber.

Zwei Dinge tut dieser Abschnitt bewusst nicht. Spanisch `many` greift ab
`1000000` und verlangt ein *de* vor dem Nomen — *1.000.000 de archivos* —, aber
keine Zahl in dieser App erreicht das plausibel, und ein `#many`, das die
einfachen Zählnomen deckt, aber nicht die Wendungen mit Artikel, wäre schlechter
als gar keines; deshalb liefert Spanisch kein `#many`. Und `{count} new` ist ein
Waisen: der Pinnwand-Tab benutzte es, bis das Ungelesen-Label zu
`{count} new notes` wurde, und es steht noch in allen acht Dateien ohne
Aufrufer. Beides ist vermerkt und nicht stillschweigend aufgenommen; §90 entfernt die
Waise, §91 ergänzt das spanische `#many`.

## 88. Bugfix: die russische Mehrzahl von „Tier" ließ die Zahl weg

§87 hat die fehlenden 83 Texte den sechs Sprachen nachgetragen, die sie noch
nicht hatten, und die Platzhalterprüfung dabei einen Fehler gefunden, der seit
§14 dort stand: `"Find all {count} animals.#one"` in `ru.ts` lautete *Найдите
одно животное.* — ein Tier, ohne das `{count}`. Die anderen sieben Sprachen
führen es alle.

Ein Zeichen plus Leerzeichen: *Найдите {count} животное.* In `i18n.ts` musste
nichts geändert werden, denn `t()` interpoliert in der gewählten Variante
bereits jeden Parameter. Die Formulierung musste im Nominativ Singular
bleiben, weil genau den verlangt `Intl.PluralRules("ru")`, und Russisch hat die
Kategorie `one` nicht nur bei `1` — sondern bei jeder Zahl, die auf `1` endet,
außer `11`. Dieselbe Zeichenkette bedient deshalb auch `21` und `101`.

**Verifiziert.** Nicht durch Lesen der Zeile, sondern indem das echte `t()` mit
esbuild gebündelt und aufgerufen wurde: `t("Find all {count} animals.", { count })`
für `0, 1, 2, 3, 5, 11, 21, 22, 25, 101` in allen acht Locales, mit der
Zusicherung, dass der erzeugte Text die übergebene Zahl enthält. Null verloren.
Die `#one`-Fälle lesen *Найдите 1 животное.*, *Найдите 21 животное.*, *Найдите
101 животное.*, alles andere fällt auf den Basisschlüssel zurück. Dieselbe
Prüfmaschinerie über `{count} notes` und `{count} new notes` besteht in allen
acht Sprachen ebenfalls. `npm run tsc2`,
`cd packages/admin-vanilla && npx tsc --noEmit` und `npm run build` sind sauber,
und die Platzhalterprüfung über alle 653 Schlüssel meldet in keiner der acht
Dateien mehr eine Abweichung.

Einen Nebeneffekt hat diese Prüfmaschinerie ebenfalls sichtbar gemacht, den §87
nicht gefunden hat und den dieser Abschnitt nicht behebt: Russisch liest `2`
als *2 заметок*, wo *2 заметки* stehen müsste. `few` ist eine eigene Kategorie
in `Intl.PluralRules`, und die App liefert nur `#one`-Varianten, also fallen
`2` bis `4` auf den Basisschlüssel zurück. Der Lookup in `t()` würde einen
`#few`-Eintrag bereits ohne jede Codeänderung beachten; es fehlt die russische
`few`-Form zu jedem Pluralnoun in den Dateien, und das ist eine
Übersetzungsaufgabe, kein Bugfix.

## 87. Bugfix: der Wiki-Dateien-Dialog sprach nur Deutsch und Englisch

`AGENTS.md` sagt, die Admin-App sei "bilingual by contract" — das wurde als
"zwei Sprachen" gelesen statt als "DE und EN sind die zwei, die es geben muss".
Die App hat seit §14 acht Sprachen, und der Wiki-Dateien-Dialog aus
§84/§85/§86 kam mit 83 Texten in `de.ts` und `en.ts` daher. `t()` fällt auf den
Schlüssel selbst zurück, wenn ein Wörterbuch keinen Eintrag hat, und so sah
jede andere Sprache den englischen Quelltext: Der Menüeintrag las *Take over a
wiki file* statt *Wiki-Datei übernehmen* — und mit ihm der ganze Dialog, jeder
Hinweis, jede Planzeile, jede Fehlermeldung und die Restore-Bestätigung.

Alle 83 Schlüssel stehen jetzt auch in `es`, `fr`, `ja`, `ko`, `ru` und
`zh-cn`, womit die acht Wörterbücher je 653 Schlüssel haben, ohne Lücke in
beide Richtungen. Kein Platzhalter ist verlorengegangen oder erfunden worden:
Jedes `{count}`, `{slug}`, `{date}` und `{name}` in einer Übersetzung passt zu
seinem englischen Schlüssel, geprüft durch Vergleich der Platzhaltermengen über
alle 498 neuen Einträge. Die Escapes `\u2026` und `\n\n` wurden in derselben
Quellform übernommen, in der die englische Datei sie führt, damit die Schlüssel
zeichengleich und nicht bloß gleich aussehend sind.

Die Terminologie folgt dem, was die jeweilige Sprache an anderer Stelle in der
App schon verwendet, und keiner neuen Überschreibung: *bag*, *tiddler* und
*wiki* bleiben wie sie waren (`tiddler`/`tiddler`/`ティドラー`/`티들러`/
`тайдлер`/`条目`), Snapshots heißen `instantánea`/`instantané`/`スナップショット`/
`스냅샷`/`снимок`/`快照`, und Russisch nimmt *вики*, wo die anderen Sprachen
*wiki* sagen. Die deutsche Mehrzahlform behält die Konvention der Datei,
`{count} Tiddler` für beide Zahlen, wie seit §14.

**Verifiziert.** `cd packages/admin-vanilla && npx tsc --noEmit` und
`npm run build` sauber; alle acht Dateien werden als TypeScript geparst, keine
hat einen doppelten Schlüssel. Das gebaute Artefakt enthält alle sechs neuen
Mengen — ein direktes `grep` im minimierten Bundle findet sie nicht, weil esbuild
Nicht-ASCII escaped, deshalb lief die Prüfung gegen das `sourcesContent` der
Sourcemap. Eine Platzhalterprüfung über alle 653 Schlüssel meldet nur
gewollte Gleichheiten (Eigennamen wie `Wiki`, `TiddlyWiki {version}`, `Slug`,
`Plugins`) und keine Abweichung.

Nicht Teil dieses Abschnitts: `"Find all {count} animals.#one"` in `ru.ts`
verliert das `{count}`, das sein englischer Schlüssel hat. Das ist toter
Demo-Text aus §14 — das Login-Rätsel benutzt `"Find all {count} animals."`, mit
Punkt —, es erscheint also heute nichts falsch, aber es ist ein echter Fehler in
dieser Pluralvariante.

## 86. Bugfix: drei Dinge, die der Single-File-Import falsch gemacht hat

Der Import aus §84 und §85 wurde gegen eine echte Datei geprüft — eine mit
TiddlyWiki 5.4.1 gespeicherte `index.html`, 2,6 MB, 17 Tiddler, alle `$:/`.
Drei Dinge haben den Vergleich nicht überstanden, alle drei sind behoben.

**Sitzungszustand wurde importiert.** Der Store dieser Datei enthält
`$:/StoryList`, `$:/temp/...`, `$:/state/tab-...`, `$:/state/plugin-info-...`,
`$:/HistoryList`, `$:/Import`, `$:/build`, `$:/isEncrypted` und `$:/status/...`:
die Tabs, die Entwürfe, das Request-Log und den Plugin-Cache der
Browser-Sitzung, die die Datei gespeichert hat. Unser Importierer hat 11 dieser
13 Tiddler mitgenommen, damit die offenen Tabs einer fremden Person im Wiki
landeten und ein veraltetes `$:/StoryList` zum Story River des Wikis wurde.
TiddlyWikys eigener Import fragt nicht nach ihnen — `core/modules/upgraders/system.js`
deselektiert genau diese Liste — und genau diese Liste steht jetzt in
`TRANSIENT_TITLES` und `TRANSIENT_PREFIXES`: die fünf Titel `$:/build`,
`$:/HistoryList`, `$:/Import`, `$:/isEncrypted`, `$:/StoryList` und die Präfixe
`$:/state/`, `$:/status/`, `$:/temp/`. Sie fallen schon vor dem
Systemtiddler-Schalter weg, denn sie sind so oder so Müll, und sie werden im
Plan benannt, damit ein übersprungener Tiddler sichtbar ist und nicht bloß
fehlt. Dieselbe Datei liefert damit drei Tiddler statt dreizehn, die elf
übrigen namentlich.

**Ein deutsches Wiki kam auf Englisch an.** `$:/language` wurde importiert,
sein Sprachpaket nicht: das ist ein `plugin-type: language`-Tiddler, und der
Importierer ließ jeden Plugin fallen, weil in MWS der Plugin-Satz zum Recipe
gehört. Für `$:/core` und die Themes stimmt das — 2 MB Core pro Bag wären
Unsinn — für die Sprache aber nicht, weil MWS *Sprach*-Plugins im Bag hält und
nicht im Recipe (die Plugin-Liste eines Recipes ist für die von MWS
erzeugten Wikis leer, die Sprache ist eine Eigenschaft des Wikis und nicht der
Installation). So blieb das Wiki mit `$:/language` → `$:/languages/de-DE` ohne
solches Paket im Bag, und der Plugin-Umschalter fiel stillschweigend auf en-GB
zurück. Ein Sprachpaket ist jetzt der einzige Plugin-Typ, der mitreisen darf,
unter derselben Bedingung wie jeder andere `$:/`-Tiddler. `$:/language` selbst
wird nur geschrieben, wenn das Wiki die Sprache danach wirklich sprechen kann:
das Paket kommt mit der Datei, der Core hat sie schon (`$:/languages/en-GB`),
oder der Ziel-Bag hat sie. Sonst bleibt `$:/language` unangetastet und der Plan
sagt es — das Wiki behält seine Sprache, statt auf ein nicht existierendes
Paket zu zeigen.

**Ein Replace hat Tiddler ohne Namen vernichtet.** Der Plan zählte, was ein
Replace löscht, und der Dialog nannte es "Tiddlers not in the file". Für die
einzige Operation, die Arbeit vernichten kann, ist das eine Klick zu wenig. Der
Plan führt die Titel, die Route gibt alle zurück (kein Zwöfer-Sample: die Zahl
ist durch das Tiddler-Limit der Datei ohnehin begrenzt), die CLI druckt sie,
und der Dialog bekommt die Zeile einen Warnhintergrund mit den Titeln in einer
offenen Liste. Es ist die einzige rote Zeile im Plan.

Texte in beiden Sprachen; aus `Plugins are never imported` und
`Plugins left out` wurden `A language pack is one of them` und `Core plugins, themes and libraries left out`, denn Plugins sind nicht mehr pauschal nein. Die
veraltete Formulierung "die Einstellungen der Datei kommen nicht mit" ist mit
den Sprachzeilen mit verschwunden.

**Verifiziert.** `empty.html` durch `import-wiki-file`, vorher und nachher, und
`npm run tsc2`, `cd packages/admin-vanilla && npx tsc --noEmit`, `npm run
build`, `git diff --check` sauber:

- `--include-system` auf `empty.html`: `3 tiddler(s)` statt vorher `13`, nämlich
  `$:/config/Plugins/Disabled/$:/languages/de-AT`, `$:/language` und das Paket
  `$:/languages/de-DE`; `11 session/build tiddler(s) dropped` vollständig
  benannt.
- `language: $:/languages/en-GB` — der Core hat sie, also reist `$:/language`
  mit.
- Eine Kopie der Datei mit Zeiger auf `$:/languages/fr-FR`: `2 new`,
  `$:/language` nicht in der Liste und nicht taken over -
  `The file wants the language "$:/languages/fr-FR" but does not contain the
  language pack, and the target wiki does not have it either. The wiki keeps
  its own language.` Die Reason-Codes sind für den Dialog; CLI und Plan
  drucken den Satz.
- Eine Kopie auf `$:/languages/de-DE`, die die Datei mitbringt: `pack
  $:/languages/de-DE comes with the file`, `$:/language` geschrieben.
- Ohne `--include-system`: `0 new`, `3 system tiddler(s) left out`, die Sprache
  nicht übernommen, das Wiki behält seine.
- Ende-zu-Ende in ein vom Befehl erzeugtes Wiki, dann ausgeliefert:
  `GET /wiki/de-test` liefert `200` und 375 KB, und der Browser-Store enthält
  `$:/language` → `$:/languages/de-DE` mit den 1072 Tiddlern des Pakets —
  `$:/language/Buttons/Cancel/Hint` ist "Abbrechen", die `en-GB`-Einstellung
  der Datei ist weg. Dasselbe Wiki hatte vor dem Fix `$:/language` →
  `$:/languages/en-GB`.
- Löschungen: ein Replace, der einen Inhaltstiddler verliert, meldet
  `1 deleted: Charlie` und schreibt einen Snapshot; einer, der zwanzig
  verliert, meldet `20 deleted` mit allen zwanzig im Plan und den ersten zwölf
  im Terminal.
- Der Store wurde danach aus seinem Backup zurückgespielt: 15 Wikis, 15 Bags,
  keine Snapshots, keine Test-Wikis.

Nicht Teil dieses Abschnitts: `$:/core/modules/`-Tiddler (sie sind Systemtiddler
wie alle anderen und reisen nur mit dem Schalter) und die Wiki-Dateiliste in
"Meine Dateien".

## 85. Feature: "Wiki-Datei übernehmen" in der Admin-App (Dialog, Routen)

Der Wiki-Dateien-Import aus §84 ist jetzt aus der Admin-App erreichbar. Der
Einstieg sitzt im vorhandenen Dropdown **"Wiki erstellen"** als **"Wiki-Datei
übernehmen"**: gespeicherte `index.html` hochladen, nachsehen, was passieren
würde, und erst dann schreiben.

**Zwei Schritte, nie einer.** Der Dialog fragt den Server, was eine Datei
*tun würde* (`PUT /api/wiki-file/inspect`), und schreibt erst nach einer
ausdrücklichen Bestätigung (`PUT /api/wiki-file/import`). Beide Aufrufe
schicken denselben Multipart-Upload, und beide lassen den Plan serverseitig
neu berechnen — die Vorschau ist eine Zusage für *eine* Datei und *ein* Ziel,
nie ein Dokument, das der Browser zurückschicken dürfte. Jede Änderung an
Datei, Ziel, Modus oder am Systemtiddler-Schalter verwirft die Vorschau, damit
der angezeigte Plan immer den folgenden Request beschreibt.

**Die Routen liegen unter `/api`, nicht unter `/admin`.** `/admin/:op/:tab` ist
die generische JSON-Datensatzroute: Sie beansprucht jeden zweiteiligen
`/admin/...`-Pfad und liest den Body als JSON — aus dem ersten
Multipart-Upload wurde so `MALFORMED_JSON`. Unter `/api` gehört das
Body-Format zur Route, und die Sicherheitsprüfungen bleiben dieselben wie
sonst (`X-Requested-With`, Referer `/`, angemeldete Person).

**Wer was darf.** Eine neue Wiki läuft durch `assertWikiCreationAllowed()`,
inklusive des eigenen Wiki-Limits der Ein-Klick-Erstellung. Eine bestehende
Wiki wird mit demselben `RecipeResolver.assertRecipe()` und `canWriteBag()`
geprüft wie das Speichern eines Tiddlers, ein Bag aus `readonlyBags` wird auch
für Administratoren abgelehnt, und `state.asserted` wird *vor*
`state.$transaction()` gesetzt — das haben die beiden Routen aus der
CLI-Arbeit gelernt, wo die Transaktion sich darüber beschwert hat. Ein Ersetzen
braucht zusätzlich `C_admin` auf dem Schreib-Bag (oder die Site-Administration
oder den Eigentümer), weil es löscht, was nicht in der Datei steht; ein
Zusammenführen braucht nur Schreibrecht und schreibt nie einen Snapshot.
Snapshots auflisten und wiederherstellen liegen hinter derselben Schranke wie
das Ersetzen, das sie erzeugt hat, und ein Restore akzeptiert nur Bags unter
`snapshots/<slug>/`.

**Neue Wiki, bestehende Wiki.** Für eine neue Wiki bietet der Dialog einen
Namen und einen Slug an; die Vorschau zeigt den Slug, den die Wiki tatsächlich
bekommt (der Server hängt eine Zahl an, wenn der Slug vergeben ist), und der
Import schickt genau diesen Slug — so kann zwischen den beiden Aufrufen keine
fremde Wiki überschrieben werden. Als Vorlage dient dieselbe
`DEFAULT_TEMPLATE` ("Blank Template") wie bei der Ein-Klick-Erstellung, und
der Bag bekommt denselben persönlichen Namensraum. `WikiShell.ts` bündelt
diese Schale, damit CLI und Dialog nicht auseinanderlaufen können.

**Systemtiddler.** Sie werden wie in §84 standardmäßig ausgelassen; das
Kästchen "Auch Systemtiddler importieren" schaltet sie hinzu, und unter dem
Plan steht, welche die Datei enthält. Plugins werden nie importiert, auch bei
aktivem Kästchen nicht.

**Snapshots.** Jedes Ersetzen schreibt einen Snapshot; der Dialog listet die
Snapshots der Zielwiki mit Zeitstempel, Tiddlerzahl und Herkunft und stellt
einen nach einer Rückfrage wieder her — auch ein Restore ist rückholbar, weil
er zuerst selbst einen Snapshot schreibt.

**Dateien.**
- `new-managers/WikiFileRoutes.ts`: die vier Routen, der Upload-Leser mit
  laufender Bytegrenze, die Zielauflösung und die Plan-Zusammenfassungen.
- `new-managers/WikiShell.ts`: Bag + Rezept + Starter-Tiddler, mit der CLI
  geteilt.
- `new-managers/TabDataAdapter.ts`: `assertWikiCreationAllowed()`,
  `newWikiAdminRole()`, `newWikiSlug()`, auch von `AdminCreateWiki` genutzt.
- `ServerState.ts`: `wikiFileSizeLimit` (`MWS_WIKI_FILE_SIZE_LIMIT`), damit
  Dialog und CLI dieselben Dateien annehmen.
- `admin-vanilla/src/wiki-file-import.tsx`: der Dialog.
- `admin-vanilla/src/helpers.tsx`: Fehlerauswertung und `prettifyBytes()` aus
  `app.tsx` und `user-files.tsx` herausgezogen, damit alle drei Bereiche sie
  teilen, plus die deutschen Meldungen zu den Servergründen der neuen Routen.

**Verifiziert** auf der Dev-Instanz mit `curl`, mit denselben Requests, die
der Dialog schickt (Multipart-Feld `file`, JSON-Body `{snapshot}` für ein
Restore), gegen `editions/bedienungsanleitung/output/index.html` und eine
geänderte Kopie davon; der Store wurde davor gesichert und danach wiederher-
gestellt:
- Neue Wiki über `PUT /api/wiki-file/import?create=1` → `49 written`, Slug
  `mws-bedienungsanleitung`, Bag
  `editions/01a09c6c-e744-716e-ae43-73c4d6393f1c/mws-bedienungsanleitung`,
  Eigentümer `admin`, 51 Tiddler (49 plus `$:/SiteTitle`,
  `$:/DefaultTiddlers`); `GET /wiki/mws-bedienungsanleitung` rendert mit
  `<title>MWS Bedienungsanleitung</title>`.
- Replace → `1 created, 1 updated, 48 unchanged, 0 deleted`, Snapshot mit 51
  Tiddlern; die Vorschau derselben Datei meldet danach `0` erstellt und `0`
  geändert.
- `include-system=1` → 57 statt 49 Tiddler, die Systemliste zeigt die acht
  `$:/`-Tiddler der Datei.
- `Schüler 1` mit `B_write` auf dem Bag: Merge `200` (`2 written`, kein
  Snapshot), Replace `403` mit "Replacing the wiki … needs administrator
  rights (C_admin) on its write bag. A merge is enough to add tiddlers."; auch
  die Snapshot-Liste ist aus demselben Grund `403`.
- Ohne Session → `403` "User not authenticated"; einfaches HTML → `400`
  `NOT_A_TIDDLYWIKI`; unbekannte Wiki → `404`; vergebener Slug → `409`; mit
  `MWS_WIKI_FILE_SIZE_LIMIT=100000` → `413` mit der Grenze in den Details.
- Restore mit dem Body des Dialogs → `1 written, 1 deleted, 50 unchanged` und
  ein neuer Snapshot mit 52 Tiddlern; ein Snapshot mit fremdem Wiki-Präfix →
  `403`.
- `npm run tsc2` und `cd packages/admin-vanilla && npm run tsc` sauber,
  `npm run build` erfolgreich; das ausgelieferte Admin-Bundle enthält den
  Dialog und beide Sprachfassungen seiner Texte.

**Nicht durch Anklicken geprüft.** Der Dialog wurde über seine Requests
getestet, nicht mit der Maus: Dropdown-Eintrag, Dateiauswahl, Plan-Anzeige und
Restore-Knopf brauchen noch einen manuellen Durchgang im Browser.

Nicht Teil dieses Abschnitts: die Wiki-Dateiliste in "Meine Dateien" und die
Migration bestehender `user_file`-HTML-Anhänge in einen Bag.

## 84. Feature: eine Single-File-TiddlyWiki-5 in ein Wiki importieren (CLI)

Ein Wiki, das nur als eine `index.html` existiert, kann jetzt von MWS
übernommen werden. Gemeint ist nicht "aus beliebigem HTML wird ein Wiki",
sondern: eine mit TiddlyWiki 5 gespeicherte Wiki lässt sich ohne Umweg über
einen Ordner voller `.tid`-Dateien an MWS übergeben.

**Warum ein serverseitiger Parser und nicht der Client.** MWS hat `tiddlywiki`
nicht als npm-Paket, bootet aber zur Laufzeit eine echte TiddlyWiki 5 —
`plugin-cache/index.ts` ermittelt die Version und bootet
`<wikiPath>/tw5/<version>`. Diese Instanz wird hier mit
`$tw.wiki.deserializeTiddlers("", html, undefined, {deserializer: "text/html"})`
benutzt, also mit dem Aufruf aus `core-server/commands/import.js:34`. Der
`text/html`-Deserializer ist der entscheidende Teil: er liest beide
Speicherformen, das JSON-Skript `tiddlywiki-tiddler-store` und das klassische
`storeArea`-Div. `application/json` ist falsch, und ohne expliziten
Deserializer fällt der Speicher in den Allerwelts-Zweig und die ganze Datei
wird zu *einem* Tiddler.

**Was erkannt und was abgelehnt wird** (`WikiFileImport.ts`):
`application-name` muss `TiddlyWiki` sein, `tiddlywiki-version` muss
vorhanden sein, und es muss einen Speicher geben. Eine TiddlyWiki-2-Datei wird
davor an ihrem Versions-Skript erkannt — sie verdient "zuerst mit TiddlyWiki 5
speichern", nicht "das ist keine TiddlyWiki". Passwortgeschützte Dateien
werden mit genau dieser Formulierung abgelehnt, ein leerer Speicher ebenfalls
("nichts zu importieren"), und Bytelimit
(`MWS_WIKI_FILE_SIZE_LIMIT`, Standard 50 MB) wie Tiddler-Limit (Standard
20 000) werden durchgesetzt. Eine `external-core`-Markierung wird als `tw5x`
gemeldet und mit dem installierten Core gelesen, denn genau das ist sie.

**Systemtiddler und Plugins.** `$:/`-Tiddler konfigurieren das Wiki als Ganzes,
deshalb werden sie standardmäßig übersprungen und nur mit
`--include-system` ausdrücklich übernommen (der Admin-Dialog einer späteren
Phase fragt nach). Plugin-, Theme-, Library- und Language-Tiddler werden
*niemals* importiert — in der Testdatei ist allein `$:/core` rund 2 MB
Plugintext, und die Plugins eines Wikis kommen aus seinem Rezept. Ziel ist
ausschließlich der Default-Write-Bag des Wikis; Rezept, ACLs und Pluginliste
bleiben unangetastet.

**Ersetzen heißt erst Snapshot.** MWS hat keine Inhaltshistorie, deshalb
kopiert ein Replace den Bag vor dem ersten Schreiben in einen versteckten Bag
`snapshots/<slug>/<UTC-Zeitstempel>` (`WikiSnapshotBag.ts`). Er wird von keinem
Rezept referenziert, erscheint also nie als Wiki-Inhalt, und wird pro Wiki auf
`--snapshot-keep` (Standard 10) beschnitten. `restore-wiki-snapshot` liest ihn
zurück — und ist selbst rückholbar, weil auch ein Restore zuerst snapshottet.

**Was ein Replace nie löscht.** Die `$:/`-Tiddler des Ziel-Bags bleiben, auch
wenn die Datei keine hat: `$:/SiteTitle` und `$:/DefaultTiddlers` gehören MWS,
und sie zu löschen, weil eine hochgeladene Datei keine mitbringt, ist nie das
Gemeinte des Bedieners. In der Vorschau stehen sie als `kept as they are`.

**Dateien.**
- `new-managers/WikiFileImport.ts`: Validierung, Speicher-Erkennung, Parser,
  System-/Plugin-Filter.
- `new-managers/WikiSnapshotBag.ts`: Snapshot-Bags, Metadaten, Pruning.
- `new-managers/importWikiFile.ts`: Plan (neu/geändert/unverändert/gelöscht),
  Anwenden, Restore.
- `new-commands/import-wiki-file.ts`, `new-commands/restore-wiki-snapshot.ts`:
  die CLI, registriert in `new-commands/index.ts`.

**Verifiziert** an `editions/bedienungsanleitung/output/index.html` (2,5 MB,
5.4.1, JSON-Speicher) auf der Dev-Instanz, Datenbank davor gesichert und
danach zurückgesetzt:
- `--create --slug import-test` → `49 new`, Wiki `import-test` mit Bag
  `editions/import-test`, `ADMIN` mit `B_write` auf dem Rezept und `C_admin`
  auf dem Bag, 51 Tiddler (49 Inhalt plus `$:/SiteTitle` und
  `$:/DefaultTiddlers`); größter Tiddler 891 Bytes, es ist kein Plugin
  reingerutscht.
- `--dry-run` auf dieselbe Datei → `48 unchanged, 0 changed` — der Weg durch
  die Datenbank ist byte-genau.
- Eine zweite Datei (gebaut mit `tiddlywiki --build index`, ein Tiddler dazu,
  zwei weg, einer geändert) → in der Vorschau `1 new, 47 changed, 2 deleted`,
  nach dem echten Lauf `2 system tiddler(s) kept as they are`. Ein erneuter
  Lauf ergibt `48 unchanged`.
- Snapshot `snapshots/import-test/20261001T173119355Z` enthielt die 51
  vorherigen Tiddler plus fünf Metadaten-Tiddler `$:/mws/snapshot/*`, stand in
  keinem `recipe_bag`, und `restore-wiki-snapshot … --list` findet ihn. Der
  Restore holte 51 Tiddler inklusive `Backup` und `Autosave` zurück, ließ
  `Import-Test-Geändert` verschwinden und legte den Zustand davor im eigenen
  Snapshot ab.
- Fehler: einfaches HTML → "no application-name meta tag"; TW2-Datei → der
  TW2-Hinweis; verschlüsselter Speicher → der Passwort-Hinweis;
  Speicher-Markierung in einem Textbeispiel → leerer Speicher abgelehnt. Ein Bag
  aus `readonlyBags` des Rezepts wird auch für die CLI abgelehnt ("is a
  read-only bag of the wiki"), und `--snapshot-keep 0` ebenso — ein Ersetzen
  ohne die eigene Sicherungskopie ist kein Ersetzen.
- Zwei Fehler, die die Verifikation gefunden hat: `$:/SiteTitle` und
  `$:/DefaultTiddlers` wurden von einem Replace als gelöscht aufgeführt (jetzt
  behalten und als `kept as they are` gemeldet), und `--include-system` hat die
  Systemtiddler nur *gemeldet*, aber nicht importiert (jetzt 56 statt 48
  Tiddler im Plan).
- `GET /recipe/import-test/store.json` (für den Test anonymes Lesen gesetzt)
  lieferte 56 Tiddler, `GET /wiki/import-test` rendert mit
  `<title>MWS Bedienungsanleitung</title>`. Die 101 `tiddler_event`-Zeilen des
  Ziel-Bags sind die Serviceseite der Live-Aktualisierung offener Tabs.
- Ein zweiter, kleinerer Durchlauf mit drei Tiddlern, nachdem der gemeinsame
  Snapshot-Leser den doppelten ersetzt hatte: create → im nächsten Dry-Run
  `0 new, 0 changed, 3 unchanged` → einen Tiddler ändern, einen löschen →
  `1 written, 1 deleted, 1 unchanged` mit Snapshot → Restore holt `T3` und den
  alten `T2`-Text zurück → `--snapshot-keep 1` wirft die zwei älteren Snapshots
  weg und benennt sie.
- `npm run tsc2` sauber, `npm run build` erfolgreich; der Dev-Store wurde danach
  Tabelle für Tabelle mit dem Backup verglichen und ist unverändert.

Nicht Teil dieses Abschnitts: der Admin-Dialog (Upload, Vorschau, Rückfrage),
die Wiki-Dateiliste in "Meine Dateien" und die Migration bestehender
`user_file`-HTML-Anhänge in einen Bag. `restoreSnapshotBag` in
`importWikiFile.ts` ist der programmatische Einstiegspunkt dafür; die CLI
nutzt bis dahin den Befehl.

## 83. Bugfix: ein Verbindungsalarm statt einer Flut (Issue #139)

Upstream-Issue #139: Ist das Netzwerk weg, stapelt die Wiki Alarm nach Alarm.
Vor dieser Änderung war das im Browser reproduzierbar und messbar.

**Vorher gemessen** auf einer isolierten Instanz
(`/tmp/opencode/mws-sim`, Port 5099, Playwright bricht `/updates` ab): Der erste
Alarm erschien erst nach 61,9 s — der Syncer fragt alle 60 s ab — und die beiden
`displayError`-Aufrufe eines fehlgeschlagenen Abrufs erzeugten je einen eigenen
Alarm im normalen Logger `syncer-browser-multiwikiclient`, weil der
MultiWikiClient-Adaptor eine Anfrage, die den Server nie erreichte, als
gewöhnlichen `Error` meldete. Der Zähler des ersten Alarms stieg von 1 auf 10,
alle 5 s ging eine neue `/updates`-Anfrage hinaus, und nachdem das Netzzeug
zurückkam, blieben beide Alarme während der beobachteten 40 s stehen.

**Vier Ursachen, alle unsere.**

1. `httpRequest` in `plugins/client/src/new-multiwikiclientadaptor.ts` nutzt
   `XMLHttpRequest` und lehnt nicht ab: Eine Anfrage, die den Server nie
   erreicht, antwortet mit Status `0`. `recipeRequest` machte aus jeder
   Nicht-ok-Antwort `Server returned 0: (no reason)` und damit ununterscheidbar
   von einem echten Serverfehler — der Syncer sah also nie einen
   Verbindungsfehler.
2. `displayError` erkennt nur den alten Core-String `XMLHttpRequest: 0`, den
   dieser Adaptor nie liefert. Und es alarmiert zweimal, weil der fehlgeschlagene
   Abruf den Fehler zweimal meldet: einmal aus der Aufgabe, einmal aus
   `syncFromServerTask`. `Logger.alert` zählt nur gleiche Texte, beide Alarme
   bleiben also sichtbar.
3. Das Wiederholungsintervall blieb bei 5 s, egal wie lange der Fehler dauerte.
4. Die Syncer-Kopie in `plugins/client/tiddlers/syncer/syncer.js` löschte die
   Verbindungsalarme in `updateDirtyStatus`, sobald die Wiki nicht schmutzig
   war. Für einen anonyben Leser ist das sofort wahr, ein gerade erzeugter Alarm
   wurde also wieder weggeworfen.

**Die Lösung.** Ein `NetworkError` mit `isNetworkError` kennzeichnet, was den
Server nie erreicht hat; Status `0` ist genau das, jeder andere Status bleibt ein
gewöhnlicher `Error` mit dem Grund des Servers. `isConnectionError()` erkennt
die Markierung neben dem alten String, und pro Ausfall wird ein Alarm über
`loggerConnection` erzeugt — mit neuem deutschen und englischem Text in
`MWS/Syncer/NetworkErrorAlert`. Eine erfolgreiche Aufgabe setzt Alarm und
Zähler zurück, das Backoff `[1,2,6,12]` der 5-s-Basis macht aus den
Wiederholungen 5/10/30/60 s, und `updateDirtyStatus` löscht nichts mehr.

**Nachher gemessen**, gleiches Szenario: erster Alarm bei 60,1 s, genau ein
Alarm mit Zähler 1 über 100 s Ausfall, Anfragen bei 60,1; 65,1; 75,1 und 107,1 s,
und der Alarm ist beim ersten erfolgreichen Abruf nach der Rückkehr des Netzes
weg. Ein Server, der `503` antwortet, erzeugt weiterhin die gewöhnlichen
Syncer-Alarme und keinen Verbindungsalarm.

**Die Messung ist ein Skript:** `scripts/syncer-alert-sim.mjs` (Playwright,
`playwright-core`, das Chromium aus dem Playwright-Cache). Vorgaben sind
20 × 5 s Ausfall und 16 × 5 s Recovery; das Recovery-Fenster muss das 60-s-Backoff
überdauern, denn der Versuch, der den Alarm löscht, ist der danach. `MWS_URL`,
`MWS_WIKI`, `MWS_ABORT_REASON` (Vorgabe `failed`) und die Messpunktzahlen sind
Umgebungsvariablen, `--help` listet sie auf.

Nicht verifiziert: echtes Schlafen und Aufwachen am Laptop — das gehört zur
Freigabe durch die Maintainer.

## Betrieb / Ausblick

- Start über `npm start` (`scripts.mjs` → `tsup` + `mws.dev.mjs`), im
  produktiven Betrieb per `pm2 startup`.
- Standard-Login nach `init-store`: `admin` / `1234` (Passwort danach
  ändern).
