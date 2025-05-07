Welcome to the MultiWikiServer wiki!

## Phases of development

### Phase 1 is to get a fully working system that can be extended.

The features here should cover all of the core requirements.

- Database fully async and concurrent with transactions and row locking.
- Recipes and bags fully supported.
  - Support for both server-wide (wiki-like) and per-user (doc-like) recipes.
  - Shadow bags to hold each user's drafts and customizations for server-wide or shared recipes.
  - Possible integration of various tiddler namespace behaviors, like private `User:{username}` tiddlers.
  - Option *on the server* for users to propose edits to existing tiddlers, probably by moving a tiddler to a different bag. 
- The concept of multiple users fully supported. Auth state has a userID property.
- Auth with username and password by default, but allowing custom integrations to be built that use third-party auth libraries or services. Several of us already have different ideas in mind, and we need to build all the required mechanisms in phase 1 in order to make sure we're properly supporting them, even if we don't actually support the third-party integrations themselves until phase 2. 
- Multiple sessions editing the same wiki supported *by the server*, with revision mechanisms to prevent overwriting edits with an old version. 
- Sharing read or write access with other users via invite links. 

### Phase 2 is to add all the other important features

- [Full integration with popular auth solutions.](https://github.com/TiddlyWiki/MultiWikiServer/issues/1)
- [Full Identity & Access Management support.](https://github.com/TiddlyWiki/MultiWikiServer/wiki/User-Management-3)
- Collaborative editing sessions.

## How the server classes work together

This implements a server that abstracts the various HTTP protocols into a single request state object which it then hands out to the routes.

- **Streamer** abstracts away the difference between HTTP/1.1 and HTTP/2 to allow both to be handled transparently. 
  - Normalizes the request and response into a single class. 
  - Currently it doesn't support push streams, but we could change that.
- **Listeners** handle the server listener and send requests they recieve to the router.
  - ListenerHTTP: Sets up and handles HTTP requests using the http module.
  - ListenerHTTPS: Sets up and handles HTTPS requests using the http2 module (with http1.1 support).
- **Router**: The main server instance. Handles route matching and sets up a state object for each request. It also instantiates subsystems.
  - **AuthState** (subsystem): Contains all authentication logic and is called at various points in the request process. It may throw to abort the request.
- **StateObject**: Contains everything routes have access to, including a database connection. Subsystems may create their own state classes which take the StateObject as a constructor argument.  

## Thoughts on routing

Routing generally works well, but the current routes are all strictly path based. They mix various concerns into one module based on path similarities. 

I think it would be a lot more streamlined to separate the concerns into different sections. Each of those would operate as their own submodule. 

Why? Because this is how complicated permissions can get:

- **Auth** determines who the user is.
  - Auth adapters that connect third-party auth services, with fields like profile pic, display name, email, etc.
  - Auth strategies like session cookies or access tokens.
  - Login and registration forms, email and phone interactions, etc.
- **Users** contains all the code for changing what the user is allowed to do.
  - List of users, with tabs for pending, roles, etc.
  - Handle user registrations and initial setup.
  - Manage sharing and collaboration permissions: [Roles](https://github.com/Arlen22/TW5-MWS/wiki/Roles) (eventually)
- **Recipes** shows the user their available recipes and lets them create or modify.
  - (Phase 1): Users create their own recipes and bags and specify read/write permissions for those recipes and bags.
  - (Phase 2): Admins can define scoped bags which are added to recipes based on the user's role.
- **Wikis** contains all the code that runs when accessing the wiki itself.
  - Tiddler saving and loading based on the recipe instructions.
  - Uploads and other third-party integrations requiring server support.



