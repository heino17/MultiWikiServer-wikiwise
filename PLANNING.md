Internal notes by core developers

## Prisma

- Migration path might be only for development
- Add other database types

## Web 

- Referer enforcement (wiki UI cannot access admin api)
- All the headers 
- CORS

## CLI

- Save and load archive (for backup purposes)
- Export recipe or bag to wiki folder (file system sync adapter).
- Import wiki folder to recipe or bag (tw boot node).
- Support includeWikis
- Automated export.

## Admin

- Some kind of URL mapping menu
- Forbidden characters in recipe and bag names
- All the settings
- 

## Wiki

- Storing large binary tiddlers on the file system
- Guest access to wiki
- Very tempted to remove READ privilege and just allow everyone to read because of the imsurmountable security issues that come with it otherwise.
- When you visit a page, you visit with page permissions only, and the page has to ask permission to use your full account permissions. The request could also be granular. 
