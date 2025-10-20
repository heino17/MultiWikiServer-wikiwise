## Contributor License Agreement

Contributors need to sign the TiddlyWiki CLA to, you know, contribute. \
To sign the CLA, and understand what it means, [go here.](https://github.com/TiddlyWiki/TiddlyWiki5/blob/master/contributing.md#contributor-license-agreement)

# MWS Server Architecture Explained

This is a monorepo divided into separate projects. The entry point is in `packages/mws/src/index.ts`. The entry point imports the `server`, `commander`, and `events` projects. 

The entire server uses Promises and async functions for pretty much everything. Synchronous file system calls should be avoided as much as possible. 

The `events` project is the foundation of MWS. It contains an `EventEmitter` instance that everything else subscribes to. 

Events are emitted asyncly. Event listeners are awaited with `Promise.all`, and rejections throw back to the event emit call. This is intentional because it is the heart of the entire server, not just a public event bus, and errors shouldn't be ignored. Errors that come from things like attempting to send SSE events to other clients, however, should not be thrown because they aren't relevent to the source of the event. 

There should be no singleton references other than the event emitter and event handlers should be as pure as possible, so that in theory it would be possible to run multiple completely separate MWS servers in the same process.

The `commander` project handles the CLI parsing code. It exports a default function which MWS calls to execute the CLI. Commander emits several events during execution, which MWS hooks into to scaffold the rest of the server. 

It also exports the base class for commands to inherit from, and because it instantiates the commands, commands should not specify their own constructor. Additional instance properties may be added to commands in the `cli.execute.before` event. 

The `server` project handles all web related stuff, but in an MWS-agnostic way. It only requires the `events` project, so it could be used as the foundation for unrelated webservers. Its internal API is directly inspired by the TiddlyWiki server API, with routing and centralized handling of the request body. 

The `mws` project is the application layer of MWS and ties everything else together. It defines all the commands and web server routes and handles the database connection. 

The `react-admin` package is the Admin UI. It's based on react, and is built automatically when the dev server is enabled. You can find the server route in `packages/mws/src/services/setupDevServer.ts`

If this all sounds a bit confusing, here's all the events that are emitted on a normal startup. 

- `zod.make`  - Emitted by `server` to extend the zod global.
- `cli.register`  - Emitted by `commander` to register commands.
- `cli.commander` - Emitted by `commander` after routes are registered, but before help is printed. 
- `cli.execute.before` - Emitted by `commander` right before the command is executed. This allows adding properties to the command instance for use later in the application. 

These next ones are attachment points for further extension of MWS. They are emitted in the main `cli.execute.before` listener that MWS attaches.  

- `mws.cache.init.before`
- `mws.cache.init.after`
- `mws.adapter.init.before`
- `mws.adapter.init.after`
- `mws.init.before`
- `mws.init.after`

These are emitted by the listen command, either by `mws` or by `server`. 

- `listen.router.init`
- `mws.router.init`
- `mws.routes.important`
- `mws.routes`
- `mws.routes.fallback`

And finally the event emitted after the command ends. 

- `cli.execute.after`

Remember that this is the order the commands start executing in. Some of them are nested. For instance, if I log the event name when it is emitted and time it, this is the output.


```
zod.make
zod.make: 0.123ms

cli.register
cli.register: 0.088ms

cli.commander
cli.commander: 0.019ms

cli.execute.before
  mws.cache.init.before
  mws.cache.init.before: 0.014ms
  mws.cache.init.after
  mws.cache.init.after: 0.013ms
  mws.adapter.init.before
  mws.adapter.init.before: 0.007ms
  mws.adapter.init.after
  mws.adapter.init.after: 0.006ms
  mws.init.before
  mws.init.before: 0.008ms
  mws.init.after
  mws.init.after: 0.009ms
cli.execute.before: 1.171s

listen.router.init
  mws.router.init
  mws.router.init: 0.012ms
  mws.routes.important
  mws.routes.important: 0.006ms
  mws.routes
  mws.routes: 2.754ms
  mws.routes.fallback
  mws.routes.fallback: 0.054ms
listen.router.init: 4.002ms

cli.execute.after
cli.execute.after: 0.015ms
```
