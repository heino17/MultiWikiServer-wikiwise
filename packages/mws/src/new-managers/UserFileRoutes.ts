// User file endpoints — per-account file uploads ("Meine Dateien").
//
// The bytes live on disk in a content-addressed store:
//   store/files/<sha256>/data.<ext>   (one data file per content hash)
//   store/files/<sha256>/meta.json
// which is exactly the layout the admin StorageRoutes audit understands.
// Only metadata (owner, name, type, hash, size) is kept in the `user_file`
// table. Sharing/permissions will be a separate step building on this.

import { SendError, tryParseJSON, zodRoute } from "@tiddlywiki/server";
import { createHash } from "crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { basename, join, resolve } from "path";

const HASH_RE = /^[a-f0-9]{64}$/;

/** Best extension for a MIME type, with a leading dot ("" when unknown). */
function extensionForType(type: string): string {
  const known: Record<string, string> = {
    "application/json": ".json",
    "application/gzip": ".gz",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
    "image/avif": ".avif",
    "text/plain": ".txt",
    "text/html": ".html",
    "text/csv": ".csv",
    "text/markdown": ".md",
    "text/vnd.tiddlywiki": ".tid",
    "text/css": ".css",
    "text/javascript": ".js",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-msvideo": ".avi",
  };
  return known[type] ?? "";
}

function sanitizeFilename(name: string): string {
  const base = basename(name)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!base) return "file";
  return base.slice(0, 240);
}

function userFileDir(storePath: string, sha256: string) {
  return resolve(storePath, "files", sha256);
}

/** Path to the content-addressed file for a hash, or null when missing. */
function storedFile(storePath: string, sha256: string): { dataPath: string; meta: any } | null {
  const dir = userFileDir(storePath, sha256);
  const metaPath = join(dir, "meta.json");
  if (!existsSync(metaPath)) return null;
  const meta = tryParseJSON<any>(readFileSync(metaPath, "utf8"));
  if (!meta?.filename) return null;
  const dataPath = join(dir, String(meta.filename));
  if (!existsSync(dataPath)) return null;
  return { dataPath, meta };
}

interface UserFileRow {
  id: string;
  filename: string;
  type: string;
  sizeBytes: number;
  createdAt: string;
}

/** Rows may also carry `user_id` (raw row) and `owner` (username, admin paths). */
function mapFile(row: any): UserFileRow {
  return {
    id: row.id,
    filename: row.filename,
    type: row.type,
    sizeBytes: row.sizeBytes,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** Multipart upload of a single file. Streams to the inbox, hashes while
 *  streaming, then adopts the bytes into the content-addressed store. */
export const UserFileUpload = zodRoute({
  method: ["PUT"],
  path: "/api/user-files/upload",
  bodyFormat: "stream",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/"]);

    const storePath = state.config.storePath as string;
    const maxBytes = state.config.userFileSizeLimit;

    const inboxName = new Date().toISOString().replace(/:/g, "-");
    const inboxPath = resolve(storePath, "inbox", inboxName);
    mkdirSync(inboxPath, { recursive: true });

    // The part is tracked inside an object holder: TypeScript's control-flow
    // narrows a `let` that is reassigned inside async callbacks to `never`
    // after the await, so we mutate the holder's property instead.
    const partState: {
      part: ({
        originalFilename: string;
        type: string;
        length: number;
        hash: string;
        hasher: ReturnType<typeof createHash>;
        spoolPath: string;
        stream: ReturnType<typeof createWriteStream>;
      } | null);
    } = { part: null };

    let overLimit = false;

    try {
      await state.readMultipartData({
        cbPartStart: async (p) => {
          if (partState.part || !p.filename) return;
          const spoolPath = resolve(inboxPath, "0");
          partState.part = {
            originalFilename: p.filename,
            type: p.headers.contentType?.mediaType ?? "application/octet-stream",
            length: 0,
            hash: "",
            hasher: createHash("sha256"),
            spoolPath,
            stream: createWriteStream(spoolPath),
          };
        },
        cbPartChunk: async (p, chunk) => {
          const part = partState.part;
          if (!part || !p.filename) return;
          part.length += chunk.length;
          if (part.length > maxBytes) {
            // keep consuming the request body, but discard the rest
            overLimit = true;
            return;
          }
          if (overLimit) return;
          part.hasher.update(chunk);
          await new Promise<void>((res) => {
            part.stream.write(chunk) ? res() : part.stream.once("drain", () => res());
          });
        },
        cbPartEnd: async (p) => {
          const part = partState.part;
          if (!part || !p.filename) return;
          await new Promise<void>((res) => part.stream.end(() => res()));
          part.hash = part.hasher.digest("hex");
        },
      });
    } catch (e) {
      rmSync(inboxPath, { recursive: true, force: true });
      throw e;
    }

    if (overLimit) {
      rmSync(inboxPath, { recursive: true, force: true });
      throw state.sendEmpty(413, { "x-reason": "File too large", "x-max-bytes": String(maxBytes) });
    }
    const part = partState.part;
    if (!part) {
      rmSync(inboxPath, { recursive: true, force: true });
      throw state.sendEmpty(400, { "x-reason": "Missing file" });
    }
    part.stream.destroy();

    const { hash, length, type, originalFilename } = part;
    const filename = sanitizeFilename(originalFilename);
    const extension = extensionForType(type);
    const dir = userFileDir(storePath, hash);
    mkdirSync(dir, { recursive: true });
    const dataPath = join(dir, "data" + extension);
    if (existsSync(dataPath)) {
      rmSync(part.spoolPath, { force: true });
    } else {
      renameSync(part.spoolPath, dataPath);
    }
    writeFileSync(join(dir, "meta.json"), JSON.stringify({
      contentHash: hash,
      filename: "data" + extension,
      type,
      originalFilename: filename,
      user_id: state.user.user_id,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
    }, null, 4));

    rmSync(inboxPath, { recursive: true, force: true });

    state.asserted = true;
    const row = await state.$transaction(async (prisma) => {
      return await prisma.userFile.create({
        data: {
          user_id: state.user.user_id,
          filename,
          type,
          extension: extension.replace(/^\./, ""),
          sha256: hash,
          sizeBytes: length,
        },
      });
    });

    return { file: mapFile(row) };
  }
});

/** List — own files for regular users; every file (with owner) for admins. */
export const UserFileList = zodRoute({
  method: ["GET"],
  path: "/api/user-files/list",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/", "/wiki"]);
    state.asserted = true;

    const isAdmin = state.user.isAdmin;
    const rows = await state.$transaction(async (prisma) => {
      return await prisma.userFile.findMany({
        where: isAdmin ? {} : { user_id: state.user.user_id },
        orderBy: { created_at: "desc" },
      });
    });

    let ownerNames = new Map<string, string>();
    if (isAdmin && rows.length) {
      const ids = Array.from(new Set(rows.map(row => row.user_id)));
      const users = await state.$transaction(async (prisma) => {
        return await prisma.users.findMany({
          where: { user_id: { in: ids } },
          select: { user_id: true, username: true },
        });
      });
      ownerNames = new Map(users.map(user => [user.user_id, user.username]));
    }

    const files = rows.map(row => ({
      ...mapFile(row),
      owner: isAdmin ? (ownerNames.get(row.user_id) ?? row.user_id) : null,
    }));
    return { files };
  }
});

/** Stream the current user's file down to the client. */
export const UserFileDownload = zodRoute({
  method: ["GET"],
  path: "/api/user-files/download",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodQueryKeys: ["id"],
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/", "/wiki"]);

    const id = state.query.get("id") ?? "";
    state.asserted = true;
    const isAdmin = state.user.isAdmin;
    const row = await state.$transaction(async (prisma) => {
      return await prisma.userFile.findFirst({
        where: isAdmin ? { id } : { id, user_id: state.user.user_id },
      });
    });
    if (!row || !HASH_RE.test(row.sha256))
      throw state.sendEmpty(404, { "x-reason": "Unknown file" });

    const stored = storedFile(state.config.storePath as string, row.sha256);
    if (!stored)
      throw state.sendEmpty(404, { "x-reason": "File not found on disk" });

    const contentDisposition =
      `attachment; filename*="UTF-8''${encodeURIComponent(row.filename)}"; filename="${encodeURIComponent(row.filename).replace(/"/g, "%22")}"`;

    return state.sendStream(200, {
      contentType: { mediaType: row.type },
      contentDisposition,
      cacheControl: "private, max-age=60",
    }, createReadStream(stored.dataPath));
  }
});

/** Delete one of the current user's files. The bytes are removed from the
 *  content-addressed store only when no other file entry references them. */
export const UserFileDelete = zodRoute({
  method: ["PUT"],
  path: "/api/user-files/delete",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({
    id: z.string().min(1).max(120),
  }),
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/", "/wiki"]);

    const { id } = state.data;
    state.asserted = true;
    const isAdmin = state.user.isAdmin;
    const result = await state.$transaction(async (prisma) => {
      const row = await prisma.userFile.findFirst({
        where: isAdmin ? { id } : { id, user_id: state.user.user_id },
      });
      if (!row) return null;
      await prisma.userFile.delete({ where: { id } });
      const refs = await prisma.userFile.count({ where: { sha256: row.sha256 } });
      return { sha256: row.sha256, refs };
    });
    if (!result) throw state.sendEmpty(404, { "x-reason": "Unknown file" });

    if (result.refs === 0)
      rmSync(userFileDir(state.config.storePath as string, result.sha256), { recursive: true, force: true });

    return { deleted: true };
  }
});