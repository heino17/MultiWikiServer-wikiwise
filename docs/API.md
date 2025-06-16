# MWS API Reference

## Overview

MWS provides a comprehensive REST API for managing users, wikis, content, and administrative functions. All APIs use JSON for data exchange and follow RESTful principles.

## Base URL

- Development: `http://localhost:8080/api`
- Production: `https://your-domain.com/api`

## Authentication

### Session-Based Authentication

MWS uses session cookies for authentication. After logging in, the session cookie is automatically included in subsequent requests.

```typescript
// Login request
POST /api/auth/login
{
  "username": "admin",
  "password": "password"
}

// Response
{
  "success": true,
  "user": {
    "id": "user_123",
    "username": "admin",
    "email": "admin@example.com",
    "roles": ["ADMIN"]
  }
}
```

### Headers

All API requests should include:

```
Content-Type: application/json
Accept: application/json
```

For authenticated requests, the session cookie is automatically included.

## Error Handling

All API errors follow a consistent format:

```typescript
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    // Additional error details
  }
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `500` - Internal Server Error

## Authentication API

### POST /api/auth/login

Authenticate a user and create a session.

**Request:**
```typescript
{
  username: string;
  password: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  user: {
    id: string;
    username: string;
    email: string;
    roles: string[];
  };
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
