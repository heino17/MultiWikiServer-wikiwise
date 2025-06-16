# MWS API Reference

## Overview

MWS provides multiple API layers for different use cases:

1. **Admin API** - Administrative functions via `/admin/{command}` endpoints
2. **Session API** - Authentication and session management
3. **Wiki API** - TiddlyWiki-compatible content API for recipes and bags
4. **Status API** - System status and configuration

All APIs use JSON for data exchange unless otherwise specified. Authentication is handled via session cookies after login.

## Base URLs

- Development: `http://localhost:8080`
- The API endpoints don't use a common `/api` prefix - each has its own path structure

## Authentication

### Session-Based Authentication

MWS uses session cookies for authentication. After logging in via the admin interface or session endpoints, the session cookie is automatically included in subsequent requests.

### Required Headers

For state-changing operations (POST, PUT, DELETE), requests must include:

```
Content-Type: application/json
X-Requested-With: fetch
```

The `X-Requested-With` header provides basic CSRF protection.

## Error Handling

### Error Response Format

```typescript
// String errors (400/404 responses)
"Error description"

// JSON errors (structured responses)  
{
  "error": "Error message",
  "details": "Additional context"
}
```

### HTTP Status Codes

- `200` - Success
- `204` - Success (no content)
- `400` - Bad Request (validation error, malformed request)
- `401` - Unauthorized (not logged in)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist, path validation failed)
- `500` - Internal Server Error

### Special Headers

Error responses may include `x-reason` headers for debugging:
- `x-reason: json` - JSON parsing failed
- `x-reason: zod-path` - Path parameter validation failed
- `x-reason: zod-query` - Query parameter validation failed
- `x-reason: zod-request` - Request body validation failed
- `x-reason: no-route` - No matching route found

## Admin API

All admin endpoints follow the pattern `POST /admin/{command}` and require authentication and admin privileges.

### POST /admin/index_json

Get system overview data for the admin interface.

**Request:**
```typescript
undefined  // No request body
```

**Response:**
```typescript
{
  user_id: string;
  username: string;
  isAdmin: boolean;
  isLoggedIn: boolean;
  // System configuration and available resources
  bags: Array<{
    bag_id: string;
    bag_name: string;
    // ACL and metadata
  }>;
  recipes: Array<{
    recipe_id: string;
    recipe_name: string;
    // Configuration and bag relationships
  }>;
  plugins: {
    client: string[];
    core: string[];
  };
}
```

### POST /admin/user_create

Create a new user account.

**Request:**
```typescript
{
  username: string;
  email: string;
  password: string;
  role_id: string;  // UUID of the role to assign
}
```

**Response:**
```typescript
{
  user_id: string;
  username: string;
  email: string;
  created_at: string;  // ISO date
}
```

### POST /admin/user_list

Get list of all users (admin only).

**Request:**
```typescript
undefined
```

**Response:**
```typescript
Array<{
  user_id: string;
  username: string;
  email: string;
  created_at: string;
  last_login: string | null;
}>
```

### POST /admin/user_edit_data

Get detailed user information for editing.

**Request:**
```typescript
{
  user_id: string;
}
```

**Response:**
```typescript
{
  user: {
    user_id: string;
    username: string;
    email: string;
    roles: string;        // Role ID
    last_login: string | null;
    created_at: string;
  };
  allRoles: Array<{
    role_id: string;
    role_name: string;
    description: string;
  }>;
}
```

### POST /admin/recipe_create_or_update

Create or update a recipe configuration.

**Request:**
```typescript
{
  recipe_name: string;
  description: string;
  bag_names: Array<{
    bag_name: string;
    with_acl: boolean;
  }>;
  plugin_names: string[];
  owner_id?: string;
  skip_required_plugins: boolean;
  skip_core: boolean;
  create_only: boolean;
}
```

**Response:**
```typescript
{
  recipe_id: string;
  recipe_name: string;
  // Updated recipe configuration
}
```

## Session API

Authentication and session management endpoints.

### POST /auth/login (First phase)

Initiate login process.

**Request:**
```typescript
{
  username: string;
}
```

**Response:**
```typescript
{
  challenge: string;  // Cryptographic challenge for second phase
}
```

### POST /auth/login (Second phase)

Complete login with password verification.

**Request:**
```typescript
{
  username: string;
  challenge_response: string;  // Response to challenge
}
```

**Response:**
```typescript
{
  success: boolean;
  user: {
    user_id: string;
    username: string;
    isAdmin: boolean;
  };
}
```

### POST /auth/logout

End the current session.

**Request:**
```typescript
undefined
```

**Response:**
```typescript
{
  success: boolean;
}
```

### POST /api/auth/logout

Terminate the current session.

**Request:** Empty body

**Response:**
```typescript
{
  success: boolean;
}
```

### GET /api/auth/me

Get current user information.

**Response:**
```typescript
{
  id: string;
  username: string;
  email: string;
  roles: string[];
  lastLogin: string;
} | null
```

## User Management API

### GET /api/users

List all users (Admin only).

**Query Parameters:**
- `limit` (number) - Number of users to return (default: 50)
- `offset` (number) - Number of users to skip (default: 0)
- `search` (string) - Search by username or email

**Response:**
```typescript
{
  users: Array<{
    id: string;
    username: string;
    email: string;
    roles: string[];
    createdAt: string;
    lastLogin: string | null;
  }>;
  total: number;
}
```

### POST /api/users

Create a new user (Admin only).

**Request:**
```typescript
{
  username: string;
  email: string;
  password: string;
  roles?: string[];
}
```

**Response:**
```typescript
{
  id: string;
  username: string;
  email: string;
  roles: string[];
  createdAt: string;
}
```

### GET /api/users/{userId}

Get user details (Admin or own user).

**Response:**
```typescript
{
  id: string;
  username: string;
  email: string;
  roles: string[];
  createdAt: string;
  lastLogin: string | null;
}
```

### PUT /api/users/{userId}

Update user (Admin or own user).

**Request:**
```typescript
{
  email?: string;
  password?: string;
  roles?: string[]; // Admin only
}
```

**Response:**
```typescript
{
  id: string;
  username: string;
  email: string;
  roles: string[];
}
```

### DELETE /api/users/{userId}

Delete user (Admin only).

**Response:**
```typescript
{
  success: boolean;
}
```

## Wiki Management API

### GET /api/wikis

List all accessible wikis.

**Query Parameters:**
- `limit` (number) - Number of wikis to return
- `offset` (number) - Number of wikis to skip

**Response:**
```typescript
{
  wikis: Array<{
    id: string;
    name: string;
    description: string;
    type: "recipe" | "bag";
    permissions: string[];
    lastModified: string;
  }>;
  total: number;
}
```

### POST /api/wikis

Create a new wiki.

**Request:**
```typescript
{
  name: string;
  description: string;
  type: "recipe" | "bag";
  template?: string; // Template to use
}
```

**Response:**
```typescript
{
  id: string;
  name: string;
  description: string;
  type: "recipe" | "bag";
  createdAt: string;
}
```

### GET /api/wikis/{wikiId}

Get wiki details.

**Response:**
```typescript
{
  id: string;
  name: string;
  description: string;
  type: "recipe" | "bag";
  permissions: string[];
  bags?: string[]; // For recipes
  tiddlerCount: number;
  lastModified: string;
}
```

### PUT /api/wikis/{wikiId}

Update wiki.

**Request:**
```typescript
{
  name?: string;
  description?: string;
  bags?: string[]; // For recipes
}
```

### DELETE /api/wikis/{wikiId}

Delete wiki.

**Response:**
```typescript
{
  success: boolean;
}
```

## Content API (Tiddlers)

### GET /api/wikis/{wikiId}/tiddlers

List tiddlers in a wiki.

**Query Parameters:**
- `limit` (number) - Number of tiddlers to return
- `offset` (number) - Number of tiddlers to skip
- `filter` (string) - TiddlyWiki filter expression
- `fields` (string) - Comma-separated list of fields to include

**Response:**
```typescript
{
  tiddlers: Array<{
    title: string;
    fields: Record<string, any>;
    revision: string;
    modified: string;
  }>;
  total: number;
}
```

### GET /api/wikis/{wikiId}/tiddlers/{title}

Get a specific tiddler.

**Response:**
```typescript
{
  title: string;
  fields: Record<string, any>;
  revision: string;
  modified: string;
  bag: string;
}
```

### PUT /api/wikis/{wikiId}/tiddlers/{title}

Create or update a tiddler.

**Request:**
```typescript
{
  fields: Record<string, any>;
  bag?: string; // For recipes
}
```

**Response:**
```typescript
{
  title: string;
  revision: string;
  modified: string;
}
```

### DELETE /api/wikis/{wikiId}/tiddlers/{title}

Delete a tiddler.

**Response:**
```typescript
{
  success: boolean;
}
```

## Admin API

### GET /api/admin/status

Get server status and statistics (Admin only).

**Response:**
```typescript
{
  server: {
    version: string;
    uptime: number;
    memory: {
      used: number;
      total: number;
    };
  };
  database: {
    users: number;
    wikis: number;
    tiddlers: number;
    size: number;
  };
  cache: {
    hits: number;
    misses: number;
    size: number;
  };
}
```

### POST /api/admin/backup

Create a backup of the system (Admin only).

**Request:**
```typescript
{
  includeFiles?: boolean;
}
```

**Response:**
```typescript
{
  backupId: string;
  downloadUrl: string;
  size: number;
  createdAt: string;
}
```

### POST /api/admin/import

Import data from various formats (Admin only).

**Request:** FormData with file upload

**Response:**
```typescript
{
  imported: {
    users: number;
    wikis: number;
    tiddlers: number;
  };
  errors: string[];
}
```

### GET /api/admin/logs

Get server logs (Admin only).

**Query Parameters:**
- `level` (string) - Log level filter
- `limit` (number) - Number of log entries
- `since` (string) - ISO date string

**Response:**
```typescript
{
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
    meta?: any;
  }>;
}
```

## Permissions API

### GET /api/wikis/{wikiId}/permissions

Get wiki permissions.

**Response:**
```typescript
{
  acl: Array<{
    roleId: string;
    roleName: string;
    permission: "READ" | "WRITE" | "ADMIN";
  }>;
}
```

### PUT /api/wikis/{wikiId}/permissions

Update wiki permissions (Admin or wiki owner).

**Request:**
```typescript
{
  acl: Array<{
    roleId: string;
    permission: "READ" | "WRITE" | "ADMIN";
  }>;
}
```

**Response:**
```typescript
{
  success: boolean;
}
```

## Search API

### GET /api/search

Search across all accessible content.

**Query Parameters:**
- `q` (string) - Search query
- `type` (string) - Content type filter ("tiddler", "wiki", "user")
- `limit` (number) - Number of results
- `offset` (number) - Results to skip

**Response:**
```typescript
{
  results: Array<{
    type: string;
    id: string;
    title: string;
    snippet: string;
    score: number;
    wiki?: string;
  }>;
  total: number;
  took: number;
}
```

## WebSocket API

MWS provides real-time updates via WebSocket connections.

### Connection

Connect to: `ws://localhost:8080/ws` or `wss://your-domain.com/ws`

### Authentication

Send authentication message after connection:

```typescript
{
  type: "auth",
  sessionId: "session_cookie_value"
}
```

### Message Types

#### Tiddler Updates

```typescript
{
  type: "tiddler.updated",
  wiki: "wiki_id",
  tiddler: {
    title: string;
    revision: string;
    fields: Record<string, any>;
  }
}
```

#### User Presence

```typescript
{
  type: "user.presence",
  wiki: "wiki_id",
  users: Array<{
    userId: string;
    username: string;
    cursor?: {
      tiddler: string;
      position: number;
    };
  }>
}
```

#### System Notifications

```typescript
{
  type: "system.notification",
  level: "info" | "warning" | "error",
  message: string;
  timestamp: string;
}
```

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

- **Authentication**: 5 requests per minute per IP
- **General API**: 100 requests per minute per user
- **Admin API**: 50 requests per minute per admin
- **Search**: 20 requests per minute per user

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1640995200
```

## API Versioning

The current API version is `v1`. Future versions will be accessible via:

- URL versioning: `/api/v2/users`
- Header versioning: `Accept: application/vnd.mws.v2+json`

## SDK and Client Libraries

Official client libraries are planned for:

- JavaScript/TypeScript
- Python
- Go
- Rust

Community-contributed libraries are welcome.

## Examples

### JavaScript/Fetch

```javascript
// Login
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'password'
  })
});

// Get user info
const userResponse = await fetch('/api/auth/me', {
  credentials: 'include' // Include session cookie
});

// Create a wiki
const wikiResponse = await fetch('/api/wikis', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    name: 'My Wiki',
    description: 'A new wiki',
    type: 'recipe'
  })
});
```

### cURL

```bash
# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}' \
  -c cookies.txt

# Get wikis
curl -X GET http://localhost:8080/api/wikis \
  -H "Accept: application/json" \
  -b cookies.txt

# Create tiddler
curl -X PUT http://localhost:8080/api/wikis/wiki_123/tiddlers/HelloWorld \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"fields":{"text":"Hello, World!","type":"text/vnd.tiddlywiki"}}'
```

## Wiki API

TiddlyWiki-compatible API for content management. These endpoints follow TiddlyWiki's standard sync adaptor protocol.

### GET /recipes/{recipe_name}/status

Get recipe status and user permissions.

**Path Parameters:**
- `recipe_name` - Name of the recipe

**Response:**
```typescript
{
  username: string;
  isAdmin: boolean;
  isLoggedIn: boolean;
  isReadOnly: boolean;  // True if user has no write access
}
```

### GET /recipes/{recipe_name}/tiddlers.json

Get list of all tiddlers in a recipe (skinny list).

**Path Parameters:**
- `recipe_name` - Name of the recipe

**Response:**
```typescript
Array<{
  title: string;
  revision_id: string;
  is_deleted: boolean;
  bag_name: string;
  bag_id: string;
}>
```

### GET /recipes/{recipe_name}/tiddlers/{title}

Get a specific tiddler from a recipe.

**Path Parameters:**
- `recipe_name` - Name of the recipe
- `title` - Title of the tiddler

**Response:**
Raw tiddler content in TiddlyWiki format or JSON, depending on content type.

### PUT /recipes/{recipe_name}/tiddlers/{title}

Save a tiddler to a recipe (writes to the recipe's writable bag).

**Path Parameters:**
- `recipe_name` - Name of the recipe
- `title` - Title of the tiddler

**Headers:**
- `Content-Type`: `application/json` or `application/x-tiddler`
- `X-Requested-With`: `fetch` (required)

**Request Body:**
Tiddler content as JSON object or TiddlyWiki tiddler format.

**Response:**
```typescript
{
  bag_name: string;
  revision_id: string;
}
```

### DELETE /recipes/{recipe_name}/tiddlers/{title}

Delete a tiddler from a recipe.

**Path Parameters:**
- `recipe_name` - Name of the recipe
- `title` - Title of the tiddler

**Headers:**
- `X-Requested-With`: `fetch` (required)

**Response:**
```typescript
{
  bag_name: string;
  revision_id: string;
}
```

### GET /recipes/{recipe_name}/bag-states

Get aggregated state information for all bags in a recipe.

**Path Parameters:**
- `recipe_name` - Name of the recipe

**Query Parameters:**
- `last_known_revision_id[]` - Array of known revision IDs for optimization
- `include_deleted[]` - Include deleted tiddlers (`"yes"` or `"no"`)
- `gzip_stream[]` - Enable streaming compression (`"yes"` or `"no"`)

**Response:**
Streaming JSON array of tiddler states with optional compression.

### Bag-Specific Endpoints

#### GET /bags/{bag_name}/tiddlers/{title}

Get a tiddler directly from a specific bag.

#### PUT /bags/{bag_name}/tiddlers/{title}

Save a tiddler directly to a specific bag.

#### DELETE /bags/{bag_name}/tiddlers/{title}

Delete a tiddler from a specific bag.

#### POST /bags/{bag_name}/tiddlers

Upload tiddler via multipart form (for file uploads).

### Wiki Index

#### GET /wikis/{recipe_name}

Serve the complete TiddlyWiki HTML file for a recipe. This returns the full TiddlyWiki application with the recipe's configuration and initial tiddler state.

**Path Parameters:**
- `recipe_name` - Name of the recipe

**Response:**
Complete HTML document with embedded TiddlyWiki application.

## Access Control

### Recipe ACL

Recipes have read and write permissions that are checked for each request:
- **Read access** - Required for GET operations
- **Write access** - Required for PUT, POST, DELETE operations

### Bag ACL  

Individual bags can have their own access controls that override recipe permissions.

### Permission Checking

The API automatically checks permissions using:
- User roles and IDs
- Recipe and bag ACL entries
- Admin privileges (admins bypass most restrictions)

Access denied results in:
- `403 Forbidden` - User is authenticated but lacks permission
- `404 Not Found` - Resource doesn't exist or user can't see it

## Content Formats

### Tiddler JSON Format

```typescript
{
  title: string;
  text?: string;
  tags?: string;
  type?: string;
  created?: string;    // TiddlyWiki date format
  modified?: string;   // TiddlyWiki date format
  [field: string]: any; // Custom fields
}
```

### TiddlyWiki Tiddler Format

Text-based format used by TiddlyWiki:
```
title: MyTiddler
tags: [[Tag One]] [[Tag Two]]
type: text/vnd.tiddlywiki

This is the text content of the tiddler.
```

### Field Types

TiddlyWiki supports various field types:
- `text/plain` - Plain text
- `text/vnd.tiddlywiki` - TiddlyWiki markup
- `text/html` - HTML content
- `application/json` - JSON data
- `image/*` - Binary image data

## Streaming and Performance

### Chunked Responses

Large dataset endpoints support streaming JSON to improve performance:
- `/recipes/{recipe_name}/bag-states` with `gzip_stream=yes`
- Progressive loading of tiddler lists

### Compression

Optional gzip compression available for:
- Large tiddler lists
- Streaming responses
- Static file serving

### Caching

Response caching based on:
- ETags derived from revision IDs
- Last-Modified headers
- Content-based cache validation
