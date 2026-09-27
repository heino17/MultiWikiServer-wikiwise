# MWS Server Architecture Explained

This document describes the architecture of **MultiWikiServer-wikiwise** (this fork).

> **On the upstream overview.** <https://deepwiki.com/TiddlyWiki/MultiWikiServer> explains the
> upstream project and still describes the core model – bags, templates, recipes, role-based
> permissions, prefix-based write routing – correctly. Its runtime surface, permission model
> and admin feature list describe the *upstream* server and are **outdated for this fork**.
> Where the two disagree, this document is the authority.

## Overview

The system treats a public wiki as a named, database-backed resource addressed by a slug. Internally that wiki is backed by a recipe, but for most developer-facing purposes it is simplest to think in terms of a wiki assembled from three things: a template, a set of bags, and a plugin set.

A template provides shared defaults such as HTML behavior, default bags, and plugin configuration. A wiki adds its own bag mappings, plugins, and access rules. At runtime, requests use the wiki's effective configuration rather than raw admin input.

This fork keeps that model intact and adds around it: a second storage axis for uploaded files, an operational layer (storage reporting, backups, previews, thumbnails), a public landing page, and a considerably larger admin surface. The additions are described in their own sections below.

## Core Concepts

A bag is a named tiddler store. Bags hold content and carry their own read and write permissions.

A template is a reusable definition that can be shared across many wikis. It supplies default bag structure, plugin settings, and HTML behavior.

A wiki is the public-facing site. It is addressed by slug and resolves to an effective set of bags and plugins.

Plugins extend the client runtime. The server prepares and serves the plugin assets needed to bootstrap the wiki in the browser.

Users, roles, and sessions determine who can see a wiki, who can edit it, and which bags they can read or write.

Two further storage concepts sit beside bags:

A user file is an uploaded document owned by exactly one account. Files are content-addressed by their sha256 and live under `store/files/<sha256>/`, so identical uploads are stored once. Files are not tiddlers and are not part of any wiki; they are reachable only through the user-file endpoints and their share rows. See [User Files And Blobs](#user-files-and-blobs).

A blob, in the vocabulary of the storage report, is not a separate table but a *tiddler whose type is binary*: any tiddler typed `image/*`, `video/*`, `audio/*`, `application/pdf`, or `application/octet-stream` is counted as a blob. Text, JSON, and wiki-language tiddlers are counted as content. The distinction exists so the storage report can separate "how much of this installation is media" from "how much is text".

Roles come in three flavors. The system roles `ADMIN`, `USER`, and `ANON` are seeded and cannot be deleted; `ANON` is the role that decides anonymous read access. A well-known `TEACHER` role is seeded as well, but teacher capability is carried by an `is_teacher` flag on the role rather than by its name, so that role may be renamed freely. Personal roles are attached to a single user, which is how a teacher gets a private role that is not inherited by anybody else. Role rows are additionally scoped to a class in the school use case, so a teacher's own class role can grant students access without granting it to the rest of the installation.

## How A Wiki Is Assembled

Each wiki is built from a template plus wiki-specific configuration. Together they determine which bags participate in the wiki, which of those bags are writable, which plugins are loaded, and what HTML shell the client receives.

Writes are routed by title prefix. In practice, the most specific matching writable prefix determines where a title is saved. Readonly bags act as fallback content layers beneath the writable part of the wiki. This gives each wiki a predictable namespace model: a title is written to one resolved writable location and read from the first applicable source in the wiki's effective bag stack.

Deleting follows the same model as writing. A delete applies to the resolved writable location for that title rather than removing the title from every bag that might contain it.

The default bag of a wiki is **namespaced by owner**. A wiki owned by a user gets its default bag at `editions/<owner-id>/<slug>`; only wikis without an owner – the system wikis – fall back to `editions/<slug>` (`TabDataAdapter.ts`). This is a security property, not a cosmetic one: with a flat namespace, one user could pre-create the bag another user's wiki resolves to, and the victim would be met with a 403 on save against a bag that already existed. Owner namespacing means the writable target of a wiki can only be created by the wiki's own creator.

## Runtime Surface

The main runtime entry point is the wiki page itself:

- `GET /wiki/:recipe_slug` returns the HTML bootstrap for the wiki.

The recipe-scoped API provides the supporting runtime data:

- `GET /recipe/:recipe_slug/status` returns the caller's view of the wiki's bag layout and writeability.
- `GET /recipe/:recipe_slug/list.json` lists visible titles together with routing information.
- `GET /recipe/:recipe_slug/store.js` returns the store payload used to bootstrap the client.
- `GET /recipe/:recipe_slug/updates?since=` returns recipe-scoped changes since a known revision.
- `PUT /recipe/:recipe_slug/batch/:op` performs batch list, read, save, and delete operations.

The runtime surface is designed so that list, read, save, delete, updates, and store generation all describe the same wiki view.

Around that core, the fork adds a second, administrative API surface. It is grouped by the feature that owns it rather than listed flat:

Note the method convention: reads are `GET`, and every mutation is `PUT`, including creation and deletion. A new route should follow that rather than reaching for `POST`/`DELETE`.

| Group | Endpoints | Owner module |
| --- | --- | --- |
| Public start page | `GET /api/landing`, `GET /api/legal-notice` | `LandingRoutes.ts` |
| User preferences | `GET /api/prefs`, `PUT /api/prefs` | `PrefsRoutes.ts` |
| Pinboard | `GET /api/pinboard`, `GET /api/pinboard/unread-count`, `PUT /api/pinboard/note`, `PUT /api/pinboard/note/delete`, `PUT /api/pinboard/layout`, `PUT /api/pinboard/read` | `PinboardRoutes.ts` |
| User files | `GET /api/user-files/{list,share-targets,shared,download,preview}`, `PUT /api/user-files/{upload,share,delete}` | `UserFileRoutes.ts` |
| Wiki thumbnails | served lazily as a PNG under the store folder | `WikiThumbnailRoutes.ts` |
| Storage report | `GET /admin/storage`, `GET`/`POST /admin/storage/cleanup`, plus a read-only view of `store/`, `store/files/`, `store/inbox/`, `store/database.sqlite`, `backups/`, `cache/` | `StorageRoutes.ts`, `StorageCleanupRoutes.ts` |
| Backups | `GET /admin/backup/list`, `GET /admin/backup/download`, `PUT /admin/backup`, `PUT /admin/backup/delete` | `BackupRoutes.ts` |

Recipe routes remain addressed by slug, as above. Nothing in the wiki runtime surface was renamed; the additions are all either `/api/*` or `/admin/*`.

## Store And Client Bootstrap

The client is bootstrapped from two pieces: HTML and store data.

The HTML comes either from the default TiddlyWiki shell or from template-defined custom HTML. The store contains the resolved tiddlers for the wiki plus the metadata the client needs to understand the current recipe, bag ownership, host, and revision state.

Depending on server and template configuration, plugin assets and store data may be delivered as external resources or injected into the HTML response. That delivery choice changes how the browser receives the data, but not what wiki content the client sees.

A wiki may also define a `cspAllow` list in its recipe definition. When it does, the assembled policy is sent as a `contentSecurityPolicy` header with the HTML shell (`RecipeIndexSender.ts`). Wikis without that list are served without a CSP header, so opting in is per wiki rather than global.

## Administration

The admin surface manages wikis, templates, bags, users, and roles. In this model, a wiki is the editable public resource, a template is the reusable shared definition, and a bag is the underlying storage unit.

Saving a wiki or template changes the configuration that future runtime requests use. Template changes affect every wiki that depends on that template.

Plugin entries are exposed through the admin load path so they can be selected and inspected, but this path does not treat plugins as editable database rows in the same way as wikis, templates, bags, users, and roles.

User administration covers profile-like data and role membership. Password creation, login, reset, and password change belong to the session and password subsystem rather than to admin row saves.

Beyond that core, the admin app in this fork also owns: the school/class and teacher model, the pinboard, user files and their shares, wiki thumbnails, the storage report and its cleanup pass, the ZIP backup manager, and a settings area holding the default language and theme, feature switches, the cookie notice, and the legal notice page. These are additive tabs over the same admin shell; they do not change the wiki/template/bag model described above.

Every administrative row in the core model carries an owner, and the admin endpoints enforce that ownership. An operator cannot edit or delete another user's wiki, bag, template, or personal role by addressing its id directly, and the same check applies to the users they may not delete.

## Permissions

Access is role-based.

Recipe permissions determine whether a wiki is available to a user at all. Bag permissions determine whether the user can read from or write to the bags that make up that wiki. Template permissions govern template management rather than live wiki access.

The runtime presents a wiki as a coherent whole rather than a partially filtered bag set. If a user does not have the required access to the bags that define a wiki, the wiki request is denied. A user can also have access to a wiki while still being unable to modify a specific title if that title resolves to a writable bag they cannot edit.

The read gate is evaluated per item rather than as a single combined check, and the three outcomes are deliberately different:

- A user with no relationship to the wiki at all – not its owner, no role row on the recipe, and no ownership of or permission on any of its bags – receives `404`, the same answer as an unknown slug. This is what prevents recipes from being probed as an existence oracle.
- A user who may read the recipe but not the definition receives `403`.
- A user who may read the definition but lacks read access on any single bag in the recipe receives `403`.

The consequence is worth stating plainly, because it is easy to misread: a foreign bag referenced from a recipe can no longer leak its tiddlers, but it also cannot be used to grant partial access. Read access is decided bag by bag, and the request is admitted only when *every* bag in the ordering passes.

Anonymous read is not a side effect of the absence of a session. It is granted explicitly through the `ANON` role on the wiki recipe and on the individual bags; anything without that role stays invisible to an unauthenticated caller.

The role guard for the school model is enforced on the server, not in the UI. A teacher manages only their own class through a personal role, cannot grant `ADMIN`, `TEACHER`, or another teacher's role, and cannot see or open a colleague's wikis unless invited. The system roles `ADMIN`/`USER`/`ANON` cannot be deleted, and only the `admin` account can create roles, so there is no self-promotion path through the API.

## Security Boundaries

Beyond permissions, the request layer enforces a few invariants that are worth knowing before adding a route:

- **Referer check on wiki content.** Recipe routes call `assertWikiReferer(recipe_slug)`. When the referer is a wiki page, it must belong to the *same* wiki as the endpoint being called, and a referer inside `/recipe/` is refused outright. The intent is to stop a malicious page from using a privileged visitor's session to read one wiki and then write into another (`RequestState.ts`).
- **`X-Requested-With` on writes.** Admin and write endpoints require the header; the read-only recipe endpoints opt out explicitly.
- **Passwords are OPAQUE (aPAQUE) hashes**, stored via `@serenity-kit/opaque` and never in plaintext.
- **Owner protection** on wikis, bags, templates, roles, and users, so ids are not an authorization bypass.
- **`404` instead of `403`** where a status code would otherwise leak the existence of a bag or recipe.

The intended direction, as the code comments put it, is a more complete system in which a page requests permission to act on another page on the user's behalf. The current check is a prefix test and is explicitly marked as provisional in the source.

## User Files And Blobs

User files are the second storage axis. Each `UserFile` row records the owner, the original filename, the MIME type, the size, and the sha256; the bytes themselves live content-addressed under `store/files/<sha256>/`. Because the address is the content hash, two users uploading the same file share one copy on disk without sharing access to it.

Sharing is modelled with a scope string rather than an enum: `GLOBAL` reaches everyone, `ROLE` targets a role id, and `USER` targets a single user. Which scopes a given user may actually offer is enforced at the API level in `UserFileRoutes`, not in the schema, so new scopes can be introduced without a migration.

The storage report counts the two axes separately – blobs as binary-typed tiddlers, files as rows and bytes in `store/files/` – and also reports orphaned files, i.e. content directories with no `UserFile` row. Cleanup removes them.

## Public Start Page

`GET /api/landing` supplies an anonymous start page: hero area, statistic cards, wiki cards with preview images, an operator welcome text, a news block, and a version footer. It replaces the login form as the first thing an unauthenticated visitor sees, while login remains available.

`GET /api/legal-notice` serves the legal notice, which an operator can either fill in or switch off. Both endpoints are read-only for anonymous callers.

## Internationalization

The admin app is translated into 8 languages, with a language switcher in the header. The wiki client follows the wiki's language automatically rather than the admin user's choice. User preferences such as the admin language and theme are stored per user and served from `/api/prefs`.

The instance can also define a default language and theme that apply on first load, before a user has expressed a preference.

## Repository Layout

This is a monorepo divided into separate projects. The entry point is in `packages/mws/src/index.ts`. The entry point imports the `server`, `commander`, and `events` projects.

The entire server uses Promises and async functions for pretty much everything. Synchronous file system calls should be avoided as much as possible.

The `events` project is the foundation of MWS. It contains an `EventEmitter` instance that everything else subscribes to.

Events are emitted asyncly. Event listeners are awaited with `Promise.all`, and rejections throw back to the event emit call. This is intentional because it is the heart of the entire server, not just a public event bus, and errors shouldn't be ignored. Errors that come from things like attempting to send SSE events to other clients, however, should not be thrown because they aren't relevent to the source of the event.

There should be no singleton references other than the event emitter and event handlers should be as pure as possible, so that in theory it would be possible to run multiple completely separate MWS servers in the same process.

The `commander` project handles the CLI parsing code. It exports a default function which MWS calls to execute the CLI. Commander emits several events during execution, which MWS hooks into to scaffold the rest of the server.

It also exports the base class for commands to inherit from, and because it instantiates the commands, commands should not specify their own constructor. Additional instance properties may be added to commands in the `cli.execute.before` event.

The `server` project handles all web related stuff, but in an MWS-agnostic way. It only requires the `events` project, so it could be used as the foundation for unrelated webservers. Its internal API is directly inspired by the TiddlyWiki server API, with routing and centralized handling of the request body.

The `mws` project is the application layer of MWS and ties everything else together. It defines all the commands and web server routes and handles the database connection.

Within `packages/mws/src/new-managers/`, one module per feature area owns its routes: `RecipeRoutes.ts` and `RecipeResolver.ts` for the wiki runtime, and separate modules for the landing page, preferences, pinboard, user files, thumbnails, storage, cleanup, and backups. `TabDataAdapter.ts` translates between the authored recipe/template definitions and the compiled database rows. The `admin-vanilla` package holds the Lit-based admin app.

## Server Events

These are the hooks that run on startup. The listen command starts the server and returns, finishing the command run.

```
├ cli.register: 0.101ms
├ cli.commander: 0.021ms
├ Command: listen: --------
├ ├ cli.execute.before: --------
├ ├ ├ mws.cache.init.before: 0.012ms
├ ├ ├ mws.cache.init.after: 0.016ms
├ ├ ├ mws.adapter.init.before: 0.013ms
├ ├ ├ mws.adapter.init.after: 0.007ms
├ ├ ├ mws.config.init.before: 0.008ms
├ ├ ├ mws.config.init.after: 0.013ms
├ cli.execute.before: 1.175s
├ ├ listen.router.init: --------
├ ├ ├ mws.router.init: 0.017ms
├ ├ ├ mws.routes.important: 0.004ms
├ ├ ├ mws.routes: 1.054ms
├ ├ ├ mws.routes.fallback: 0.039ms
├ listen.router.init: 111.665ms
├ cli.execute.after: 0.008ms
├ Command: listen: 1.296s
```

`mws.tiddler.events` is emitted per persisted tiddler change and is the hook for anything that has to react to content changes.

## Todo

- improve the small screen form factor for the admin UI
- reduce the repeated access choreography in the route layer: recipe routes still call the referer check, the read gate, and the `asserted` state mutation by hand before every resolver call
- define batch atomicity explicitly; failures are currently whole-batch by accident of the first thrown `SendError`, which is the right behaviour but is not stated anywhere
- state the rename and recompile guarantees: when a bag or template is renamed, whether dependent wikis are fully recompiled or lightly rewritten, and whether partial completion is acceptable during fanout
- document which routing facts appear in `status` versus `list` and `read`, so the endpoints can be tested for agreement instead of being compared by eye
- add structural tests around the invariants claimed here: permission hierarchy and gating, resolver agreement across list/read/save/delete/updates, prefix longest-match routing, delete uncover semantics, and batch rejection on one denied item
- investigate the upsert path in `TabUpserts.ts`; it has been flagged as suspect since before this fork's feature work
