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
- The API endpoint groups don't use a common `/api` prefix - each has its own path structure

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

All admin endpoints follow the pattern `POST /admin/{command}` and require authentication. Despite the name, they are used by all users, not just admins. 

See the routes in 

- `packages/mws/src/managers/index.ts`
- `packages/mws/src/managers/admin-users.ts`
- `packages/mws/src/managers/admin-recipes.ts`

## Session API

Authentication and session management endpoints.

See the routes in `packages/mws/src/services/sessions.ts`

## Wiki API

TiddlyWiki-compatible API for content management. These endpoints follow TiddlyWiki's standard sync adaptor protocol.

See the routes in `packages/mws/src/managers/wiki-routes.ts`

## Access Control

### Recipe ACL

Recipes have read, write, and admin permissions that are checked for each request. 

### Bag ACL  

Individual bags can have their own access controls in addition to recipe permissions.

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
  [field: string]: string; // etc
}
```

### MWS Tiddler Format

Modified TiddlyWiki tiddler format using a JSON header:
```
{ "title": "MyTiddler", "tags": "[[Tag One]] [[Tag Two]]", "type": "text/vnd.tiddlywiki" }

This is the text content of the tiddler.
```

## Streaming and Performance

### Compression

Optional gzip compression available for:
- Large tiddler lists
- Streaming responses
- Static file serving
- Concatenated GZIP streams

### Caching

Response caching based on:
- ETags derived from revision IDs
- Last-Modified headers
- Content-based cache validation
