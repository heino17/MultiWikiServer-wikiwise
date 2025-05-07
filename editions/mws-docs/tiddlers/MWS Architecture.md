### Features

* Bag & Recipe system for storing tiddlers.
* User and Role management with ACL.
* Attachment system for storing binary tiddlers on the file system.
* Various import and export commands (currently still in development).

### Planned (hopefully) for the future

* AuthJS or a similar integration that supports third-party OAuth (you can already write your own).
* Compiling filters to SQL to optimize memory on both the client and server.
* Support for other database and storage systems. Most likely MariaDB and Postgres.
* Additional recipe strategies with features like prefixed bags and namespaces.
* Server rendering of pages, for a more wikipedia-like experience.
* Some kind of plugin system which provides a level of server-side access into the request path
