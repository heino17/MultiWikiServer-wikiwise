#!/bin/sh
# Das Handbuch "simplewiki-manual" aus editions/simplewiki-manual in den
# Store laden. Das ist der Aufruf, den `init-store` intern macht, nur mit
# `--overwrite`, damit die schon vorhandene Bag ersetzt wird statt zu
# scheitern.
#
# Vorher den laufenden Dev-Server stoppen (sonst ist die SQLite gesperrt).
# Danach `npm start` und /wiki/simplewiki-manual mit Strg+Umschalt+R laden.
#
#   ./update-simplewiki-manual.sh
#
# Der Aufbau (Pfad, Bag, Rezept, Rechte, Vorlage) ist der aus
# packages/mws/src/new-commands/init-store.ts (Zeilen 131-136); die
# Beschreibung nennt den Fork beim Namen. Wer am Handbuch-Rezept oder an den
# Rechten etwas aendert, aendert es hier mit.
#
# Nicht `npm start load-wiki-folder ...` benutzen: npm schluckt die
# --Optionen, und scripts.mjs reicht die Argumente ueber eine Shell ohne
# Anfuehrungszeichen weiter - das Leerzeichen und die Klammern in
# "MWS Bedienungsanleitung (SimpleWiki)" zerlegen den Aufruf. Darum erst
# bauen, dann mws.dev.mjs direkt aufrufen.

set -e

# Vom Repo-Wurzelverzeichnis arbeiten, egal von wo das Skript aufgerufen wird.
cd "$(dirname "$(readlink -f "$0")")"

if [ ! -x tools/node_modules/.bin/tsup ]; then
  echo "Fehlt: tools/node_modules. Einmal 'npm install' ausfuehren." >&2
  exit 1
fi

# Derselbe Bauschritt, den `npm start` vor dem CLI-Aufruf macht.
tools/node_modules/.bin/tsup

DEVSERVER=watch ENABLE_EXTERNAL_PLUGINS=1 node mws.dev.mjs \
  load-wiki-folder "$(pwd)/editions/simplewiki-manual" \
  --bag-relative-root "$(pwd)" \
  --bag-description "MWS-wikiwise Bedienungsanleitung" \
  --recipe-name simplewiki-manual \
  --recipe-description "MWS-wikiwise Bedienungsanleitung" \
  --recipe-users ANON \
  --template-name SimpleWiki \
  --owner-roles ADMIN \
  --overwrite
