Access Control is implemented separately for both recipes and bags, but bags can inherit the ACL of recipes they are added to. 

### Permission Inheritance
- Users receive combined permissions from all assigned roles
- When roles grant different permission levels for the same resource, the higher access level is granted. For example, if one role grants "read" and another grants "write" access to a recipe, the user receives "write" access since it includes all lower-level permissions. If a role grants "admin", it inherits both "read" and "write". 

### "Readonly" permission

If this were reversed, and users with explicit "read" access were forbidden from writing, it would significantly complicate roles. 

Imagine a group of engineers working on several projects. Each project has people who are responsible for editing the documentation for everyone else. So everyone needs to be granted the read permission on all projects, but only a few people are granted the write permission on each project. 

The easiest approach is to maintain one role which grants "read" access to all users, and then maintain additional roles to grant "write" access to the users responsible for each project. 

If granting read access explicitly prevented a user from writing, we would need to create two roles for each project, one which which grants write access for the project, and another which grants read access to all other projects. 

Every time a new project is added, all other projects would need to grant "read" access to that new "all projects but one" role on every single wiki for every single project in the entire organization. 
