import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import { serverEvents } from "@tiddlywiki/events";
import { personalRoleNameCandidates, sanitizeSlugPart } from "../new-managers";

const OLD_PREFIX = "lehrer-";

serverEvents.on("cli.register", (commands) => {
  commands["rename-personal-roles"] = { info, Command: RenamePersonalRolesCommand };
});

const info: CommandInfo = {
  name: "rename-personal-roles",
  description: "Migrate personal roles from the old 'lehrer-<username>' scheme to the username-based scheme. Free names are renamed; when the same user already has a personal role under the new name, the old role is merged into it (permissions stay on the user's wiki). Idempotent.",
  arguments: [],
};

type MergeKind = "bag" | "recipe" | "template";

/**
 * Points all permission rows of `fromId` at `toId` (or drops rows that would
 * collide with an existing `toId` row on the same object), then relinks the
 * owner's account and deletes the old role.
 */
async function mergeRoleInto(prisma: any, fromId: string, toId: string, ownerUserId: string): Promise<{ moved: number; dropped: number }> {
  const targets: { client: string; idField: string }[] = [
    { client: "bagPermission", idField: "bag_id" },
    { client: "recipePermission", idField: "recipe_id" },
    { client: "templatePermission", idField: "template_id" },
  ];
  let moved = 0;
  let dropped = 0;
  const p = prisma as any;

  for (const { client, idField } of targets) {
    const rows: { [key: string]: string }[] = await p[client].findMany({ where: { role_id: fromId } });
    for (const row of rows) {
      const objectId = row[idField];
      const collide = await p[client].findUnique({
        where: { [`${idField}_role_id`]: { [idField]: objectId, role_id: toId } },
        select: { level: true },
      });
      if (collide) {
        await p[client].delete({ where: { [`${idField}_role_id`]: { [idField]: objectId, role_id: fromId } } });
        dropped++;
      } else {
        await p[client].update({
          where: { [`${idField}_role_id`]: { [idField]: objectId, role_id: fromId } },
          data: { role_id: toId },
        });
        moved++;
      }
    }
  }

  await p.users.update({
    where: { user_id: ownerUserId },
    data: { roles: { disconnect: { role_id: fromId } } },
  });
  const linked = await p.users.findUnique({
    where: { user_id: ownerUserId },
    select: { roles: { where: { role_id: toId }, select: { role_id: true } } },
  });
  if (!linked || linked.roles.length === 0) {
    await p.users.update({
      where: { user_id: ownerUserId },
      data: { roles: { connect: { role_id: toId } } },
    });
  }

  await p.pinboardNote.updateMany({
    where: { scope_type: "ROLE", scope_id: fromId },
    data: { scope_id: toId },
  });

  await p.roles.delete({ where: { role_id: fromId } });
  return { moved, dropped };
}

/**
 * One-time migration from the old `lehrer-<slug>` personal-role naming to the
 * current username-based scheme:
 * - the new name is free            -> rename the role in place,
 * - the same user already owns the  -> merge (repoint permissions, relink the
 *   new-named personal role           account, delete the old role),
 * - the name is owned by someone    -> leave as-is and report a skip,
 *   else
 */
export class RenamePersonalRolesCommand extends BaseCommand<[]> {
  static info = info;

  async execute() {
    const engine = this.config.engine;
    const renamed: string[] = [];
    const merged: string[] = [];
    const skipped: { role_name: string; reason: string }[] = [];

    await engine.$transaction(async (prisma) => {
      const users = await prisma.users.findMany({ select: { user_id: true, username: true } });
      const usernameBySlug = new Map<string, string>();
      for (const user of users) {
        const slug = sanitizeSlugPart(user.username);
        if (slug && !usernameBySlug.has(slug)) usernameBySlug.set(slug, user.username);
      }

      const personal = await prisma.roles.findMany({
        where: { owner_user_id: { not: null }, role_name: { startsWith: OLD_PREFIX } },
        select: { role_id: true, role_name: true, owner_user_id: true },
      });
      const castOwner = (value: string | null): string => value ?? "";

      for (const role of personal) {
        const part = role.role_name.slice(OLD_PREFIX.length);
        const username = usernameBySlug.get(part) ?? part;
        const candidates = personalRoleNameCandidates(username);

        let renameTarget: string | undefined;
        let mergeTargetId: string | undefined;
        let mergeTargetName = "";
        let reason = "";
        for (const name of candidates) {
          const existing = await prisma.roles.findUnique({
            where: { role_name: name },
            select: { role_id: true, owner_user_id: true },
          });
          if (!existing) {
            renameTarget = name;
            break;
          }
          if (existing.owner_user_id === role.owner_user_id) {
            mergeTargetId = existing.role_id;
            mergeTargetName = name;
            break;
          }
          reason = `'${name}' is occupied by another owner`;
        }

        if (renameTarget) {
          await prisma.roles.update({ where: { role_id: role.role_id }, data: { role_name: renameTarget } });
          renamed.push(`${role.role_name} -> ${renameTarget}`);
        } else if (mergeTargetId && mergeTargetName) {
          const { moved, dropped } = await mergeRoleInto(prisma, role.role_id, mergeTargetId, castOwner(role.owner_user_id));
          merged.push(`${role.role_name} -> merged into ${mergeTargetName} (${moved} perms moved, ${dropped} dropped)`);
        } else {
          skipped.push({ role_name: role.role_name, reason });
        }
      }
    });

    const label = (title: string, lines: string[]) => {
      if (!lines.length) return;
      console.log(`${title} (${lines.length}):`);
      for (const line of lines) console.log(`  ${line}`);
    };
    label("Renamed personal roles", renamed);
    label("Merged personal roles", merged);
    for (const { role_name, reason } of skipped) console.log(`  SKIPPED ${role_name}: ${reason}`);

    if (!renamed.length && !merged.length && !skipped.length)
      console.log("No personal roles to migrate.");
    return { renamed, merged, skipped };
  }
}