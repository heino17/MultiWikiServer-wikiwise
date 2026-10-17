#!/bin/sh
# Das Handbuch "simplewiki-manual" neu in den Store laden.
#
# Das ist seit §139 nur noch ein Kuerzel: die System-Wikis und ihre
# Ladedefinition (Slug, Beschreibung, Template, Leserechte) liegen jetzt in
# packages/mws/src/new-managers/system-wikis.ts, und der Server traegt sie
# beim Start vorwaerts nach. Dieses Skript wendet einfach den Befehl an, der
# auch in einer Installation laeuft:
#
#   npm start update-system-wikis
#
# (Ebenso: `npx mws update-system-wikis` im Datenordner.) Der Befehl laedt
# beide System-Wikis neu, nicht nur das Handbuch; er ist der Weg, ein
# beschaedigtes System-Wiki zu reparieren. Liefert er ab, weil die Wiki-Ordner
# fehlen, ist in diesem Build nichts mitgeliefert.
#
# Vorher den laufenden Dev-Server stoppen (sonst ist die SQLite gesperrt).
# Danach `npm start` und /wiki/simplewiki-manual mit Strg+Umschalt+R laden.

set -e

# Vom Repo-Wurzelverzeichnis arbeiten, egal von wo das Skript aufgerufen wird.
cd "$(dirname "$(readlink -f "$0")")"

npm start update-system-wikis

