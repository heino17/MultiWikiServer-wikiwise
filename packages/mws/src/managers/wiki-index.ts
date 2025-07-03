

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
import { WikiRecipeRoutes } from "./wiki-recipe";
import { WikiStatusRoutes } from "./wiki-status";
import { BAG_PREFIX, RECIPE_PREFIX } from "./wiki-utils";
import { WikiExternalRoutes } from "./wiki-external";
const debugCORS = Debug("mws:cors");
const debugSSE = Debug("mws:sse");


export { WikiExternalRoutes, WikiRecipeRoutes, WikiStatusRoutes };

declare module "@tiddlywiki/server" {
  interface IncomingHttpHeaders {
    'last-event-id'?: string;
  }
}

serverEvents.on("mws.routes", (root, config) => {


  // lets start with the scenarios from the sync adapter
  // 1. Status - The wiki status that gets sent to the TW5 client
  // 2. tiddlers.json - gets a skinny list of the recipe bag state.
  // 3. Save Tiddler - create or update a tiddler
  // 4. Load Tiddler - load the data for a tiddler
  // 5. Delete Tiddler - delete a tiddler
  // 6. Wiki Index - the wiki client itself, with all the config 
  //    from the recipe, and the initial tiddler state

  const parent = root.defineRoute({
    method: [],
    denyFinal: true,
    path: new RegExp(`^(?=${RECIPE_PREFIX}/)`),
  }, async state => {

  });

  // ctrl-click to navigate to any of these routes

  registerZodRoutes(parent, new WikiStatusRoutes(), Object.keys({
    handleGetAllBagStates: true,
    handleGetBagState: true,
    handleGetRecipeStatus: true,
    handleGetRecipeEvents: true,
    handleGetBags: true,
  } satisfies RouterKeyMap<WikiStatusRoutes, true>));

  registerZodRoutes(parent, new WikiRecipeRoutes(), Object.keys({
    handleDeleteRecipeTiddler: true,
    handleLoadRecipeTiddler: true,
    handleSaveRecipeTiddler: true,
    rpcDeleteRecipeTiddlerList: true,
    rpcLoadRecipeTiddlerList: true,
    rpcSaveRecipeTiddlerList: true,
  } satisfies RouterKeyMap<WikiRecipeRoutes, true>));

  // registerZodRoutes(parent, new WikiExternalRoutes(), Object.keys({
  //   handleFormMultipartRecipeTiddler: true,
  //   handleFormMultipartBagTiddler: true,
  //   handleDeleteBagTiddler: true,
  //   handleLoadBagTiddler: true,
  //   handleSaveBagTiddler: true,
  // } satisfies RouterKeyMap<WikiExternalRoutes, true>));

  // the wiki index route
  root.defineRoute({
    method: ["GET", "HEAD"],
    path: /^\/wiki\/(.*)$/,
    pathParams: ["recipe_name"],
    bodyFormat: "ignore",
  }, async (state) => {
    const timekey = `handler ${state.bodyFormat} ${state.method} ${state.urlInfo.pathname}`;
    if (Debug.enabled("server:handler:timing")) console.time(timekey);

    if (!state.pathParams.recipe_name)
      throw state.sendEmpty(404, { "x-reason": "recipe name not found" });

    checkPath(state, z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }));

    await state.assertRecipeAccess(state.pathParams.recipe_name, false);

    await state.$transaction(async (prisma) => {
      const server = new WikiStateStore(state, prisma);
      await server.serveIndexFile(state.pathParams.recipe_name);
    });

    if (Debug.enabled("server:handler:timing")) console.timeEnd(timekey);

    throw STREAM_ENDED;
  });
})
