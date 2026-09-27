# MultiWikiServer-wikiwise

<a href="https://www.paypal.com/donate/?hosted_button_id=BVDDREGEU2ZEA">
  <img src="https://github.com/user-attachments/assets/6467378f-26fd-40ff-b60e-b8d62555c08a" width="20" />
Donate to MultiWikiServer founder Arlen Beiler via PayPal to support development
</a>

---

Multiple users, multiple wikis for TiddlyWiki.

- Bag & Recipe system for storing tiddlers.
- User and Role management with ACL.
- SQLite database managed with Prisma.
- Password-based login.

> Before you put real data in, please read [Security between users](#security-between-users) and [Backups](#backups).

## ✨ What this fork adds

Highlights only – the full story, with file names, code and background, lives in the [CHANGELOG](CHANGELOG.md).

- 🏫 **A teacher area for school operation.** A school operator creates teachers, and each teacher manages **only their own class** – walled off from colleagues by personal roles and a server-side role guard, while class roles hand students targeted read access and cooperation by invitation stays possible. (§21–§27)
- 📚 **Wikis you can actually manage.** Create a wiki with a single click (or from a full form), rename slug and display name, delete, get live validation of every name, and see "real names" instead of "recipe" in the UI. (§10–§13, §17, §30)
- 🌍 **8 languages.** The whole admin app – and the wiki client, which follows the wiki's language automatically. With 500+ translated keys and a language switcher in the header. (§14, §46)
- 🏠 **A public start page for anonymous visitors.** Hero area, statistic cards, wiki cards with preview images, an operator welcome text, a news block and a version footer – instead of a login form. (§48)
- 📌 **A pinboard.** Shared post-its for all logged-in users, addressed globally, to a class or to one person, with important notes pinned to the top, an unread badge and moderation. (§42)
- 🗂️ **My Files.** Every account uploads its own files, previews them in the browser (image, audio, video, PDF, text, Markdown, ODT) and shares them selectively – admin shares reach everyone, teacher shares their class. (§44, §45)
- 🖼️ **Real wiki thumbnails.** Headless screenshots of each wiki, per user view, 24 h cache, automatically swept when a wiki is deleted. (§43)
- 💾 **Storage transparency and one-click backups.** An admin tab that separates system disk status from MWS usage, reports blobs & files, orphaned files and the top-10 storage users – plus a consistent ZIP backup of database, keys and config. (§36, §39–§41)
- ⚙️ **Settings that cover the whole operation.** Default language and theme for the first load, feature switches, the cookie notice and the legal notice page. (§47)
- 🔐 **Security rework.** Owner protection for wikis, bags, templates, roles and users, per-owner bag namespaces against name squatting, `CSP` headers and no existence oracle. Anonymous read access is now an explicit `ANON` role. (§4, §15, §47)

## 🚀 How to run

The init command creates a new folder and installs what you need to get started. You can name "my-folder" whatever you want. 

- `npm init @tiddlywiki/mws@latest my-folder`
- `cd my-folder`
- `npx mws listen --listener`

You can run `npx mws help` to get more information about the commands. 

- the server runs on port `8080`. It does not use HTTPS by default, but you can enable it by specifying a key and cert.
- A `passwords.key` file is created which contains the password master salt. If this file changes, all passwords will become unusable and need to be reset.
- Your database is in the `store` folder. All files in the `store` folder are data files, not temp or lock files! Never delete them! 

The initial user created on first run has the username `admin` and password `1234`.

If you run into trouble, or need help figuring something out, feel free to [start a discussion](https://github.com/heino17/MultiWikiServer-wikiwise/discussions). If you know what's wrong, you can also open an issue.

## 🧩 Flexible and Extendible

- Plugins can add routes and hooks.
- Abstractions everywhere, allowing flexibility.
- The source code is fully typed and easy to navigate.
- Admin endpoints can also be called from the CLI.

## Security between users

The database structure and the storage layer are solid, and this fork has closed
several of the sharpest edges of the original. Access control is still
**bag-based** rather than per tiddler, and privileged roles are powerful by
design. So MWS is a good fit for classrooms, teams and hobby wikis – and the
wrong tool for secrets that must stay strictly compartmentalized.

### 🛡️ Hardened in this fork

- **A save can no longer pull in someone else's bag.** Creating or saving a
  recipe/template requires read access – write access for write targets – on
  every bag it references. Referencing `editions/<someone-else>` neither exposes
  that wiki to you nor grants access you don't hold yourself.
- **Reading a wiki no longer unlocks all of its bags.** Access to a wiki's
  contents is decided bag by bag, instead of "owning any single bag opened the
  whole wiki".
- **Anonymous read access is explicit.** It is granted by the `ANON` role on the
  wiki recipe and its bags; everything else stays invisible.
- **Bag namespaces are partitioned per owner.** A wiki's default bag lives at
  `editions/<owner-id>/<slug>`, so nobody can pre-create the bag a wiki saves
  into – the bug that used to hand students mysterious 403s. The public URL
  `/wiki/<slug>` stays unchanged.
- **No existence oracle.** Bags you may not see answer `404` instead of `403`,
  so foreign bag names don't leak through status codes. Wiki pages are served
  with a `CSP` header.
- **Privileges can't be handed out casually.** The system roles
  `ADMIN`/`USER`/`ANON` cannot be deleted, and only the `admin` account can
  create roles – there is no self-promotion through the API.
- **Teachers are sandboxed.** A school operator creates teachers; each teacher
  manages **only their own class** through a personal role, cannot grant
  `ADMIN`, `TEACHER` or another teacher's role, and cannot see or open a
  colleague's wikis unless explicitly invited. A server-side role guard
  enforces all of this, not just the UI.
- **Write paths are checked.** Admin and write endpoints enforce referer/CSRF
  checks and the `X-Requested-With` header, and passwords are stored as OPAQUE
  (aPAKE) hashes, never in plaintext.

### ⚠️ Still open by design

- **Granularity is one bag.** Anyone who can read a bag can read every tiddler
  in it, and anyone who can write it can write every tiddler in it. There is no
  per-tiddler or per-field restriction, so a leak is binary per bag.
- **Privileged roles see a lot.** Admins and teachers can read and reassign a
  large part of the installation by design; the role and user system is shared
  installation-wide.
- **Don't use it as a vault.** If you need per-tiddler confidentiality or hard
  tenant isolation, MWS is the wrong choice.

In practice: hand out the smallest rights that get the job done, run a real
instance behind HTTPS, and take backups.

## 🗄️ Also, this is a database, please make backups

Databases try very hard to be perfect, and data bugs are rare. But that doesn't mean things can't go wrong. Backups are pretty important. 

## 🔄 Updates

_Always, always, always save a backup of your store folder before updating._

- You can update to the latest version of MWS using `npm update`. 
- You can update to the latest version of tiddywiki using `npx mws update-tiddlywiki`. 

If there are any database changes, MWS should pick them up and apply them on startup. The changes are generated by prisma's builtin migration and are supposed to preserve data, but backups are still highly recommended.

## 💾 Backups

It is recommended to backup your entire data folder, not just the `store` folder, with a few exceptions. 

- You must *always* backup the *entire* `store` folder. Never delete any files in the `store` folder. All files in the `store` folder are data files!
- `passwords.key` can be backed up, but since it never changes you could also just save a copy of it in a more secure location separate from your normal backups.
- You should backup `package.json` and `package-lock.json`.
- The `node_modules` folder can be ignored. `npm ci` will reinstall the `node_modules` folder based on `package-lock.json`.
- The `cache` folder (next to the `store` folder) is generated every time MWS starts, so it's nothing but bloat. You can always ignore it.
- Only the `tw5/versions.txt` file needs to be saved from the `tw5` folder.

So essentially, the paths you need to backup are:
- `/package.json`
- `/package-lock.json`
- `/store`
- `/tw5/versions.txt`
- `/passwords.key` (or save it separately)

## 🛠️ Development

The development data folder is `/dev/wiki`.

If you want to work on the project, or just try out the latest changes,

- `git clone https://github.com/heino17/MultiWikiServer-wikiwise`
- `cd MultiWikiServer-wikiwise`
- `npm install` or `npm run install-android`
- `npm run certs` - if you want https (unix only)
- `npm start update-tiddlywiki` - Download the latest TiddlyWiki version
- `npm start init-store` - Create the `admin` user and import default wikis.
- `npm start` - this will run the build every time, but it's very fast.

The development wiki will be active at http://localhost:8080/

You can change the listeners as explained in the mws.dev.mjs file.
