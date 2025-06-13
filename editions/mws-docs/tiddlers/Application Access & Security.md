
## Permissions

- **READ** - Read tiddlers from an entity.
- **WRITE** - Write tiddlers to an entity.
- **ADMIN** - Update ACL for an entity.

## Entities

- **Bag** - A collection of tiddlers with unique titles
- **Recipe** - A stack of bags in a specific order. Bags may inherit the ACL of a recipe they are included in. 

## Roles (aka Groups)

- Roles have names and descriptions
- Multiple users can be assigned to a role
- Roles are given *permissions* on *entities*

## Access Levels

Conceptually, there are 6 access levels.

- **Site owner** - has file system access to the server, and can run CLI commands. Presumably they also have a site admin account and they can always create one via the CLI.
- **Site admin** - Users with the admin *role*. They can assign owners and change permissions, and have full read and write access.
- **Entity owner** - Owner of an entity (bag or recipe). They can change permissions for that entity, and have full read and write access.
- **Entity admin** - Granted admin *permission*, they can manage permissions for the entity. 
- **Entity write** - Granted write *permission*, they can list, read, create, update, and delete tiddlers, but cannot change permissions. 
- **Entity read** - Granted read *permission* on an entity. They can list and read tiddlers, but cannot do anything else. 
