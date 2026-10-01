# Contributing to MultiWikiServer-wikiwise

Thanks for looking at this fork. **MultiWikiServer-wikiwise** (`@mws/wikiwise`)
is a maintained fork of
[`TiddlyWiki/MultiWikiServer`](https://github.com/TiddlyWiki/MultiWikiServer)
maintained by heino17 and published under the BSD 3-Clause license. Small,
well-described pull requests are the most valuable contribution here; a bug
report with a reproduction is just as welcome.

## Before you start

- [`ARCHITECTURE.md`](ARCHITECTURE.md) explains how a wiki is assembled and
  where the trust boundaries are. Read it before touching server code.
- [`PLANNING.md`](PLANNING.md) lists what is open, what is deliberately
  unfinished, and which decisions are already settled. Do not re-open a
  settled point.
- [`CHANGELOG.md`](CHANGELOG.md) documents every change of this fork as a
  numbered section `§N`, together with the reasoning. It is the best place to
  find out *why* something works the way it does.

## Getting the code running

```bash
git clone https://github.com/heino17/MultiWikiServer-wikiwise
cd MultiWikiServer-wikiwise
npm install                # also builds the bundle (prepare → build:pack)
npm run certs              # optional: https for localhost (unix only)
npm start update-tiddlywiki
npm start init-store       # creates the admin user and the default wikis
npm start                  # dev server on http://localhost:8080/
```

The development data folder is `dev/wiki`; listeners, ports and TLS are
configured in `mws.dev.mjs`. `npm start` bundles in watch mode and therefore
rebuilds on every change. Everything you pass after `start` is handed to the
MWS CLI, which is why `init-store` and `update-tiddlywiki` work the same way.

`npm run docs` starts the same server with the documentation route enabled.

## Commands

| Purpose | Command |
|---|---|
| Install | `npm install` (`npm run install-android` on Android/NDK) |
| Develop with watch rebuild | `npm start` |
| One-off CLI task | `npm start init-store`, `npm start update-tiddlywiki`, … |
| Production build | `npm run build` |
| Typecheck server packages | `npm run tsc2` |
| Typecheck admin app | `cd packages/admin-vanilla && npm run tsc` |
| Wiki-side client build | `npm run build:client` |
| Fresh instance from the tarball | `npm test` |
| Reset the development store | `npm run dev-quick-reset` |
| Local HTTPS certificates | `npm run certs` |
| Validate, format, generate the DB client | `npm run prisma:gen` |
| New migration | `npm run prisma:mig` |

Two things to know about `npm test`: it builds the project, packs a tarball,
deletes and recreates the `tests/` folder, installs the tarball there and
**starts that instance on port 8080** — stop your dev server first. It is a
smoke test without automated assertions. Also, the root script
`npm run tsc-client` still refers to the old `packages/react-admin` and no
longer works; typecheck the admin app with the `admin-vanilla` command above.

The database is selected with `DATABASE_URL` (SQLite, Postgres or MSSQL). The
Prisma schema lives in `prisma/schema.prisma`, migrations in
`prisma/migrations`. Stores created before 27.09.2026 need additional tables
(§70).

## Working on a change

- One topic per commit, and small enough that its description stays honest.
- Commit messages carry a prefix and **German text**: `feat:`, `fix:`,
  `refactor:`, `docs:`, `style:`, `release:`, `chore:`. When the change is
  documented, reference the section in parentheses, e.g.
  `docs: CHANGELOG §§65–79 auch auf Englisch`.
- Match the style of the file you are editing. TypeScript everywhere, no
  framework in the server packages; the admin app is TSX on
  `@tiddlywiki/jsx-runtime`.
- Do not add a dependency without saying so in the pull request, and check
  first whether the project already ships something similar.
- Never commit generated or local artifacts: `dist/`, `*.tgz`, `dev/wiki/`,
  `tests/`, `store/`, `test.sqlite`, `.env`, `localhost.*`. `.gitignore`
  already covers all of them.

## Documentation is part of the change

This fork documents itself in both languages, and a change is not finished
before the documentation follows:

- **`CHANGELOG.md`** — every user-visible change gets a new numbered section
  (`§81` is next), newest section first, in *both* the English and the German
  half. The section number has to be identical on both sides, inline code,
  identifiers, file names and command lines stay literally the same, and prose
  is wrapped at about 80 columns. Release sections additionally carry a release
  block with version, date, number of commits, files changed and
  insertions/deletions.
- **`README.md`** and **`README_features.md`** — each an English and a German
  half with a matching structure. When you add a section, add it to both
  halves.
- **`editions/mws-docs/tiddlers/Installation.md`** and the wiki edition
  `editions/bedienungsanleitung` — installation instructions and the manual.
  These are TiddlyWiki files, not Markdown; keep their syntax valid.
- **New UI strings** — the admin app is bilingual, so add the German *and* the
  English text.

## Releases

Releases are cut by the maintainer; this is the checklist, so that a
contributor does not have to guess:

1. Bump the version in `package.json` and `package-lock.json` (and
   `tools/package-lock.json` if that changed).
2. Update the version references in `README.md`, `README_features.md`,
   `editions/mws-docs/tiddlers/Installation.md` and `create-package/README.md`.
3. Finish the CHANGELOG section for the release and recompute the statistics in
   the release block.
4. `npm run build`, then `npm pack` → `mws-wikiwise-X.Y.Z.tgz`.
5. Commit as `release: Version X.Y.Z`, then create the annotated tag `vX.Y.Z`.
6. Publish a GitHub release for that tag and attach the tarball.

The fork is **not** published to npm, and that is deliberate: the registry path
(reserved names, 2FA, tokens) costs more than it is worth for a single
maintainer. `create-package/README.md` documents the installation from the
release tarball. Please do not add npm publishing steps to this document.

## Reporting bugs

German or English, both are fine. Useful are: what you did, what you expected,
what happened instead, wiki slug and browser, the relevant browser console
output, and the CHANGELOG section that introduced the behaviour. Security
issues: please write to the maintainer directly instead of opening a public
issue.

## License

This fork is licensed under the [BSD 3-Clause License](LICENSE), copyright
(c) 2025 TiddlyWiki, (c) 2026 heino17. Pull requests are accepted under that
license. There is no separate contributor license agreement to sign —
contributing means you agree that your contribution is distributed under
BSD 3-Clause.

---

# Beitrag zu MultiWikiServer-wikiwise

Danke, dass du herüberschaust. **MultiWikiServer-wikiwise** (`@mws/wikiwise`)
ist ein gepflegter Fork von
[`TiddlyWiki/MultiWikiServer`](https://github.com/TiddlyWiki/MultiWikiServer),
gepflegt von heino17 und veröffentlicht unter der BSD-3-Clause-Lizenz. Kleine,
gut beschriebene Pull Requests sind hier die wertvollste Beitragsform; ein
Fehlerbericht mit Reproduktion ist genauso willkommen.

## Bevor du anfängst

- [`ARCHITECTURE.md`](ARCHITECTURE.md) erklärt, wie ein Wiki zusammengesetzt
  wird und wo die Vertrauensgrenzen liegen. Lies es, bevor du Servercode
  anfasst.
- [`PLANNING.md`](PLANNING.md) listet, was offen ist, was bewusst unfertig
  bleibt, und welche Entscheidungen bereits gefallen sind. Mach gefallene
  Entscheidungen nicht wieder auf.
- [`CHANGELOG.md`](CHANGELOG.md) dokumentiert jede Änderung dieses Forks als
  nummerierten Abschnitt `§N`, zusammen mit der Begründung. Dort steht am
  besten, *warum* etwas so funktioniert, wie es funktioniert.

## Der Code läuft bei dir nach diesem Ablauf

```bash
git clone https://github.com/heino17/MultiWikiServer-wikiwise
cd MultiWikiServer-wikiwise
npm install                # baut das Bundle gleich mit (prepare → build:pack)
npm run certs              # optional: https für localhost (nur unix)
npm start update-tiddlywiki
npm start init-store       # legt den admin-User und die Standard-Wikis an
npm start                  # Entwicklungsserver auf http://localhost:8080/
```

Der Entwicklungsdatenordner ist `dev/wiki`; Listener, Ports und TLS stehen in
`mws.dev.mjs`. `npm start` bündelt im Watch-Modus und baut also bei jeder
Änderung neu. Alles, was du hinter `start` übergibst, landet in der MWS-CLI —
deshalb funktionieren `init-store` und `update-tiddlywiki` genauso.

`npm run docs` startet denselben Server mit aktivierter Dokumentationsroute.

## Befehle

| Zweck | Befehl |
|---|---|
| Installieren | `npm install` (`npm run install-android` für Android/NDK) |
| Entwickeln mit Watch-Rebuild | `npm start` |
| Einmalige CLI-Aufgabe | `npm start init-store`, `npm start update-tiddlywiki`, … |
| Produktions-Build | `npm run build` |
| Typprüfung der Server-Pakete | `npm run tsc2` |
| Typprüfung der Admin-App | `cd packages/admin-vanilla && npm run tsc` |
| Build des Wiki-Clients | `npm run build:client` |
| Frische Instanz aus dem Tarball | `npm test` |
| Entwicklungsdatenbank zurücksetzen | `npm run dev-quick-reset` |
| Lokale HTTPS-Zertifikate | `npm run certs` |
| DB-Client validieren, formatieren, erzeugen | `npm run prisma:gen` |
| Neue Migration | `npm run prisma:mig` |

Zwei Dinge zu `npm test`: Der Befehl baut das Projekt, packt ein Tarball,
löscht und neu anlegt den Ordner `tests/`, installiert das Tarball dort und
**startet diese Instanz auf Port 8080** — vorher den Entwicklungsserver
beenden. Es ist ein Smoke-Test ohne automatisierte Prüfungen. Außerdem zeigt
das Root-Skript `npm run tsc-client` noch auf das entfernte
`packages/react-admin` und funktioniert nicht mehr; die Typprüfung der
Admin-App läuft über den `admin-vanilla`-Befehl oben.

Die Datenbank wird über `DATABASE_URL` gewählt (SQLite, Postgres oder MSSQL).
Das Prisma-Schema liegt in `prisma/schema.prisma`, die Migrationen in
`prisma/migrations`. Datenbestände, die vor dem 27.09.2026 entstanden sind,
brauchen zusätzliche Tabellen (§70).

## An einer Änderung arbeiten

- Ein Thema pro Commit, und so klein, dass die Beschreibung ehrlich bleibt.
- Commit-Nachrichten haben ein Präfix und **deutschen Text**: `feat:`,
  `fix:`, `refactor:`, `docs:`, `style:`, `release:`, `chore:`. Wenn die
  Änderung dokumentiert ist, gehört der Abschnitt in Klammern dahinter, z. B.
  `docs: CHANGELOG §§65–79 auch auf Englisch`.
- Folge dem Stil der Datei, die du bearbeitest. Überall TypeScript, im
  Serverbereich ohne Framework; die Admin-App ist TSX auf
  `@tiddlywiki/jsx-runtime`.
- Füge keine Abhängigkeit hinzu, ohne es im Pull Request zu sagen, und prüfe
  vorher, ob das Projekt schon etwas Ähnliches mitbringt.
- Committe nie erzeugte oder lokale Artefakte: `dist/`, `*.tgz`, `dev/wiki/`,
  `tests/`, `store/`, `test.sqlite`, `.env`, `localhost.*`. `.gitignore`
  deckt all das bereits ab.

## Dokumentation gehört zur Änderung

Dieser Fork dokumentiert sich zweisprachig, und eine Änderung ist nicht fertig,
bevor die Dokumentation nachgezogen ist:

- **`CHANGELOG.md`** — jede nutzersichtbare Änderung bekommt einen neuen
  nummerierten Abschnitt (`§81` ist der nächste), den neuesten zuerst, in
  *beiden* Hälften, der englischen und der deutschen. Die Abschnittsnummer
  muss auf beiden Seiten gleich sein, Inline-Code, Bezeichner, Dateinamen und
  Kommandozeilen bleiben wörtlich gleich, Fließtext wird bei etwa 80 Spalten
  umgebrochen. Release-Abschnitte tragen zusätzlich einen Release-Block mit
  Version, Datum, Anzahl Commits, geänderten Dateien und Einfügungen/
  Löschungen.
- **`README.md`** und **`README_features.md`** — jeweils eine englische und
  eine deutsche Hälfte mit gleicher Struktur. Neuer Abschnitt in beide
  Hälften.
- **`editions/mws-docs/tiddlers/Installation.md`** und die Wiki-Ausgabe
  `editions/bedienungsanleitung` — Installationsanleitung und Handbuch. Das
  sind TiddlyWiki-Dateien, kein Markdown; halte die Syntax gültig.
- **Neue Oberflächentexte** — die Admin-App ist zweisprachig, also gehören
  deutscher *und* englischer Text dazu.

## Releases

Releases fertigt der Maintainer an; diese Checkliste steht hier, damit
Mitwirkende nicht raten müssen:

1. Version in `package.json` und `package-lock.json` hochsetzen (und in
   `tools/package-lock.json`, falls sich dort etwas geändert hat).
2. Versionsangaben in `README.md`, `README_features.md`,
   `editions/mws-docs/tiddlers/Installation.md` und `create-package/README.md`
   nachziehen.
3. Den CHANGELOG-Abschnitt für das Release abschließen und die Statistik im
   Release-Block neu berechnen.
4. `npm run build`, dann `npm pack` → `mws-wikiwise-X.Y.Z.tgz`.
5. Commit als `release: Version X.Y.Z`, dann den annotierten Tag `vX.Y.Z`
   anlegen.
6. Für diesen Tag ein GitHub-Release veröffentlichen und das Tarball anhängen.

Der Fork ist **nicht** auf npm veröffentlicht, und das ist Absicht: Der
Registry-Weg (reservierte Namen, 2FA, Tokens) kostet für eine einzelne
Maintainerin mehr, als er bringt. `create-package/README.md` beschreibt die
Installation aus dem Release-Tarball. Bitte ergänze keine
npm-Veröffentlichungsschritte in diesem Dokument.

## Fehler melden

Deutsch oder Englisch, beides passt. Hilfreich sind: was du getan hast, was du
erwartet hast, was stattdessen passiert ist, Wiki-Slug und Browser, die
relevanten Browser-Konsolenausgaben und der CHANGELOG-Abschnitt, der das
Verhalten eingeführt hat. Sicherheitsprobleme: bitte direkt an den Maintainer
schreiben statt ein öffentliches Issue zu eröffnen.

## Lizenz

Dieser Fork steht unter der [BSD-3-Clause-Lizenz](LICENSE), Copyright
(c) 2025 TiddlyWiki, (c) 2026 heino17. Pull Requests werden unter dieser
Lizenz angenommen. Eine separate Contributor License Agreement gibt es nicht
zu unterschreiben — mit dem Beitrag erklärst du dich damit einverstanden, dass
dein Beitrag unter BSD 3-Clause weiterverteilt wird.