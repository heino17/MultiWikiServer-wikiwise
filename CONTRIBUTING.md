

## Explanation of the repo files

- dev - development related files
  - wiki - the dev wiki folder (cwd for a project)
  - localhost_certs.sh - a script to generate a quick localhost SSL key and cert for use during development. Note that using an invalid HTTPS certificate usually disables a browser's cache, which typically doesn't matter during development anyway unless you're testing caching behavior. There are workarounds, but they're not recommended. 
- dist - the build folder for the server code
- editions - TiddlyWiki5 editions-like folder
  - mws-docs - The mws site tiddlers. 
- packages - The MWS code split into logical units to aid development.
  - events - The server event bus which the other code ties into.
  - commander - The cli parser and command runner.
  - server - The web server: request routing and validation. 
  - tiddlywiki-types - contains some basic TW5 types.
  - mws - The MWS routes and database logic. 
  - react-admin - The React client UI
- plugins
  - client - The sync adapter and other client-side tiddlers.
  - server - Added to the TiddlyWiki5 instance on the server used during startup for caching plugins and rendering the wiki page. 
- prisma - database schema and migration files.
- prisma-2025-04-06 - the prisma files for version 0.0
- mws.dev.mjs - The dev "bin" file. 
- scripts.mjs - Called from package.json to improve cross-platform operation.
- tsconfig.base.json - The base ts config for the project.
- tsconfig.bundle.json - an attempt at getting typescript to generate a d.ts file
- tsconfig.tsc.json - called by `npm run tsc`, used to check for errors across the project.
- tsup.config.ts - The build config used by `npx tsup`.
