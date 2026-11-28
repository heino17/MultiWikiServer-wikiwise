// Own profile picture — one image per account.
//
// The bytes are content-addressed under `store/avatars/<sha256>.<ext>`, the
// metadata lives on the `users` row. This is deliberately separate from the
// user files ("Meine Dateien"): an avatar is not a shareable file and must not
// appear in that list. Only the account owner may upload or remove a picture;
// admins and teachers may read the pictures of the accounts they see in the
// user list, but never change them.
//
// Input follows the Tiddlyhost fork: JPEG, PNG, GIF and WebP, at most 256 px
// and 100 KB after processing. An oversized picture is scaled down first; only
// one that still cannot meet the limits is rejected with a clear message.

import { zodRoute } from "@tiddlywiki/server";
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp, { type Sharp } from "sharp";
import { avatarUrlFor } from "./sessions";

const AVATAR_MAX_DIMENSION = 256;
const AVATAR_MAX_BYTES = 100 * 1024;
/** Raw upload cap, enforced while streaming so the spool cannot grow without
 *  bound. The final picture must still pass the much smaller 100 KB limit. */
const AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};
/** Only extensions this module ever writes are accepted on the way back out. */
const ALLOWED_EXTENSIONS = new Set(Object.values(MIME_EXTENSIONS));

/** Detect the real image type from magic bytes. The multipart content type is
 *  client-controlled and is deliberately not trusted for the allowlist. */
function detectImageMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 6 && (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a")) return "image/gif";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

function encode(pipeline: Sharp, mime: string): Promise<Buffer> {
  switch (mime) {
    case "image/jpeg": return pipeline.jpeg({ quality: 84, mozjpeg: true }).toBuffer();
    case "image/png": return pipeline.png({ compressionLevel: 9, palette: true }).toBuffer();
    case "image/gif": return pipeline.gif().toBuffer();
    case "image/webp": return pipeline.webp({ quality: 84 }).toBuffer();
    default: throw new Error("Unsupported image type");
  }
}

/** Downscale aspect-preservingly to at most 256 × 256. If the original format
 *  cannot meet the 100 KB limit, fall back to WebP before rejecting. */
async function prepareAvatar(spoolPath: string, mime: string): Promise<{ bytes: Buffer; contentType: string; extension: string }> {
  const pipeline = () => sharp(spoolPath, { failOn: "error", limitInputPixels: 20_000_000 })
    .rotate()
    .resize({ width: AVATAR_MAX_DIMENSION, height: AVATAR_MAX_DIMENSION, fit: "inside", withoutEnlargement: true });

  let contentType = mime;
  let extension = MIME_EXTENSIONS[mime];
  let bytes = await encode(pipeline(), mime);
  if (bytes.length > AVATAR_MAX_BYTES) {
    contentType = "image/webp";
    extension = "webp";
    bytes = await pipeline().webp({ quality: 78 }).toBuffer();
  }
  if (bytes.length > AVATAR_MAX_BYTES)
    throw new Error("Picture is still too large after scaling.");

  // The metadata check is on the encoded result, not on the claimed headers.
  const info = await sharp(bytes).metadata();
  if ((info.width ?? 0) > AVATAR_MAX_DIMENSION || (info.height ?? 0) > AVATAR_MAX_DIMENSION)
    throw new Error("Picture dimensions exceed the limit.");

  return { bytes, contentType, extension };
}

function avatarPath(storePath: string, sha256: string, extension: string): string {
  return resolve(storePath, "avatars", `${sha256}.${extension}`);
}

/** Upload or replace the current user's own picture. */
export const AvatarUpload = zodRoute({
  method: ["PUT"],
  path: "/api/users/me/avatar",
  bodyFormat: "stream",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/", "/wiki", "/profile"]);
    state.asserted = true;

    const storePath = state.config.storePath as string;
    const inboxPath = resolve(storePath, "inbox", `avatar-${Date.now()}-${randomBytes(6).toString("hex")}`);
    mkdirSync(inboxPath, { recursive: true });
    const spoolPath = join(inboxPath, "0");

    const part: {
      stream: ReturnType<typeof createWriteStream> | null;
      length: number;
      overLimit: boolean;
    } = { stream: null, length: 0, overLimit: false };

    try {
      await state.readMultipartData({
        cbPartStart: async (p) => {
          if (part.stream || !p.filename) return;
          part.stream = createWriteStream(spoolPath);
        },
        cbPartChunk: async (_p, chunk) => {
          if (!part.stream) return;
          part.length += chunk.length;
          if (part.length > AVATAR_MAX_INPUT_BYTES) {
            part.overLimit = true;
            return;
          }
          if (part.overLimit) return;
          await new Promise<void>((res) => {
            part.stream!.write(chunk) ? res() : part.stream!.once("drain", () => res());
          });
        },
        cbPartEnd: async (p) => {
          if (!part.stream || !p.filename) return;
          await new Promise<void>((res) => part.stream!.end(() => res()));
        },
      });
    } catch (e) {
      rmSync(inboxPath, { recursive: true, force: true });
      throw e;
    }

    if (part.overLimit) {
      rmSync(inboxPath, { recursive: true, force: true });
      throw state.sendEmpty(413, {
        "x-reason": "Picture too large",
        "x-max-bytes": String(AVATAR_MAX_INPUT_BYTES),
      });
    }
    if (!part.stream || !existsSync(spoolPath)) {
      rmSync(inboxPath, { recursive: true, force: true });
      throw state.sendEmpty(400, { "x-reason": "Missing picture" });
    }
    part.stream.destroy();

    try {
      const raw = readFileSync(spoolPath);
      const mime = detectImageMime(raw);
      if (!mime || !MIME_EXTENSIONS[mime])
        throw state.sendEmpty(415, { "x-reason": "Unsupported image type" });

      const prepared = await prepareAvatar(spoolPath, mime);
      const sha256 = createHash("sha256").update(prepared.bytes).digest("hex");
      mkdirSync(resolve(storePath, "avatars"), { recursive: true });
      const dataPath = avatarPath(storePath, sha256, prepared.extension);
      if (!existsSync(dataPath)) writeFileSync(dataPath, prepared.bytes);

      await state.$transaction(async prisma => {
        await prisma.users.update({
          where: { user_id: state.user.user_id },
          data: {
            avatar_sha256: sha256,
            avatar_content_type: prepared.contentType,
            avatar_extension: prepared.extension,
            avatar_size_bytes: prepared.bytes.length,
          },
        });
      });
      rmSync(inboxPath, { recursive: true, force: true });

      return { avatarUrl: avatarUrlFor(state.user.user_id, sha256, state.pathPrefix) };
    } catch (e) {
      // sendEmpty returns a sentinel that must reach the router, so don't
      // wrap it in another error — only clean up the spool on the way out.
      rmSync(inboxPath, { recursive: true, force: true });
      throw e;
    }
  },
});

/** Remove the current user's picture. The bytes stay on disk: content-addressed
 *  files are deduplicated, and deleting them could break another account that
 *  uploaded the very same image. */
export const AvatarRemove = zodRoute({
  method: ["PUT"],
  path: "/api/users/me/avatar/remove",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/", "/wiki", "/profile"]);
    state.asserted = true;
    await state.$transaction(async prisma => {
      await prisma.users.update({
        where: { user_id: state.user.user_id },
        data: {
          avatar_sha256: null,
          avatar_content_type: null,
          avatar_extension: null,
          avatar_size_bytes: null,
        },
      });
    });
    return { avatarUrl: "" };
  },
});

/** Serve the picture. Same-origin URL only; an <img> request has no
 *  X-Requested-With header, so this route deliberately has no CSRF header
 *  check. The session cookie is still required, and the referer must be one of
 *  ours. Readers are limited to the account itself and the accounts an admin
 *  or teacher sees in the user list; nobody can change another user's picture. */
export const AvatarGet = zodRoute({
  method: ["GET", "HEAD"],
  path: "/api/users/:user_id/avatar",
  bodyFormat: "ignore",
  zodPathParams: z => ({
    user_id: z.prismaField("Users", "user_id", "string"),
  }),
  /** Cache-busting key added by avatarUrlFor(); the value is unused here. */
  zodQueryKeys: ["v"],
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/", "/wiki", "/profile"]);
    state.asserted = true;
    const userId = state.pathParams.user_id;
    // The user list shows an admin every account and a teacher only their own
    // and invited accounts. The picture route uses the same scope, so seeing a
    // row always implies being allowed to load its avatar.
    const visible = state.user.isAdmin
      ? { user_id: userId }
      : { user_id: userId, OR: [
          { user_id: state.user.user_id },
          { owner_user_id: state.user.user_id },
        ] };
    const row = await state.$transaction(async prisma => prisma.users.findFirst({
      where: visible,
      select: {
        avatar_sha256: true,
        avatar_content_type: true,
        avatar_extension: true,
        avatar_size_bytes: true,
      },
    }));
    if (!row)
      throw state.sendEmpty(403, { "x-reason": "Not your picture" });
    if (!row.avatar_sha256 || !row.avatar_extension
      || !ALLOWED_EXTENSIONS.has(row.avatar_extension)
      || !/^[a-f0-9]{64}$/.test(row.avatar_sha256))
      return state.sendEmpty(404, { cacheControl: "no-store" });

    const contentType = Object.entries(MIME_EXTENSIONS)
      .find(([, extension]) => extension === row.avatar_extension)?.[0]
      ?? "application/octet-stream";
    const dataPath = avatarPath(state.config.storePath as string, row.avatar_sha256, row.avatar_extension);
    if (!existsSync(dataPath))
      return state.sendEmpty(404, { cacheControl: "no-store" });

    const bytes = readFileSync(dataPath);
    const etag = `"${row.avatar_sha256}"`;
    const headers = {
      contentType: { mediaType: contentType },
      cacheControl: "private, no-cache",
      etag,
    };
    if (state.headers.get("if-none-match")?.split(",").map(e => e.trim()).includes(etag))
      return state.sendEmpty(304, headers);
    if (state.method === "HEAD")
      return state.sendEmpty(200, { ...headers, contentLength: bytes.length });
    return state.sendBuffer(200, { ...headers, contentLength: bytes.length }, bytes);
  },
});
