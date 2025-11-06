The server package (with its supporting packages) is designed to stand alone and be used in other projects. 


## Checklist

- Server Startup
  ```ts
  import{ startup, exiter } from "@tiddlywiki/server";
  await startup();
  process.on('SIGTERM', exiter);
  process.on('SIGINT', exiter);
  process.on('SIGHUP', exiter);
  ```

  - `exiter` emits the `exit` event on the server event bus. Various long-running connections, like SSE, listen for this event and close gracefully. The HTTP listeners also close, preventing new connections. The process listener is not added automatically in case you want to customize exit behavior. You can also listen to the exit event if you need to be notified. 
  - `startup` currently does nothing, but may emit hook events in the future that want to be run during application startup.

