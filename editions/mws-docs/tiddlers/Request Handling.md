
1. **Entry Point**: `Router.handle()`
   - Takes HTTP/HTTP2 request and response objects
   - Wraps `handleRequest()` in error handling

2. **Main Request Processing**: `Router.handleRequest()`
   - Emit middleware event
   - Apply Helmet middleware
   - Create Streamer instance
   - Call `handleStreamer()`

3. **Stream Processing**: `Router.handleStreamer()`
   - Emits streamer event
   - Finds matching route using `findRoute()`
   - Performs security checks (CSRF protection)
   - Processes request body based on `bodyFormat`
   - Creates `ServerRequest` instance
   - Calls `handleRoute()`

4. **Route Matching**: `Router.findRoute()` and `findRouteRecursive()`
   - Recursively matches URL path against defined routes
   - Handles nested routes
   - Matches HTTP methods
   - Returns array of matched route segments

5. **Route Handling**: `Router.handleRoute()`
   - Executes handlers for matched routes in sequence
   - Emits handle event
   - Falls back to 404 if no handler sends response

## Body Format Processing

The router supports multiple body formats:
- `stream`: Raw streaming data
- `string`: UTF-8 string
- `json`: Parsed JSON data
- `buffer`: Raw buffer
- `www-form-urlencoded`: Parsed form data as object
- `www-form-urlencoded-urlsearchparams`: Form data as URLSearchParams
- `ignore`: Ignores request body (default for GET/HEAD)

## Security Features

- Built-in Helmet middleware for security headers
- CSRF protection via `x-requested-with` header checks
- JSON security parsing (protects against prototype pollution)
- Method matching validation
- Path validation


The routes are hierarchical, allowing for nested routes with inherited properties and progressive URL path matching.

It is important that the entire request path be awaited and eventually resolve or reject. A promise should never be left hanging. The Router class takes care of making sure every request has finished with some response, but if the promise never resolves or rejects, the request will eventually time out. 