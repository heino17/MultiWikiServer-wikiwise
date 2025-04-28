
Users can be administered through two interfaces:

1. Web-based Administrative Interface
   - Accessible to all users.
   - Provides graphical interface for user operations
   - Real-time validation and feedback
1. Command-line Interface (CLI) Tools
   - Only available to server owner.
   - Suitable for automation and scripting
   - Enables batch operations
   - Useful for system initialization

Each user account contains the following essential components:

- **Username**
  - Must be unique across the system
  - Case-sensitive
  - Used for authentication and audit trails
- **Password**
  - Stored using secure hashing algorithms
  - Never stored in plaintext
  - Subject to complexity requirements
- **Email**
  - Eventually used for the obvious password reset.
- **Role Assignments**
  - Multiple roles can be assigned
  - Inherited permissions from all assigned roles
  - Dynamic permission calculation based on role combination

## Access Levels

Conceptually, there are 6 access levels.

- **Site owner** - has file system access to the server, and can run CLI commands. Presumably they also have a site admin account. 
- **Site admin** - Users with the admin *role*. They can assign owners and change permissions, and have full read and write access. Most ACL checks are skipped for the admin role. 
- **Entity owner** - Users who "own" an entity (bag or recipe). They can change permissions for that entity, and have full read and write access. *Entity admins* cannot change the owner.
- **Entity admin** - Users granted the admin *permission* on an entity. They cannot change the owner, but they can change the permissions of other users for that entity. 
- **Entity write** - Users granted the write *permission* on an enitity. They can list, read, create, update, and delete tiddlers, but cannot change permissions. 
- **Entity read** - Users granted the read *permission* on an entity. They can list and read tiddlers, but cannot do anything else. 

## Entities

- **Bag** - A collection of tiddlers with unique titles
- **Recipe** - A stack of bags in a specific order. Bags may inherit the ACL of a recipe they are included in. 

## Roles

- Roles have names and descriptions
- Multiple users can be assigned to a role

## Permissions

- **READ** - Read tiddlers from an entity.
- **WRITE** - Write tiddlers to an entity.
- **ADMIN** - Update ACL for an entity.

## Admin

- There is an admin *role* and an admin *permission*. 
- Roles are given specific permissions for specific entities (bags and recipes).
- The admin *role* has automatic admin *permission* for everything.

## ACL

- Grants the **Permission** for an **Entity** to a **Role**. 
- Entities without an ACL are either public or private (configurable).

## Ownership

- Ownership of an entity grants the "admin" *permission*.
- Only site admins can change the owner of an entity. 
- Users with "admin" *permission* **cannot** change ownership.

## User Types

#### Administrator (ADMIN) Role

- Full system access and configuration rights
- Most access checks are skipped
- Can create, modify, and delete user accounts
- Manages role assignments and permissions
- Has full permissions on all recipes and bags

#### Regular Users

- Created by administrators
- Permissions determined by assigned roles
- Access limited to specific recipes based on role permissions
- Access to recipes without an ACL is based on recipe config

#### Guest Users

- Users not logged in.
- No inherent permissions
- Can access recipes which allow it
- Read/write can be enabled by server config
- Useful for public wikis or documentation sites
