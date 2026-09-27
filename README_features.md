# 🇩🇪 MultiWikiServer-wikiwise

Ein Fork des [TiddlyWiki-MultiWikiServer](https://github.com/TiddlyWiki/MultiWikiServer) von Arlen Beiler – ein **Mehrbenutzer-/Mehr-Wiki-Server für TiddlyWiki**: mehrere Benutzer, mehrere Wikis, gemeinsame oder private Inhalte, Rollen und Zugriffsrechte auf einen Blick. Das besondere Augenmerk dieses Forks liegt auf dem **Schul-/Klassenbetrieb** (Lehrer verwalten ihre Klassen) sowie auf einer einladenden **öffentlichen Startseite** mit Statistik, Wiki-Karten, News und rechtlich sauberem Betrieb (Cookie-Consent, Impressum).

Entstanden aus dem praktischen Einsatz: Lehrer legen per Knopfdruck Wikis an, geben sie gezielt für Klassen frei („nur lesen" oder „mitarbeiten") und behalten Speicherverbrauch und Nutzer im Griff – ohne technisches Wissen über Bags, Recipes oder ACLs.

**8 Sprachen: 🇩🇪 DE, 🇺🇸 US, 🇷🇺 RU, 🇪🇸 ES, 🇫🇷 FR, 🇯🇵 JP, 🇰🇷 KR, 🇨🇳 zh-CN – Umschalter in der Kopfzeile**  
Standard-Sprache und Standard-Theme fürs erste Laden stellt der Betreiber in den „Einstellungen" fest (Sprache/Theme eines Besuchers gewinnt immer).

## Nutzung

1. Neues Projekt anlegen: `npm init @tiddlywiki/mws@latest mein-ordner`
2. Hineinwechseln und starten: `cd mein-ordner && npx mws listen --listener`
3. Im Browser öffnen: Port `8080` (bzw. wie konfiguriert) – Erstanmeldung mit `admin` / `1234` (Passwort danach ändern).

Hinweise: Der Server spricht standardmäßig HTTP; HTTPS ist über eigene Key/Cert möglich (z. B. hinter einem Reverse-Proxy wie Apache). Die Daten liegen in einer SQLite-Datei im `store`-Ordner – **immer komplett sichern** (⇒ Admin-Backup). Updates: `npm update` und `npx mws update-tiddlywiki`.

## Funktionen

### Benutzer & Rollen

- **Mehrbenutzer-Betrieb:** beliebig viele Nutzer, beliebig viele Wikis; alles läuft über „Bags" & „Recipes" (TiddlyWiki-Speicher-Editoren)
- **Nutzer-Einladung ohne E-Mail:** Admins/Lehrer legen Nutzer direkt an und setzen deren Passwort (OPAQUE-gehasht, nie im Klartext); Löschung mit Aufräumen von Rollen- und Sitzungsverknüpfungen inklusive
- **Sichere Passwort-Generierung:** „🎲 Generator" unter jedem Neupasswort-Feld mit Länge (8–32), garantiert gemischtem Zeichensatz, **Entropie-Anzeige** und farbigem **Stärkebalken**; Ergebnis wird in beide Felder übernommen
- **Rollen & ACL:** Rollen mit abgestuften Rechten (Lesen/`A_read`, Schreiben/`B_write`, Verwalten/`C_admin`); System-Rollen (`ADMIN`/`USER`/`ANON`) und Lehrer-Rollen sind **unlöschbar** und nur über den Site-Admin editierbar
- **Owner-Schutz überall:** Der **Ersteller** eines Wikis/Bags/Templates/Rolle/Users behält die Kontrolle – nur er oder das `admin`-Konto darf bearbeiten/löschen; *keine* Self-Promotion über die API möglich

### Wikis verwalten

- **1-Klick-Wiki-Erstellung:** nur einen Anzeigenamen eingeben – Slug, Standard-Bag, Recipe und Start-Tiddler entstehen serverseitig atomar; alternativ „Definiertes Wiki erstellen" mit vollem Formular (beides in einem Dropdown gebündelt)
- **Umbenennen:** Slug (URL) und Anzeigename getrennt änderbar – das Standard-Bag wird automatisch mit umbenannt, Tiddler, Rechte und Verknüpfungen bleiben vollständig erhalten
- **Live-Validierung beim Tippen:** Slug-Format (`mein-wiki`), und Verfügbarkeit von Slug/Bag-Namen/Benutzernamen sofort sichtbar (grün = frei, rot = vergeben)
- **Löschen:** mit Bestätigung, Owner-/Admin-Schutz, geteilte Bags bleiben erhalten
- **Öffentlich machen:** Wiki-Rezept und Bags geben an `ANON`→Lesen frei; ein öffentlich lesbares Wiki lässt sich zusätzlich von der Startseite nehmen (Pro-Wiki-Schalter)

### Lehrer- & Klassenmodus (Schulbetrieb)

- **Lehrer-Rolle** (`TEACHER`): delegierter Nutzer-Manager – legt Schüler an, setzt Passwörter, verwaltet **nur die eigene Klasse**; die Capability hängt am Rollen-**Flag**, nicht am Namen (übersteht jedes Umbenennen)
- **Trennung der Lehrer:** jeder Lehrer hat eine **private Rolle** nach seinem Benutzernamen; fremde Lehrer können die Wikis des Kollegen weder sehen noch öffnen
- **Rollen-Guard:** Lehrer dürfen weder `ADMIN`/`TEACHER` noch fremde Lehrer-Rollen vergeben; das Admin-UI blendet fremde persönliche Rollen im User-Dialog aus
- **Klassen-Freigabe:** Klassen-Rollen geben Schülern gezielt Lesezugriff – ohne dass das Wiki öffentlich wird; die Freigabe wird automatisch auf die Bags gespiegelt
- **Kooperation:** ein Lehrer lädt einen Kollegen gezielt in sein Wiki ein (Bearbeiter-/Verwalter-Rechte)
- **Wiki-Limit pro Schüler:** der Lehrer legt fest, wie viele eigene Wikis ein Schüler anlegen darf (0 = gesperrt, leer = unbegrenzt); Banner „X von Y eigene Wikis" und Spalte „Eigene Wikis `erstellt/limit`" zeigen den Verbrauch
- **Privatheit standardmäßig:** Schüler-/Lehrer-Wikis sind automatisch privat und tauchen in fremden Listen nicht auf; Sichtbarkeit entsteht nur über geteilte Rollen

### Öffentliche Startseite (`/`)

- Anonyme Besucher sehen statt des Login-Formulars eine einladende Startseite mit **Hero-Bereich**, **Statistik-Kacheln** (Tiddler, öffentliche Wikis, Nutzer, Online), **Wiki-Karten** (mit Vorschaubild) und **Versions-Footer**
- **Willkommens-Text** und **News-Block** des Betreibers (Markdown), News durch den Besucher wegklickbar, News-Stil wählbar (Hinweis/Erfolg/Warnung/Gefahr)
- **Login-Button** führt zum gewohnten Formular; eingeloggte sehen „Zurück zur Wiki-Übersicht"
- Der Betreiber kann die Startseite per Schalter abschalten (dann wieder Umleitung auf `/login`)

### Pinnwand

- Gemeinsames Zettel-Forum für alle eingeloggten Nutzer: Post-its in sechs Farben, mit Kork-/Filz-Optik, leicht geneigten Karten und Klebeband
- **Zielgruppen:** global (alle) · eine Rolle/Klasse · einzelne Person; wichtige Zettel heften oben (rote Reißzwecke)
- **1700 Zeichen** mit Zeichenzähler, optionalem Ablaufdatum, Vorschau ab 130 Zeichen (breite Zettel ab 200 Zeichen)
- **Ungelesen-Badge** (Polling alle 30 s), „Für mich abheften", Volltext-Viewer-Modal, „In Zwischenablage kopieren"
- **Moderation:** Autor löscht eigene Zettel, Admins alles, Lehrer auf ihren Klassenwänden; global schreiben nur Admin/Lehrer

### Meine Dateien

- Jeder Nutzer hat einen eigenen Tab: **hochladen, herunterladen, inline ansehen** (Bild, Audio, Video, PDF, Text, **Markdown** und **ODT**) und gezielt teilen
- Bytes liegen **content-addressed** auf der Platte (`store/files/<sha256>/`), in SQLite nur Metadaten; Standardlimit 100 MB pro Datei (`MWS_USERFILE_SIZE_LIMIT`)
- **Freigaben nach Kontotyp:** Admin-Freigaben erreichen alle, Lehrer-Freigaben ihre Klassen (nie andere Lehrer), Schüler-Freigaben nur konkret gewählte Empfänger; nicht geteilte Dateien → 404
- Audio/Video mit **Range-Support** (Suchen/Seeken), Markdown und ODT-Vorschau werden clientseitig **ohne HTML-Parsing** (XSS-sicher) gerendert
- **„Upload file" direkt im Wiki:** die Wiki-Werkzeugleiste lädt Dateien in den Dateispeicher des **Wiki-Besitzers** – auch wenn man als Gast/Lehrer im fremden Wiki schreibt

### Wiki-Vorschau (Thumbnails)

- Die Wiki-Liste zeigt echte **Vorschaubilder** (Headless-Screenshots der Wiki-Seite, per-User-Sicht): 640×400 auf `store/thumbnails/`, TTL 24 h, Klick öffnet das große Bild
- Rendering serverseitig mit **Chromium** (max. 2 parallel), anonyme Besucher bekommen nur aus dem Cache bedient (DoS-Schutz); gelöschte Wikis räumen ihre Vorschau sofort und beim Serverstart automatisch weg

### Speicher & Backups

- **Admin-Tab „Speicher":** System-Festplatte mit Ampel-Status, Speicherbelegung der App, Record-Zählungen (Tiddler/Bags/Wikis/Templates/User), Verzeichnis-Kategorien mit Legende
- **„Blobs & Dateien":** Binärinhalte als base64 in der DB (kein separater Blob-Store), Dateispeicher `store/files/`, Inbox und **verwaiste Dateien** in einer Übersicht
- **Top-10-Speicherverbrauch pro User** (Wikis/Dateispeicher/Gesamt, ohne Doppelzählung)
- **Admin-Backup:** „Backup jetzt erstellen" sichert Datenbank + `passwords.key` + Config als ZIP (konsistenter `VACUUM INTO`-Snapshot), Download per Klick, die letzten 10 bleiben erhalten; Restore-Anleitung in der Doku

### Admin-Einstellungen

- **Standard-Sprache & Theme fürs 1. Laden** (Browser-/System-Folge wählbar), Feature-Schalter: Pinnwand, Meine Dateien, Upload im Wiki, Sprachwahl anzeigen, Vorschaubilder, Öffentliche Startseite, **Cookie-Hinweis**, **Impressum**
- Thumbnail-Cache-Zeit (leer = 24 h), Markdown-Felder für Begrüßungstext, News und **Impressum-Text**; schreibgeschützt für Nicht-Admins
- Theme wird **vor dem ersten Paint** angewendet (kein Flash beim Öffnen); X-Button schließt die Einstellungen direkt zurück zur Übersicht

### Sicherheit

- **Öffentliche Lesezugriffe kontrolliert** über die `ANON`-Rolle; private Wikis leaken weder Inhalt noch Namen
- **Namespace-Partition pro Owner** (`editions/<owner-id>/<slug>`): kein Vorgreifen auf fremde Bag-Namen; die öffentliche URL bleibt unverändert
- **CSP-Header** auf Wiki-Seiten, **Existenz-Orakel** (404 statt 403), „Meine Bereiche"-UI mit Vertrauens-Labeln; klassifizierte kollaborative (fremd-beschreibbare) Bags mit Warnung
- CSRF-/Referer-Checks und `X-Requested-With`-Schutz auf allen Admin-/Schreibpfaden
- **Passwörter nur als OPAQUE-aPAKE-Hashes**, nie im Klartext; keine E-Mail-Pflicht
- **Cookie-Consent** mit Kategorien (technisch erforderlich / Einstellungen lokal / extern nur nach Zustimmung), kein Tracking, **keine externen Fonts** (Icons eingebettet, Roboto lokal, SIL-OFL)
- **Impressum-Seite** unter `/legal-notice` – eigener Markdown-Text, HTML wird escaped; auch im Footer der Startseite und der Verwaltung verlinkt

### Oberfläche & Sprachen

- **8 Sprachen** in der gesamten Admin-App (500+ Keys, Sprachenumschalter in der Kopfzeile) *und* im TiddlyWiki-Client (folgt automatisch der Wiki-Sprache, 23 Strings)
- **Hell-/Dunkel-Modus** mit Umschalter (System-Folge, warme helle Grundierung), ohne Flackern beim Laden
- **Verständliche, übersetzte Fehlermeldungen** statt roher JSON-Blöcke
- Einheitlicher Footer (Versionen, „Cookie-Einstellungen", „Impressum") in Startseite und Verwaltung
- Responsives Layout; funktioniert hinter Reverse-Proxys (SSL)

## Technik

- **Server:** Node.js + TypeScript (ESM), gebaut mit `tsup`; SQLite-Datenbank über **Prisma** (automatische Migrationen beim Start)
- **Admin-App:** eigenständige Web-App (Vanilla-JSX/Lit-Webkomponenten) ohne Framework; eingebettete SVG-Icons, lokale Fonts – keine externen Assets im Browser
- **TiddlyWiki** als Wiki-Engine; mehrere Wikis pro Server über das Bag-/Recipe-System
- **Passwörter:** OPAQUE (aPAKE) – serverseitig nur Hashes, kein Klartext, keine Passwortwörterbücher nötig
- **Thumbnails:** headless Chromium (Playwright), paralleles Rendering begrenzt, TTL-Cache in `store/thumbnails/`
- **Dateispeicher:** content-addressed (`store/files/<sha256>/`), Streaming-Uploads über die Inbox
- **8 Sprachen:** `en`, `de`, `es`, `fr`, `ja`, `ko`, `ru`, `zh-cn` (Admin-App, Wiki-Client, Startseite)

## Lizenz

Dieses Projekt steht unter der [BSD 3-Clause License](LICENSE). Der Quellcode darf verwendet, verändert und weitergegeben werden – auch kommerziell. Es gelten die üblichen drei Bedingungen: Copyright-Hinweis beibehalten, bei einer Binärverteilung den Urheber nennen, und die Namen der Beitragenden nicht ohne Erlaubnis für Empfehlungen nutzen.

Copyright (c) 2025, TiddlyWiki · Copyright (c) 2026, heino17 – https://github.com/heino17/MultiWikiServer-wikiwise


---


# 🇺🇸 MultiWikiServer-wikiwise

A fork of the [TiddlyWiki MultiWikiServer](https://github.com/TiddlyWiki/MultiWikiServer) of Arlen Beiler – a **multi-user, multi-wiki server for TiddlyWiki**: several users, several wikis, shared or private content, roles and access rights at a glance. This fork focuses on **school and classroom operation** (teachers managing their own classes) plus an inviting **public start page** with statistics, wiki cards, news and privacy-law-friendly operation (cookie consent, legal notice).

Born out of practical use: teachers create wikis with a single click, share them selectively with classes ("read only" or "collaborate") and keep storage usage and users under control – no technical knowledge of bags, recipes or ACLs required.

**8 languages: 🇩🇪 DE, 🇺🇸 US, 🇷🇺 RU, 🇪🇸 ES, 🇫🇷 FR, 🇯🇵 JP, 🇰🇷 KR, 🇨🇳 zh-CN – switch in the header bar**  
The operator sets the default language and theme for the very first load in "Settings" (a visitor's own language/theme always wins).

## **Usage**

1. Create a new project: `npm init @tiddlywiki/mws@latest my-folder`
2. Move into it and start: `cd my-folder && npx mws listen --listener`
3. Open in your browser: port `8080` (or as configured) – first login with `admin` / `1234` (change the password afterwards).

Notes: The server speaks plain HTTP by default; HTTPS is possible via your own key/cert (e.g. behind a reverse proxy like Apache). Data lives in a single SQLite file inside the `store` folder – **always back it up completely** (⇒ admin backup). Updates: `npm update` and `npx mws update-tiddlywiki`.

## **Features**

### **Users & Roles**
- **Multi-user operation:** any number of users and wikis; everything runs on TiddlyWiki "bags" & "recipes"
- **Invitation without e-mail:** admins/teachers create users directly and set their password (OPAQUE-hashed, never plaintext); deletion cleans up role and session links
- **Secure password generation:** the "🎲 Generate" button under every new-password field with length (8–32), a guaranteed mixed character set, an **entropy display** and a colored **strength bar**; the result fills both fields
- **Roles & ACL:** roles with graded rights (read/`A_read`, write/`B_write`, manage/`C_admin`); system roles (`ADMIN`/`USER`/`ANON`) and teacher roles are **undeletable** and only editable by the site admin
- **Owner protection everywhere:** the **creator** of a wiki/bag/template/role/user stays in control – only they or the `admin` account may edit/delete; *no* self-promotion over the API

### **Managing Wikis**
- **One-click wiki creation:** just enter a display name – slug, default bag, recipe and start tiddlers are created atomically server-side; alternatively "Create a defined wiki" with the full form (both in a single dropdown)
- **Renaming:** slug (URL) and display name are changeable separately – the default bag is renamed automatically, while tiddlers, rights and links are fully preserved
- **Live validation while typing:** slug format (`my-wiki`) and availability of slug/bag name/username are shown instantly (green = free, red = taken)
- **Deleting:** with confirmation, owner/admin protection; shared bags stay intact
- **Going public:** wiki recipe and bags grant `ANON`→read; a publicly readable wiki can additionally be removed from the start page (per-wiki switch)

### **Teacher & Classroom Mode (school operation)**
- **Teacher role** (`TEACHER`): a delegated user manager – creates students, sets passwords, manages **only their own class**; the capability is tied to a role **flag**, not the name (survives any renaming)
- **Teacher separation:** each teacher has a **private role** named after their username; colleagues can neither see nor open each other's wikis
- **Role guard:** teachers may grant neither `ADMIN`/`TEACHER` nor foreign teacher roles; the admin UI hides foreign personal roles in the user dialog
- **Class sharing:** class roles give students read access on purpose – without making the wiki public; the grant is mirrored to the bags automatically
- **Collaboration:** a teacher can invite a colleague into their wiki (editor/manager rights)
- **Per-student wiki limit:** the teacher sets how many own wikis a student may create (0 = locked, empty = unlimited); a "X of Y own wikis" banner and an "Own wikis `created/limit`" column show usage
- **Private by default:** student/teacher wikis are automatically private and don't appear in foreign lists; visibility is created only through shared roles

### **Public Start Page (`/`)**
- Anonymous visitors see an inviting start page instead of the login form, with a **hero area**, **statistic cards** (tiddlers, public wikis, users, online), **wiki cards** (with preview images) and a **version footer**
- Operator **welcome message** and **news block** (Markdown); the visitor can dismiss the news; news style selectable (info/success/warning/danger)
- A **Log in** button leads to the familiar form; logged-in visitors see "Back to the wiki overview"
- The operator can switch the start page off (then it redirects to `/login` again)

### **Pinboard**
- A shared post-it forum for all logged-in users: notes in six colors with cork/felt styling, slightly tilted cards and tape
- **Audiences:** global (everyone) · a role/class · a single person; important notes pin to the top (red thumbtack)
- **1700 characters** with a character counter, optional expiry date, preview from 130 characters (wide notes from 200)
- **Unread badge** (polling every 30 s), "file away for me", full-text viewer modal, "copy to clipboard"
- **Moderation:** the author deletes own notes, admins everything, teachers on their class walls; only admins/teachers write globally

### **My Files**
- Every user has their own tab: **upload, download, preview inline** (image, audio, video, PDF, text, **Markdown** and **ODT**) and share selectively
- Bytes are stored **content-addressed** on disk (`store/files/<sha256>/`), SQLite holds only metadata; 100 MB default per file (`MWS_USERFILE_SIZE_LIMIT`)
- **Sharing by account type:** admin shares reach everyone, teacher shares reach their classes (never other teachers), student shares reach only chosen recipients; unshared files → 404
- Audio/video with **range support** (seeking), Markdown and ODT preview are rendered client-side **without HTML parsing** (XSS-safe)
- **"Upload file" right in the wiki:** the wiki toolbar stores files in the **wiki owner's** file store – even when you write in a foreign wiki as a guest/teacher

### **Wiki Previews (Thumbnails)**
- The wiki list shows real **preview images** (headless screenshots of the wiki page, per-user view): 640×400 in `store/thumbnails/`, 24 h TTL, a click opens the large image
- Rendered server-side with **Chromium** (max. 2 parallel); anonymous visitors are served only from cache (DoS protection); deleted wikis have their preview removed immediately and automatically swept on server start

### **Storage & Backups**
- **Admin "Storage" tab:** system disk with traffic-light status, app storage usage, record counts (tiddlers/bags/wikis/templates/users) and directory categories with a legend
- **"Blobs & Files":** binary content as base64 inside the DB (no separate blob store), file store `store/files/`, inbox and **orphaned files** in one overview
- **Top-10 storage usage per user** (wikis/file store/total, without double counting)
- **Admin backup:** "Create a backup now" saves database + `passwords.key` + config as a ZIP (consistent `VACUUM INTO` snapshot), one-click download, the latest 10 are kept; restore instructions in the docs

### **Admin Settings**
- **Default language & theme for the first load** (follow browser/system), feature switches: pinboard, My files, upload in wiki, show language selector, previews, public start page, **cookie notice**, **legal notice**
- Thumbnail cache time (empty = 24 h), Markdown fields for welcome message, news and **legal notice text**; read-only for non-admins
- The theme is applied **before the first paint** (no flash on load); an X button closes Settings straight back to the overview

### **Security**
- **Controlled public read access** via the `ANON` role; private wikis leak neither content nor names
- **Per-owner namespace partitioning** (`editions/<owner-id>/<slug>`): no squatting foreign bag names; the public URL stays unchanged
- **CSP headers** on wiki pages, an **existence oracle** (404 instead of 403), a "My areas" UI with trust labels; collaborative (foreign-writable) bags are classified and warned about
- CSRF/referer checks and `X-Requested-With` protection on all admin/write paths
- **Passwords only as OPAQUE-aPAKE hashes,** never plaintext; no e-mail required
- **Cookie consent** with categories (technically required / preferences stored locally / external only after consent), no tracking, **no external fonts** (embedded icons, local Roboto, SIL OFL)
- **Legal notice page** at `/legal-notice` – your own Markdown text, HTML is escaped; linked in the footer of the start page and the admin app

### **User Interface & Languages**
- **8 languages** in the entire admin app (500+ keys, language switch in the header) *and* in the TiddlyWiki client (follows the wiki language automatically, 23 strings)
- **Light/Dark mode** with toggle (follows system, warm light base), no flicker on load
- **Clear, translated error messages** instead of raw JSON blocks
- A shared footer (versions, "Cookie settings", "Legal notice") on the start page and the admin app
- Responsive layout; works behind reverse proxies (SSL)

## **Technology**

- **Server:** Node.js + TypeScript (ESM), built with `tsup`; SQLite database via **Prisma** (automatic migrations on start)
- **Admin app:** a standalone web app (vanilla JSX/Lit web components) without a framework; embedded SVG icons, local fonts – no external assets in the browser
- **TiddlyWiki** as the wiki engine; multiple wikis per server via the bag/recipe system
- **Passwords:** OPAQUE (aPAKE) – only hashes server-side, no plaintext, no password dictionaries needed
- **Thumbnails:** headless Chromium (Playwright), capped parallel rendering, TTL cache in `store/thumbnails/`
- **File store:** content-addressed (`store/files/<sha256>/`), streaming uploads via the inbox
- **8 languages:** `en`, `de`, `es`, `fr`, `ja`, `ko`, `ru`, `zh-cn` (admin app, wiki client, start page)

## **License**

This project is licensed under the [BSD 3-Clause License](LICENSE). The source code may be used, modified and redistributed – including commercially. The usual three conditions apply: retain the copyright notice, name the copyright holder in binary distributions, and do not use the names of the contributors to endorse derivative products without permission.

Copyright (c) 2025, TiddlyWiki · Copyright (c) 2026, heino17 – https://github.com/heino17/MultiWikiServer-wikiwise