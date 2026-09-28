# 🇺🇸 CHANGELOG – MultiWikiServer-wikiwise

Documentation of the changes to heino17's MultiWikiServer-wikiwise fork. This log
tells the development story in reverse order of features, bug fixes, and reworks
since the base state.

As of: 2026-09-22 · Base: `TiddlyWiki/MultiWikiServer` @ `3627482`

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

## Privacy / Datenschutz

- **No external fonts/assets:** The admin interface loads neither Google
  Fonts nor Material Icons fonts from third-party servers. The icons are
  embedded SVGs (`@material-symbols/svg-400`); the Roboto variable font
  (latin/latin-ext, normal/italic) is served locally from
  `packages/admin-vanilla/public/fonts/` (→ `/fonts/*.woff2`). This
  eliminates, for example, the Google Fonts-dependent cookie notice.
  Roboto is licensed under the **SIL Open Font License 1.1**; the license
  is included as `OFL.txt` alongside
  `packages/admin-vanilla/public/fonts/` (unmodified use, no Reserved Font
  Names affected).
- **Cookie notice (consent banner, category-based):** A notice fades in at
  the bottom of the screen. Categories: `essential` (session cookie
  `session`, technically required, always on), `preferences` (stored locally
  in `localStorage`: design/language, always on) and `external` (third-party
  services such as Google Fonts — **off by default**, loaded only after
  separate consent). Buttons: "Accept all cookies", "Necessary cookies only"
  and "Cookie settings" (detail panel with toggles). The state is stored as a
  versioned object in `localStorage` (`mws-cookie-consent`,
  `{version:"v2",…}`); the old `v1` assumption is migrated conservatively
  (external=false, no asking again). Implementation: `consent.ts` (central
  API: `getConsent`, `hasConsent`, `setExternalConsent`, `onConsentChange`,
  `applyExternalStylesheet` as the future integration point for external
  resources), `cookie-consent.tsx` + `.cookie-consent` in
  `app.inline.css`, included globally in `main.tsx` (landing page, login,
  admin app). Consent can be changed at any time:
  `openCookieConsent(true)` in `cookie-consent.tsx` reopens the banner
  directly on the settings panel; reachable via "Cookie settings" in the
  footer of the start page — the same footer was also carried over into the
  admin view (for this reason, the former cookie icon button in the admin
  header was dropped). In addition, the embedded server response now
  provides `mwsVersion` for the version display in the footer.
- **Legal notice (own page, no modal):** For live operations, the app
  provides a public page under `/legal-notice` (equally available to
  anonymous and logged-in visitors). The content is a single Markdown
  textarea in the admin "settings" (`admin.legalNotice`), deliberately
  **one** for all languages — whoever needs it enters the text in their own
  language. It is rendered with the same escaped mini-markdown as the
  welcome/news text: raw HTML tags (`<b>`, `<center>`, …) appear as literal
  text and are never injected as active elements (defense-in-depth). The page
  header shows the "Back to wiki overview" button for everyone. The
  on/off toggle `admin.showLegalNotice` (default: on, also during install
  seeding): when disabled, the "Legal notice" links disappear from the
  footers of the start page and the admin app, the `GET /api/legal-notice`
  API returns `content: null`, and a direct call to `/legal-notice` falls
  back to login/overview. Implementation: `legal-notice.tsx`
  (component + `.legal-notice-card` in `app.inline.css`),
  `LegalNoticeRoute` in `LandingRoutes.ts`, `admin.legalNotice`/
  `admin.showLegalNotice` in `PrefsRoutes.ts`, text + toggle in
  `app-settings.tsx`, "Legal notice" link in `app-landing.tsx` and
  `app.tsx`.

---

## Operations / Outlook

- Start via `npm start` (`scripts.mjs` → `tsup` + `mws.dev.mjs`), in
  production operations via `pm2 startup`.
- Default login after `init-store`: `admin` / `1234` (password thereafter

---

# 🇩🇪 CHANGELOG – MultiWikiServer-wikiwise

Dokumentation der Änderungen am MultiWikiServer-wikiwise-Fork von heino17.
Dieses Log erzählt die Entwicklungsgeschichte in umgekehrter
Reihenfolge der Features, Bug-Fixes und Umbauten seit dem Basis-Stand.

Stand: 2026-09-22 · Basis: `TiddlyWiki/MultiWikiServer` @ `3627482`

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

- Neuer Helper `wikiFileUrl()` baut die URL absolut über dieselbe Host-Quelle
  wie die XHRs (`getHost()`, d. h. `$:/config/multiwikiclient/host`) →
  `[img[http://host/api/user-files/wiki-file?recipe=…&id=…]]` löst unabhängig
  von der Wiki-Basis-URL korrekt auf (Modal-Vorschau und einfügbarer Schnipsel
  nutzen beide denselben Pfad).
- Nicht-Bilder bekommen statt des toten `[ext[…]]` einen echten Wiki-Link
  `[[Dateiname|url]]` (Sonderzeichen `]`/`|` im Namen werden entfernt).
- Da der Dev-Server die Client-Tiddler beim Start aus `plugins/client/tiddlers/`
  einliest (Plugin-Cache `mws/<version>/client`), greift der Fix nach einem
  Neustart des Dev-Servers.

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

## Betrieb / Ausblick

- Start über `npm start` (`scripts.mjs` → `tsup` + `mws.dev.mjs`), im
  produktiven Betrieb per `pm2 startup`.
- Standard-Login nach `init-store`: `admin` / `1234` (Passwort danach
  ändern).
