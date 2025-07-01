

import { TiddlerFields } from "tiddlywiki";
import { createWriteStream, mkdirSync, rmSync } from "fs";
import { resolve } from "path";
import { createHash, Hash } from "crypto";
import { readFile } from "fs/promises";
import { Writable } from "stream";
import { IncomingHttpHeaders } from "http";
import { WikiStateStore } from "./WikiStateStore";
import Debug from "debug";
import { BodyFormat, checkPath, JsonValue, registerZodRoutes, RouterKeyMap, RouterRouteMap, ServerRoute, tryParseJSON, UserError, Z2, zod, ZodRoute, zodRoute, ZodState } from "@tiddlywiki/server";
import { serverEvents, ServerEventsMap } from "@tiddlywiki/events";
import { Prisma } from "prisma-client";
import { t } from "try";
import { RECIPE_PREFIX } from "./wiki-utils";
const debugCORS = Debug("mws:cors");
const debugSSE = Debug("mws:sse");

export class WikiStatusRoutes {
 

  // lets start with the scenarios from the sync adapter
  // 1. Status - The wiki status that gets sent to the TW5 client
  // 2. tiddlers.json - gets a skinny list of the recipe bag state.
  // 3. Save Tiddler - create or update a tiddler
  // 4. Load Tiddler - load the data for a tiddler
  // 5. Delete Tiddler - delete a tiddler
  // 6. Wiki Index - the wiki client itself, with all the config 
  //    from the recipe, and the initial tiddler state

  handleGetRecipeStatus = zodRoute({
    method: ["GET", "HEAD"],
    path: RECIPE_PREFIX + "/:recipe_name/status",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    inner: async (state) => {

      const { recipe_name } = state.pathParams;

      const { recipe, canRead, canWrite } = await state.getRecipeACL(recipe_name, true);

      if (!recipe) throw state.sendEmpty(404, { "x-reason": "recipe not found" });
      if (!canRead) throw state.sendEmpty(403, { "x-reason": "read access denied" });

      const { isAdmin, user_id, username } = state.user;

      return {
        isAdmin,
        user_id,
        username,
        isLoggedIn: state.user.isLoggedIn,
        isReadOnly: !canWrite,
      };
    }
  });

  handleGetRecipeEvents = zodRoute({
    method: ["GET", "HEAD"],
    path: RECIPE_PREFIX + "/:recipe_name/events",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    zodQueryParams: z => ({
      "first-event-id": z.string().array().optional(),
    }),
    inner: async (state) => {

      const { recipe_name } = state.pathParams;

      await state.assertRecipeAccess(recipe_name, false);

      debugSSE("connection opened", recipe_name);
      const events = state.sendSSE();
      serverEvents.on("mws.tiddler.delete", onDelete);
      serverEvents.on("mws.tiddler.save", onSave);
      events.onClose(() => {
        debugSSE("connection closed", recipe_name);
        serverEvents.off("mws.tiddler.delete", onDelete);
        serverEvents.off("mws.tiddler.save", onSave);
      });

      const lastEventID = state.headers['last-event-id'] || state.queryParams["first-event-id"]?.[0];

      if (lastEventID) {
        const updates = await state.engine.recipe_bags.findMany({
          where: { recipe: { recipe_name } },
          orderBy: { position: "asc" },
          select: {
            bag: {
              select: {
                bag_name: true,
                tiddlers: {
                  select: {
                    title: true,
                    revision_id: true,
                    is_deleted: true,
                  },
                  where: {
                    is_deleted: true,
                    revision_id: lastEventID ? { gt: lastEventID } : undefined,
                  },
                }
              }
            }
          }
        });
        let newlastevent = "";
        updates.forEach(({ bag }) => {
          bag.tiddlers.forEach(tiddler => {
            if (newlastevent < tiddler.revision_id) newlastevent = tiddler.revision_id;
          })
        });
        // if there were no updates, just use the same last event id
        events.emitEvent("tiddler.since-last-event", updates, newlastevent || lastEventID);
      }


      throw STREAM_ENDED;

      // catch errors here otherwise they would cause the initiating request to 
      // possibly return a 500 response. Since the event happens after the 
      // transaction closes, it wouldn't roll it back.

      // the only way to optimize this would be if the mws event included the 
      // entire recipe_bags table, so we could check if the bag is in our recipe

      // it's worse because we're using recipe and bag names instead of ids
      // we also aren't checking permissions every time we emit an event

      // TODO: there are probably things we could improve.

      async function onSave(data: ServerEventsMap["mws.tiddler.save"][0]) {
        try {
          const hasBag = !!await state.engine.recipe_bags.count({
            where: {
              recipe: { recipe_name },
              bag: { bag_name: data.bag_name },
            },
          });
          if (hasBag) {
            debugSSE("tiddler.save", recipe_name);
            events.emitEvent("tiddler.save", data, data.revision_id);
          }
        } catch (e) {
          console.error("Error in onSave for recipe events", e);
        }
      }

      async function onDelete(data: ServerEventsMap["mws.tiddler.delete"][0]) {
        try {
          const hasBag = !!await state.engine.recipe_bags.count({
            where: {
              recipe: { recipe_name },
              bag: { bag_name: data.bag_name },
            },
          });
          if (hasBag) {
            debugSSE("tiddler.delete", data);
            events.emitEvent("tiddler.delete", data, data.revision_id);
          }
        } catch (e) {
          console.error("Error in onDelete for recipe events", e);
        }
      }
    }
  })

  handleGetBags = zodRoute({
    method: ["GET", "HEAD"],
    path: RECIPE_PREFIX + "/:recipe_name/bags",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    inner: async (state) => {

      const { recipe_name } = state.pathParams;
      await state.assertRecipeAccess(recipe_name, false);

      const result = await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        return await server.getRecipeBags(recipe_name);
      });

      return result;

    }
  })

  handleGetBagState = zodRoute({
    method: ["GET", "HEAD"],
    path: RECIPE_PREFIX + "/:recipe_name/bags/:bag_name/state",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      bag_name: z.prismaField("Bags", "bag_name", "string"),
    }),
    zodQueryParams: z => ({
      last_known_revision_id: z.prismaField("Tiddlers", "revision_id", "string").array().optional(),
      include_deleted: z.enum(["yes", "no"]).array().optional(),
    }),
    inner: async (state) => {

      const { recipe_name, bag_name } = state.pathParams;
      await state.assertRecipeAccess(recipe_name, false);

      const last_known_revision_id = state.queryParams.last_known_revision_id?.[0];
      const include_deleted = state.queryParams.include_deleted?.[0] === "yes";

      const result = await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        return await server.getBagTiddlers(bag_name, { include_deleted, last_known_revision_id });
      });

      let etag = "";
      for (const t of result.tiddlers) {
        if (etag < t.revision_id) etag = t.revision_id;
      }
      const newEtag = `"${etag}"`;
      const match = state.headers["if-none-match"] === newEtag;
      state.setHeader("etag", newEtag);

      if (match) throw state.sendEmpty(304, {});

      return result;

    }
  });


  handleGetAllBagStates = zodRoute({
    method: ["GET", "HEAD"],
    path: RECIPE_PREFIX + "/:recipe_name/all-bags-state",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    zodQueryParams: z => ({
      last_known_revision_id: z.prismaField("Tiddlers", "revision_id", "string").array().optional(),
      include_deleted: z.enum(["yes", "no"]).array().optional(),
      gzip_stream: z.enum(["yes", "no"]).array().optional(),
    }),
    inner: async (state) => {

      const { recipe_name } = state.pathParams;
      await state.assertRecipeAccess(recipe_name, false);

      const
        last_known_revision_id = state.queryParams.last_known_revision_id?.[0],
        include_deleted = state.queryParams.include_deleted?.[0] === "yes",
        gzip_stream = state.queryParams.gzip_stream?.[0] === "yes";

      const result = await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        const bags = await server.getRecipeBags(recipe_name);

        const alltids = await Promise.all(bags.map(({ bag_name, position }) =>
          server.getBagTiddlers_PrismaQuery(bag_name, {
            include_deleted,
            last_known_revision_id
          }).then(f => ({ ...f, position }))
        ));

        return zod.array(zod.strictObject({
          bag_id: zod.string(),
          bag_name: zod.string(),
          position: zod.number(),
          tiddlers: zod.strictObject({
            title: zod.string(),
            revision_id: zod.string(),
            is_deleted: zod.boolean()
          }).array()
        })).parse(alltids);
      });

      let etag = "";
      for (const b of result) {
        for (const t of b.tiddlers) {
          if (etag < t.revision_id) etag = t.revision_id;
        }
      }
      const newEtag = `"${etag}${gzip_stream}"`;
      const match = state.headers["if-none-match"] === newEtag;
      // 304 has to return the same headers if they're to be useful, 
      // so we'll also put them in the etag in case it ignores the query
      state.writeHead(match ? 304 : 200, gzip_stream ? {
        "content-type": "application/gzip",
        "content-encoding": "identity",
        "x-gzip-stream": "yes",
        "etag": newEtag,
      } : {
        "content-type": "application/json",
        "content-encoding": "identity",
        "etag": newEtag,
      });
      if (match) throw state.end();

      state.write("[");
      for (let i = 0; i < result.length; i++) {
        await state.write((i > 0 ? "," : "") + JSON.stringify(result[i]));
        if (gzip_stream) await state.splitCompressionStream();
      }
      state.write("]");
      throw state.end();

      // this still sets the return type of the function
      return result;

    }
  })


}
