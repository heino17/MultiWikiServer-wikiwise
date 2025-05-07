Described here is a full blown role-based identity & access management system. However we are unlikely to need this level of sophistication immediately. 

## Logical groupings and definitions

- A user is a logical grouping of logins.
- An organization ("content space") is a logical grouping of users and the content they interact with.
- The organization owner is a user who sets the privileges other users have in the organization.
  - If enabled, every user is the owner of their own personal organization. 
  - If enabled, they may own extra organizations. 
  - The organization owner has all privileges in the organization except those they explicitly deny themself. 
  - They cannot deny themself the ability to change privileges in the organization. 
  - They may delegate to managers. 
- Admins are users with site-wide privileges. 
  - The admin role is separate from the owner role. They are not site-wide owners.
  - Admins can take various actions on extra orginizations, depending on site settings.
  - Admins can manage users access to the site and take related actions.
  - Depending on settings, admins cannot view content that does not belong to them, unless shared (the exact privacy details here aren't important, it's the technical features that I'm including this for).
- Site admins can define a public content space which everyone can view, and an additional content space which authenticated users can view. These act as implicit organizations with admins given permissions as managers.

Even though it sounds like I'm expecting this to be some kind of public document sharing platform or online collaboration, the setup actually has multiple use-cases within a single organization that are just as complicated.

### To recap the various roles in an organization

- **admin** - Granted site-wide permissions.
- **owner** - Granted organization level permissions. 
- **manager** - Delegated permission from owners.
- **user** - Explicitly invited and added to the organization user list by owners or managers.
- **auth** - Visitor signed in and not in the user list.
- **anon** - Visitor not signed into the site.

### There are two permission levels within the wiki

- **writer** - can edit tiddlers, optionally filtered
- **reader** - can view tiddlers, optionally filtered

Owners can create permission profiles which define reader and writer filters, then assign them to users or groups (or to their access to a specific wiki), and when they update the permission profile the changes apply everywhere. 

I mean look, at some point I'm just implementing an entire Identity Access Management service. 

## JSON settings file

A short list of options in a JSON file alongside the database (or with the database settings) which determines some permanent settings that depend on the use case.

- Whether admins can change user email address or oauth identity and set user passwords (account takeover).
- Whether admins can view site content unrestricted (account privacy).
- Sets the max visibility owners and admins can set (since that shouldn't need to change).
- The default default visibility (before orgs change it).

### settings for content spaces (organizations)

- Whether new users get their own personal content space (personal organization).
- Whether non-admin users can be given additional content spaces (extra organizations).
- Whether non-admin users can create their own additional content spaces (extra organizations).
- Whether additional content spaces created by non-admin users can be removed from them by admins (this will depend on the use case).


