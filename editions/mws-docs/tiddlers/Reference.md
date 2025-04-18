# Authentication & Authorization

## Overview

Our application has transitioned from a conventional username/password authentication system to a more robust Authentication and Authorization implementation. This new system supports multiple user accounts, roles, permissions, and a comprehensive access control list.

## Key Features

1. Multiple User Accounts
1. Role-based Access Control
1. Granular Permissions
1. Access Control List (ACL)

## Application Access & Security

### Access Levels

Conceptually, there are 6 access levels.

- **Site owner** - has file system access to the server, and can run CLI commands. Presumably they also have a site admin account. 
- **Site admin** - Users with the admin *role*. They can assign owners and change permissions, and have full read and write access.
- **Entity owner** - Users who "own" an entity (bag or recipe). They can change permissions for that entity, and have full read and write access.
- **Entity admin** - Users granted the admin *permission* on an entity. They cannot change the owner, but they can change the permissions of other users for that entity. 
- **Entity write** - Users granted the write *permission* on an enitity. They can list, read, create, update, and delete tiddlers, but cannot change permissions. 
- **Entity read** - Users granted the read *permission* on an entity. They can list and read tiddlers, but cannot do anything else. 

### Initial Setup

When you first launch the Multiwiki Server, it creates a default admin user. The username is `admin` and the password is `1234`. To secure your installation you should change this immediately. 

### Entities

- **Bag** - A collection of tiddlers with unique titles
- **Recipe** - A stack of bags in a specific order. Bags may inherit the ACL of a recipe they are included in. 

### Roles

- Roles have names and descriptions
- Multiple users can be assigned to a role

### Permissions

- **READ** - Read tiddlers from an entity.
- **WRITE** - Write tiddlers to an entity.
- **ADMIN** - Update ACL for an entity.

### ACL

- Grants the **Permission** for an **Entity** to a **Role**. 
- Entities without an ACL are either public or private (configurable).

### Ownership

- Ownership of an entity grants the "admin" *permission*.
- Only site admins can change the owner of an entity. 
- Users with "admin" *permission* **cannot** change ownership.

### User Types

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

### Access Control

Access Control is implemented separately for both recipes and bags, but bags can in inherit the ACL of recipes they are added to. 

#### Permission Inheritance
- Users receive combined permissions from all assigned roles
- When roles grant different permission levels for the same resource, the higher access level is granted. For example, if one role grants "read" and another grants "write" access to a recipe, the user receives "write" access since it includes all lower-level permissions.

If this were reversed, and users with explicit "read" access were forbidden from writing, it would significantly complicate roles. 

Imagine a group of engineers working on several projects. Each project has people who are responsible for editing the documentation for everyone else. So everyone needs to be granted the read permission on all projects, but only a few people are granted the write permission on each project. 

The easiest approach is to maintain one role which grants "read" access to all users, and then maintain additional roles to grant "write" access to the users responsible for each project. 

If granting read access explicitly prevented a user from writing, we would need to create two roles for each project, one which which grants write access for the project, and another which grants read access to all other projects. 

Every time a new project is added, all other projects would need to grant "read" access to that new "all projects but one" role on every single wiki for every single project in the entire organization. 

## User Management & Security Architecture

### User Account Management

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

# HTTP API

The MultiWikiServer HTTP API provides management and tiddler endpoints. It was based on [the API of TiddlyWeb](https://tank.peermore.com/tanks/tiddlyweb/HTTP%20API), first developed in 2008 by Chris Dent, but is more oriented around JSON and Typescript. 

The purpose of the API is to connect the client and server as transparently as possible. This means that, at least for the moment, we aren't looking at specific formats, and are generally just dumping JSON onto the wire.

The design goals of the API are:

 - Follow the principles of remote procedure calls.
 - Be easy to understand and use via Javascript. 
 - Have strict validation of incoming requests.

General points about the design:

- On the client, most request paths are defined by a single adaptor function which accepts the input for the server and returns a promise which resolves to the server's parsed response.  
- The server may throw a user error, which is expected to return to the client. It should give them an actionable understanding of what went wrong. 

