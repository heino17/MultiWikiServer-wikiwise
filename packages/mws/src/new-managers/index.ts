// New endpoints for the wikis → templates → types model (see NEW-DESIGN.md).
//
// Wikis are stored as `recipe` rows. Public wiki and recipe endpoints are
// addressed by recipe slug, while internal relations still use recipe ids.
// The recipe and wiki endpoint families are kept separate, mirroring the
// existing code.
//
// All routing goes through a single shared resolver (RecipeResolver) so that
// single, batch, and list operations always present the same view and can
// never disagree about where a title routes.

import { checkPath, checkQueryKeys, defineZodRoute, zod, ZodRoute } from "@tiddlywiki/server";
import { serverEvents } from "@tiddlywiki/events";
import { serveDocsIndex, serveWikiIndex, } from "./RecipeIndexSender";
import { AdminLoad, AdminCreateWiki, AdminDeleteWiki, AdminDeleteRole, AdminDeleteBag, AdminDeleteUser, AdminSave } from "./TabDataAdapter";
import { AdminBackup, AdminBackupList, AdminBackupDownload, AdminBackupDelete } from "./BackupRoutes";
import { AdminStorage } from "./StorageRoutes";
import { AdminStorageCleanup } from "./StorageCleanupRoutes";
import { PinboardDeleteNote, PinboardList, PinboardMarkRead, PinboardSaveNote, PinboardSavePosition, PinboardUnreadCount } from "./PinboardRoutes";
import { UserFileDelete, UserFileDownload, UserFileList, UserFilePreview, UserFileShareTargets, UserFileShareUpdate, UserFileSharedList, UserFileUpload } from "./UserFileRoutes";
import { serveWikiThumbnail } from "./WikiThumbnailRoutes";
import { RecipeStatus, RecipeStoreJS, RecipeStoreJSON, RecipeUpdates, TiddlerBatch, TiddlerList } from "./RecipeRoutes";
import { AdminPrefsGet, AdminPrefsPut } from "./PrefsRoutes";
import { LandingData, LandingWikisGet, LandingWikisPut } from "./LandingRoutes";

export * from "./RecipeResolver";
export * from "./TabDataAdapter";
export * from "./TabUpserts";
export * from "./wiki-utils";
export * from "./wiki-contract";

// #region Routes
// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
// type jsonify2Tuple<T> = T extends [infer A, ...infer B] ? [jsonify2<A>, ...jsonify2Tuple<B>] : T extends [infer A] ? [jsonify<A>] : [];

type Optional<T> = {
  [P in keyof T as T[P] extends undefined ? P : never]?: T[P];
} & {
  [P in keyof T as T[P] extends undefined ? never : P]: T[P];
};

// type jsonify2<T> =
//   T extends IdString ? string :
//   T extends string ? string :
//   T extends [...any[]] ? number extends T["length"] ? jsonify2<T[number]>[] : [...jsonify2Tuple<T>] :
//   T extends Array<infer U> ? jsonify2<U>[] :
//   T extends ReadonlyArray<infer U> ? jsonify2<U>[] :
//   T extends object ? { [K in keyof T as T[K] extends never ? never : K]: jsonify2<T[K]> } :
//   jsonify<T>;

type ExtractTypes2<PATH, Q2 extends string[], REQ, RES> = (args: Optional<{
  path: keyof PATH extends never ? undefined : { [K in keyof PATH]: zod.input<PATH[K]>; };
  query: string extends Q2[number] ? undefined : Record<Q2[number], string[]>;
  data: undefined extends REQ ? undefined : zod.input<REQ>;
}>) => Promise<RES>;

type RouterRouteMap2<T> = {
  [K in keyof T as ClientRoute<T[K]> extends Function ? K : never]: ClientRoute<T[K]>;
}

type ClientRoute<T> =
  T extends ZodRoute<any, infer B, infer PATH, infer Q2, infer REQ, infer RES>
  ? B extends "ignore" ? ExtractTypes2<PATH, Q2, undefined, RES> : ExtractTypes2<PATH, Q2, REQ, RES>
  : never;


serverEvents.on("mws.routes", (root) => {

  const parent = root.defineRoute({
    method: [],
    denyFinal: true,
    path: new RegExp(`^(?=/recipe/|/wiki/|/admin/|/api/|/tw5/)`),
  }, async (state) => { });

  (Object.entries(ApiRoutes)).forEach(([key, val]) => {
    if (!val) return;
    defineZodRoute(parent, key, val as any);
  });

  parent.defineRoute<"ignore">({
    method: ["GET", "HEAD", "OPTIONS"],
    path: new RegExp(`^/tw5/(?<version>.*)$`),
    bodyFormat: "ignore",
  }, async (state) => {

    if (state.method === "OPTIONS") return state.sendEmpty(200);

    checkPath(state, z => ({ version: z.string() }), new Error());

    return await serveDocsIndex(state, state.pathParams.version);

  });

  parent.defineRoute<"ignore">({
    method: ["GET", "HEAD", "OPTIONS"],
    path: new RegExp(`^/wiki/favicon\\.ico$`),
    bodyFormat: "ignore",
  }, async (state) => {
    return state.redirect("/favicon.ico");
  });

  parent.defineRoute<"ignore">({
    method: ["GET", "OPTIONS"],
    path: new RegExp(`^/wiki/(?<recipe_slug>[^/]+)/thumbnail$`),
    bodyFormat: "ignore",
  }, async (state) => {

    if (state.method === "OPTIONS")
      return state.sendEmpty(200);

    checkPath(state, z => ({
      recipe_slug: z.prismaField("Recipe", "slug", "string"),
    }), new Error());

    return await serveWikiThumbnail(state);

  });

  parent.defineRoute<"ignore">({
    method: ["GET", "HEAD", "OPTIONS"],
    path: new RegExp(`^/wiki/(?<recipe_slug>[^/]+)$`),
    bodyFormat: "ignore",
  }, async (state) => {

    if (state.method === "OPTIONS")
      return state.sendEmpty(200);

    checkPath(state, z => ({
      recipe_slug: z.prismaField("Recipe", "slug", "string"),
    }), new Error());

    const { recipe_slug } = state.pathParams;
    state.assertWikiReferer(recipe_slug);
    return await serveWikiIndex(state, recipe_slug, "index");

  }, async (state, e) => {
    if (state.headersSent) {
      console.log(e.stack + "\nCaptured by:\n" + new Error("").stack?.split("\n").slice(1).join("\n"));
    }
    // else if (state.headers.accept.accepts("text/html")) {
    //   if (e instanceof SendError) {
    //     return await state.sendAdmin({ status: e.status, serverResponse: { sendError: e } });
    //   } else {
    //     const se = new SendError("INTERNAL_SERVER_ERROR", 500, { message: "An unknown error occured. Details have been logged." })
    //     await state.sendAdmin({ status: se.status, serverResponse: { sendError: se } });
    //   }
    // }
    throw e;
  });
});




const ApiRoutes = {
  RecipeStatus,
  RecipeUpdates,
  RecipeStoreJS,
  RecipeStoreJSON,
  TiddlerBatch,
  TiddlerList,
  AdminLoad,
  AdminCreateWiki,
  AdminDeleteWiki,
  AdminDeleteRole,
  AdminDeleteBag,
  AdminDeleteUser,
  AdminBackup,
  AdminBackupList,
  AdminBackupDownload,
  AdminBackupDelete,
  AdminStorage,
  AdminStorageCleanup,
  PinboardList,
  PinboardUnreadCount,
  PinboardSaveNote,
  PinboardSavePosition,
  PinboardDeleteNote,
  PinboardMarkRead,
  AdminSave,
  AdminPrefsGet,
  AdminPrefsPut,
  LandingData,
  LandingWikisGet,
  LandingWikisPut,
  UserFileUpload,
  UserFileList,
  UserFileDownload,
  UserFilePreview,
  UserFileDelete,
  UserFileShareTargets,
  UserFileSharedList,
  UserFileShareUpdate,
};
interface ClientRoutes {
  AdminLoad: ClientRoute<typeof AdminLoad>;
  AdminCreateWiki: ClientRoute<typeof AdminCreateWiki>;
  AdminDeleteWiki: ClientRoute<typeof AdminDeleteWiki>;
  AdminDeleteRole: ClientRoute<typeof AdminDeleteRole>;
  AdminDeleteBag: ClientRoute<typeof AdminDeleteBag>;
  AdminDeleteUser: ClientRoute<typeof AdminDeleteUser>;
  AdminSave: ClientRoute<typeof AdminSave>;
  AdminPrefsGet: ClientRoute<typeof AdminPrefsGet>;
  AdminPrefsPut: ClientRoute<typeof AdminPrefsPut>;
  LandingWikisGet: ClientRoute<typeof LandingWikisGet>;
  LandingWikisPut: ClientRoute<typeof LandingWikisPut>;
  AdminBackup: ClientRoute<typeof AdminBackup>;
  AdminBackupList: ClientRoute<typeof AdminBackupList>;
  AdminBackupDownload: ClientRoute<typeof AdminBackupDownload>;
  AdminBackupDelete: ClientRoute<typeof AdminBackupDelete>;
  AdminStorage: ClientRoute<typeof AdminStorage>;
  AdminStorageCleanup: ClientRoute<typeof AdminStorageCleanup>;
  PinboardList: ClientRoute<typeof PinboardList>;
  PinboardUnreadCount: ClientRoute<typeof PinboardUnreadCount>;
  PinboardSaveNote: ClientRoute<typeof PinboardSaveNote>;
  PinboardSavePosition: ClientRoute<typeof PinboardSavePosition>;
  PinboardDeleteNote: ClientRoute<typeof PinboardDeleteNote>;
  PinboardMarkRead: ClientRoute<typeof PinboardMarkRead>;
  UserFileUpload: ClientRoute<typeof UserFileUpload>;
  UserFileList: ClientRoute<typeof UserFileList>;
  UserFileDownload: ClientRoute<typeof UserFileDownload>;
  UserFilePreview: ClientRoute<typeof UserFilePreview>;
  UserFileDelete: ClientRoute<typeof UserFileDelete>;
  UserFileShareTargets: ClientRoute<typeof UserFileShareTargets>;
  UserFileSharedList: ClientRoute<typeof UserFileSharedList>;
  UserFileShareUpdate: ClientRoute<typeof UserFileShareUpdate>;
  TiddlerBatch: ClientRoute<typeof TiddlerBatch>;
  TiddlerList: ClientRoute<typeof TiddlerList>;
  RecipeStatus: ClientRoute<typeof RecipeStatus>;
  RecipeUpdates: ClientRoute<typeof RecipeUpdates>;
}
type ClientRoutes2 = RouterRouteMap2<typeof ApiRoutes>;