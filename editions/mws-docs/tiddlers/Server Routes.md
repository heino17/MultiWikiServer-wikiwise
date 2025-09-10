The routing for the server uses the same concept of routes as the TiddlyWiki core server, but significantly enhanced with TypeScript types and request helpers and primitives, including request validation.

## Server Routing

Routes are registered as a tree. The router starts at the root node and works its way down, using the regex and method of each route to check if the request matches. Once it finds a match, it recursively checks the children of those matches. 

- The request method is "narrowed". Parent routes restrict the methods their child routes can accept. 

Once the full route is determined, it handles the request body based on the options of the matched route, then it calls each handler, starting with the root handler, and continuing down.

- The request body format is determined by the parent routes, and child routes cannot change the body format if a parent route sets it.

In the example below, if the request matches child 2a, the router calls the root handler, then the child 2 handler, then the child 2a handler. 

---

[root] 

- child 1
  - child 1a
- child 2
  - child 2a
  - child 2b

---

## Server Route Definition

The type definitions for this interface contains comments with more details. Please see that for more info. 

- **path**: A regular expression (must start with `^` to match the start of the path)
- **pathParams**: Keys for the Regex match params. The object is added to the request state.
- **method**: Array of methods supported by this route.
- **bodyFormat**: The desired body format for this route. Ignored if the parent also specifies a body format. 
- **denyFinal**: Parent routes can set this so the request is rejected if no child routes are matched. 
- **securityChecks**: additional security checks for the server to perform.
  - **requestedWithHeader**: requires a custom `X-Requested-With` header to be set to one of the valid values (`fetch`, `XMLHttpRequest`, `TiddlyWiki`) in order to prevent form and `no-cors` requests. 

## Request Validation

The `zodRoute` helper function implements validation checks and additional typing for the request object. See the comments and types in the `zodRoute` file for further information.  

The zod options accept a function which returns a zod schema (or a hashmap of keys to zod schemas). 

- **zodPathParams**: the path params object
- **zodQueryParams**: the query params object
- **zodRequestBody**: the request body
- The **path** is a string instead of a regex. The path is split on the `/` and names starting with a colon become path params. 
- The **method**, **body format**, and **security checks** are same as above. 
- **registerError**: An error instance to capture a stack trace in case it's needed for any reason. Note that in most runtimes the performance penalty is incurred when the stack trace is read, not when the error instance is created. 




