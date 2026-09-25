# README_heino17

Dokumentation der Änderungen am MultiWikiServer-wikiwise-Fork von heino17.

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
`http://192.168.1.47:5000` schlug die Passwort-Änderung daher fehl:

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
  Pro-Wiki-Sichtbarkeit +3 Editor-Keys („Landing page", Callout, Hinweis).
  Aktuelle Parität: 519 Keys.

### Verifikation

- `GET /api/landing` anonym: 200 mit 8 öffentlichen Wikis, Stats (Tiddler
  1127, 6 Nutzer, online 0 ohne aktive Sessions), Versions, `message`/`news`
  aus den Prefs.
- Anonym `GET /` headless: rendert Landing (Stat-Kacheln, Wiki-Karten,
  Thumbnails via `/wiki/<slug>/thumbnail`), kein Redirect nach `/login`.
  Wiki-Karten öffnen mit `target="_blank" rel="noopener noreferrer"`.
  Mit `showLanding=false` (per `PUT /api/prefs`) ⇒ `/` leitet wieder nach
  `/login`; danach zurückgesetzt auf `true`.
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
- `tsc` (admin-vanilla) + `tsc2` (Root) grün; Locale-Parität 519/519.

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

---

## Betrieb / Ausblick

- Lokal: `http://192.168.1.47:5000`
- Extern: `https://tiddly.publicvm.de` → Apache-Reverse-Proxy → Port 5000
- Start über `npm start` (`scripts.mjs` → `tsup` + `mws.dev.mjs`), im
  produktiven Betrieb per `pm2 startup`.
- Standard-Login nach `init-store`: `admin` / `1234` (Passwort danach
  ändern).