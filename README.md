# 🇺🇸 MultiWikiServer-wikiwise

[![License: BSD 3-Clause](https://img.shields.io/badge/License-BSD--3--Clause-blue.svg)](LICENSE)

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

> Before you put real data in, please read [Security between users](#security-between-users) and the **Backups** section.

## ✨ What this fork adds

Highlights only – the full story, with file names, code and background, lives in the [CHANGELOG](CHANGELOG.md).

- 🏫 **A teacher area for school operation.** A school operator creates teachers, and each teacher manages **only their own class** – walled off from colleagues by personal roles and a server-side role guard, while class roles hand students targeted read access and cooperation by invitation stays possible. (§21–§27)
- 📚 **Wikis you can actually manage.** Create a wiki with a single click (or from a full form), rename slug and display name, delete, get live validation of every name, see "real names" instead of "recipe" in the UI – and page through long lists. (§10–§13, §17, §30, §76, §78)
- 🌍 **8 languages.** The whole admin app – and the wiki client, which follows the wiki's language automatically. With 500+ translated keys and a language switcher in the header. (§14, §46)
- 🏠 **A public start page for anonymous visitors.** Hero area, statistic cards, wiki cards with preview images, an operator welcome text, a news block and a version footer – instead of a login form. (§48)
- 📌 **A pinboard.** Shared post-its for all logged-in users, addressed globally, to a class or to one person, with important notes pinned to the top, an unread badge and moderation. (§42)
- 🗂️ **My Files.** Every account uploads its own files, previews them in the browser (image, audio, video, PDF, text, Markdown, ODT) and shares them selectively – admin shares reach everyone, teacher shares their class. One search field covers both your own and the shared files. (§44, §45, §79)
- 🔎 **Search and sort in every list.** Wikis, templates, bags, roles, users and my files each get a search field that filters as you type – case, umlauts and "ß" are ignored – plus sorting by any named column, where numbers count as numbers and file sizes by their real byte count ("950.4 KB" before "2.3 MB"). Sorting flattens the wiki groups on purpose, because grouping would otherwise tear one result into three blocks. (§78, §79)
- 🖼️ **Real wiki thumbnails.** Headless screenshots of each wiki, per user view. The preview stays visible while a wiki is being edited and refreshes by itself after a short grace period instead of going blank; swept automatically when a wiki is deleted. (§43, §74–§75)
- 💾 **Storage transparency and one-click backups.** An admin tab that separates system disk status from MWS usage, reports blobs & files, orphaned files and the top-10 storage users – plus a consistent ZIP backup of database, keys and config. (§36, §39–§41)
- ⚙️ **Settings that cover the whole operation.** Default language and theme for the first load, feature switches (including screenshot previews and how many wikis a list shows at once), the cookie notice and the legal notice page. (§47, §76)
- 🔐 **Security rework.** Owner protection for wikis, bags, templates, roles and users, per-owner bag namespaces against name squatting, `CSP` headers and no existence oracle. Anonymous read access is now an explicit `ANON` role. (§4, §15, §47)

## 🚀 How to run

> ⚠️ **The package `@tiddlywiki/mws` on npm is the upstream project, not this fork.**
> `npm init @tiddlywiki/mws@latest` installs upstream MultiWikiServer – without any of
> the features listed above. This fork is distributed as a GitHub release, not on npm.

### Recommended: install the release package

Every release contains a ready-to-install package. Download it, install it into a
folder of your choice, and nothing has to be compiled:

- `mkdir my-folder && cd my-folder`
- `npm install https://github.com/heino17/MultiWikiServer-wikiwise/releases/download/v0.3.3/mws-wikiwise-0.3.3.tgz`
- `npx mws init-data-folder`
- `npx mws update-tiddlywiki`
- `npx mws init-store`
- `npx mws listen --listener` – serves on <http://localhost:8080/>

`npx mws init-data-folder` is not optional. MWS insists on a data folder whose
`package.json` is named `@tiddlywiki/mws-instance`, is marked `private` and
carries a `0.2.x` version – it refuses to start otherwise, because that file is
what keeps your tiddlers out of a public registry. `npm install <url>` in an
empty folder writes a `package.json` named after the folder, so the command
corrects exactly those three fields, keeps the dependencies npm wrote, and
refuses to overwrite a name that somebody chose on purpose.

The download is an ordinary npm package, so `npm` resolves and installs all
dependencies for you. Verify it before you trust it:

```
sha256sum mws-wikiwise-0.3.3.tgz
```

The expected checksum is printed in the release notes. A mismatch means the file
was changed in transit – delete it and download again.

### From the repository

This is what you want if you plan to change the code, or if you always want the
current state instead of a fixed release. `npm install` builds the server bundle,
so there is no separate build step:

- `git clone https://github.com/heino17/MultiWikiServer-wikiwise.git`
- `cd MultiWikiServer-wikiwise`
- `npm install`
- `npm start update-tiddlywiki` – creates `dev/wiki/tw5/<version>` (TiddlyWiki 5.4.1)
- `npm start init-store` – creates `dev/wiki/store/`: migrations, the `admin` user, and the default wikis
- `npm start` – serves the development wiki on <http://localhost:8080/>

`dev/` is not committed to git, so a fresh clone has no data folder yet — the two
`npm start <command>` steps above initialize it (there is also a `dev/mws.dev.json`
listener config if you want a different port/prefix, see `mws.dev.mjs`).

For your own data folder, independent of the development wiki, build a package once
and install it into a new folder:

- `npm pack` – creates `mws-wikiwise-0.3.3.tgz`
- `mkdir my-folder && cp create-package/files/* my-folder/`
- `cd my-folder && npm install ../mws-wikiwise-0.3.3.tgz`
- `npx mws update-tiddlywiki`
- `npx mws init-store`
- `npx mws listen --listener` – serves on <http://localhost:8080/>

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

## 📄 License

This project is licensed under the [BSD 3-Clause License](LICENSE) – free to use, modify and redistribute, including commercially. Copyright (c) 2025, TiddlyWiki · Copyright (c) 2026, heino17.

---

# 🇩🇪 MultiWikiServer-wikiwise

[![License: BSD 3-Clause](https://img.shields.io/badge/License-BSD--3--Clause-blue.svg)](LICENSE)

<a href="https://www.paypal.com/donate/?hosted_button_id=BVDDREGEU2ZEA">
  <img src="https://github.com/user-attachments/assets/6467378f-26fd-40ff-b60e-b8d62555c08a" width="20" />
Donate an den MultiWikiServer-Gründer Arlen Beiler via PayPal, um die Entwicklung zu unterstützen
</a>

---

Mehrere Nutzer, mehrere Wikis für TiddlyWiki.

- Bag-&-Recipe-System zum Speichern von Tiddlern.
- Nutzer- und Rollenverwaltung mit ACL.
- SQLite-Datenbank, verwaltet mit Prisma.
- Passwortbasierte Anmeldung.

> Bevor Du echte Daten reinlädst, lies bitte [Sicherheit zwischen Nutzern](#sicherheit-zwischen-nutzern) und den Abschnitt **Backups**.

## ✨ Was dieser Fork hinzufügt

Nur Highlights – die vollständige Geschichte mit Dateinamen, Code und Hintergrund steht im [CHANGELOG](CHANGELOG.md).

- 🏫 **Ein Lehrer-Bereich für den Schulbetrieb.** Ein Schulbetreiber legt Lehrer an, und jeder Lehrer verwaltet **nur seine eigene Klasse** – von den Kollegen abgetrennt durch persönliche Rollen und einen serverseitigen Rollen-Guard, während Klassenrollen Schülern gezielten Lesezugriff geben und eine Kooperation per Einladung möglich bleibt. (§21–§27)
- 📚 **Wikis, die man wirklich verwalten kann.** Ein Wiki mit einem Klick anlegen (oder aus einem Vollformular), Slug und Anzeigename umbenennen, löschen, jeden Namen live prüfen lassen – und in der Oberfläche „Klarnamen" statt „Recipe" sehen, auch auf langen Listen. (§10–§13, §17, §30, §76, §78)
- 🌍 **8 Sprachen.** Die komplette Admin-App – und der Wiki-Client, der automatisch der Wiki-Sprache folgt. Mit über 500 übersetzten Keys und einem Sprachumschalter in der Kopfzeile. (§14, §46)
- 🏠 **Eine öffentliche Startseite für anonyme Besucher.** Hero-Bereich, Statistik-Kacheln, Wiki-Karten mit Vorschaubildern, ein Willkommenstext des Betreibers, ein News-Block und ein Versions-Footer – statt eines Login-Formulars. (§48)
- 📌 **Eine Pinnwand.** Gemeinsame Zettel für alle angemeldeten Nutzer: global, an eine Klasse oder an eine einzelne Person adressiert, mit wichtigen Zetteln oben, Ungelesen-Badge und Moderation. (§42)
- 🗂️ **Meine Dateien.** Jedes Konto lädt eigene Dateien hoch, zeigt sie im Browser an (Bild, Audio, Video, PDF, Text, Markdown, ODT) und teilt sie gezielt – Admin-Freigaben erreichen alle, Lehrer-Freigaben ihre Klasse. Ein Suchfeld gilt für eigene *und* geteilte Dateien. (§44, §45, §79) Über die Wiki-Werkzeugleiste hochgeladene Dateien lassen sich direkt ins Wiki einbinden (`[img[...]]`/`[ext[...]]`) und sind für alle sichtbar, die das Wiki öffnen dürfen. (§65)
- 🔎 **Suche und Sortieren in jeder Liste.** Wikis, Templates, Bags, Rollen, Benutzer und Meine Dateien haben je ein Suchfeld, das beim Tippen filtert – Groß-/Kleinschreibung, Umlaute und „ß" sind egal – dazu Sortierung über jede benannte Spalte, wobei Zahlen als Zahlen und Dateigrößen nach echten Bytes gezählt werden („950.4 KB" vor „2.3 MB"). Beim Sortieren werden die Wiki-Gruppen bewusst flach, weil die Gruppierung das Ergebnis sonst in drei Blöcke zerreißen würde. (§78, §79)
- 🖼️ **Echte Wiki-Vorschaubilder.** Screenshots der Wikis aus einem Headless-Browser, pro User-Sicht. Die Vorschau bleibt beim Bearbeiten sichtbar und erneuert sich nach einer kurzen Schonfrist von selbst, statt zu verschwinden; beim Löschen eines Wikis wird sie automatisch mit aufgeräumt. (§43, §74–§75)
- 💾 **Speicher-Transparenz und Backups per Klick.** Ein Admin-Tab, der System-Festplatte und MWS-Belegung trennt, Blobs & Dateien, verwaiste Dateien und die Top-10-Speichernutzer meldet – plus ein konsistentes ZIP-Backup von Datenbank, Schlüsseln und Config. (§36, §39–§41)
- ⚙️ **Einstellungen für den gesamten Betrieb.** Standard-Sprache und -Theme fürs erste Laden, Feature-Schalter (u. a. Vorschaubilder und Wikis pro Seite), der Cookie-Hinweis und die Impressum-Seite. (§47, §76)
- 🔐 **Security-Umbau.** Owner-Schutz für Wikis, Bags, Templates, Rollen und Nutzer, Bag-Namespaces pro Owner gegen Namens-Squatting, `CSP`-Header und kein Existenz-Orakel. Anonyme Lesezugriffe sind jetzt eine explizite `ANON`-Rolle. (§4, §15, §47)

## 🚀 So startest du es

> ⚠️ **Das Paket `@tiddlywiki/mws` auf npm ist das Upstream-Projekt, nicht dieser Fork.**
> `npm init @tiddlywiki/mws@latest` installiert das originale MultiWikiServer – ohne eine
> einzige der oben genannten Funktionen. Dieser Fork wird als GitHub-Release verteilt,
> nicht über npm.

### Empfohlen: das Release-Paket installieren

Jedes Release enthält ein fertiges Paket. Herunterladen, in einen Ordner deiner Wahl
installieren – kompilieren musst du nichts:

- `mkdir mein-ordner && cd mein-ordner`
- `npm install https://github.com/heino17/MultiWikiServer-wikiwise/releases/download/v0.3.3/mws-wikiwise-0.3.3.tgz`
- `npx mws init-data-folder`
- `npx mws update-tiddlywiki`
- `npx mws init-store`
- `npx mws listen --listener` – liefert auf <http://localhost:8080/>

`npx mws init-data-folder` ist nicht optional. MWS besteht auf einem Datenordner,
dessen `package.json` `@tiddlywiki/mws-instance` heißt, als `private` markiert
ist und eine `0.2.x`-Version trägt – sonst startet der Server nicht, denn genau
diese Datei hält deine Tiddler aus einer öffentlichen Registry heraus.
`npm install <url>` in einem leeren Ordner schreibt eine `package.json` mit dem
Ordnernamen, also korrigiert der Befehl genau diese drei Felder, behält die von
npm geschriebenen Abhängigkeiten und weigert sich, einen absichtlich gewählten
Namen zu überschreiben.

Der Download ist ein ganz normales npm-Paket, `npm` löst also alle Abhängigkeiten für
dich auf. Prüfe die Datei, bevor du ihr vertraust:

```
sha256sum mws-wikiwise-0.3.3.tgz
```

Die erwartete Prüfsumme steht in den Release-Notizen. Bei Abweichung wurde die Datei
unterwegs verändert – löschen und erneut herunterladen.

### Aus dem Repository

Das ist die richtige Wahl, wenn du den Code ändern willst oder immer den aktuellen
Stand statt eines festen Releases brauchst. `npm install` baut das Server-Bundle mit,
ein zusätzlicher Build-Schritt ist nicht nötig:

- `git clone https://github.com/heino17/MultiWikiServer-wikiwise.git`
- `cd MultiWikiServer-wikiwise`
- `npm install`
- `npm start update-tiddlywiki` – legt `dev/wiki/tw5/<version>` an (TiddlyWiki 5.4.1)
- `npm start init-store` – legt `dev/wiki/store/` an: Migrationen, den Nutzer `admin` und die Standard-Wikis
- `npm start` – liefert das Entwicklungs-Wiki auf <http://localhost:8080/>

`dev/` ist nicht in Git eingecheckt, ein frischer Klon hat also noch keinen
Datenordner – die beiden `npm start <befehl>`-Schritte oben legen ihn an (eine
Listener-Konfiguration für anderen Port/Präfix ist in `dev/mws.dev.json` möglich,
Erklärung in `mws.dev.mjs`).

Für einen eigenen Datenordner, unabhängig vom Entwicklungs-Wiki, einmal ein Paket bauen
und in einen neuen Ordner installieren:

- `npm pack` – erzeugt `mws-wikiwise-0.3.3.tgz`
- `mkdir mein-ordner && cp create-package/files/* mein-ordner/`
- `cd mein-ordner && npm install ../mws-wikiwise-0.3.3.tgz`
- `npx mws update-tiddlywiki`
- `npx mws init-store`
- `npx mws listen --listener` – liefert auf <http://localhost:8080/>

Mit `npx mws help` bekommst du mehr Informationen zu den Befehlen.

- Der Server läuft auf Port `8080`. Standardmäßig nutzt er kein HTTPS, aber du kannst es über Key und Cert aktivieren.
- Es wird eine `passwords.key` erstellt, die das Master-Salt für die Passwörter enthält. Ändert sich diese Datei, sind alle Passwörter unbrauchbar und müssen neu gesetzt werden.
- Deine Datenbank liegt im Ordner `store`. Alle Dateien im Ordner `store` sind Datendateien, keine temporären Dateien und keine Lock-Dateien! Niemals löschen!

Der beim ersten Start angelegte Nutzer hat den Benutzernamen `admin` und das Passwort `1234`.

Wenn du Probleme hast oder nicht weiterkommst, leg gerne eine [Diskussion](https://github.com/heino17/MultiWikiServer-wikiwise/discussions) an. Wenn du weißt, was nicht stimmt, kannst du auch ein Issue eröffnen.

## 🧩 Flexibel und erweiterbar

- Plugins können Routen und Hooks ergänzen.
- Überall Abstraktionen, das erlaubt Flexibilität.
- Der Quellcode ist vollständig typisiert und gut navigierbar.
- Admin-Endpunkte lassen sich auch über die CLI aufrufen.

## Sicherheit zwischen Nutzern

Die Datenbankstruktur und die Speicherschicht sind solide, und dieser Fork hat mehrere der schärfsten Kanten des Originals geschlossen. Die Zugriffskontrolle ist weiterhin **bag-basiert** und nicht pro Tiddler, und privilegierte Rollen sind mächtig. MWS passt also gut zu Klassenzimmern, Teams und Hobby-Wikis – und ist das falsche Werkzeug für Geheimnisse, die strikt getrennt bleiben müssen.

### 🛡️ In diesem Fork gehärtet

- **Ein Speichern kann nicht mehr den Bag eines anderen mitreißen.** Beim Anlegen oder Speichern eines Rezepts/Templates wird für jeden referenzierten Bag Lesezugriff benötigt – bei Schreibzielen Schreibzugriff. Ein Verweis auf `editions/<jemand-anderes>` legt dir dieses Wiki weder offen noch gibt er dir Rechte, die du nicht selbst hast.
- **Ein Wiki zu lesen schaltet nicht mehr alle seine Bags frei.** Über den Zugriff auf den Inhalt eines Wikis entscheidet Bag für Bag, statt „ein einziger Bag öffnet das ganze Wiki".
- **Anonymer Lesezugriff ist explizit.** Er wird über die `ANON`-Rolle am Wiki-Rezept und seinen Bags vergeben; alles andere bleibt unsichtbar.
- **Bag-Namespaces sind pro Owner partitioniert.** Der Standard-Bag eines Wikis liegt unter `editions/<owner-id>/<slug>`, sodass niemand den Bag vorab anlegen kann, in den das Wiki speichert – der Bug, der Schülern früher rätselhafte 403er bescherte. Die öffentliche URL `/wiki/<slug>` bleibt unverändert.
- **Kein Existenz-Orakel.** Bags, die du nicht sehen darfst, antworten mit `404` statt `403`, sodass fremde Bag-Namen nicht über Statuscodes durchsickern. Wiki-Seiten werden mit einem `CSP`-Header ausgeliefert.
- **Rechte lassen sich nicht beiläufig vergeben.** Die Systemrollen `ADMIN`/`USER`/`ANON` können nicht gelöscht werden, und nur das `admin`-Konto darf Rollen anlegen – über die API gibt es keine Selbstbeförderung.
- **Lehrer sind in einer Sandbox.** Ein Schulbetreiber legt Lehrer an; jeder Lehrer verwaltet **nur seine eigene Klasse** über eine persönliche Rolle, darf weder `ADMIN`, `TEACHER` noch die Rolle eines anderen Lehrers vergeben und kann die Wikis eines Kollegen nicht sehen oder öffnen, solange er nicht ausdrücklich eingeladen wurde. Ein serverseitiger Rollen-Guard erzwingt all das, nicht nur die Oberfläche.
- **Schreibpfade werden geprüft.** Admin- und Schreib-Endpunkte erzwingen Referer-/CSRF-Prüfungen und den `X-Requested-With`-Header, und Passwörter werden als OPAQUE-(aPAKE-)Hashes gespeichert, niemals im Klartext.

### ⚠️ Von Haus aus offen

- **Die Granularität ist ein Bag.** Wer einen Bag lesen darf, liest alle Tiddler darin; wer ihn schreiben darf, schreibt alle Tiddler darin. Es gibt keine Beschränkung pro Tiddler oder pro Feld, ein Leck ist pro Bag also binär.
- **Privilegierte Rollen sehen viel.** Admins und Lehrer können konstruktionsbedingt einen großen Teil der Installation lesen und neu zuweisen; das Rollen- und Nutzersystem ist für die gesamte Installation gemeinsam.
- **Nicht als Tresor benutzen.** Wenn Du Vertraulichkeit pro Tiddler oder eine harte Mandantentrennung brauchst, ist MWS die falsche Wahl.

In der Praxis: Verteile so wenig Rechte wie nötig, betreibe eine echte Instanz hinter HTTPS und mach Sicherungskopien.

## 🗄️ Das hier ist eine Datenbank, bitte mach Backups

Datenbanken bemühen sich sehr, perfekt zu sein, und Datenfehler sind selten. Das bedeutet aber nicht, dass nichts schiefgehen kann. Backups sind ziemlich wichtig.

## 🔄 Updates

_Immer, immer, immer sichere deinen Store-Ordner, bevor du aktualisierst._

- Mit `npm update` bringst du MWS auf die neueste Version.
- Mit `npx mws update-tiddlywiki` bringst du TiddlyWiki auf die neueste Version.

Gibt es Änderungen an der Datenbank, sollte MWS sie beim Start übernehmen. Die Änderungen werden aus Prisms eingebauter Migration erzeugt und sollen die Daten erhalten, aber Backups werden dringend empfohlen.

## 💾 Backups

Es wird empfohlen, den kompletten Datenordner zu sichern, nicht nur den Ordner `store` – mit ein paar Ausnahmen.

- Du musst *immer* den *kompletten* Ordner `store` sichern. Lösche niemals Dateien im Ordner `store`. Alle Dateien im Ordner `store` sind Datendateien!
- `passwords.key` kann gesichert werden, aber da sie sich nie ändert, kannst du auch einfach eine Kopie an einem sichereren Ort getrennt von deinen normalen Backups aufbewahren.
- Du solltest `package.json` und `package-lock.json` sichern.
- Der Ordner `node_modules` kann ignoriert werden. `npm ci` installiert den Ordner `node_modules` anhand von `package-lock.json` neu.
- Der Ordner `cache` (neben dem Ordner `store`) wird bei jedem Start von MWS erzeugt, ist also nur Ballast. Du kannst ihn immer ignorieren.
- Aus dem Ordner `tw5` muss nur die Datei `tw5/versions.txt` gesichert werden.

Im Wesentlichen sind das die Pfade, die du sichern musst:
- `/package.json`
- `/package-lock.json`
- `/store`
- `/tw5/versions.txt`
- `/passwords.key` (oder separat aufbewahren)

## 🛠️ Entwicklung

Der Entwicklungs-Datenordner ist `/dev/wiki`.

Wenn du am Projekt arbeiten oder einfach die neuesten Änderungen ausprobieren möchtest:

- `git clone https://github.com/heino17/MultiWikiServer-wikiwise`
- `cd MultiWikiServer-wikiwise`
- `npm install` or `npm run install-android`
- `npm run certs` - wenn du https willst (nur unix)
- `npm start update-tiddlywiki` - Lädt die neueste TiddlyWiki-Version herunter
- `npm start init-store` - Legt den Nutzer `admin` an und importiert die Standard-Wikis.
- `npm start` - führt jedes Mal den Build aus, aber das geht sehr schnell.

Das Entwicklungs-Wiki ist aktiv unter http://localhost:8080/

Du kannst die Listener ändern, wie es in der Datei mws.dev.mjs erklärt wird.

## 📄 Lizenz

Dieses Projekt steht unter der [BSD 3-Clause License](LICENSE) – frei verwendbar, veränderbar und weitergebbar, auch kommerziell. Copyright (c) 2025, TiddlyWiki · Copyright (c) 2026, heino17.
