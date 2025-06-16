

## Basic Route Definer

The original route definer which I used to type TiddlyWiki server routes, but the types ended up being extremely complicated for what I actually ended up needing.  It is still used internally to actually define the routes, but the JavaScript side of it is very simple. 


`method`
: A subset of the [[Allowed Methods]]. 

`path`
: A regex starting with `^/` which matches the request. The first route handler which matches is used. Routes may be nested, and the full match is removed from the URL before matching children. If a parent route matches, it will be called, even if it has no child matches. 

`denyFinal`
: If this route matches, but none of its children do, the server will return `404 NOT FOUND`. Otherwise, its state handler will be called and expected to handle the request, even if none of its children match. 

`pathParams`
: An array of key names for regex match groups for the pathParams object.

`bodyFormat`
: The [[Body Format]] which the request wishes to receive. If the method is only GET and HEAD, this is ignored, as no request body is expected. Internally, the request is probably drained early, just in case a body was sent. 

`handler` - a separate callback argument
: If the route matches, the handler is called. The handler is called at each level in order, so parents may add additional (out of type) properties to the state object or handle some requests and allow others to go through to the matched child.

### Match result

The StateObject has a routePath parameter containing the "path" through the "tree" of route definitions. In other words, it has the first matched route, and then the first matched child of that route, and then the first matched child of that route, and so on. 

It is an array of objects with the following properties. 

`route`
: an object containing the options for the route listed above

`params`
: an array of the match groups (`match.slice(1)`)

`remainingPath`
: The remaining URL to match (if this is zero-length, it will be a `/`)

## Zod Route Definers

The rest of the route definers are used by creating a class with the route definitions as properties, and then calling that class on server startup to register the routes. 

<div style="color: rgb(212, 212, 212); background-color: rgb(30, 30, 30); font-family: &quot;Fira Code&quot;, &quot;Cascadia Code&quot;, Consolas, &quot;Courier New&quot;, monospace, Consolas, &quot;Courier New&quot;, monospace; font-size: 15px; line-height: 20px; white-space: pre;"><div><span style="color: #569cd6;">class</span> <span style="color: #4ec9b0;">RoutesClass</span> { <span style="color: #9cdcfe;">test</span> = <span style="color: #dcdcaa;">zodManage</span>(<span style="color: #9cdcfe;">z</span> <span style="color: #569cd6;">=&gt;</span> <span style="color: #9cdcfe;">z</span>.<span style="color: #dcdcaa;">any</span>(), <span style="color: #569cd6;">async</span> <span style="color: #9cdcfe;">e</span> <span style="color: #569cd6;">=&gt;</span> <span style="color: #569cd6;">null</span>) }</div><div><span style="color: #569cd6;">const</span> <span style="color: #4fc1ff;">RoutesKeyMap</span>: <span style="color: #4ec9b0;">RouterKeyMap</span>&lt;<span style="color: #4ec9b0;">RoutesClass</span>, <span style="color: #4ec9b0;">true</span>&gt; = { <span style="color: #9cdcfe;">test</span><span style="color: #9cdcfe;">:</span> <span style="color: #569cd6;">true</span> }</div><div><span style="color: #dcdcaa;">registerZodRoutes</span>(<span style="color: #4fc1ff;">root</span>, <span style="color: #569cd6;">new</span> <span style="color: #4ec9b0;">RoutesClass</span>(), <span style="color: #4ec9b0;">Object</span>.<span style="color: #dcdcaa;">keys</span>(<span style="color: #4fc1ff;">RoutesKeyMap</span>));</div></div>

`RoutesKeyMap` would have the keys of all the routes in the class, and the type makes sure no routes have been missed, while also allowing the class to have extra properties that are not routes. 


## `zodRoute`

The `zodRoute` function creates type-safe route definitions with Zod validation. It takes a single configuration object with the following properties:

`method: string[]`
: An array of HTTP methods (e.g., `["GET", "POST"]`). Must be a subset of allowed methods.

`path: string`
: A slash-separated string path with optional parameters prefixed with `:` (e.g., `"/recipes/:recipe_name/tiddlers/:title"`).

`bodyFormat: BodyFormat`
: The expected body format: `"ignore"`, `"string"`, `"json"`, `"buffer"`, `"www-form-urlencoded"`, `"www-form-urlencoded-urlsearchparams"`, or `"stream"`. For GET and HEAD requests, this is always treated as `"ignore"`.

`zodPathParams: (z: Z2<"STRING">) => Record<string, ZodType>`
: A function that returns an object defining Zod validations for path parameters. The keys must match the parameter names in the path. If validation fails, returns 404.

`zodQueryParams?: (z: Z2<"STRING">) => Record<string, ZodType>`
: Optional function defining Zod validations for query parameters. Query params are arrays of strings by default.

`zodRequestBody?: (z: Z2<BodyFormat>) => ZodType`
: Optional function defining Zod validation for the request body. Only valid for `"string"`, `"json"`, and `"www-form-urlencoded"` body formats. If validation fails, returns 400.

`securityChecks?: { requestedWithHeader?: boolean }`
: Optional security checks. If `requestedWithHeader` is true, requires the `x-requested-with: fetch` header for non-GET/HEAD/OPTIONS requests.

`corsRequest?: (state: ZodState<"OPTIONS", "ignore", P, Q, ZodUndefined>) => Promise<symbol>`
: Optional CORS preflight handler for OPTIONS requests. Cannot authenticate but can provide endpoint information.

`inner: (state: ZodState<Method, BodyFormat, PathParams, QueryParams, RequestBody>) => Promise<JsonValue>`
: The main route handler that receives a fully validated and typed state object.

### Example

```typescript
const getUser = zodRoute({
  method: ["GET"],
  path: "/users/:user_id",
  bodyFormat: "ignore",
  zodPathParams: z => ({
    user_id: z.string().uuid()
  }),
  zodQueryParams: z => ({
    include_roles: z.enum(["yes", "no"]).array().optional()
  }),
  inner: async (state) => {
    const { user_id } = state.pathParams; // typed as { user_id: string }
    const { include_roles } = state.queryParams; // typed as { include_roles?: ("yes"|"no")[] }
    
    return await getUserById(user_id, include_roles?.[0] === "yes");
  }
});
```

## `admin` Helper Function

The `admin` function is a convenience wrapper around `zodRoute` specifically for admin API endpoints. It automatically sets up:

- Method: `["POST"]`
- Path: `"/admin/$key"` (where `$key` is replaced with the property name)
- Body format: `"json"`
- Security: Requires `x-requested-with: fetch` header
- Database transactions: Automatically wraps the handler in a Prisma transaction
- Authentication: Provides access to authenticated user state

### Signature

```typescript
function admin<T extends ZodTypeAny, R extends JsonValue>(
  zodRequest: (z: Z2<"JSON">) => T,
  inner: (state: ZodState<"POST", "json", {}, {}, T>, prisma: PrismaTxnClient) => Promise<R>
): ZodRoute<"POST", "json", {}, {}, T, R>
```

### Parameters

`zodRequest: (z: Z2<"JSON">) => ZodType`
: Function defining the expected shape of the JSON request body.

`inner: (state, prisma) => Promise<JsonValue>`
: Handler function that receives the validated state and a Prisma transaction client.

### Example

```typescript
const user_create = admin(z => z.object({
  username: z.string().min(3),
  email: z.string().email(),
  role_id: z.string().uuid()
}), async (state, prisma) => {
  // state.data is typed based on the zodRequest schema
  const { username, email, role_id } = state.data;
  
  // Create user within the automatic transaction
  const user = await prisma.users.create({
    data: { username, email, role_id }
  });
  
  return { user_id: user.user_id, username, email };
});
```

## `registerZodRoutes` Function

This function registers multiple Zod routes from a class instance to a parent route. It's the bridge between route definitions and the actual router.

### Signature

```typescript
function registerZodRoutes(
  parent: ServerRoute,
  router: object,
  keys: string[]
): void
```

### Parameters

`parent: ServerRoute`
: The parent route to register child routes under.

`router: object`
: An instance of a class containing route definitions as properties.

`keys: string[]`
: Array of property names to register as routes. Usually `Object.keys(RouterKeyMap)`.

### Usage Pattern

```typescript
export class UserManager {
  static defineRoutes(root: ServerRoute) {
    registerZodRoutes(root, new UserManager(), Object.keys(UserKeyMap));
  }

  user_create = admin(z => z.object({
    username: z.string(),
    email: z.string().email()
  }), async (state, prisma) => {
    // Implementation
  });

  user_list = admin(z => z.undefined(), async (state, prisma) => {
    // Implementation  
  });
}

export const UserKeyMap: RouterKeyMap<UserManager, true> = {
  user_create: true,
  user_list: true,
};

// Register during server startup
serverEvents.on("mws.routes", (root) => {
  UserManager.defineRoutes(root);
});
``` 

