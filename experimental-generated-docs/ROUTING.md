# MWS Routing System Documentation

## Overview

MWS uses a sophisticated, type-safe routing system built on top of Zod validation. The system provides three main layers:

1. **Basic Route Definer** - Low-level route definition for the router
2. **Zod Routes** - Type-safe routes with automatic validation
3. **Specialized Helpers** - Domain-specific route builders (`admin`, `zodSession`)

## Architecture

### Request Flow

```
HTTP Request → Router → Route Matching → Validation → Handler → Response
```

1. **Router.handleRequest()** - Processes incoming HTTP requests
2. **Route Matching** - Finds matching route definition using regex patterns
3. **Validation Phase** - Validates path params, query params, and request body
4. **Handler Execution** - Calls the inner handler with validated, typed state
5. **Response** - Sends JSON response or handles streaming

### Core Components

#### Router Class

The `Router` class is the main entry point that:
- Matches incoming requests to route definitions
- Handles different body formats (JSON, form data, streams, etc.)
- Manages CSRF protection via `x-requested-with` headers
- Applies security middleware (Helmet.js)
- Emits server events for extensibility

#### ServerRoute Interface

Defines the basic route structure:
```typescript
interface ServerRoute {
  method: string[];           // HTTP methods
  path: RegExp;              // Path matching regex
  bodyFormat?: BodyFormat;   // Expected body type
  denyFinal?: boolean;       // Block if no child routes match
  securityChecks?: {
    requestedWithHeader?: boolean;
  };
  handler: (state: ServerRequest) => Promise<symbol>;
  defineRoute: (route: RouteDef, handler) => ServerRoute;
}
```

## Zod Route System

### zodRoute Function

The `zodRoute` function creates type-safe routes with automatic validation:

```typescript
export function zodRoute<
  M extends string,
  B extends BodyFormat,
  P extends Record<string, z.ZodTypeAny>,
  Q extends Record<string, z.ZodTypeAny>,
  T extends z.ZodTypeAny,
  R extends JsonValue
>(route: ZodRoute<M, B, P, Q, T, R>): ZodRoute<M, B, P, Q, T, R>
```

#### Configuration Object

```typescript
{
  method: ["GET", "POST"],                    // HTTP methods
  path: "/recipes/:recipe_name/tiddlers",     // Path with parameters
  bodyFormat: "json",                         // Body parsing format
  
  // Path parameter validation
  zodPathParams: z => ({
    recipe_name: z.string().min(1)
  }),
  
  // Query parameter validation (optional)
  zodQueryParams: z => ({
    limit: z.string().transform(Number).array().optional()
  }),
  
  // Request body validation (optional)
  zodRequestBody: z => z.object({
    title: z.string(),
    content: z.string()
  }),
  
  // Security settings
  securityChecks: {
    requestedWithHeader: true  // Require x-requested-with: fetch
  },
  
  // CORS preflight handler (optional)
  corsRequest: async (state) => {
    // Handle OPTIONS requests
    throw state.sendEmpty(204, {
      "Access-Control-Allow-Methods": "GET,POST",
      "Access-Control-Allow-Headers": "Content-Type"
    });
  },
  
  // Main handler
  inner: async (state) => {
    // state.pathParams is fully typed
    // state.queryParams is fully typed  
    // state.data is fully typed based on zodRequestBody
    
    return { success: true };
  }
}
```

#### Body Formats

- `"ignore"` - No body processing (default for GET/HEAD)
- `"string"` - Raw string body
- `"json"` - Parse as JSON object
- `"buffer"` - Raw Buffer
- `"www-form-urlencoded"` - Parse as form data object
- `"www-form-urlencoded-urlsearchparams"` - Parse as URLSearchParams
- `"stream"` - Access raw readable stream

#### Complete Example

```typescript
const handleSaveRecipeTiddler = zodRoute({
  method: ["PUT"],
  path: "/recipes/:recipe_name/tiddlers/:title",
  bodyFormat: "string",
  securityChecks: { requestedWithHeader: true },
  
  zodPathParams: z => ({
    recipe_name: z.string().min(1),
    title: z.string().min(1)
  }),
  
  zodRequestBody: z => z.string(),
  
  inner: async (state) => {
    const { recipe_name, title } = state.pathParams;
    const content = state.data; // typed as string
    
    // Validate permissions
    await state.assertRecipeACL(recipe_name, true);
    
    // Parse tiddler content
    const fields = parseTiddlerFields(content, state.headers["content-type"]);
    if (!fields) {
      throw state.sendEmpty(400, { "x-reason": "invalid-tiddler-format" });
    }
    
    // Save in database transaction
    const result = await state.$transaction(async (prisma) => {
      const server = new WikiStateStore(state, prisma);
      const bag = await server.getRecipeWritableBag(recipe_name);
      return await server.saveBagTiddlerFields(fields, bag.bag_name, null);
    });
    
    return { revision_id: result.revision_id, bag_name: result.bag_name };
  }
});
```

## Admin Route Helper

The `admin` function is a specialized helper for administrative API endpoints:

```typescript
export function admin<T extends zod.ZodTypeAny, R extends JsonValue>(
  zodRequest: (z: Z2<"JSON">) => T,
  inner: (state: ZodState<"POST", "json", {}, {}, T>, prisma: PrismaTxnClient) => Promise<R>
)
```

### Features

- **Fixed Configuration**: Always POST to `/admin/$key` with JSON body
- **Automatic Transactions**: Wraps handler in Prisma transaction
- **Authentication Required**: Provides authenticated user context
- **CSRF Protection**: Requires `x-requested-with: fetch` header
- **Type Safety**: Full TypeScript typing for request/response

### Example Usage

```typescript
export class UserManager {
  user_create = admin(z => z.object({
    username: z.string().min(3).max(50),
    email: z.string().email(),
    password: z.string().min(8),
    role_id: z.string().uuid()
  }), async (state, prisma) => {
    // Authentication is automatic
    if (!state.user.isAdmin) {
      throw "Only administrators can create users";
    }
    
    // state.data is typed as the validated input
    const { username, email, password, role_id } = state.data;
    
    // Hash password
    const hashedPassword = await hashPassword(password);
    
    // Create user in transaction
    const user = await prisma.users.create({
      data: {
        username,
        email, 
        password_hash: hashedPassword,
        role_id
      },
      select: {
        user_id: true,
        username: true,
        email: true,
        created_at: true
      }
    });
    
    return user; // Automatically JSON serialized
  });
}
```

## Route Registration System

### RouterKeyMap Type

Ensures all routes in a class are registered:

```typescript
export const UserKeyMap: RouterKeyMap<UserManager, true> = {
  user_create: true,
  user_list: true,
  user_update: true,
  user_delete: true,
  // TypeScript will error if any routes are missing
};
```

### registerZodRoutes Function

Registers multiple routes from a class:

```typescript
export const registerZodRoutes = (
  parent: ServerRoute, 
  router: object, 
  keys: string[]
) => {
  keys.forEach((key) => {
    const route = router[key] as ZodRoute<any, any, any, any, any, any>;
    
    // Convert string path to regex with parameter extraction
    const pathregex = "^" + route.path.split("/").map(segment =>
      segment === "$key" ? key : 
      segment.startsWith(":") ? "([^/]+)" : 
      segment
    ).join("\\/") + "$";
    
    // Register OPTIONS handler for CORS if defined
    if (route.corsRequest) {
      parent.defineRoute({
        method: ["OPTIONS"],
        path: new RegExp(pathregex),
        bodyFormat: "ignore"
      }, route.corsRequest);
    }
    
    // Register main route handler
    parent.defineRoute({
      method: route.method,
      path: new RegExp(pathregex),
      bodyFormat: route.bodyFormat,
      securityChecks: route.securityChecks
    }, async (state) => {
      // Validate path parameters
      checkPath(state, route.zodPathParams);
      
      // Validate query parameters  
      checkQuery(state, route.zodQueryParams);
      
      // Validate request body
      checkData(state, route.zodRequestBody);
      
      // Call inner handler with validated state
      const result = await route.inner(state);
      
      // Send JSON response
      return state.sendString(200, 
        { "Content-Type": "application/json" },
        JSON.stringify(result), 
        "utf8"
      );
    });
  });
};
```

### Class-Based Route Definition

```typescript
export class WikiRoutes {
  static defineRoutes = (root: ServerRoute) => {
    const router = new WikiRoutes();
    const keys = Object.keys(WikiRouterKeyMap);
    registerZodRoutes(root, router, keys);
  }

  handleGetRecipeStatus = zodRoute({
    method: ["GET", "HEAD"],
    path: "/recipes/:recipe_name/status",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.string()
    }),
    inner: async (state) => {
      const { recipe_name } = state.pathParams;
      const { recipe, canRead, canWrite } = await state.getRecipeACL(recipe_name, true);
      
      if (!recipe) throw state.sendEmpty(404, { "x-reason": "recipe not found" });
      if (!canRead) throw state.sendEmpty(403, { "x-reason": "read access denied" });
      
      return {
        username: state.user.username,
        isAdmin: state.user.isAdmin,
        isLoggedIn: state.user.isLoggedIn,
        isReadOnly: !canWrite
      };
    }
  });
}

export const WikiRouterKeyMap: RouterKeyMap<WikiRoutes, true> = {
  handleGetRecipeStatus: true,
  // ... other routes
};

// Register during server startup
serverEvents.on("mws.routes", (root) => {
  WikiRoutes.defineRoutes(root);
});
```

## Session Routes

For authentication-related routes, use the `zodSession` helper:

```typescript
export function zodSession<P extends string, T extends zod.ZodTypeAny, R extends JsonValue>(
  path: P,
  zodRequest: (z: Z2<"JSON">) => T,
  inner: (state: ZodState<"POST", "json", {}, {}, T>, prisma: PrismaTxnClient) => Promise<R>
): ZodSessionRoute<P, T, R>
```

Example:
```typescript
const login1 = zodSession("/auth/login", z => z.object({
  username: z.string(),
  password: z.string()
}), async (state, prisma) => {
  const { username, password } = state.data;
  
  const user = await authenticateUser(prisma, username, password);
  if (!user) {
    throw "Invalid credentials";
  }
  
  // Set session cookie
  const sessionId = await createSession(prisma, user.user_id);
  state.setHeader("Set-Cookie", `sessionId=${sessionId}; HttpOnly; SameSite=Strict`);
  
  return { 
    success: true,
    user: {
      user_id: user.user_id,
      username: user.username,
      isAdmin: user.isAdmin
    }
  };
});
```

## Error Handling

### Validation Errors

- **Path validation failure**: Returns 404 Not Found
- **Query validation failure**: Returns 400 Bad Request  
- **Body validation failure**: Returns 400 Bad Request

### Custom Errors

```typescript
// Send empty response with status
throw state.sendEmpty(403, { "x-reason": "insufficient-permissions" });

// Send string response
throw state.sendString(400, {}, "Invalid request format", "utf8");

// Send JSON response
throw state.sendString(400, 
  { "Content-Type": "application/json" },
  JSON.stringify({ error: "Validation failed" }),
  "utf8"
);
```

### Streaming Responses

For streaming responses, return the `STREAM_ENDED` symbol:

```typescript
inner: async (state) => {
  state.setHeader("Content-Type", "application/json");
  state.write('{"items":[');
  
  for (let i = 0; i < items.length; i++) {
    if (i > 0) state.write(',');
    state.write(JSON.stringify(items[i]));
  }
  
  state.write(']}');
  throw state.end(); // Returns STREAM_ENDED
}
```

## Best Practices

### 1. Type Safety

Always define proper Zod schemas for validation:

```typescript
// Good
zodPathParams: z => ({
  user_id: z.string().uuid(),
  recipe_name: z.string().min(1).max(100)
})

// Bad - too permissive
zodPathParams: z => ({
  user_id: z.string(),
  recipe_name: z.string()
})
```

### 2. Security

Use appropriate security checks:

```typescript
// For state-changing operations
securityChecks: { requestedWithHeader: true }

// Check permissions in handlers
await state.assertRecipeACL(recipe_name, true); // write access
await state.assertBagACL(bag_name, false);     // read access
```

### 3. Database Transactions

Use transactions for data consistency:

```typescript
const result = await state.$transaction(async (prisma) => {
  const user = await prisma.users.create({ data: userData });
  const profile = await prisma.profiles.create({ 
    data: { user_id: user.user_id, ...profileData }
  });
  return { user, profile };
});
```

### 4. Error Messages

Provide clear, actionable error messages:

```typescript
if (!bag) {
  throw state.sendEmpty(404, { "x-reason": "bag-not-found" });
}

if (!canWrite) {
  throw state.sendEmpty(403, { "x-reason": "write-access-denied" });
}
```

## Migration from TiddlyWiki Routes

If migrating from traditional TiddlyWiki route handlers:

### Before (TiddlyWiki style)
```javascript
exports.method = "GET";
exports.path = /^\/recipes\/([^\/]+)\/tiddlers\/(.+)$/;

exports.handler = function(request, response, state) {
  var recipe_name = $tw.utils.decodeURIComponentSafe(request.params[0]);
  var title = $tw.utils.decodeURIComponentSafe(request.params[1]);
  
  // Manual validation and processing
  if (!recipe_name || !title) {
    response.writeHead(404);
    response.end();
    return;
  }
  
  // Handler logic...
};
```

### After (MWS style)
```typescript
const handleGetRecipeTiddler = zodRoute({
  method: ["GET"],
  path: "/recipes/:recipe_name/tiddlers/:title",
  bodyFormat: "ignore",
  zodPathParams: z => ({
    recipe_name: z.string().min(1),
    title: z.string().min(1)
  }),
  inner: async (state) => {
    const { recipe_name, title } = state.pathParams; // Automatically validated
    
    // Handler logic with full type safety...
    return await getTiddlerData(recipe_name, title);
  }
});
```

The new system provides:
- Automatic parameter validation and type safety
- Standardized error handling
- Built-in security checks
- Database transaction support
- Better testing capabilities
