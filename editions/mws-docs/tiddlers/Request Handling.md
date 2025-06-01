The Router class has the following methods which constitute the request chain. 

## `handle`

Takes the incoming request, response, and listener options, and calls the `handleRequest` function, adding a catch handler for rejected promises. This is the start of the async request chain. Any rejected promise from here on will make it's way back here if not caught anywhere else. If the Error is the `STREAM_ENDED` symbol, the handler simply ignores it, which is an easy way to signal that the request was handled and halt further processing. 

The `STREAM_ENDED` symbol is usually used by returning or throwing the result of `state.send*` methods, which have code equivalent to the following. 

```
class State {
  sendEmpty(status, headers){
    this.res.writeHead(status, headers);
    return this.end();
  }
  end(){
    this.res.end();
    return STREAM_ENDED;
  }
}
```

## `handleRequest`

Calls connect-style middleware for all requests
- helmet

Creates the streamer

Calls `handleStreamer`, adding a catch handler with `streamer.catcher`

## `new Streamer`

The streamer hides the difference between HTTP/1.1 and HTTP/2. 

- Parse the URL and request headers.
- If this listener has a path prefix, remove it from the URL.
- set the host header from the `:authority` header if HTTP/2.
- Parse cookies
- Setup the compression stream. This is modified from the compression package and returns a compression stream or a PassThrough stream if no compression is used, instead of modifying the response object. It determines the compression to use based on `accept-encoding`, but if a `content-encoding` header is already set it just passes the response through, assuming it is already in the desired encoding.




## `handleStreamer`

- Enforce the `x-requested-with` header if the request isn't a GET, HEAD, or OPTIONS request.
- Gets the auth details from the session manager
- Calculates the route for this request. Think of the route as the path through the tree of route handlers. Each handler may have child routes which get called after it. Each level in the tree can handle the request entirely or defer to child routes. If any level sends headers, the child level will not be called.
- Receives the body in the format specified by the route
- Calls `handleRoute`

## `handleRoute`

Awaits each handler in the route in turn, returning if one of them sends headers.

If none of them sent headers, send a 404 response.
