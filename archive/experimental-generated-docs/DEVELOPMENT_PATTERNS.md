# MWS Development Patterns and Examples

## Adding New API Endpoints

This guide shows how to add new API endpoints to MWS using the type-safe routing system.

### Basic Zod Route

For standard API endpoints, use `zodRoute`:

```typescript
// packages/mws/src/managers/example-routes.ts
import { zodRoute, registerZodRoutes, RouterKeyMap, ServerRoute } from "@tiddlywiki/server";
import { serverEvents } from "@tiddlywiki/events";

export class ExampleManager {
  static defineRoutes(root: ServerRoute) {
    registerZodRoutes(root, new ExampleManager(), Object.keys(ExampleKeyMap));
  }

  // GET endpoint with path and query parameters
  getItems = zodRoute({
    method: ["GET"],
    path: "/api/items/:category",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      category: z.string().min(1)
    }),
    zodQueryParams: z => ({
      limit: z.string().transform(Number).array().optional(),
      offset: z.string().transform(Number).array().optional(),
      search: z.string().array().optional()
    }),
    inner: async (state) => {
      const { category } = state.pathParams;
      const { limit, offset, search } = state.queryParams;
      
      // Validate user permissions
      if (!state.user.isLoggedIn) {
        throw state.sendEmpty(401, { "x-reason": "authentication-required" });
      }
      
      return await state.$transaction(async (prisma) => {
        const items = await prisma.items.findMany({
          where: {
            category,
            ...(search?.[0] && {
              title: { contains: search[0] }
            })
          },
          take: limit?.[0] || 50,
          skip: offset?.[0] || 0
        });
        
        return { items, total: items.length };
      });
    }
  });

  // POST endpoint with JSON body
  createItem = zodRoute({
    method: ["POST"],
    path: "/api/items",
    bodyFormat: "json",
    securityChecks: { requestedWithHeader: true },
    zodRequestBody: z => z.object({
      title: z.string().min(1).max(200),
      category: z.string().min(1),
      description: z.string().optional(),
      tags: z.array(z.string()).optional()
    }),
    inner: async (state) => {
      const { title, category, description, tags } = state.data;
      
      // Check write permissions
      await state.assertUserPermission("WRITE");
      
      return await state.$transaction(async (prisma) => {
        const item = await prisma.items.create({
          data: {
            title,
            category,
            description,
            tags: tags?.join(" ") || "",
            owner_id: state.user.user_id,
            created_at: new Date()
          }
        });
        
        // Emit event for other systems
        await serverEvents.emitAsync("item.created", item);
        
        return item;
      });
    }
  });
}

export const ExampleKeyMap: RouterKeyMap<ExampleManager, true> = {
  getItems: true,
  createItem: true,
};

// Register routes on server startup
serverEvents.on("mws.routes", (root) => {
  ExampleManager.defineRoutes(root);
});
```

### Admin API Endpoints

For admin-only endpoints, use the `admin` helper:

```typescript
// packages/mws/src/managers/admin-examples.ts
import { admin } from "./admin-utils";
import { registerZodRoutes, RouterKeyMap, ServerRoute } from "@tiddlywiki/server";
import { serverEvents } from "@tiddlywiki/events";

export class AdminExampleManager {
  static defineRoutes(root: ServerRoute) {
    registerZodRoutes(root, new AdminExampleManager(), Object.keys(AdminExampleKeyMap));
  }

  // POST /admin/system_stats
  system_stats = admin(z => z.undefined(), async (state, prisma) => {
    // Automatically authenticated and in transaction
    if (!state.user.isAdmin) {
      throw "Only administrators can view system statistics";
    }

    const userCount = await prisma.users.count();
    const bagCount = await prisma.bags.count();
    const recipeCount = await prisma.recipes.count();
    const tiddlerCount = await prisma.tiddlers.count({
      where: { is_deleted: false }
    });

    return {
      users: userCount,
      bags: bagCount,
      recipes: recipeCount,
      tiddlers: tiddlerCount,
      timestamp: new Date().toISOString()
    };
  });

  // POST /admin/user_bulk_update
  user_bulk_update = admin(z => z.object({
    user_ids: z.array(z.string().uuid()),
    updates: z.object({
      role_id: z.string().uuid().optional(),
      is_active: z.boolean().optional()
    })
  }), async (state, prisma) => {
    const { user_ids, updates } = state.data;
    
    if (!state.user.isAdmin) {
      throw "Only administrators can bulk update users";
    }

    const updatedUsers = await prisma.users.updateMany({
      where: { user_id: { in: user_ids } },
      data: updates
    });

    await serverEvents.emitAsync("users.bulk_updated", { 
      user_ids, 
      updates, 
      admin_id: state.user.user_id 
    });

    return { updated_count: updatedUsers.count };
  });
}

export const AdminExampleKeyMap: RouterKeyMap<AdminExampleManager, true> = {
  system_stats: true,
  user_bulk_update: true,
};

serverEvents.on("mws.routes", (root) => {
  AdminExampleManager.defineRoutes(root);
});
```

### Custom Authentication Routes

For authentication-related endpoints, use `zodSession`:

```typescript
// packages/mws/src/services/auth-examples.ts
import { zodSession, registerZodRoutes, RouterKeyMap, ServerRoute } from "@tiddlywiki/server";
import { createHash } from "node:crypto";

export class AuthExampleManager {
  static defineRoutes(root: ServerRoute) {
    registerZodRoutes(root, new AuthExampleManager(), Object.keys(AuthExampleKeyMap));
  }

  // POST /auth/password-reset-request
  password_reset_request = zodSession("/auth/password-reset-request", z => z.object({
    email: z.string().email()
  }), async (state, prisma) => {
    const { email } = state.data;

    const user = await prisma.users.findUnique({
      where: { email }
    });

    if (!user) {
      // Don't reveal if email exists
      return { success: true, message: "If email exists, reset link sent" };
    }

    // Generate reset token
    const resetToken = createHash('sha256').update(
      user.user_id + Date.now() + Math.random()
    ).digest('hex');

    await prisma.password_resets.create({
      data: {
        user_id: user.user_id,
        token: resetToken,
        expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        created_at: new Date()
      }
    });

    // In real implementation, send email here
    await sendPasswordResetEmail(user.email, resetToken);

    return { success: true, message: "Reset link sent to email" };
  });

  // POST /auth/password-reset-confirm  
  password_reset_confirm = zodSession("/auth/password-reset-confirm", z => z.object({
    token: z.string(),
    new_password: z.string().min(8)
  }), async (state, prisma) => {
    const { token, new_password } = state.data;

    const reset = await prisma.password_resets.findFirst({
      where: {
        token,
        expires_at: { gt: new Date() },
        used_at: null
      },
      include: { user: true }
    });

    if (!reset) {
      throw "Invalid or expired reset token";
    }

    // Hash new password
    const password_hash = await hashPassword(new_password);

    // Update password and mark reset as used
    await prisma.$transaction([
      prisma.users.update({
        where: { user_id: reset.user_id },
        data: { password_hash }
      }),
      prisma.password_resets.update({
        where: { id: reset.id },
        data: { used_at: new Date() }
      })
    ]);

    return { success: true, message: "Password updated successfully" };
  });
}

export const AuthExampleKeyMap: RouterKeyMap<AuthExampleManager, true> = {
  password_reset_request: true,
  password_reset_confirm: true,
};
```

### Stream Processing Routes

For handling file uploads or streaming data:

```typescript
// File upload endpoint
handleFileUpload = zodRoute({
  method: ["POST"],
  path: "/api/files/upload/:category",
  bodyFormat: "stream",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({
    category: z.enum(["images", "documents", "archives"])
  }),
  inner: async (state) => {
    const { category } = state.pathParams;
    
    // Check upload permissions
    await state.assertUserPermission("UPLOAD");
    
    // Process multipart upload
    const uploadedFiles = await processMultipartUpload(state, {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: category === "images" ? 
        ["image/jpeg", "image/png", "image/gif"] :
        ["application/pdf", "text/plain"]
    });
    
    return await state.$transaction(async (prisma) => {
      const fileRecords = await Promise.all(
        uploadedFiles.map(file => 
          prisma.files.create({
            data: {
              filename: file.originalName,
              path: file.savedPath,
              size: file.size,
              mime_type: file.mimeType,
              category,
              owner_id: state.user.user_id,
              uploaded_at: new Date()
            }
          })
        )
      );
      
      return { files: fileRecords };
    });
  }
});

// Streaming export endpoint
exportData = zodRoute({
  method: ["GET"],
  path: "/api/export/:format",
  bodyFormat: "ignore",
  zodPathParams: z => ({
    format: z.enum(["json", "csv", "xml"])
  }),
  zodQueryParams: z => ({
    from_date: z.string().datetime().array().optional(),
    to_date: z.string().datetime().array().optional()
  }),
  inner: async (state) => {
    const { format } = state.pathParams;
    const { from_date, to_date } = state.queryParams;
    
    // Set streaming headers
    state.setHeader("Content-Type", 
      format === "json" ? "application/json" :
      format === "csv" ? "text/csv" :
      "application/xml"
    );
    state.setHeader("Content-Disposition", 
      `attachment; filename="export.${format}"`
    );
    
    // Stream data in chunks
    const query = {
      where: {
        ...(from_date?.[0] && { created_at: { gte: new Date(from_date[0]) } }),
        ...(to_date?.[0] && { created_at: { lte: new Date(to_date[0]) } })
      }
    };
    
    if (format === "json") {
      state.write('[');
      let first = true;
      
      await state.$transaction(async (prisma) => {
        const cursor = prisma.data.findMany({
          ...query,
          orderBy: { created_at: 'asc' }
        });
        
        for await (const record of cursor) {
          if (!first) state.write(',');
          state.write(JSON.stringify(record));
          first = false;
          
          // Flush periodically for large datasets
          if (Math.random() < 0.1) {
            await state.splitCompressionStream();
          }
        }
      });
      
      state.write(']');
    }
    
    throw state.end(); // Return STREAM_ENDED symbol
  }
});
```

### Error Handling Patterns

```typescript
// Custom error types
class ValidationError extends Error {
  constructor(message: string, public field: string) {
    super(message);
    this.name = "ValidationError";
  }
}

class PermissionError extends Error {
  constructor(message: string, public required: string) {
    super(message);
    this.name = "PermissionError";
  }
}

// Route with comprehensive error handling
complexOperation = zodRoute({
  method: ["POST"],
  path: "/api/complex/:operation_type",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({
    operation_type: z.enum(["analyze", "transform", "validate"])
  }),
  zodRequestBody: z => z.object({
    data: z.record(z.any()),
    options: z.object({
      timeout: z.number().max(300).optional(),
      validate_only: z.boolean().optional()
    }).optional()
  }),
  inner: async (state) => {
    const { operation_type } = state.pathParams;
    const { data, options } = state.data;
    
    try {
      // Validate business rules
      if (operation_type === "transform" && !data.source) {
        throw new ValidationError("Source data required for transform", "source");
      }
      
      // Check specific permissions
      const requiredPermission = operation_type.toUpperCase();
      if (!state.user.hasPermission(requiredPermission)) {
        throw new PermissionError(
          `${requiredPermission} permission required`, 
          requiredPermission
        );
      }
      
      // Perform operation with timeout
      const result = await Promise.race([
        performComplexOperation(operation_type, data, options),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Operation timeout")), 
          (options?.timeout || 60) * 1000)
        )
      ]);
      
      return { 
        success: true, 
        result,
        operation_type,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      if (error instanceof ValidationError) {
        throw state.sendString(400, 
          { "x-reason": "validation-error", "x-field": error.field },
          error.message, "utf8"
        );
      }
      
      if (error instanceof PermissionError) {
        throw state.sendString(403,
          { "x-reason": "permission-denied", "x-required": error.required },
          error.message, "utf8"
        );
      }
      
      // Log unexpected errors
      console.error("Complex operation failed:", error);
      throw state.sendString(500, {},
        "Internal server error", "utf8"
      );
    }
  }
});
```

### Integration with Server Events

```typescript
// Event-driven route that triggers other systems
createNotification = admin(z => z.object({
  user_id: z.string().uuid(),
  type: z.enum(["info", "warning", "error"]),
  title: z.string(),
  message: z.string(),
  expires_at: z.string().datetime().optional()
}), async (state, prisma) => {
  const notificationData = state.data;
  
  const notification = await prisma.notifications.create({
    data: {
      ...notificationData,
      created_by: state.user.user_id,
      created_at: new Date(),
      expires_at: notificationData.expires_at ? 
        new Date(notificationData.expires_at) : 
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    }
  });
  
  // Trigger real-time notification
  await serverEvents.emitAsync("notification.created", {
    notification,
    recipient_id: notificationData.user_id
  });
  
  // Trigger email if high priority
  if (notificationData.type === "error") {
    await serverEvents.emitAsync("email.send", {
      to: notificationData.user_id,
      template: "urgent_notification",
      data: notification
    });
  }
  
  return notification;
});

// Listen for events from other parts of the system
serverEvents.on("user.created", async (user) => {
  // Auto-create welcome notification
  await prisma.notifications.create({
    data: {
      user_id: user.user_id,
      type: "info",
      title: "Welcome to MWS",
      message: "Your account has been created successfully",
      created_at: new Date()
    }
  });
});
```

### Testing Routes

```typescript
// test/routes/example.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTestServer, createTestUser } from "../helpers/test-setup";
import { ExampleManager } from "../../src/managers/example-routes";

describe("Example Routes", () => {
  let server: TestServer;
  let user: TestUser;
  
  beforeEach(async () => {
    server = await createTestServer();
    user = await createTestUser(server, { isAdmin: false });
  });
  
  describe("GET /api/items/:category", () => {
    it("should return items for valid category", async () => {
      // Seed test data
      await server.prisma.items.createMany({
        data: [
          { title: "Item 1", category: "books", owner_id: user.user_id },
          { title: "Item 2", category: "books", owner_id: user.user_id }
        ]
      });
      
      const response = await server.request
        .get("/api/items/books")
        .set("Cookie", user.sessionCookie)
        .expect(200);
        
      expect(response.body).toEqual({
        items: expect.arrayContaining([
          expect.objectContaining({ title: "Item 1", category: "books" }),
          expect.objectContaining({ title: "Item 2", category: "books" })
        ]),
        total: 2
      });
    });
    
    it("should require authentication", async () => {
      await server.request
        .get("/api/items/books")
        .expect(401);
    });
    
    it("should validate path parameters", async () => {
      await server.request
        .get("/api/items/")  // Empty category
        .set("Cookie", user.sessionCookie)
        .expect(404);
    });
  });
  
  describe("POST /api/items", () => {
    it("should create new item with valid data", async () => {
      const itemData = {
        title: "New Item",
        category: "books",
        description: "A test item",
        tags: ["test", "example"]
      };
      
      const response = await server.request
        .post("/api/items")
        .set("Cookie", user.sessionCookie)
        .set("X-Requested-With", "fetch")
        .send(itemData)
        .expect(200);
        
      expect(response.body).toMatchObject({
        title: "New Item",
        category: "books",
        owner_id: user.user_id
      });
      
      // Verify in database
      const saved = await server.prisma.items.findFirst({
        where: { title: "New Item" }
      });
      expect(saved).toBeTruthy();
    });
    
    it("should validate request body", async () => {
      await server.request
        .post("/api/items")
        .set("Cookie", user.sessionCookie)
        .set("X-Requested-With", "fetch")
        .send({ title: "" }) // Invalid - empty title
        .expect(400);
    });
    
    it("should require CSRF header", async () => {
      await server.request
        .post("/api/items")
        .set("Cookie", user.sessionCookie)
        // Missing X-Requested-With header
        .send({ title: "Test", category: "books" })
        .expect(403);
    });
  });
});
```

### Best Practices Summary

1. **Type Safety**: Always define comprehensive Zod schemas
2. **Security**: Use appropriate `securityChecks` and permission validation
3. **Error Handling**: Provide clear, actionable error messages
4. **Transactions**: Use database transactions for data consistency
5. **Events**: Emit events for system integration and extensibility
6. **Testing**: Write comprehensive tests for all routes
7. **Documentation**: Document API endpoints and expected behavior
8. **Performance**: Consider streaming for large datasets
9. **Validation**: Validate at multiple levels (Zod, business rules, permissions)
10. **Monitoring**: Log errors and emit metrics for observability
