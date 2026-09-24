import {
  DataSave,
  DataStore,
  IdString,

  WritablePrefixRow,
  PermissionRow,
  TabId,
  TemplateTypes,
  buildTabZodObject
} from "@mws/admin-vanilla/src/definition/tabs";
import {
  checkData,
  SendError,
  ServerRequest,
  Z2,
  zod,
  zodRoute
} from "@tiddlywiki/server";
import {
  BagImportWriter,
  DEFAULT_TEMPLATE,
  RecipeImportWriter,
  RoleImportWriter,
  TemplateImportWriter,
  UserImportWriter
} from "./TabUpserts";
import {
  BagPermissionLevel,
  RecipePermissionLevel
} from "@tiddlywiki/mws-prisma";
import {
  CompiledRecipeBagInput,
  UpsertBagInput,
  UpsertRecipeInput,
  UpsertTemplateInput
} from "./wiki-contract";
import { createHash } from "crypto";
import { debuglog } from "util";
import { Debug } from "@prisma/client/runtime/client";
import { WikiStore } from "./RecipeResolver";
import { SessionManager } from "./sessions";
import { deleteThumbnail } from "./WikiThumbnailRoutes";
import type { PasswordService } from "../services/PasswordService";



type IRecipeRow = DataStore["wikis"][number];
type ITemplateRow = DataStore["templates"][number];
type IBagRow = DataStore["bags"][number];
// type IPluginRow = DataStore["plugins"][number];
type IUserRow = DataStore["users"][number];
type IRoleRow = DataStore["roles"][number];


export type TemplateDefinition = Omit<
  DataStore["templates"][number],
  | "id"
  | "name"
  | "lastUpdatedAt"
  | "templatePermissions"
  | "dependentWikis"
  | "templateUsers"
  | "templateAdmins"
  | "ownerUsername"
  | "myRights"
>;

export type RecipeDefinition = Omit<
  DataStore["wikis"][number],
  | "id"
  | "slug"
  | "templateName"
  | "lastCompiledAt"
  | "recipePermissions"
  | "effectiveWritableBags"
  | "effectiveReadonlyBags"
  | "effectivePluginSet"
  | "recipeUsers"
  | "recipeAdmins"
  | "ownerUsername"
  | "myRights"
  | "sharedWritableBags"
>;

declare global {
  namespace PrismaJson {
    type Template_definition = TemplateDefinition;
    type Recipe_definition = RecipeDefinition;
  }
}

export type {
  UpsertBagInput,
  UpsertRecipeInput,
  UpsertRoleInput,
  UpsertTemplateInput,
  UpsertUserInput,
} from "./wiki-contract";
export {
  type ImportedBagRows,
  type ImportedRecipeRows,
  type ImportedRoleRows,
  type ImportedTemplateRow,
  type ImportedUserRows,
} from "./TabUpserts";


// #region abstracts

function normalizeLineList<T extends string | string | IdString>(values: readonly T[]): T[] {
  return values.map((entry) => entry.trim() as T).filter(Boolean);
}

function normalizePrefixRows(rows: readonly WritablePrefixRow[]): WritablePrefixRow[] {
  return rows
    .map((row) => ({ prefix: row.prefix, bagName: row.bagName.trim() }))
    .filter((row) => row.bagName)
    .sort((a, b) => b.prefix.length - a.prefix.length);
}

const PERMISSION_LEVEL_RANK: Record<string, number> = {
  A_read: 1,
  B_write: 2,
  C_admin: 3,
};

function normalizePermissions<Level extends string>(rows: readonly PermissionRow<Level>[]): PermissionRow<Level>[] {
  // Deduplicate by role, keeping the highest permission level for roles that
  // appear more than once (e.g. listed in both the reader and admin lists).
  const byRole = new Map<string, PermissionRow<Level>>();
  for (const row of rows) {
    const role = row.role.trim();
    if (!role) continue;
    const existing = byRole.get(role);
    if (!existing || (PERMISSION_LEVEL_RANK[row.level] ?? 0) > (PERMISSION_LEVEL_RANK[existing.level] ?? 0))
      byRole.set(role, { role, level: row.level });
  }
  return Array.from(byRole.values());
}

/**
 * Follows the derived default bag "editions/<slug>" when a wiki's slug is
 * renamed: unless the target name already exists or the bag is still shared
 * with other recipes, the bag row is renamed in place so the compiled recipe
 * connects to it and existing tiddlers/permissions keep their bag_id.
 */
async function followDefaultBagOnSlugRename(
  prisma: PrismaTxnClient,
  prior: { id: string; slug: string; definition: PrismaJson.Recipe_definition | null },
  data: DataSave["wikis"][number],
) {
  const oldDefaultBag = prior.definition?.writablePrefixBags?.find((row) => row.prefix === "")?.bagName;
  if (!oldDefaultBag) return;
  const newDefaultBag = data.writablePrefixBags.find((row) => row.prefix === "")?.bagName;
  if (!newDefaultBag || oldDefaultBag === newDefaultBag) return;

  // only follow the derived "editions/<slug>" convention
  if (oldDefaultBag !== `editions/${prior.slug}` || newDefaultBag !== `editions/${data.slug}`) return;

  const oldBag = await prisma.bag.findUnique({ where: { name: oldDefaultBag }, select: { id: true } });
  if (!oldBag) return;
  // target already exists: prefer connecting to it over stealing its name
  const clash = await prisma.bag.findUnique({ where: { name: newDefaultBag }, select: { id: true } });
  if (clash) return;
  const sharedByOthers = await prisma.recipeBag.count({ where: { bag_id: oldBag.id, recipe_id: { not: prior.id } } });
  if (sharedByOthers > 0) return;

  await prisma.bag.update({ where: { id: oldBag.id }, data: { name: newDefaultBag } });
}

/**
 * Mirrors a wikI display-name edit into the starter tiddlers of its default
 * bag — but only while they still hold the untouched default content
 * ($:/SiteTitle text and the unmodified "Willkommen" starter teaser).
 * Customized tiddlers are left alone.
 */
async function mirrorDisplayNameIntoStarterTiddlers(
  prisma: PrismaTxnClient,
  recipeId: IdString,
  defaultBagName: string,
  newDisplayName: string,
) {
  const bag = await prisma.bag.findUnique({ where: { name: defaultBagName }, select: { id: true } });
  if (!bag) return;
  const store = new WikiStore(prisma);
  const bagId = new IdString(bag.id);

  const siteTitle = await prisma.tiddler.findUnique({
    where: { bag_id_title: { bag_id: bag.id, title: "$:/SiteTitle" } },
    select: { fields: true },
  });
  const siteTitleText = (siteTitle?.fields as { text?: unknown } | null)?.text;
  if (siteTitleText !== newDisplayName) {
    await store.saveTiddler({
      recipe_id: recipeId,
      bag_id: bagId,
      fields: { ...(siteTitle?.fields as object), text: newDisplayName },
    });
  }

  const welcome = await prisma.tiddler.findUnique({
    where: { bag_id_title: { bag_id: bag.id, title: "Willkommen" } },
    select: { fields: true },
  });
  const welcomeTextValue = (welcome?.fields as { text?: unknown } | null)?.text;
  // Heal stale starter teasers (left behind by older edits) but never clobber
  // a genuinely customized one: only rewrite if it still looks like the
  // auto-generated starter (heading + onboarding sentence) and does not yet
  // carry the new display name.
  if (
    typeof welcomeTextValue === "string"
    && welcomeTextValue.startsWith("# Willkommen in \u201e")
    && welcomeTextValue.includes("per Knopfdruck für dich angelegt")
    && welcomeTextValue !== welcomeText(newDisplayName)
  ) {
    await store.saveTiddler({
      recipe_id: recipeId,
      bag_id: bagId,
      fields: { ...(welcome?.fields as object), text: welcomeText(newDisplayName) },
    });
  }
}


function permissionLevelRank(level: "A_read" | "B_write" | "C_admin"): number {
  if (level === "C_admin") return 3;
  if (level === "B_write") return 2;
  return 1;
}

/**
 * Closes the bag-hijack hole in editors' save paths. A recipe/template may
 * only reference bags the current editor already has rights on:
 *   * an existing bag must be owned by the editor or carry at least A_read
 *     for one of their roles, otherwise referencing it would leak its
 *     tiddlers to the wiki's visitors;
 *   * bags used as write targets additionally need B_write (or ownership)
 *     whenever the saved definition grants write access to anyone, otherwise
 *     an A_read-only editor could silently hand out write on a foreign wiki.
 * Unknown names are allowed: they do not exist yet, so the importer creates
 * them as the editor's own bags (referencing a bag that genuinely belongs to
 * someone else only works if it already exists – which is exactly the case
 * this gate blocks). Admins bypass the check.
 */
async function assertBagReferencesAllowed(
  prisma: PrismaTxnClient,
  user: ServerRequest["user"],
  refs: { bagName: string; isWritable: boolean }[],
  permissions: readonly { level: string }[],
): Promise<void> {
  if (user.isAdmin) return;
  const existing = await prisma.bag.findMany({
    where: { name: { in: refs.map(r => r.bagName) } },
    select: { name: true, owner_user_id: true, permissions: true },
  });
  const byName = new Map(existing.map(b => [b.name, b] as const));
  const grantsWrite = permissions.some(p => p.level === "B_write");
  for (const ref of refs) {
    const bag = byName.get(ref.bagName);
    if (!bag) continue;
    if (bag.owner_user_id === user.user_id) continue;
    const held = bag.permissions.reduce(
      (max, p) => user.roles.some(r => r.role_id === p.role_id)
        ? Math.max(max, permissionLevelRank(p.level as BagPermissionLevel))
        : max,
      0,
    );
    const required = ref.isWritable && grantsWrite ? 2 : 1;
    if (held >= required) continue;
    if (ref.isWritable && grantsWrite)
      throw new SendError("ACCESS_DENIED", 403, { reason: `write access on the bag "${ref.bagName}" is required to use it as a write target in this wiki's definition` });
    throw new SendError("ACCESS_DENIED", 403, { reason: `no read access on the bag "${ref.bagName}"` });
  }
}

/**
 * Konsistenz: MWS prüft beim Öffnen eines Wikis Rezept UND Bags
 * (RecipeResolver.assertRecipe). Rollen mit A_read/B_write auf Rezept
 * werden deshalb automatisch auch auf allen Bags des Wikis eingetragen
 * (A_read bleibt A_read, B_write wird als B_write gespiegelt). Bestehende
 * höhere Berechtigungen (z.B. C_admin des Owners) bleiben unangetastet.
 * B_write wird dabei nur auf Bags gespiegelt, die das Wiki tatsächlich als
 * Schreibziel nutzt (isWritable); rein lesend referenzierte Bags bekommen
 * höchstens A_read, damit der Editor nie mehr vergeben kann, als
 * assertBagReferencesAllowed zuvor zugelassen hat.
 */
async function syncRecipePermissionsToBags(
  prisma: PrismaTxnClient,
  bags: { bagName: string; isWritable: boolean }[],
  recipePermissions: PermissionRow<RecipePermissionLevel>[],
  roles: (name: string) => IdString,
): Promise<void> {
  if (bags.length === 0 || recipePermissions.length === 0) return;
  const writableBagNames = new Set(bags.filter(b => b.isWritable).map(b => b.bagName));
  const bagRows = await prisma.bag.findMany({
    where: { name: { in: bags.map(e => e.bagName) } },
    include: { permissions: true },
  });
  for (const bag of bagRows) {
    const current = new Map(bag.permissions.map(p => [p.role_id, p.level] as const));
    for (const rp of recipePermissions) {
      const role_id = roles(rp.role).toString();
      const mirrorWrite = rp.level === "B_write" && writableBagNames.has(bag.name);
      const desired: BagPermissionLevel = mirrorWrite ? "B_write" : "A_read";
      const existing = current.get(role_id);
      if (existing === undefined || permissionLevelRank(desired) > permissionLevelRank(existing)) {
        await prisma.bagPermission.upsert({
          where: { bag_id_role_id: { bag_id: bag.id, role_id } },
          create: { bag_id: bag.id, role_id, level: desired },
          update: { level: desired },
        });
      }
    }
  }
}

abstract class TabDataAdapter<TAB extends TabId> {
  constructor(protected user: ServerRequest["user"]) { }
  abstract saveRow(prisma: PrismaTxnClient, data: DataSave[TAB][number]): Promise<DataStore[TAB][number]>;
  // roles aren't connected to data tables so they can be swapped out for SSO
  abstract getList(prisma: PrismaTxnClient, roles: (key: IdString) => string): Promise<DataStore[TAB]>;
}
// #region Recipe
export class RecipeDataAdapter extends TabDataAdapter<"wikis"> {

  async saveRow(prisma: PrismaTxnClient, data: DataSave["wikis"][number]): Promise<DataStore["wikis"][number]> {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(data.slug))
      throw new Error("Recipe slug is not valid. Use only lowercase letters, numbers and hyphens (e.g. mein-wiki), no spaces or special characters.");
    if (data.slug.startsWith("$")) throw new Error("recipe slug may not start with a dollar sign.");

    const importer = new RecipeImportWriter(prisma, false);
    if (!data.templateName) throw new Error("wiki template reference is required");
    const template = await prisma.template.findUnique({ where: { name: data.templateName } });
    if (!template) throw new Error("wiki template not found");

    // Capture the pre-rename record by id so a slug change can be detected:
    // checkExisting() renames the recipe row in place before we upsert.
    const priorRecipe = data.id.toString()
      ? await prisma.recipe.findUnique({
          where: { id: data.id.toString() },
          select: { id: true, slug: true, definition: true },
        })
      : null;

    const authoredDefinition: PrismaJson.Recipe_definition = {
      displayName: data.displayName,
      description: data.description,
      readonlyBags: normalizeLineList(data.readonlyBags),
      writablePrefixBags: normalizePrefixRows(data.writablePrefixBags),
      plugins: normalizeLineList(data.plugins),
      cspAllow: normalizeLineList(data.cspAllow ?? []),
    };

    await importer.checkExisting(data.id, data.slug, this.user);

    // When the slug is renamed, the derived default write target
    // "editions/<old-slug>" follows along to "editions/<new-slug>", so the
    // compiled recipe can connect to it and existing tiddlers keep their data.
    if (priorRecipe && priorRecipe.slug !== data.slug)
      await followDefaultBagOnSlugRename(prisma, priorRecipe, data);

    const { bags, plugins } = importer.compileRecipeSimpleV1(
      authoredDefinition,
      template.definition
    );

    const recipePermissions = normalizePermissions<RecipePermissionLevel>([
      ...data.recipeUsers.map(e => ({ level: "A_read" as const, role: e })),
      ...data.recipeAdmins.map(e => ({ level: "B_write" as const, role: e })),
    ]);

    const roles = await getRolesMapper(prisma, recipePermissions.map((row) => row.role));

    const existingRecipe = await prisma.recipe.findUnique({
      where: { slug: data.slug },
      select: { owner_user_id: true },
    });

    assertCanEdit({
      existingOwnerId: existingRecipe?.owner_user_id,
      user: this.user,
      kind: "wiki",
    });

    // Editors may only reference bags they already have rights on. Without
    // this gate a recipe author could attach a foreign bag and expose its
    // tiddlers (or hand out write) through the wiki's compiled access list.
    await assertBagReferencesAllowed(
      prisma,
      this.user,
      bags.map(e => ({ bagName: e.bagName, isWritable: e.isWritable })),
      recipePermissions,
    );

    const [[id, lastCompiledAt]] = await importer.upsert([{
      slug: data.slug,
      templateId: new IdString(template.id),
      compiledBags: bags,
      plugins: plugins,
      definition: authoredDefinition,
      ownerUserId: existingRecipe ? undefined : (this.user.user_id ? new IdString(this.user.user_id) : undefined),
      permissions: recipePermissions.map(row => ({
        level: row.level,
        role_id: roles(row.role),
        role_name: row.role,
      })),
    }]);

    // Freigaben auf Rezept-Ebene (A_read/B_write) automatisch auf die Bags
    // des Wikis spiegeln, damit Öffnen/Schreiben nicht an fehlenden
    // Bag-Permissions scheitert (siehe syncRecipePermissionsToBags).
    await syncRecipePermissionsToBags(prisma, bags, recipePermissions, roles);

    // Mirror the wiki's display name into the default bag's starter tiddlers.
    // Runs on every save of an existing wiki: it also heals tiddlers that were
    // left behind by edits made before this sync existed.
    if (priorRecipe) {
      const defaultBagName = data.writablePrefixBags.find((row) => row.prefix === "")?.bagName
        ?? bags.find((e) => e.isWritable && e.prefix === "")?.bagName;
      if (defaultBagName)
        await mirrorDisplayNameIntoStarterTiddlers(prisma, new IdString(id), defaultBagName, data.displayName);
    }

    let ownerUsername = "";
    if (existingRecipe?.owner_user_id) {
      const owner = await prisma.users.findUnique({ where: { user_id: existingRecipe.owner_user_id }, select: { username: true } });
      ownerUsername = owner?.username ?? "";
    } else if (!existingRecipe) {
      ownerUsername = this.user.username;
    }

    const sharedWritableBags = await classifySharedWritableBags(prisma, {
      ownerUserId: existingRecipe?.owner_user_id ?? this.user.user_id,
      compiledBags: bags,
    });

    return this.buildResponse({
      id: new IdString(id),
      slug: data.slug,
      definition: authoredDefinition,
      templateName: template.name,
      lastCompiledAt,
      allbags: bags,
      plugins,
      recipePermissions,
      ownerUsername,
      myRights: this.user.isAdmin ? "admin" : existingRecipe?.owner_user_id === this.user.user_id ? "owner" : "",
      sharedWritableBags,
    });

  }

  private buildResponse({ definition, plugins, allbags, id, slug, templateName, lastCompiledAt, recipePermissions, ownerUsername = "", myRights = "", sharedWritableBags = [] }: {
    id: IdString;
    slug: string;
    lastCompiledAt: Date;
    definition: RecipeDefinition;
    allbags: CompiledRecipeBagInput[];
    plugins: string[];
    recipePermissions: PermissionRow<RecipePermissionLevel>[];
    templateName: string;
    ownerUsername: string;
    myRights: string;
    /** writable bags that users other than the wiki owner can write to */
    sharedWritableBags: string[];
  }): DataStore["wikis"][number] {
    const effectivePluginSet = plugins;
    const effectiveReadonlyBags = allbags
      .filter(e => !e.isWritable)
      .map((row) => row.bagName);
    const effectiveWritableBags = allbags
      .filter((row) => row.isWritable)
      .sort((a, b) => b.prefix.length - a.prefix.length)
      .map((row) => ({ prefix: row.prefix, bagName: row.bagName }));

    return {
      ...definition,
      // legacy definitions predate cspAllow — default to empty
      cspAllow: definition.cspAllow ?? [],
      id,
      slug,
      templateName,
      lastCompiledAt: lastCompiledAt.toISOString(),
      // recipePermissions,
      effectiveWritableBags,
      effectiveReadonlyBags,
      effectivePluginSet,
      ownerUsername,
      myRights,
      sharedWritableBags,
      recipeAdmins: recipePermissions.filter(e => e.level === "B_write").map(e => e.role),
      recipeUsers: recipePermissions.filter(e => e.level === "A_read").map(e => e.role),
    };
  }

  async getList(prisma: PrismaTxnClient, roles: (key: IdString) => string) {

    const visibleRoleIds = this.user.isAdmin ? undefined : visibilityRoleIds(this.user.roles);
    // Ersteller sehen ihre eigenen Wikis immer, auch wenn deren
    // Permissions nur auf Core-Rollen (USER/ANON/ADMIN) oder auf
    // Rollen verweisen, die sie selbst nicht halten (z. B. geseedete
    // oder Klassen-Wikis). Für andere User bleibt die Sichtbarkeit
    // rein rollenbasiert — private Wikis bleiben privat.
    const where = visibleRoleIds
      ? { OR: [
          { permissions: { some: { role_id: { in: visibleRoleIds } } } },
          { owner_user_id: this.user.user_id },
        ] }
      : undefined;
    const myRoleIds = new Set(this.user.roles.map(e => e.role_id));
    const myRoleIdArray = Array.from(myRoleIds);
    const recipes = await prisma.recipe.findMany({
      where,
      select: {
        id: true,
        slug: true,
        definition: true,
        plugins: true,
        template_id: true,
        compiledAt: true,
        owner_user_id: true,
        permissions: {
          select: {
            level: true,
            role_id: true,
          },
        },
        recipe_bags: {
          select: {
            bag_id: true,
            priority: true,
            is_writable: true,
            prefix: true,
            bag: {
              select: {
                name: true,
                owner_user_id: true,
                permissions: {
                  where: { role_id: { in: myRoleIdArray } },
                  orderBy: { level: "desc" },
                  select: { level: true, role_id: true },
                },
              },
            },
          },
        },
      },
    });

    // these are connected but I figured this could result in simpler queries
    // it could also lend itself better to future changes
    const templates = await new TemplateImportWriter(prisma, false).getIdMapper();
    const bags = await new BagImportWriter(prisma, false).getIdMapper();

    // Unfiltered bag permissions for the shared-area classification: the
    // select above is (deliberately) filtered to the current user's roles, so
    // the writable grants for all roles are fetched in a separate pass.
    const allBagIds = Array.from(new Set(recipes.flatMap(r => r.recipe_bags).map(rb => rb.bag_id)));
    const classificationBags = new Map(
      allBagIds.length
        ? (await prisma.bag.findMany({
            where: { id: { in: allBagIds } },
            select: {
              id: true,
              name: true,
              owner_user_id: true,
              permissions: { orderBy: { level: "desc" }, select: { level: true, role_id: true } },
            },
          })).map(e => [e.id, e])
        : []
    );

    const ownerIds = Array.from(new Set(recipes.map(e => e.owner_user_id).filter((id): id is string => Boolean(id))));
    const ownerNames = new Map((
      ownerIds.length
        ? await prisma.users.findMany({ where: { user_id: { in: ownerIds } }, select: { user_id: true, username: true } })
        : []
    ).map(e => [e.user_id, e.username]));

    // Foreign-writer classification for the shared-area warning: every
    // role_id granted B_write/C_admin anywhere in the visible recipe set,
    // its members, and its role names, fetched in a few round-trips.
    const grantRoleIds = Array.from(new Set(
      recipes.flatMap(r => r.recipe_bags)
        .flatMap(rb => classificationBags.get(rb.bag_id)?.permissions ?? [])
        .map(p => p.role_id)
        .filter((id): id is string => Boolean(id))
    ));
    const { roleNames, memberIdsByRole } = await roleNamesAndMembers(prisma, grantRoleIds);

    return recipes.map((recipe): IRecipeRow => {
      recipe.recipe_bags.sort(e => e.priority);

      let myRights = "";
      if (this.user.isAdmin) myRights = "admin";
      else if (recipe.owner_user_id === this.user.user_id) myRights = "owner";
      else {
        const recipeLevel = recipeLevelForUser(recipe.permissions, myRoleIds);
        const writeTarget = recipe.recipe_bags.find(e => e.is_writable && e.prefix === "")
          ?? recipe.recipe_bags.find(e => e.is_writable);
        if (writeTarget && bagWriteAllowed(writeTarget, this.user)) myRights = "write";
        else if (recipeLevel) myRights = "read";
      }

      const sharedWritableBags = foreignWritableBagNames({
        ownerUserId: recipe.owner_user_id,
        roleNameById: (role_id) => roleNames.get(role_id) ?? "",
        memberIdsByRole,
        bags: recipe.recipe_bags.map(e => {
          const bag = classificationBags.get(e.bag_id);
          return {
            bagName: bag?.name ?? "",
            owner_user_id: bag?.owner_user_id ?? null,
            isWritable: e.is_writable,
            allPermissions: bag?.permissions ?? [],
          };
        }),
      });

      return this.buildResponse({
        allbags: recipe.recipe_bags.map(e => ({
          bagName: bags(new IdString(e.bag_id)),
          isWritable: e.is_writable,
          prefix: e.prefix,
          priority: e.priority,
        })),
        definition: recipe.definition,
        id: new IdString(recipe.id),
        slug: recipe.slug,
        lastCompiledAt: recipe.compiledAt,
        plugins: recipe.plugins,
        ownerUsername: recipe.owner_user_id ? ownerNames.get(recipe.owner_user_id) ?? "" : "",
        recipePermissions: recipe.permissions.map(e => ({
          level: e.level,
          role: roles(new IdString(e.role_id)),
        })),
        templateName: templates(new IdString(recipe.template_id)),
        myRights,
        sharedWritableBags,
      });
    })
  }

}

// #region Template

export class TemplateDataAdapter extends TabDataAdapter<"templates"> {
  async saveRow(prisma: PrismaTxnClient, data: DataSave["templates"][number]): Promise<DataStore["templates"][number]> {
    const importer = new TemplateImportWriter(prisma, false);
    await importer.checkExisting(data.id, data.name, this.user);

    const record = await prisma.template.findUnique({
      where: { name: data.name },
      select: { owner_user_id: true },
    });
    assertCanEdit({ existingOwnerId: record?.owner_user_id, user: this.user, kind: "template" });

    const templatePermissions = [
      ...data.templateUsers.map(e => ({ level: "A_read" as const, role: e })),
      ...data.templateAdmins.map(e => ({ level: "B_write" as const, role: e })),
    ]
    // roles aren't connected to data tables so they can be swapped out for SSO
    const roleIds = await getRolesMapper(prisma, templatePermissions.map((row) => row.role));
    let template: UpsertTemplateInput;
    const isDefault = data.name === DEFAULT_TEMPLATE;
    if (isDefault) {
      const existing = await prisma.template.findUnique({ where: { name: DEFAULT_TEMPLATE } });
      if (!existing) throw new Error("could not find the default template");
      template = {
        name: DEFAULT_TEMPLATE,
        definition: {
          ...existing.definition,
          externalPlugins: data.externalPlugins,
          externalStore: data.externalStore,
        },
        permissions: templatePermissions.map(e => ({ level: e.level, role_id: roleIds(e.role), })),
        ownerUserId: record ? undefined : (this.user.user_id ? new IdString(this.user.user_id) : undefined),
      }
    } else {
      template = {
        name: data.name,
        definition: {
          type: "simpleV1",
          description: data.description,
          readonlyBags: normalizeLineList(data.readonlyBags),
          writablePrefixBags: normalizePrefixRows(data.writablePrefixBags),
          plugins: normalizeLineList(data.plugins),
          externalPlugins: data.externalPlugins,
          externalStore: data.externalStore,
          twVersion: data.twVersion,
          requiredPluginsEnabled: data.requiredPluginsEnabled,
          customHtmlEnabled: data.customHtmlEnabled,
          htmlContent: data.htmlContent,
          injectionFunction: data.injectionFunction,
          injectionLocation: data.injectionLocation,
        },
        permissions: templatePermissions.map(e => ({ level: e.level, role_id: roleIds(e.role), })),
        ownerUserId: record ? undefined : (this.user.user_id ? new IdString(this.user.user_id) : undefined),
      };
    }

    // Same bag-hijack gate as for recipes: a template's writablePrefixBags /
    // readonlyBags compile into the access list of every wiki built from it.
    // The default template only authors externalPlugins/externalStore, so its
    // save path is not affected.
    if (!isDefault) {
      await assertBagReferencesAllowed(
        prisma,
        this.user,
        [
          ...normalizePrefixRows(data.writablePrefixBags).map(e => ({ bagName: e.bagName, isWritable: true })),
          ...normalizeLineList(data.readonlyBags).map(e => ({ bagName: e, isWritable: false })),
        ],
        templatePermissions,
      );
    }

    const [{ id: template_id, updated }] = await importer.upsert([template]);
    if (!isDefault) {
      const recipes = await prisma.recipe.findMany({
        where: { template_id },
        include: { permissions: true }
      });

      const importerRecipe = new RecipeImportWriter(prisma, false);

      for (const recipe of recipes) {
        const compiled = importerRecipe.compileRecipeSimpleV1(
          recipe.definition,
          template.definition,
        );

        await importerRecipe.upsert([{
          slug: recipe.slug,
          templateId: new IdString(template_id),
          compiledBags: compiled.bags,
          plugins: compiled.plugins,
          definition: recipe.definition,
          permissions: recipe.permissions.map(row => ({
            level: row.level,
            role_id: new IdString(row.role_id),
          })),
        }]);
      }
    }

    const ownerUsername = record?.owner_user_id
      ? (await prisma.users.findUnique({ where: { user_id: record.owner_user_id }, select: { username: true } }))?.username ?? ""
      : this.user.username;

    return {
      ...template.definition,
      id: new IdString(template_id),
      name: data.name,
      type: "simpleV1",
      lastUpdatedAt: updated.toISOString(),
      templateAdmins: templatePermissions.filter(e => e.level === "B_write").map(e => e.role),
      templateUsers: templatePermissions.filter(e => e.level === "A_read").map(e => e.role),
      ownerUsername,
    };
  }

  async getList(prisma: PrismaTxnClient, roles: (key: IdString) => string) {
    const where = this.user.isAdmin
      ? undefined
      : this.user.isTeacher
        ? { OR: [
            { permissions: { some: { role_id: { in: this.user.roles.map(e => e.role_id) } } } },
            { name: DEFAULT_TEMPLATE },
          ] }
        : { permissions: { some: { role_id: { in: this.user.roles.map(e => e.role_id) } } } };
    const templates = await prisma.template.findMany({
      where,
      select: {
        id: true,
        name: true,
        definition: true,
        type: true,
        updated: true,
        owner_user_id: true,
        recipes: {
          select: {
            id: true,
            slug: true,
          },
        },
        permissions: {
          select: {
            level: true,
            role_id: true,
          }
        }
      },
      orderBy: { id: "asc" },
    });

    const ownerIds = Array.from(new Set(templates.map(e => e.owner_user_id).filter((id): id is string => Boolean(id))));
    const ownerNames = new Map((
      ownerIds.length
        ? await prisma.users.findMany({ where: { user_id: { in: ownerIds } }, select: { user_id: true, username: true } })
        : []
    ).map(e => [e.user_id, e.username]));

    return templates.map((template): ITemplateRow => {
      /* @deprecated - version 0.2 */
      if (template.definition.twVersion?.startsWith("tw5-"))
        template.definition.twVersion = template.definition.twVersion.slice(4);
      return {
        ...template.definition,
        id: new IdString(template.id),
        name: template.name,
        type: "simpleV1",
        lastUpdatedAt: template.updated.toISOString(),
        ownerUsername: template.owner_user_id ? ownerNames.get(template.owner_user_id) ?? "" : "",
        templateAdmins: template.permissions.filter(e => e.level === "B_write").map(e => roles(new IdString(e.role_id))),
        templateUsers: template.permissions.filter(e => e.level === "A_read").map(e => roles(new IdString(e.role_id))),
      };
    });
  }
}

// #region Bag

export class BagDataAdapter extends TabDataAdapter<"bags"> {

  async saveRow(prisma: PrismaTxnClient, data: DataSave["bags"][number]): Promise<DataStore["bags"][number]> {
    const importer = new BagImportWriter(prisma, false);
    await importer.checkExisting(data.id, data.name, this.user);

    const existing = await prisma.bag.findUnique({
      where: { name: data.name },
      select: { owner_user_id: true },
    });
    const isOwner = !!existing?.owner_user_id && existing.owner_user_id === this.user.user_id;
    const isSiteAdmin = this.user.username === "admin";
    if (existing && !isOwner && !isSiteAdmin)
      throw new SendError("ACCESS_DENIED", 403, { reason: "Only the user who created the bag (or the site admin 'admin') may edit it." });

    const permissions = normalizePermissions(data.bagPermissions);
    const roles = await getRolesMapper(prisma, permissions.map(e => e.role));

    const [bag] = await importer.upsert([{
      name: data.name,
      description: data.description,
      ownerUserId: existing ? undefined : (this.user.user_id ? new IdString(this.user.user_id) : undefined),
      permissions: data.bagPermissions.map(e => ({
        role_id: roles(e.role),
        level: e.level as BagPermissionLevel
      }))
    }]);

    const ownerUsername = existing?.owner_user_id
      ? (await prisma.users.findUnique({ where: { user_id: existing.owner_user_id }, select: { username: true } }))?.username ?? ""
      : this.user.username;

    return {
      id: new IdString(bag.id),
      name: data.name,
      description: data.description,
      ownerUsername,
      bagPermissions: data.bagPermissions,
    }
  }
  async getList(prisma: PrismaTxnClient, roles: (key: IdString) => string): Promise<DataStore["bags"]> {

    const visibleRoleIds = this.user.isAdmin ? undefined : visibilityRoleIds(this.user.roles);
    const bags = await prisma.bag.findMany({
      where: visibleRoleIds ? { permissions: { some: { role_id: { in: visibleRoleIds } } } } : undefined,
      select: {
        id: true,
        name: true,
        description: true,
        owner_user_id: true,
        permissions: {
          select: {
            level: true,
            role_id: true,
          },
        },
      },
    });

    const ownerIds = Array.from(new Set(bags.map(e => e.owner_user_id).filter((id): id is string => Boolean(id))));
    const ownerNames = new Map((
      ownerIds.length
        ? await prisma.users.findMany({ where: { user_id: { in: ownerIds } }, select: { user_id: true, username: true } })
        : []
    ).map(e => [e.user_id, e.username]));

    return bags.map((bag) => ({
      id: new IdString(bag.id),
      name: bag.name,
      description: bag.description,
      ownerUsername: bag.owner_user_id ? ownerNames.get(bag.owner_user_id) ?? "" : "",
      bagPermissions: bag.permissions.map((row) => ({
        role: roles(new IdString(row.role_id)),
        level: row.level,
      })),
    }));
  }
}

async function getRolesMapper(prisma: PrismaTxnClient, roles: readonly string[]) {
  return await new RoleImportWriter(prisma, false).getNameMapper(roles);
}

/**
 * Shared ownership guard: a record may only be edited by the user who
 * created it (owner) or by the bootstrap site admin account ("admin").
 * Records without an owner (legacy/system rows) are admin-only.
 */
function assertCanEdit(opts: {
  existingOwnerId: string | null | undefined;
  user: ServerRequest["user"];
  kind: string;
  /** additionally allow this explicit user_id (e.g. editing one's own account) */
  selfUserId?: string;
}) {
  const { existingOwnerId, user, kind, selfUserId } = opts;
  const isOwner = !!existingOwnerId && existingOwnerId === user.user_id;
  const isSiteAdmin = user.username === "admin";
  const isSelf = !!selfUserId && user.user_id === selfUserId;
  // existingOwnerId === undefined means the record does not exist yet (create).
  // A present owner that is not the current user — or a missing owner (legacy
  // / system rows) — may only be edited by the site admin account.
  if (existingOwnerId !== undefined && !isOwner && !isSiteAdmin && !isSelf)
    throw new SendError("ACCESS_DENIED", 403, {
      reason: `Only the user who created this ${kind} (or the site admin 'admin') may edit it.`,
    });
}

// #region Role

/**
 * Returns the set of user_ids among `ownerIds` whose accounts carry a role
 * with the teacher capability flag (`is_teacher`). Used to detect another
 * teacher's personal role.
 */
async function getTeacherOwnerIdSet(prisma: PrismaTxnClient, ownerIds: string[]): Promise<Set<string>> {
  if (!ownerIds.length) return new Set();
  const ownedUsers = await prisma.users.findMany({
    where: { user_id: { in: ownerIds } },
    select: { user_id: true, roles: { where: { is_teacher: true }, select: { role_name: true } } },
  });
  return new Set(ownedUsers.filter(o => o.roles.length).map(o => o.user_id));
}

/**
 * For the current user: the set of user_ids of everyone who shares at least one
 * group role with them (classmates, their class teacher/team-leader). The
 * connection is made purely through common membership: who "knows" whom is
 * decided by the group roles (e.g. a class) both are members of. The user
 * themself is included, which is harmless. Not used for admins
 * (they see everything); applied to students and teachers alike.
 */
async function getMyGroupMemberIdSet(prisma: PrismaTxnClient, me: ServerRequest["user"]): Promise<Set<string>> {
  const myGroupRoleIds = me.roles
    .filter(role => role.role_name !== "ADMIN" && role.role_name !== "USER" && role.role_name !== "ANON")
    .map(role => role.role_id);
  if (!myGroupRoleIds.length) return new Set();
  const groupMembers = await prisma.users.findMany({
    where: { roles: { some: { role_id: { in: myGroupRoleIds } } } },
    select: { user_id: true },
  });
  return new Set(groupMembers.map(member => member.user_id));
}

export class RoleDataAdapter extends TabDataAdapter<"roles"> {
  async saveRow(prisma: PrismaTxnClient, data: DataSave["roles"][number]): Promise<DataStore["roles"][number]> {

    const importer = new RoleImportWriter(prisma, false);
    await importer.checkExisting(data.id, data.name, this.user);

    const record = await prisma.roles.findUnique({
      where: { role_id: data.id.toString() },
      select: { owner_user_id: true, is_teacher: true },
    });
    assertCanEdit({ existingOwnerId: record?.owner_user_id, user: this.user, kind: "role" });

    // The teacher capability flag is a privileged switch that only site
    // admins may touch; teachers may edit their own role rows otherwise.
    if (data.isTeacher) {
      if (!this.user.isAdmin)
        throw new SendError("ACCESS_DENIED", 403, { reason: "You must be an admin to grant teacher capabilities." });
    } else if (record?.is_teacher) {
      if (!this.user.isAdmin)
        throw new SendError("ACCESS_DENIED", 403, { reason: "You must be an admin to change teacher capabilities." });
    }

    const [role] = await importer.upsert([{
      description: data.description,
      name: data.name,
      isTeacher: data.isTeacher,
      ownerUserId: record ? undefined : (this.user.user_id ? new IdString(this.user.user_id) : undefined),
    }]);

    const ownerUserId = record?.owner_user_id ?? this.user.user_id;
    const ownerUsername = record?.owner_user_id
      ? (await prisma.users.findUnique({ where: { user_id: record.owner_user_id }, select: { username: true } }))?.username ?? ""
      : this.user.username;
    const ownerIsTeacher = await getTeacherOwnerIdSet(prisma, [ownerUserId]);
    const myGroupMemberIds = this.user.isAdmin ? new Set<string>() : await getMyGroupMemberIdSet(prisma, this.user);

    return {
      id: new IdString(role.role_id),
      name: role.role_name,
      description: role.description ?? "",
      isTeacher: Boolean(role.is_teacher),
      ownerUsername,
      foreignTeacherRole: ownerUserId !== this.user.user_id && ownerIsTeacher.has(ownerUserId),
      ownerSharesGroupWithMe: Boolean(ownerUserId && myGroupMemberIds.has(ownerUserId) && ownerUserId !== this.user.user_id),
    }
  }
  // roles aren't connected to data tables so they can be swapped out for SSO
  async getList(prisma: PrismaTxnClient): Promise<DataStore["roles"]> {
    const roles = await prisma.roles.findMany({
      select: {
        role_id: true,
        role_name: true,
        description: true,
        is_teacher: true,
        owner_user_id: true,
      },
    });

    const ownerIds = Array.from(new Set(roles.map(e => e.owner_user_id).filter((id): id is string => Boolean(id))));
    const ownerNames = new Map((
      ownerIds.length
        ? await prisma.users.findMany({ where: { user_id: { in: ownerIds } }, select: { user_id: true, username: true } })
        : []
    ).map(e => [e.user_id, e.username]));
    const ownerIsTeacher = await getTeacherOwnerIdSet(prisma, ownerIds);
    const myGroupMemberIds = this.user.isAdmin ? new Set<string>() : await getMyGroupMemberIdSet(prisma, this.user);

    return roles.map((role) => ({
      id: new IdString(role.role_id),
      name: role.role_name,
      description: role.description ?? "",
      isTeacher: Boolean(role.is_teacher),
      ownerUsername: role.owner_user_id ? ownerNames.get(role.owner_user_id) ?? "" : "",
      foreignTeacherRole: Boolean(
        role.owner_user_id && ownerIsTeacher.has(role.owner_user_id) && role.owner_user_id !== this.user.user_id
      ),
      ownerSharesGroupWithMe: Boolean(
        role.owner_user_id && myGroupMemberIds.has(role.owner_user_id) && role.owner_user_id !== this.user.user_id
      ),
    }));

  }
}

// #region User
/**
 * Formats a user's own-wiki usage for the "Own wikis" list column.
 * `limit` is the configured cap (null = unlimited). Example: "2 / 3".
 */
function formatOwnWikiUsage(count: number, limit: number | null): string {
  return `${count} / ${limit == null ? "∞" : limit}`;
}

/**
 * The "role in the group" of a user, shown in the users tab: for a user who
 * holds a teacher-function role, only that function role name is reported;
 * otherwise the group/class role name(s) the user belongs to (excluding their
 * own personal role and the system roles, which have no owner).
 */
function roleGroupNamesForUser(
  username: string,
  roles: readonly { role_name: string; is_teacher: boolean; owner_user_id: string | null }[],
): string[] {
  const teacherFunctions = roles.filter((role) => role.is_teacher).map((role) => role.role_name);
  if (teacherFunctions.length) return teacherFunctions;
  return roles
    .filter((role) => !role.is_teacher && Boolean(role.owner_user_id) && role.role_name !== username)
    .map((role) => role.role_name);
}

export class UserDataAdapter extends TabDataAdapter<"users"> {
  constructor(
    user: ServerRequest["user"],
    private readonly passwordService?: PasswordService,
  ) {
    super(user);
  }

  async saveRow(prisma: PrismaTxnClient, data: DataSave["users"][number]): Promise<DataStore["users"][number]> {

    if (!this.user.isAdmin && !this.user.isTeacher)
      throw new SendError("ACCESS_DENIED", 403, { reason: "You must be an admin to manage user accounts." });

    const importer = new UserImportWriter(prisma, false);
    await importer.checkExisting(data.id, data.username, this.user);

    if (!this.user.isAdmin) {
      // Teachers may not hand out privileged roles or create more teachers,
      // nor may they hand out another teacher's personal role (which would
      // leak that teacher's wikis to the recipient). Teacher capability is
      // tracked via the is_teacher flag, so it survives any role rename.
      const normalized = normalizeLineList(data.userRoles);
      const candidateRoles = normalized.length
        ? await prisma.roles.findMany({
            where: { role_name: { in: normalized } },
            select: { role_name: true, is_teacher: true },
          })
        : [];
      const capabilityByName = new Map(candidateRoles.map((role) => [role.role_name, role.is_teacher]));
      const forbidden = normalized.find((role) => role === "ADMIN" || capabilityByName.get(role) === true);
      if (forbidden)
        throw new SendError("ACCESS_DENIED", 403, { reason: `You are not allowed to assign the "${forbidden}" role.` });

      const personal = await prisma.roles.findMany({
        where: {
          role_name: { in: normalized },
          owner_user_id: { not: null },
        },
        select: { role_name: true, owner_user_id: true },
      });
      if (personal.length) {
        const ownerIds = Array.from(new Set(personal.map(r => r.owner_user_id).filter((id): id is string => Boolean(id))));
        const owners = ownerIds.length
          ? await prisma.users.findMany({
              where: { user_id: { in: ownerIds } },
              select: { user_id: true, roles: { where: { is_teacher: true }, select: { role_name: true } } },
            })
          : [];
        const teacherOwnerIds = new Set(owners.filter(o => o.roles.length).map(o => o.user_id));
        const foreignPersonal = personal.find(r =>
          r.owner_user_id && teacherOwnerIds.has(r.owner_user_id) && r.owner_user_id !== this.user.user_id);
        if (foreignPersonal)
          throw new SendError("ACCESS_DENIED", 403, { reason: `You are not allowed to assign the "${foreignPersonal.role_name}" role.` });
      }
    }

    const record = await prisma.users.findUnique({
      where: { username: data.username },
      select: { user_id: true, owner_user_id: true },
    });
    assertCanEdit({ existingOwnerId: record?.owner_user_id, user: this.user, kind: "user account", selfUserId: data.id.toString() });

    const normalizedUserRoles = normalizeLineList(data.userRoles).map((role) => role);
    const rolesMapper = await getRolesMapper(prisma, normalizedUserRoles);
    const roleLinks = normalizedUserRoles.map(e => rolesMapper(e));

    // Empty string means "unlimited" (stored as NULL); otherwise the zod
    // schema already guarantees a non-negative whole number.
    const wikiLimit = data.wikiLimit.trim() === "" ? null : Number(data.wikiLimit);

    const [user] = await importer.upsert([{
      username: data.username,
      email: data.email,
      roleIds: roleLinks,
      resetCode: data.resetCode || null,
      wikiLimit,
    }])

    if (!record) {
      // accounts are created by another user ("invitation"): the creating
      // user becomes the owner. The created user themself (selfUserId) and
      // the site admin may still edit the record.
      await prisma.users.update({
        where: { user_id: user.user_id },
        data: { owner_user_id: this.user.user_id },
      });
    }

    if (data.password && this.passwordService) {
      // no emails are sent, so an admin can set a password directly;
      // the plaintext is hashed server-side (OPAQUE registration record).
      const registrationRecord = await this.passwordService.PasswordCreation(user.user_id, data.password);
      await prisma.users.update({
        where: { user_id: user.user_id },
        data: { password: registrationRecord },
      });
    }

    const ownerUsername = record?.owner_user_id
      ? (await prisma.users.findUnique({ where: { user_id: record.owner_user_id }, select: { username: true } }))?.username ?? ""
      : this.user.username;

    const ownWikiCount = await prisma.recipe.count({ where: { owner_user_id: user.user_id } });
    // Admins and teachers are not subject to the own-wiki limit, so their
    // stored (default) limit must not be shown as if it applied.
    const limitExempt = normalizedUserRoles.includes("ADMIN")
      || (await prisma.roles.count({ where: { role_name: { in: normalizedUserRoles }, is_teacher: true } })) > 0;

    const roleInfos = normalizedUserRoles.length
      ? await prisma.roles.findMany({
          where: { role_name: { in: normalizedUserRoles } },
          select: { role_name: true, is_teacher: true, owner_user_id: true },
        })
      : [];

    return {
      id: new IdString(user.user_id),
      username: user.username,
      email: user.email ?? "",
      resetCode: user.resetCode ?? "",
      password: "",
      ownerUsername,
      userRoles: normalizedUserRoles,
      groupRoles: roleGroupNamesForUser(user.username, roleInfos),
      wikiLimit: user.wiki_limit == null ? "" : String(user.wiki_limit),
      ownWikiUsage: formatOwnWikiUsage(ownWikiCount, limitExempt ? null : user.wiki_limit),
    }
  }
  // roles aren't connected to data tables so they can be swapped out for SSO
  async getList(prisma: PrismaTxnClient, roles: (key: IdString) => string): Promise<DataStore["users"]> {
    if (!this.user.isAdmin && !this.user.isTeacher) return [];
    const where = this.user.isAdmin
      ? undefined
      : { OR: [
          { owner_user_id: this.user.user_id },
          { user_id: this.user.user_id },
        ] };
    const users = await prisma.users.findMany({
      where,
      select: {
        user_id: true,
        username: true,
        email: true,
        resetCode: true,
        owner_user_id: true,
        wiki_limit: true,
        roles: {
          select: {
            role_name: true,
            is_teacher: true,
            owner_user_id: true,
          },
          orderBy: { role_name: "asc" },
        },
      },
      orderBy: { username: "asc" },
    })

    const ownerIds = Array.from(new Set(users.map(e => e.owner_user_id).filter((id): id is string => Boolean(id))));
    const ownerNames = new Map((
      ownerIds.length
        ? await prisma.users.findMany({ where: { user_id: { in: ownerIds } }, select: { user_id: true, username: true } })
        : []
    ).map(e => [e.user_id, e.username]));

    // Own-wiki counts are read directly from the recipes so a teacher sees the
    // real usage even for wikis that aren't visible to them in the wikis list.
    const ownWikiCounts = new Map<string, number>();
    for (const recipe of await prisma.recipe.findMany({ select: { owner_user_id: true } }))
      if (recipe.owner_user_id)
        ownWikiCounts.set(recipe.owner_user_id, (ownWikiCounts.get(recipe.owner_user_id) ?? 0) + 1);

    return users.map((user) => ({
      id: new IdString(user.user_id),
      username: user.username,
      email: user.email ?? "",
      userRoles: user.roles.map((role) => role.role_name),
      groupRoles: roleGroupNamesForUser(user.username, user.roles),
      ownerUsername: user.owner_user_id ? ownerNames.get(user.owner_user_id) ?? "" : "",
      resetCode: user.resetCode || "",
      password: "",
      wikiLimit: user.wiki_limit == null ? "" : String(user.wiki_limit),
      ownWikiUsage: formatOwnWikiUsage(
        ownWikiCounts.get(user.user_id) ?? 0,
        user.roles.some(role => role.role_name === "ADMIN" || role.is_teacher) ? null : user.wiki_limit,
      ),
    }));
  }
}


export const AdminSave = zodRoute({
  method: ["PUT"],
  path: "/admin/:op/:tab",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({
    op: z.enum(["save"]),
    tab: z.enum(["wikis", "templates", "bags", "users", "roles"] satisfies TabId[])
  }),
  zodRequestBody: z => z.any(),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.asserted = state.user.isLoggedIn;
    state.data = JSON.parse(JSON.stringify(state.data), (key: any, val: any) => {
      if (typeof val === "string" && val.startsWith(IdString.prefix))
        return new IdString(val.slice(IdString.prefix.length));
      // if (typeof val === "string" && val.startsWith("KeyString____"))
      //   return val.slice("KeyString____".length);
      return val;
    });

    checkData(state, () => buildTabZodObject(state.pathParams.tab, "DataSave"), new Error());

    const res = await state.$transaction(async prisma => {
      const { pathParams: { op, tab }, data } = state;
      if (op !== "save") throw new Error(`Unsupported admin operation: ${op}`);
      switch (tab) {
        case "wikis": return await new RecipeDataAdapter(state.user).saveRow(prisma, data as IRecipeRow);
        case "templates": return await new TemplateDataAdapter(state.user).saveRow(prisma, data as ITemplateRow);
        case "bags": return await new BagDataAdapter(state.user).saveRow(prisma, data as IBagRow);
        case "roles": return await new RoleDataAdapter(state.user).saveRow(prisma, data as IRoleRow);
        case "users": return await new UserDataAdapter(state.user, state.PasswordService).saveRow(prisma, data as IUserRow);
        default: {
          const _exhaustive: never = tab;
          throw new Error(`Unsupported admin tab: ${_exhaustive}`);
        }
      }
    });

    const { success, data: res2, error } = buildTabZodObject(state.pathParams.tab, "DataStore").safeParse(res);
    if (!success) console.log("Response validation: ", error);
    return res2;
  }
});

export const AdminLoad = zodRoute({
  method: ["GET"],
  path: "/admin/load",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.asserted = state.user.isLoggedIn;
    const res = await state.$transaction(async prisma => {
      const roles = await new RoleImportWriter(prisma, false).getIdMapper();
      return {
        wikis: await new RecipeDataAdapter(state.user).getList(prisma, roles),
        templates: await new TemplateDataAdapter(state.user).getList(prisma, roles),
        bags: await new BagDataAdapter(state.user).getList(prisma, roles),
        roles: await new RoleDataAdapter(state.user).getList(prisma),
        users: await new UserDataAdapter(state.user).getList(prisma, roles),
        availablePlugins: state.pluginCache.pluginsList.map(e => ({
          name: e.title,
          description: `${e.name}: ${e.desc}`,
        })),
      } satisfies Omit<DataStore, "availableBagNames" | "availablePluginNames">;
    });
    const { success, data, error } = zod.object({
      wikis: buildTabZodObject("wikis", "DataStore").array(),
      templates: buildTabZodObject("templates", "DataStore").array(),
      bags: buildTabZodObject("bags", "DataStore").array(),
      roles: buildTabZodObject("roles", "DataStore").array(),
      users: buildTabZodObject("users", "DataStore").array(),
      availablePlugins: zod.array(zod.object({
        name: zod.string(),
        description: zod.string(),
      })),
    }).safeParse(res);
    if (!success) throw error;
    return data;
  }
});

// #region AdminCreateWiki
const NEW_WIKI_ROLES = ["ADMIN", "USER", "ANON"] as const;

// A_read < B_write < C_admin — the highest permission a user's roles hold on
// the wiki definition. Used to summarize "which rights do I have" per wiki.
function recipeLevelForUser(permissions: { level: string; role_id: string }[], myRoleIds: Set<string>): string {
  let level = "";
  for (const e of permissions) {
    if (!myRoleIds.has(e.role_id)) continue;
    if (e.level === "C_admin") return e.level;
    if (e.level === "B_write" && level !== "C_admin") level = "B_write";
    if (e.level === "A_read" && !level) level = "A_read";
  }
  return level;
}

/** Mirrors RecipeResolver.canWriteBag against the user's own bag permissions. */
function bagWriteAllowed(
  rb: { bag: { owner_user_id: string | null; permissions: { level: string; role_id: string }[] } },
  user: { user_id: string; isAdmin: boolean; AdminRoleID: string },
): boolean {
  if (rb.bag.owner_user_id === user.user_id) return true;
  if (user.isAdmin && !rb.bag.permissions.find(e => e.role_id === user.AdminRoleID)) return true;
  return ["B_write", "C_admin"].includes(rb.bag.permissions[0]?.level ?? "");
}

/** Carried by the site admin account; never counts as a "foreign" writer. */
const SYSTEM_WRITER_ROLES = new Set(["ADMIN", "USER", "ANON"]);

/**
 * Names of a wiki's writable bags that users other than the wiki owner can
 * write to, making the wiki a collaboration surface. A bag counts when
 *   * it is itself a write target owned by a different user, or
 *   * it carries a write-level (B_write/C_admin) grant for a role whose
 *     members include someone who is not the wiki owner (system roles
 *     ADMIN/USER/ANON are excluded — those belong to the platform).
 * Every writer of a shared bag can read all of the wiki's tiddlers today
 * (see the known H2 limitation), so the admin UI warns about these areas.
 */
function foreignWritableBagNames(opts: {
  ownerUserId: string | null;
  roleNameById: (role_id: string) => string;
  /** role_id → user_ids of everyone holding that role. */
  memberIdsByRole: ReadonlyMap<string, ReadonlySet<string>>;
  bags: {
    bagName: string;
    owner_user_id: string | null;
    isWritable: boolean;
    allPermissions: { level: string; role_id: string }[];
  }[];
}): string[] {
  const { ownerUserId, roleNameById, memberIdsByRole, bags } = opts;
  const shared: string[] = [];
  for (const bag of bags) {
    const writers = new Set<string>();
    if (bag.isWritable && bag.owner_user_id && bag.owner_user_id !== ownerUserId)
      writers.add(bag.owner_user_id);
    for (const p of bag.allPermissions) {
      if (p.level !== "B_write" && p.level !== "C_admin") continue;
      const roleName = roleNameById(p.role_id);
      if (SYSTEM_WRITER_ROLES.has(roleName)) continue;
      const members = memberIdsByRole.get(p.role_id);
      if (!members) continue;
      for (const memberId of members) writers.add(memberId);
    }
    // No known owner: any writer is "foreign". With an owner, only writers
    // that are not the owner make the area shared.
    const sharedArea = ownerUserId
      ? [...writers].some(id => id !== ownerUserId)
      : writers.size > 0;
    if (sharedArea) shared.push(bag.bagName);
  }
  return shared.sort();
}

/**
 * Resolves role names and role memberships for a set of role_ids in a couple
 * of round-trips. Roles have no FK from the permission tables, so names and
 * members have to come from the auth module's own tables.
 */
async function roleNamesAndMembers(
  prisma: PrismaTxnClient,
  roleIds: string[],
): Promise<{ roleNames: Map<string, string>; memberIdsByRole: Map<string, Set<string>> }> {
  const roleNames = new Map(
    roleIds.length
      ? (await prisma.roles.findMany({ where: { role_id: { in: roleIds } }, select: { role_id: true, role_name: true } }))
          .map(e => [e.role_id, e.role_name])
      : []
  );
  const memberIdsByRole = new Map<string, Set<string>>();
  if (roleIds.length) {
    const roleMembers = await prisma.users.findMany({
      where: { roles: { some: { role_id: { in: roleIds } } } },
      select: { user_id: true, roles: { where: { role_id: { in: roleIds } }, select: { role_id: true } } },
    });
    for (const member of roleMembers)
      for (const role of member.roles) {
        const set = memberIdsByRole.get(role.role_id) ?? new Set<string>();
        set.add(member.user_id);
        memberIdsByRole.set(role.role_id, set);
      }
  }
  return { roleNames, memberIdsByRole };
}

/** Fetches the bag, role, and membership data for one compiled recipe and
 * classifies its shared (foreign-writable) areas. Used after a wiki save. */
async function classifySharedWritableBags(
  prisma: PrismaTxnClient,
  opts: { ownerUserId: string; compiledBags: { bagName: string; isWritable: boolean }[] },
): Promise<string[]> {
  const { ownerUserId, compiledBags } = opts;
  const bagNames = compiledBags.map(e => e.bagName);
  const bagRows = bagNames.length
    ? await prisma.bag.findMany({
        where: { name: { in: bagNames } },
        select: { name: true, owner_user_id: true, permissions: { select: { level: true, role_id: true } } },
      })
    : [];
  const byName = new Map(bagRows.map(b => [b.name, b]));
  const grantRoleIds = Array.from(new Set(bagRows.flatMap(b => b.permissions).map(p => p.role_id)));
  const { roleNames, memberIdsByRole } = await roleNamesAndMembers(prisma, grantRoleIds);
  return foreignWritableBagNames({
    ownerUserId,
    roleNameById: (role_id) => roleNames.get(role_id) ?? "",
    memberIdsByRole,
    bags: compiledBags.map(e => ({
      bagName: e.bagName,
      isWritable: e.isWritable,
      owner_user_id: byName.get(e.bagName)?.owner_user_id ?? null,
      allPermissions: byName.get(e.bagName)?.permissions ?? [],
    })),
  });
}

// Generische Systemrollen erzeugen keine Sichtbarkeit in den Admin-Listen:
// Wer nur über USER/ANON (geteilte Systemrollen) oder über eine Rolle mit
// Lehrer-Capability (is_teacher, unabhängig vom Rollennamen) Zugriff auf ein
// Wiki/Bag hat, sieht es nicht als "sein" Objekt. Nur qualifizierte Rollen
// (persönliche Rollen, eingeladene Rollen, Klassen-Rollen) zählen.
function visibilityRoleIds(userRoles: { role_id: string; role_name: string; is_teacher: boolean }[]): string[] {
  return userRoles
    .filter(e => e.role_name !== "ADMIN" && e.role_name !== "USER" && e.role_name !== "ANON" && !e.is_teacher)
    .map(e => e.role_id);
}

export function sanitizeSlugPart(input: string): string {
  return input.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function wikiSlugBase(username: string): string {
  const part = sanitizeSlugPart(username);
  return part ? `wiki-${part}` : "wiki";
}

async function findFreeWikiSlug(prisma: PrismaTxnClient, base: string): Promise<string> {
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await prisma.recipe.findUnique({ where: { slug: candidate }, select: { slug: true } });
    if (!existing) return candidate;
  }
}

function wikiTiddlerMeta(modifier: string) {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const timestamp = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
    pad(now.getUTCMilliseconds(), 3),
  ].join("");
  return { created: timestamp, modified: timestamp, creator: modifier, modifier };
}

function welcomeText(displayName: string): string {
  return `# Willkommen in „${displayName}" 🎉

Dieses Wiki wurde gerade per Knopfdruck für dich angelegt.

* Neue Tiddler schreibst du einfach, indem du einen neuen Tiddler anlegst.
* Alles wird automatisch gespeichert und ist sofort für andere sichtbar.

Viel Spaß beim Loslegen!`;
}

/**
 * One-click "new wiki": creates the bag, the recipe (Blank Template),
 * the default permissions and some starting tiddlers in a single
 * transaction. Only a display name is required — the slug is derived from
 * the logged-in user's username (`wiki-<username>`, numbered on conflict).
 */

/**
 * System role names that must never be reused as personal-role names.
 * Matched case-insensitively so a username like "admin" cannot create a
 * role that the auth layer would treat as the ADMIN system role.
 */
const RESERVED_SYSTEM_ROLE_NAMES = new Set(["ADMIN", "USER", "ANON", "TEACHER"].map((name) => name.toLowerCase()));

/**
 * Candidate names for a user's personal role, in order of preference: the raw
 * username first, then the slugified fallback. The raw username is skipped
 * when it collides with a reserved system role name.
 */
export function personalRoleNameCandidates(username: string): string[] {
  const trimmed = username.trim();
  const slug = sanitizeSlugPart(username) || "persoenlich";
  const preferred = trimmed && !RESERVED_SYSTEM_ROLE_NAMES.has(trimmed.toLowerCase()) ? trimmed : undefined;
  const fallback = RESERVED_SYSTEM_ROLE_NAMES.has(slug) ? `${slug}-persoenlich` : slug;
  return preferred ? [preferred, fallback] : [fallback];
}

/**
 * Picks the first free (or self-owned) candidate name for the user's personal
 * role, or a numbered variant when every candidate is already owned elsewhere.
 */
async function pickPersonalRoleName(prisma: PrismaTxnClient, user: ServerRequest["user"]): Promise<string> {
  const candidates = personalRoleNameCandidates(user.username);
  for (const candidate of candidates) {
    const existing = await prisma.roles.findUnique({
      where: { role_name: candidate },
      select: { owner_user_id: true },
    });
    if (!existing || existing.owner_user_id === user.user_id) return candidate;
  }
  const base = candidates[0];
  for (let i = 2; ; i++) {
    const name = `${base}-${i}`;
    const existing = await prisma.roles.findUnique({
      where: { role_name: name },
      select: { owner_user_id: true },
    });
    if (!existing || existing.owner_user_id === user.user_id) return name;
  }
}

/**
 * Ensures the user's personal role (owned by the user) exists and is assigned
 * to them, and returns its id. Because it is unique to one user, role-based
 * wiki visibility keeps that user's wikis private to them (and the site
 * admin) instead of sharing them across a common role. The role is named
 * after the user's own username (raw, or the slugified fallback when the
 * username collides with a reserved system role name).
 */
async function ensurePersonalRole(prisma: PrismaTxnClient, user: ServerRequest["user"]): Promise<IdString> {
  const roleName = await pickPersonalRoleName(prisma, user);
  const role = await prisma.roles.upsert({
    where: { role_name: roleName },
    update: {},
    create: {
      role_name: roleName,
      description: `Persönliche Rolle von ${user.username}`,
      owner_user_id: user.user_id,
    },
  });
  const linked = await prisma.users.findUnique({
    where: { user_id: user.user_id },
    select: { roles: { where: { role_id: role.role_id }, select: { role_id: true } } },
  });
  if (!linked || linked.roles.length === 0) {
    await prisma.users.update({
      where: { user_id: user.user_id },
      data: { roles: { connect: { role_id: role.role_id } } },
    });
  }
  return new IdString(role.role_id);
}
export const AdminCreateWiki = zodRoute({
  method: ["PUT"],
  path: "/admin/wiki",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({
    displayName: z.string().min(1).max(120),
    description: z.string().max(400).optional(),
  }),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.asserted = state.user.isLoggedIn;

    const { displayName, description } = state.data;

    const isAdmin = state.user.isAdmin;
    const isTeacher = state.user.isTeacher;

    return await state.$transaction(async (prisma) => {
      if (!isAdmin && !isTeacher) {
        // Students may create their own private wikis, but only as many as
        // the teacher granted in the users tab (NULL = unlimited, 0 = none).
        const limit = state.user.wikiLimit;
        if (limit != null) {
          const ownedWikis = await prisma.recipe.count({
            where: { owner_user_id: state.user.user_id },
          });
          if (ownedWikis >= limit) {
            throw new SendError("ACCESS_DENIED", 403, {
              reason: limit === 0
                ? "Your administrator has not allowed you to create your own wikis."
                : `You have reached your limit of ${limit} own wiki(s).`,
            });
          }
        }
      }

      const rolesMapper = await new RoleImportWriter(prisma, false).getNameMapper(NEW_WIKI_ROLES);
      // Admins keep the public system roles; teachers and students get a
      // private personal role so their wikis stay theirs.
      const personalRole = isAdmin ? undefined : await ensurePersonalRole(prisma, state.user);
      const adminRole = personalRole ?? rolesMapper("ADMIN");
      const commonRole = isAdmin ? rolesMapper("USER") : undefined;
      const anonRole = isAdmin ? rolesMapper("ANON") : undefined;

      const slug = await findFreeWikiSlug(prisma, wikiSlugBase(state.user.username));
      const bagName = `editions/${slug}`;

      const bagWriter = new BagImportWriter(prisma, false);
      await bagWriter.checkExisting(new IdString(""), bagName, state.user, { allowCreate: true });
      const [bag] = await bagWriter.upsert([{
        name: bagName,
        description: `Tiddler storage for the wiki "${displayName}"`,
        ownerUserId: new IdString(state.user.user_id),
        permissions: [
          { role_id: adminRole, level: "C_admin" },
          ...(commonRole ? [{ role_id: commonRole, level: "A_read" as const }] : []),
          ...(anonRole ? [{ role_id: anonRole, level: "A_read" as const }] : []),
        ],
      } satisfies UpsertBagInput]);

      const template = await prisma.template.findUnique({ where: { name: DEFAULT_TEMPLATE } });
      if (!template) throw new Error("wiki template not found");

      const recipeWriter = new RecipeImportWriter(prisma, false);
      await recipeWriter.checkExisting(new IdString(""), slug, state.user, { allowCreate: true });
      const authoredDefinition: PrismaJson.Recipe_definition = {
        displayName,
        description: description ?? "",
        readonlyBags: [],
        writablePrefixBags: [{ prefix: "", bagName }],
        plugins: [],
        cspAllow: [],
      };
      const { bags, plugins } = recipeWriter.compileRecipeSimpleV1(authoredDefinition, template.definition);
      const [[recipeId, lastCompiledAt]] = await recipeWriter.upsert([{
        slug,
        templateId: new IdString(template.id),
        compiledBags: bags,
        plugins,
        definition: authoredDefinition,
        ownerUserId: new IdString(state.user.user_id),
        permissions: [
          { role_id: adminRole, level: "B_write" },
          ...(commonRole ? [{ role_id: commonRole, level: "A_read" as const }] : []),
          ...(anonRole ? [{ role_id: anonRole, level: "A_read" as const }] : []),
        ],
      } satisfies UpsertRecipeInput]);

      const store = new WikiStore(prisma);
      const recipeIdString = new IdString(recipeId);
      const bagId = new IdString(bag.id);
      const welcomeTitle = "Willkommen";
      const startingTiddlers = [
        { title: "$:/SiteTitle", text: displayName },
        { title: "$:/DefaultTiddlers", text: welcomeTitle },
        { title: welcomeTitle, text: welcomeText(displayName) },
      ];
      for (const { title, text } of startingTiddlers) {
        await store.saveTiddler({
          recipe_id: recipeIdString,
          bag_id: bagId,
          fields: { ...wikiTiddlerMeta(state.user.username), title, text, type: "text/vnd.tiddlywiki" },
        });
      }

      return {
        slug,
        displayName,
        bagName,
        templateName: DEFAULT_TEMPLATE,
        lastCompiledAt: lastCompiledAt.toISOString(),
      };
    });
  }
});

/**
 * Deletes a wiki (recipe) and the bags that only it references. Only the
 * user who created the wiki (owner) or the site admin account ("admin")
 * may delete it. Recipes whose slug is missing return 404; shared bags
 * referenced by other recipes are kept (RecipeBag.bag has onDelete Restrict).
 */
export const AdminDeleteWiki = zodRoute({
  method: ["PUT"],
  path: "/admin/wiki/delete",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({
    slug: z.string().min(1).max(120),
  }),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.asserted = state.user.isLoggedIn;

    const { slug } = state.data;

    const result = await state.$transaction(async (prisma) => {
      const recipe = await prisma.recipe.findUnique({
        where: { slug },
        include: { recipe_bags: true },
      });
      if (!recipe)
        throw new SendError("RECIPE_NOT_FOUND", 404, { recipeName: slug });

      const isOwner = !!recipe.owner_user_id && recipe.owner_user_id === state.user.user_id;
      const isSiteAdmin = state.user.username === "admin";
      if (!isOwner && !isSiteAdmin)
        throw new SendError("ACCESS_DENIED", 403, { reason: "Only the user who created the wiki (or the site admin 'admin') may delete it." });

      await prisma.recipe.delete({ where: { id: recipe.id } });

      for (const { bag_id } of recipe.recipe_bags) {
        const remainingReferences = await prisma.recipeBag.count({ where: { bag_id } });
        if (remainingReferences === 0)
          await prisma.bag.delete({ where: { id: bag_id } });
      }

      return { slug, deleted: true };
    });

    // drop the cached preview as soon as the wiki is gone (before any pending
    // debounced invalidation could re-touch the file); failure must not fail
    // the delete itself.
    await deleteThumbnail(state.config.storePath, slug).catch((error: unknown) => {
      console.error(`[thumbnail] failed to delete "${slug}":`, error);
    });

    return result;
  }
});

export const AdminDeleteRole = zodRoute({
  method: ["PUT"],
  path: "/admin/role/delete",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({
    name: z.string().min(1).max(120),
  }),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.asserted = state.user.isLoggedIn;

    const { name } = state.data;

    return await state.$transaction(async (prisma) => {
      const role = await prisma.roles.findUnique({
        where: { role_name: name },
        select: { role_id: true, role_name: true, owner_user_id: true, is_teacher: true },
      });
      if (!role)
        throw new SendError("RECORD_KEY_NOT_FOUND", 400, { table: "roles", name });

      // never delete the bootstrap system roles (lockout protection).
      // teacher roles (is_teacher) are protected by capability instead of
      // name, so the guard survives renaming TEACHER to e.g. "Gruppenleiter 1".
      if (role.is_teacher)
        throw new SendError("ACCESS_DENIED", 403, { reason: "A teacher role cannot be deleted." });
      if (name === "ADMIN" || name === "USER" || name === "ANON")
        throw new SendError("ACCESS_DENIED", 403, { reason: "The system role '" + name + "' cannot be deleted." });

      const isOwner = !!role.owner_user_id && role.owner_user_id === state.user.user_id;
      const isSiteAdmin = state.user.username === "admin";
      if (!isOwner && !isSiteAdmin)
        throw new SendError("ACCESS_DENIED", 403, {
          reason: "Only the user who created this role (or the site admin 'admin') may delete it.",
        });

      // release role memberships; the _RolesToUsers join table cascades on delete.
      // permission rows reference role_id without an FK, so they are removed here.
      await prisma.recipePermission.deleteMany({ where: { role_id: role.role_id } });
      await prisma.templatePermission.deleteMany({ where: { role_id: role.role_id } });
      await prisma.bagPermission.deleteMany({ where: { role_id: role.role_id } });
      await prisma.roles.delete({ where: { role_id: role.role_id } });

      return { name, deleted: true };
    });
  }
});

export const AdminDeleteBag = zodRoute({
  method: ["PUT"],
  path: "/admin/bag/delete",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({
    name: z.string().min(1).max(120),
  }),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.asserted = state.user.isLoggedIn;

    const { name } = state.data;

    return await state.$transaction(async (prisma) => {
      const bag = await prisma.bag.findUnique({
        where: { name },
        select: { id: true, name: true, owner_user_id: true },
      });
      if (!bag)
        throw new SendError("RECORD_KEY_NOT_FOUND", 400, { table: "bags", name });

      const isOwner = !!bag.owner_user_id && bag.owner_user_id === state.user.user_id;
      const isSiteAdmin = state.user.username === "admin";
      if (!isOwner && !isSiteAdmin)
        throw new SendError("ACCESS_DENIED", 403, {
          reason: "Only the user who created this bag (or the site admin 'admin') may delete it.",
        });

      // Bags referenced by a wiki recipe must not be deleted on their own,
      // otherwise the wiki would lose its backing store.
      const references = await prisma.recipeBag.count({ where: { bag_id: bag.id } });
      if (references > 0)
        throw new SendError("ACCESS_DENIED", 403, {
          reason: "This bag is used by a wiki recipe and cannot be deleted on its own.",
        });

      await prisma.bagPermission.deleteMany({ where: { bag_id: bag.id } });
      await prisma.tiddler.deleteMany({ where: { bag_id: bag.id } });
      await prisma.bag.delete({ where: { id: bag.id } });

      return { name, deleted: true };
    });
  }
});

export const AdminDeleteUser = zodRoute({
  method: ["PUT"],
  path: "/admin/user/delete",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({
    username: z.string().min(1).max(120),
  }),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.asserted = state.user.isLoggedIn;

    const { username } = state.data;

    return await state.$transaction(async (prisma) => {
      if (!state.user.isAdmin && !state.user.isTeacher)
        throw new SendError("ACCESS_DENIED", 403, { reason: "You must be an admin to manage user accounts." });

      const user = await prisma.users.findUnique({
        where: { username },
        select: { user_id: true, username: true, owner_user_id: true },
      });
      if (!user)
        throw new SendError("RECORD_KEY_NOT_FOUND", 400, { table: "users", name: username });

      // never delete the bootstrap super-admin account (lockout protection)
      if (user.username === "admin")
        throw new SendError("ACCESS_DENIED", 403, { reason: "The site admin account 'admin' cannot be deleted." });

const isOwner = !!user.owner_user_id && user.owner_user_id === state.user.user_id;
    const isSiteAdmin = state.user.username === "admin";
    const isSelf = user.user_id === state.user.user_id;
    const canDelete = state.user.isAdmin
      ? (isOwner || isSiteAdmin || isSelf)
      : (state.user.isTeacher && isOwner && !isSelf);
    if (!canDelete)
      throw new SendError("ACCESS_DENIED", 403, {
        reason: "Only the user who created this account (or the site admin 'admin') may delete it.",
      });

      // release role memberships and sessions before removing the account;
      // wikis/bags/templates/roles owned by the user are left intact
      // (they become ownerless and admin-manageable).
      await prisma.users.update({ where: { user_id: user.user_id }, data: { roles: { set: [] } } });
      await prisma.sessions.deleteMany({ where: { user_id: user.user_id } });
      await prisma.users.delete({ where: { user_id: user.user_id } });

      return { username, deleted: true };
    });
  }
});
