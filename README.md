# MultiWikiServer

MultiWikiServer for TiddlyWiki.

### How to run

- Clone the repo
- `npm install`
- `npm start`

By default, the server runs on http://localhost:5000. You can customize this by copying the else block into `mws.run.ts`. This will allow you to `git pull` updates while still preserving your configuration.

### Updates

Before running git pull, here's how to prepare to test updated code while hopefully keeping your current content. 

Run the command mws-save-archive by modifying the args array in tiddlywiki.ts to export the database. Then carefully move your precious database file to a safe location outside the repo. Then git pull. Then look at the same commands, which have now moved to server.ts, and comment out the ones you don't want (probably the entire rundbsetup section) then run mws-load-archive from the same folder. 

I definitely need to make this process easier. 

### The Server

- Supports HTTP and HTTPS listeners. All requests are funneled into one stack.
- Uses abstractions and state objects to make the server as flexible as possible.
- Supports overriding classes to implement custom handling of various features.
- All of the features from the old MWS branch have been converted to the new system.

### The Store

- Written using Prisma and entirely promise-based.
- Swapping to a different database engine should be a breeze. For sqlite it uses the libsql adapter, which also allows connections to libsql servers.
- The tiddler text attachment system, which stores some tiddler bodies on the file system, is promise-based and can be modified to store files in the cloud.

### The Features

- Bag & Recipe system for storing tiddlers.
- User and Role management with ACL.
- Attachment system for storing binary tiddlers on the file system.
- Various import and export commands (currently still in development).
- Customization of these features should be quite easy as they are fairly self-contained. The TypeScript code is fully typed and easy to navigate.

### Planned (hopefully) for the future

- AuthJS or a similar integration that supports third-party OAuth (you can already write your own).
- Compiling filters to SQL to optimize memory on both the client and server.
- Support for other database and storage systems. Most likely MariaDB and Postgres.
- Additional recipe strategies with features like prefixed bags and namespaces.
- Server rendering of pages, for a more wikipedia-like experience. 

