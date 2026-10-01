https://www.npmjs.com/package/@mws/wikiwise

The init package for the MultiWikiServer-wikiwise fork. It creates a folder,
copies the instance configuration into it and installs the server package.

It is meant for `npm init @mws/wikiwise@latest <folder-name>`, which needs the
package to be published on npm under a reserved name. The fork is currently
distributed as a GitHub release instead, so the documented installation is:

    mkdir my-folder && cd my-folder
    npm install https://github.com/heino17/MultiWikiServer-wikiwise/releases/download/v0.4.1/mws-wikiwise-0.4.1.tgz
    npx mws init-data-folder
    npx mws update-tiddlywiki
    npx mws init-store
    npx mws listen --listener

`files/package.json` in this folder is the single source of truth for the
instance manifest. `npx mws init-data-folder` copies it, which is why that command
replaces `npm init @mws/wikiwise` until the package is on npm. Until then this
package only works from a local checkout, and even then `create.js` cannot finish
the job: it installs the server package from the npm registry, which does not
exist for the fork yet. Use one of the routes above.

The package `@tiddlywiki/mws` on npm is the upstream project, not this fork.
