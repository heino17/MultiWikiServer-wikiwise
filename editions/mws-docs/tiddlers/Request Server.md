
This is more or less a reference on the design philosophy.

## HTTP request path

The server comprises several classes which handle various parts of the request path. 

The Listener classes call the Router class with incoming requests. The Router class starts an async (Promise-based) code path with a catch handler protecting it.

There are two kinds of classes, routing and state.

Routing classes hold config state for that part of the request path. They are used to reach a specific objective. Examples include the Router and Authentication classes.

State classes hold information specific to each request. It may be used by any of the routing classes. The primary goal is usually to hide implementation details, or to pass information between routing classes. The StateObject class is the primary example, but modules may have their own state classes. 

Both kinds of classes should check incoming information thoroughly and throw quickly if anything is wrong. The constructors of state classes are part of the request chain and may throw as well. 

The request may be completed at any point in the request chain by throwing the STREAM_ENDED symbol. The catch all handler will ignore the symbol, but will send an error 500 if headers are not marked as sent at that point. 

It is important that the entire request be awaited and eventually resolve or reject. A promise should never be left hanging. The Router class takes care of making sure every request has finished with some response, but if the promise never resolves or rejects, there is no way to do this. 
