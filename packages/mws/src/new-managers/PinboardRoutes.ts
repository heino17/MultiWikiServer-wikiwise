// Pinboard endpoints — a loose "wall with notes" for the whole instance.
//
// Notes ("Zettel") are pinned to the wall by any logged-in user. A note is
// addressed to one of three scopes:
//   GLOBAL — everyone; only admins/teachers may pin these
//   ROLE   — the members of a role ("Klasse"); anyone may pin to their roles
//   USER   — a single person
//
// Reading is intentionally loose: there are no read receipts. A per-user row
// in `pinboard_note_read` only remembers what *you* have already read or
// shoved aside ("abgeheftet"), which drives the unread badge on the tab.

import { SendError, ServerRequest, zodRoute } from "@tiddlywiki/server";

const COLORS = ["yellow", "pink", "blue", "green", "orange", "purple"] as const;
type PinboardColor = typeof COLORS[number];

const SCOPES = ["GLOBAL", "ROLE", "USER"] as const;
type PinboardScope = typeof SCOPES[number];

const SYSTEM_ROLES = ["ADMIN", "USER", "ANON"];
const MAX_BODY = 1700;

type AuthUser = ServerRequest["user"];

export interface PinboardNote {
  id: string;
  authorUserId: string;
  authorName: string;
  scopeType: PinboardScope;
  scopeId: string | null;
  scopeLabel: string;
  body: string;
  color: string;
  important: boolean;
  createdAt: string;
  expiresAt: string | null;
  read: boolean;
  dismissed: boolean;
  /// Where *this* user has placed the note on the wall (0..1 fractions of the
  /// wall's width/height, note centre); null when the user never moved it.
  posX: number | null;
  posY: number | null;
  canEdit: boolean;
  canDelete: boolean;
}

interface PinboardTargetRole {
  id: string;
  name: string;
}

interface PinboardTargetUser {
  id: string;
  username: string;
}

export interface PinboardInfo {
  notes: PinboardNote[];
  unreadCount: number;
  targets: {
    canPostGlobal: boolean;
    roles: PinboardTargetRole[];
    users: PinboardTargetUser[];
  };
}

function isSystemRole(name: string) {
  return SYSTEM_ROLES.includes(name);
}

function qualifiedRoleIds(user: AuthUser) {
  return user.roles.filter(role => !isSystemRole(role.role_name) && !role.is_teacher).map(role => role.role_id);
}

/**
 * Who may see a note. Authors always see their own notes; everybody sees
 * global notes; role notes go to the role's members; user notes to that user.
 * Admins see everything so they can moderate.
 */
function canSee(note: { author_user_id: string; scope_type: string; scope_id: string | null }, user: AuthUser) {
  if (note.author_user_id === user.user_id) return true;
  if (user.isAdmin) return true;
  if (note.scope_type === "GLOBAL") return true;
  if (note.scope_type === "ROLE") return user.roles.some(role => role.role_id === note.scope_id);
  if (note.scope_type === "USER") return note.scope_id === user.user_id;
  return false;
}

function canEdit(note: { author_user_id: string }, user: AuthUser) {
  return user.isAdmin || note.author_user_id === user.user_id;
}

/**
 * Author, admin, or a teacher moderating a class role they
 * created may take a note off the wall.
 * Admins' notes on the global wall can only be deleted by admins.
 */
function canDelete(
  note: { author_user_id: string; scope_type: string; scope_id: string | null },
  user: AuthUser,
  ownedRoleIds: Set<string>,
) {
  // Author can always delete their own note
  if (canEdit(note, user)) return true;
  // Non-teachers (students) can't delete others' notes
  if (!user.isTeacher) return false;
  // Teachers can only delete on their own class walls (ROLE scope they own)
  if (note.scope_type === "ROLE" && note.scope_id && ownedRoleIds.has(note.scope_id)) return true;
  // Teachers cannot delete GLOBAL notes (even their own — author check above handles that)
  // Teachers cannot delete USER notes addressed to others
  return false;
}

async function ownedRoleIdSet(prisma: PrismaTxnClient, user: AuthUser) {
  const roles = await prisma.roles.findMany({
    where: { owner_user_id: user.user_id },
    select: { role_id: true },
  });
  return new Set(roles.map(role => role.role_id));
}

/**
 * The roles and users the current user may address, plus whether they may pin
 * to the global wall. Students are limited to their own roles and to people
 * who share one of their (non-system) roles; admins and teachers may address
 * any role they own/belong to and any other account.
 */
async function resolveTargets(prisma: PrismaTxnClient, user: AuthUser): Promise<PinboardInfo["targets"]> {
  const statusView = user.isAdmin || user.isTeacher;
  const memberRoleIds = qualifiedRoleIds(user);

  const roleRows = user.isAdmin
    ? await prisma.roles.findMany({
      where: { role_name: { notIn: SYSTEM_ROLES } },
      select: { role_id: true, role_name: true },
      orderBy: { role_name: "asc" },
    })
    : await prisma.roles.findMany({
      where: {
        role_name: { notIn: SYSTEM_ROLES },
        OR: [
          { role_id: { in: memberRoleIds } },
          { owner_user_id: user.user_id },
        ],
      },
      select: { role_id: true, role_name: true },
      orderBy: { role_name: "asc" },
    });

  let userRows: { user_id: string; username: string }[] = [];
  if (statusView) {
    userRows = await prisma.users.findMany({
      where: { user_id: { not: user.user_id } },
      select: { user_id: true, username: true },
      orderBy: { username: "asc" },
    });
  } else if (memberRoleIds.length) {
    userRows = await prisma.users.findMany({
      where: {
        user_id: { not: user.user_id },
        roles: { some: { role_id: { in: memberRoleIds } } },
      },
      select: { user_id: true, username: true },
      orderBy: { username: "asc" },
    });
  }

  return {
    canPostGlobal: statusView,
    roles: roleRows.map(role => ({ id: role.role_id, name: role.role_name })),
    users: userRows.map(user => ({ id: user.user_id, username: user.username })),
  };
}

async function visibleNoteRows(prisma: PrismaTxnClient, user: AuthUser) {
  const rows = await prisma.pinboardNote.findMany({
    where: {
      is_active: true,
      OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
    },
    orderBy: [{ is_important: "desc" }, { created_at: "desc" }],
  });
  return rows.filter(note => canSee(note, user));
}

async function buildPinboard(prisma: PrismaTxnClient, user: AuthUser): Promise<PinboardInfo> {
  const rows = await visibleNoteRows(prisma, user);
  const noteIds = rows.map(note => note.id);

  const [readRows, positionRows, ownedRoleIds, targets] = await Promise.all([
    noteIds.length
      ? prisma.pinboardNoteRead.findMany({ where: { user_id: user.user_id, note_id: { in: noteIds } } })
      : Promise.resolve([] as { note_id: string; read_at: Date | null; dismissed_at: Date | null }[]),
    noteIds.length
      ? prisma.pinboardNotePosition.findMany({ where: { user_id: user.user_id, note_id: { in: noteIds } } })
      : Promise.resolve([] as { note_id: string; x: number; y: number }[]),
    ownedRoleIdSet(prisma, user),
    resolveTargets(prisma, user),
  ]);
  const readMap = new Map(readRows.map(row => [row.note_id, row]));
  const positionMap = new Map(positionRows.map(row => [row.note_id, row]));

  const roleIds = Array.from(new Set(rows.filter(n => n.scope_type === "ROLE" && n.scope_id).map(n => n.scope_id as string)));
  const userIds = Array.from(new Set(rows.filter(n => n.scope_type === "USER" && n.scope_id).map(n => n.scope_id as string)));
  const [roleRows, userRows] = await Promise.all([
    roleIds.length
      ? prisma.roles.findMany({ where: { role_id: { in: roleIds } }, select: { role_id: true, role_name: true } })
      : Promise.resolve([] as { role_id: string; role_name: string }[]),
    userIds.length
      ? prisma.users.findMany({ where: { user_id: { in: userIds } }, select: { user_id: true, username: true } })
      : Promise.resolve([] as { user_id: string; username: string }[]),
  ]);
  const roleNames = new Map(roleRows.map(row => [row.role_id, row.role_name]));
  const usernames = new Map(userRows.map(row => [row.user_id, row.username]));

  const notes: PinboardNote[] = rows.map(note => {
    const readRow = readMap.get(note.id);
    const positionRow = positionMap.get(note.id);
    return {
      id: note.id,
      authorUserId: note.author_user_id,
      authorName: note.author_name,
      scopeType: note.scope_type as PinboardScope,
      scopeId: note.scope_id,
      scopeLabel: note.scope_type === "GLOBAL"
        ? ""
        : note.scope_type === "ROLE"
          ? roleNames.get(note.scope_id ?? "") ?? ""
          : usernames.get(note.scope_id ?? "") ?? "",
      body: note.body,
      color: note.color,
      important: note.is_important,
      createdAt: note.created_at.toISOString(),
      expiresAt: note.expires_at ? note.expires_at.toISOString() : null,
      read: Boolean(readRow?.read_at),
      dismissed: Boolean(readRow?.dismissed_at),
      posX: positionRow?.x ?? null,
      posY: positionRow?.y ?? null,
      canEdit: canEdit(note, user),
      canDelete: canDelete(note, user, ownedRoleIds),
    };
  });

  const unreadCount = notes.filter(note =>
    note.authorUserId !== user.user_id && !note.read && !note.dismissed
  ).length;

  return { notes, unreadCount, targets };
}

async function countPinboard(prisma: PrismaTxnClient, user: AuthUser) {
  const rows = await visibleNoteRows(prisma, user);
  if (!rows.length) return { noteCount: 0, unreadCount: 0 };
  const readRows = await prisma.pinboardNoteRead.findMany({
    where: { user_id: user.user_id, note_id: { in: rows.map(note => note.id) } },
    select: { note_id: true, read_at: true, dismissed_at: true },
  });
  const readMap = new Map(readRows.map(row => [row.note_id, row]));
  let unreadCount = 0;
  for (const note of rows) {
    const readRow = readMap.get(note.id);
    if (note.author_user_id !== user.user_id && !readRow?.read_at && !readRow?.dismissed_at) unreadCount++;
  }
  return { noteCount: rows.length, unreadCount };
}

/** Validates the scope against the options the user actually has. */
async function assertScopeAllowed(
  prisma: PrismaTxnClient,
  user: AuthUser,
  scopeType: PinboardScope,
  scopeId: string | null,
) {
  if (scopeType === "GLOBAL") {
    if (!user.isAdmin && !user.isTeacher)
      throw new SendError("ACCESS_DENIED", 403, { reason: "Only admins and teachers may pin to the global wall." });
    return;
  }
  if (!scopeId)
    throw new SendError("ACCESS_DENIED", 403, { reason: "A target is required for this note." });
  const targets = await resolveTargets(prisma, user);
  if (scopeType === "ROLE" && !targets.roles.some(role => role.id === scopeId))
    throw new SendError("ACCESS_DENIED", 403, { reason: "You may not pin to this role." });
  if (scopeType === "USER" && !targets.users.some(entry => entry.id === scopeId))
    throw new SendError("ACCESS_DENIED", 403, { reason: "You may not pin a note for this user." });
}

function normalizeBody(value: string) {
  const body = value.trim();
  if (!body) throw new SendError("INVALID_REQUEST", 400, null);
  if (body.length > MAX_BODY) throw new SendError("INVALID_REQUEST", 400, null);
  return body;
}

function normalizeExpiresAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new SendError("INVALID_REQUEST", 400, null);
  return date;
}

export const PinboardList = zodRoute({
  method: ["GET"],
  path: "/api/pinboard",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okUser();
    state.asserted = true;
    return await buildPinboard(state.engine, state.user);
  }
});

export const PinboardUnreadCount = zodRoute({
  method: ["GET"],
  path: "/api/pinboard/unread-count",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okUser();
    state.asserted = true;
    return await countPinboard(state.engine, state.user);
  }
});

export const PinboardSaveNote = zodRoute({
  method: ["PUT"],
  path: "/api/pinboard/note",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({
    id: z.string().optional(),
    body: z.string().max(MAX_BODY),
    color: z.enum(COLORS).optional().default("yellow"),
    important: z.boolean().optional().default(false),
    scopeType: z.enum(SCOPES),
    scopeId: z.string().min(1).nullable().optional(),
    expiresAt: z.string().nullable().optional(),
  }),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okUser();
    state.asserted = true;

    const { id, body, color, important, scopeType, scopeId, expiresAt } = state.data;
    const normalizedBody = normalizeBody(body);
    const normalizedExpiry = normalizeExpiresAt(expiresAt);
    const userId = state.user.user_id;

    return await state.$transaction(async (prisma) => {
      await assertScopeAllowed(prisma, state.user, scopeType, scopeId ?? null);

      if (id) {
        const existing = await prisma.pinboardNote.findUnique({ where: { id } });
        if (!existing) throw state.sendEmpty(404, { "x-reason": "Unknown note" });
        if (!canEdit(existing, state.user))
          throw new SendError("ACCESS_DENIED", 403, { reason: "You may only edit your own notes." });
        await prisma.pinboardNote.update({
          where: { id },
          data: {
            body: normalizedBody,
            color,
            is_important: important,
            scope_type: scopeType,
            scope_id: scopeType === "GLOBAL" ? null : scopeId ?? null,
            expires_at: normalizedExpiry,
          },
        });
      } else {
        await prisma.pinboardNote.create({
          data: {
            author_user_id: userId,
            author_name: state.user.username,
            scope_type: scopeType,
            scope_id: scopeType === "GLOBAL" ? null : scopeId ?? null,
            body: normalizedBody,
            color,
            is_important: important,
            expires_at: normalizedExpiry,
          },
        });
      }

      return await buildPinboard(prisma, state.user);
    });
  }
});

export const PinboardDeleteNote = zodRoute({
  method: ["PUT"],
  path: "/api/pinboard/note/delete",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({ id: z.string().min(1) }),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okUser();
    state.asserted = true;

    return await state.$transaction(async (prisma) => {
      const existing = await prisma.pinboardNote.findUnique({ where: { id: state.data.id } });
      if (!existing) throw state.sendEmpty(404, { "x-reason": "Unknown note" });
      const ownedRoleIds = await ownedRoleIdSet(prisma, state.user);
      if (!canDelete(existing, state.user, ownedRoleIds))
        throw new SendError("ACCESS_DENIED", 403, { reason: "You may not remove this note." });
      await prisma.pinboardNote.delete({ where: { id: existing.id } });
      return await buildPinboard(prisma, state.user);
    });
  }
});

export const PinboardSavePosition = zodRoute({
  method: ["PUT"],
  path: "/api/pinboard/layout",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({
    id: z.string().min(1),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okUser();
    state.asserted = true;

    const { id, x, y } = state.data;

    return await state.$transaction(async (prisma) => {
      const note = await prisma.pinboardNote.findUnique({ where: { id } });
      if (!note) throw state.sendEmpty(404, { "x-reason": "Unknown note" });
      if (!canSee(note, state.user))
        throw new SendError("ACCESS_DENIED", 403, { reason: "This note is not addressed to you." });

      await prisma.pinboardNotePosition.upsert({
        where: { note_id_user_id: { note_id: id, user_id: state.user.user_id } },
        create: { note_id: id, user_id: state.user.user_id, x, y },
        update: { x, y },
      });

      return { ok: true };
    });
  }
});

export const PinboardMarkRead = zodRoute({
  method: ["PUT"],
  path: "/api/pinboard/read",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({
    id: z.string().min(1),
    read: z.boolean().optional(),
    dismissed: z.boolean().optional(),
  }),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okUser();
    state.asserted = true;

    const { id, read, dismissed } = state.data;

    return await state.$transaction(async (prisma) => {
      const note = await prisma.pinboardNote.findUnique({ where: { id } });
      if (!note) throw state.sendEmpty(404, { "x-reason": "Unknown note" });
      if (!canSee(note, state.user))
        throw new SendError("ACCESS_DENIED", 403, { reason: "This note is not addressed to you." });

      const data: { read_at?: Date | null; dismissed_at?: Date | null } = {};
      if (read === true) data.read_at = new Date();
      else if (read === false) data.read_at = null;
      if (dismissed === true) data.dismissed_at = new Date();
      else if (dismissed === false) data.dismissed_at = null;

      await prisma.pinboardNoteRead.upsert({
        where: { note_id_user_id: { note_id: id, user_id: state.user.user_id } },
        create: { note_id: id, user_id: state.user.user_id, ...data },
        update: data,
      });

      return await countPinboard(prisma, state.user);
    });
  }
});
