// User file endpoints — per-account file uploads ("Meine Dateien").
//
// The bytes live on disk in a content-addressed store:
//   store/files/<sha256>/data.<ext>   (one data file per content hash)
//   store/files/<sha256>/meta.json
// which is exactly the layout the admin StorageRoutes audit understands.
// Only metadata (owner, name, type, hash, size) is kept in the `user_file`
// table; who a file is shared with lives in `user_file_share`.

import { SendError, tryParseJSON, zodRoute } from "@tiddlywiki/server";
import { createHash } from "crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { basename, join, resolve } from "path";

const HASH_RE = /^[a-f0-9]{64}$/;

const SYSTEM_ROLES = ["ADMIN", "USER", "ANON"];

/** Who a file with share scopes is visible to.
 *
 *  Owners always see their own files and admins see everything. Otherwise the
 *  sharer's account type decides:
 *  - admin shares reach everyone;
 *  - teacher shares reach admins and members of the roles the teacher chose —
 *    other teachers never see them;
 *  - student shares reach only the specific recipients the student chose
 *    (their classmates and teachers).
 */
function shareGrantsVisibility(
  owner: { userId: string; isAdmin: boolean; isTeacher: boolean },
  viewer: { userId: string; isAdmin: boolean; isTeacher: boolean; roleIds: Set<string> },
  shares: { scope_type: string; scope_id: string | null }[],
): boolean {
  if (viewer.userId === owner.userId) return true;
  if (viewer.isAdmin) return true;
  if (owner.isAdmin) return true;
  // Teachers can neither see nor be addressed by other teachers.
  if (owner.isTeacher && viewer.isTeacher) return false;
  return shares.some((scope) => {
    if (scope.scope_type === "GLOBAL") return true;
    if (scope.scope_type === "ROLE") return !!scope.scope_id && viewer.roleIds.has(scope.scope_id);
    if (scope.scope_type === "USER") return scope.scope_id === viewer.userId;
    return false;
  });
}

/** The share options the current user may pick, mirroring the matrix:
 *  - admin: "everyone" plus each group and each individual user;
 *  - teacher: the class groups they belong to or own, plus each student
 *    (non-teacher, non-admin account) individually and the admin account.
 *    No "everyone"; other teachers are excluded as recipients by
 *    `shareGrantsVisibility`;
 *  - student: their classmates and teachers individually (no "everyone").
 */
function shareTargetsFor(
  user: { isAdmin: boolean; isTeacher: boolean },
  targets: { roles: { role_id: string; role_name: string }[]; users: { user_id: string; username: string }[] },
): { global: boolean; roles: { id: string; name: string }[]; users: { id: string; name: string }[] } {
  const roles = targets.roles.map(role => ({ id: role.role_id, name: role.role_name }));
  const users = targets.users.map(userItem => ({ id: userItem.user_id, name: userItem.username }));
  if (user.isAdmin) return { global: true, roles, users };
  return { global: false, roles, users };
}

/** Roles a teacher may share with: the group roles they belong to or own,
 *  minus system roles, teacher-bearing roles and their own personal role. */
async function collectAllowedShareRoles(
  prisma: any,
  user: {
    user_id: string;
    username: string;
    isTeacher: boolean;
    roles: { role_id: string; role_name: string; is_teacher: boolean }[];
  },
): Promise<{ role_id: string; role_name: string }[]> {
  if (!user.isTeacher) return [];
  const owned = await prisma.roles.findMany({
    where: { owner_user_id: user.user_id },
    select: { role_id: true, role_name: true, is_teacher: true },
  });
  const fromMember = user.roles.filter(
    role => !SYSTEM_ROLES.includes(role.role_name) && !role.is_teacher && role.role_name !== user.username,
  );
  const fromOwned = (owned as { role_id: string; role_name: string; is_teacher: boolean }[]).filter(
    role => !SYSTEM_ROLES.includes(role.role_name) && !role.is_teacher && role.role_name !== user.username,
  );
  const allowed = new Map<string, string>();
  for (const role of [...fromMember, ...fromOwned]) allowed.set(role.role_id, role.role_name);
  return [...allowed].map(([role_id, role_name]) => ({ role_id, role_name }));
}

/** All recipients the current user may address (roles and individual users).
 *  Admin: every real group plus every user — personal roles (named after a
 *  single owner) are dropped from the group list because those users can be
 *  addressed directly. Teacher: their class groups plus the individual
 *  students who are members of those groups (no outsiders, no other
 *  teachers, no admins). */
async function collectShareTargets(
  prisma: any,
  user: {
    user_id: string;
    isAdmin: boolean;
    isTeacher: boolean;
    username: string;
    roles: { role_id: string; role_name: string; is_teacher: boolean }[];
  },
): Promise<{ roles: { role_id: string; role_name: string }[]; users: { user_id: string; username: string }[] }> {
  if (user.isAdmin) {
    const roles = await prisma.roles.findMany({
      where: { role_name: { notIn: SYSTEM_ROLES } },
      select: { role_id: true, role_name: true, owner_user_id: true },
      orderBy: { role_name: "asc" },
    });
    const ownerIds = (roles as { owner_user_id: string | null }[]).filter(r => r.owner_user_id != null).map(r => r.owner_user_id as string);
    const [owners, users] = await Promise.all([
      ownerIds.length
        ? prisma.users.findMany({
            where: { user_id: { in: ownerIds } },
            select: { user_id: true, username: true },
          })
        : Promise.resolve([]),
      prisma.users.findMany({
        where: { user_id: { not: user.user_id } },
        select: { user_id: true, username: true },
        orderBy: { username: "asc" },
      }),
    ]);
    const personalNames = new Set((owners as { username: string }[]).map(owner => owner.username));
    const groupRoles = (roles as { role_id: string; role_name: string; owner_user_id: string | null }[]).filter(role => !personalNames.has(role.role_name));
    return { roles: groupRoles, users };
  }
  if (user.isTeacher) {
    const roles = await collectAllowedShareRoles(prisma, user);
    const allowedRoleIds = roles.map(role => role.role_id);
    // Students are the non-teacher, non-admin members of the teacher's groups;
    // the admin account is always additionally addressable individually.
    const [students, admins] = await Promise.all([
      allowedRoleIds.length
        ? prisma.users.findMany({
            where: {
              user_id: { not: user.user_id },
              roles: { some: { role_id: { in: allowedRoleIds } } },
              NOT: { roles: { some: { OR: [{ role_name: "ADMIN" }, { is_teacher: true }] } } },
            },
            select: { user_id: true, username: true },
            orderBy: { username: "asc" },
          })
        : Promise.resolve([]),
      prisma.users.findMany({
        where: { roles: { some: { role_name: "ADMIN" } } },
        select: { user_id: true, username: true },
        orderBy: { username: "asc" },
      }),
    ]);
    const users = [...(admins as { user_id: string; username: string }[]), ...(students as { user_id: string; username: string }[])];
    return { roles, users };
  }
  // Students: "everyone" plus their classmates and teachers — the non-admin
  // members of the non-system groups they belong to (personal and system
  // roles excluded, admins see everything anyway).
  const groupRoleIds = user.roles
    .filter(role => !SYSTEM_ROLES.includes(role.role_name) && role.role_name !== user.username)
    .map(role => role.role_id);
  const users = groupRoleIds.length
    ? await prisma.users.findMany({
        where: {
          user_id: { not: user.user_id },
          roles: { some: { role_id: { in: groupRoleIds } } },
          NOT: { roles: { some: { role_name: "ADMIN" } } },
        },
        select: { user_id: true, username: true },
        orderBy: { username: "asc" },
      })
    : [];
  return { roles: [], users };
}

/** Restrict a submitted scope list to the options the owner may actually use. */
function normalizeShareScopes(
  user: { isAdmin: boolean; isTeacher: boolean },
  scopes: unknown,
  allowedRoleIds: Set<string>,
  allowedUserIds: Set<string>,
): { scope_type: "GLOBAL" | "ROLE" | "USER"; scope_id: string | null }[] {
  if (!Array.isArray(scopes) || !scopes.length) return [];
  const seen = new Set<string>();
  const out: { scope_type: "GLOBAL" | "ROLE" | "USER"; scope_id: string | null }[] = [];
  const mayGlobal = user.isAdmin;
  for (const scope of scopes as { scope_type?: unknown; scope_id?: unknown }[]) {
    if (scope?.scope_type === "GLOBAL" && mayGlobal) {
      if (!seen.has("GLOBAL")) {
        seen.add("GLOBAL");
        out.push({ scope_type: "GLOBAL", scope_id: null });
      }
      continue;
    }
    if (scope?.scope_type === "ROLE" && typeof scope.scope_id === "string") {
      if (allowedRoleIds.has(scope.scope_id) && !seen.has("ROLE:" + scope.scope_id)) {
        seen.add("ROLE:" + scope.scope_id);
        out.push({ scope_type: "ROLE", scope_id: scope.scope_id });
      }
      continue;
    }
    if (scope?.scope_type === "USER" && typeof scope.scope_id === "string") {
      if (allowedUserIds.has(scope.scope_id) && !seen.has("USER:" + scope.scope_id)) {
        seen.add("USER:" + scope.scope_id);
        out.push({ scope_type: "USER", scope_id: scope.scope_id });
      }
    }
  }
  return out;
}

interface OwnerInfo {
  userId: string;
  username: string;
  isAdmin: boolean;
  isTeacher: boolean;
}

async function fetchOwnerInfos(
  prisma: any,
  ids: string[],
): Promise<Map<string, OwnerInfo>> {
  const users = await prisma.users.findMany({
    where: { user_id: { in: ids } },
    include: { roles: { select: { role_id: true, role_name: true, is_teacher: true } } },
  });
  return new Map(users.map((user: any) => [user.user_id, {
    userId: user.user_id,
    username: user.username,
    isAdmin: user.roles.some((role: any) => role.role_name === "ADMIN"),
    isTeacher: user.roles.some((role: any) => role.is_teacher),
  }]));
}

function viewerInfo(user: {
  user_id: string;
  isAdmin: boolean;
  isTeacher: boolean;
  roles: { role_id: string }[];
}) {
  return {
    userId: user.user_id,
    isAdmin: user.isAdmin,
    isTeacher: user.isTeacher,
    roleIds: new Set(user.roles.map(role => role.role_id)),
  };
}

/** Look up a file entry, check that the current user may see it, and resolve
 *  its on-disk location. Returns null when the file is unknown, not shared with
 *  the viewer, or missing on disk. Shared by the download and preview routes. */
async function fetchAuthorizedFile(
  state: { user: any; $transaction: any; config: any },
  id: string,
): Promise<{ row: any; stored: { dataPath: string } } | null> {
  const me = viewerInfo(state.user);
  const { row, owners } = await state.$transaction(async (prisma: any) => {
    const row = await prisma.userFile.findFirst({
      where: { id },
      include: { shares: { select: { scope_type: true, scope_id: true } } },
    });
    const owners = row ? await fetchOwnerInfos(prisma, [row.user_id]) : new Map<string, OwnerInfo>();
    return { row, owners };
  });
  if (!row || !HASH_RE.test(row.sha256)) return null;

  if (!me.isAdmin && row.user_id !== me.userId) {
    const owner = owners.get(row.user_id);
    if (!owner || !shareGrantsVisibility(owner, me, row.shares)) return null;
  }

  const stored = storedFile(state.config.storePath as string, row.sha256);
  if (!stored) return null;
  return { row, stored };
}

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
  /** Share scopes on this file: [{ type: "GLOBAL"|"ROLE"|"USER", id }]. */
  shared: { type: string; id: string | null }[];
}

/** Rows may also carry `user_id` (raw row) and `owner` (username, admin paths). */
function mapFile(row: any): UserFileRow {
  return {
    id: row.id,
    filename: row.filename,
    type: row.type,
    sizeBytes: row.sizeBytes,
    createdAt: new Date(row.created_at).toISOString(),
    shared: (row.shares ?? []).map((share: any) => ({
      type: share.scope_type,
      id: share.scope_id ?? null,
    })),
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
        include: { shares: { select: { scope_type: true, scope_id: true } } },
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

/** Which accounts a file must be shared with to be seen by the current user. */
export const UserFileShareTargets = zodRoute({
  method: ["GET"],
  path: "/api/user-files/share-targets",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/", "/wiki"]);
    state.asserted = true;

    const me = state.user;
    const targets = await state.$transaction(async (prisma) => {
      return await collectShareTargets(prisma, me);
    });
    return { targets: shareTargetsFor(me, targets) };
  }
});

/** Files shared with the current user by other accounts. Admins see every
 *  file in the ordinary list already, so this stays empty for them. */
export const UserFileSharedList = zodRoute({
  method: ["GET"],
  path: "/api/user-files/shared",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/", "/wiki"]);
    state.asserted = true;

    const me = viewerInfo(state.user);
    if (me.isAdmin) return { files: [] };

    const { rows, owners } = await state.$transaction(async (prisma) => {
      const rows = await prisma.userFile.findMany({
        where: { user_id: { not: state.user.user_id }, shares: { some: {} } },
        include: { shares: { select: { scope_type: true, scope_id: true } } },
        orderBy: { created_at: "desc" },
      });
      const ownerIds = Array.from(new Set(rows.map(row => row.user_id)));
      const owners = ownerIds.length ? await fetchOwnerInfos(prisma, ownerIds) : new Map<string, OwnerInfo>();
      return { rows, owners };
    });
    const visible = rows.filter(row => {
      const owner = owners.get(row.user_id);
      if (!owner) return false;
      return shareGrantsVisibility(owner, me, row.shares);
    });
    const files = visible.map(row => {
      const owner = owners.get(row.user_id)!;
      return {
        ...mapFile(row),
        owner: owner.username,
      };
    });
    return { files };
  }
});

/** Replace the share scopes on one of the current user's files. The submitted
 *  scopes are restricted to what the owner may legally use; an empty scope
 *  list stops sharing. */
export const UserFileShareUpdate = zodRoute({
  method: ["PUT"],
  path: "/api/user-files/share",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({
    id: z.string().min(1).max(120),
    scopes: z.array(z.object({
      scope_type: z.string(),
      scope_id: z.string().nullish(),
    })).optional(),
  }),
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/", "/wiki"]);

    const { id, scopes } = state.data;
    state.asserted = true;

    const me = state.user;
    const targets = await state.$transaction(async (prisma) => {
      return await collectShareTargets(prisma, me);
    });
    const allowedRoleIds = new Set(targets.roles.map(role => role.role_id));
    const allowedUserIds = new Set(targets.users.map(userItem => userItem.user_id));
    const allowed = normalizeShareScopes(me, scopes, allowedRoleIds, allowedUserIds);

    const ok = await state.$transaction(async (prisma) => {
      const row = await prisma.userFile.findFirst({
        where: { id, user_id: me.user_id },
        select: { id: true },
      });
      if (!row) return false;
      await prisma.userFileShare.deleteMany({ where: { file_id: id } });
      if (allowed.length) {
        await prisma.userFileShare.createMany({
          data: allowed.map(scope => ({ file_id: id, ...scope })),
        });
      }
      return true;
    });
    if (!ok) throw state.sendEmpty(404, { "x-reason": "Unknown file" });
    return { shared: allowed };
  }
});

/** Stream the current user's file down to the client. */
export const UserFileDownload = zodRoute({
  method: ["GET", "HEAD"],
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

    const file = await fetchAuthorizedFile(state, id);
    if (!file)
      throw state.sendEmpty(404, { "x-reason": "Unknown file" });

    const { row, stored } = file;
    const contentDisposition =
      `attachment; filename*="UTF-8''${encodeURIComponent(row.filename)}"; filename="${encodeURIComponent(row.filename).replace(/"/g, "%22")}"`;

    return state.sendStream(200, {
      contentType: { mediaType: row.type },
      contentDisposition,
      cacheControl: "private, max-age=60",
    }, createReadStream(stored.dataPath));
  }
});

/** Stream a file so it is displayed inline (images, audio, video, PDFs, plain
 *  text). Supports byte ranges so media controls can seek and scrubbing works. */
export const UserFilePreview = zodRoute({
  method: ["GET", "HEAD"],
  path: "/api/user-files/preview",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodQueryKeys: ["id"],
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/", "/wiki"]);

    const id = state.query.get("id") ?? "";
    state.asserted = true;

    const file = await fetchAuthorizedFile(state, id);
    if (!file)
      throw state.sendEmpty(404, { "x-reason": "Unknown file" });

    const { row, stored } = file;
    const size = statSync(stored.dataPath).size;
    const contentDisposition =
      `inline; filename*="UTF-8''${encodeURIComponent(row.filename)}"; filename="${encodeURIComponent(row.filename).replace(/"/g, "%22")}"`;
    const base = {
      contentType: { mediaType: row.type },
      contentDisposition,
      acceptRanges: "bytes",
      cacheControl: "private, max-age=60",
    };

    const rangeHeader = String(state.headers.get("range") ?? "");
    const rangeMatch = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader)
      ?? (/^bytes=(\d+)-$/.exec(rangeHeader))
      ?? (/^bytes=-(\d+)$/.exec(rangeHeader));
    if (rangeMatch) {
      const full = rangeHeader.startsWith("bytes=-");
      const start = full ? Math.max(0, size - parseInt(rangeMatch[1], 10)) : parseInt(rangeMatch[1], 10);
      const end = full || rangeMatch[2] === "" ? size - 1 : Math.min(parseInt(rangeMatch[2], 10), size - 1);
      if (rangeMatch[1] === "" || start < size) {
        const from = Math.min(start, size - 1);
        if (from <= end) {
          return state.sendStream(206, {
            ...base,
            contentLength: end - from + 1,
            contentRange: `bytes ${from}-${end}/${size}`,
          }, createReadStream(stored.dataPath, { start: from, end }));
        }
      }
    }
    if (rangeHeader !== "" && rangeHeader !== "bytes=*")
      return state.sendEmpty(416, { contentRange: `bytes */${size}` });

    return state.sendStream(200, {
      ...base,
      contentLength: size,
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