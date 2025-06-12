

import { TiddlerFields } from "tiddlywiki";
import { createWriteStream, mkdirSync, rmSync } from "fs";
import { resolve } from "path";
import { createHash, Hash } from "crypto";
import { readFile } from "fs/promises";
import { Writable } from "stream";
import { IncomingHttpHeaders } from "http";
import { WikiStateStore } from "./WikiStateStore";
import { Debug } from "@prisma/client/runtime/library";
import { registerZodRoutes, RouterKeyMap, RouterRouteMap, ServerRoute, tryParseJSON, UserError, zod, zodRoute, ZodState } from "@tiddlywiki/server";
import { serverEvents } from "@tiddlywiki/events";
const debugCORS = Debug("mws:cors");

export const WikiRouterKeyMap: RouterKeyMap<WikiRoutes, true> = {
  // recipe status updates
  handleGetRecipeStatus: true,
  handleListRecipeTiddlers: true,
  handleGetBagStates: true,
  // individual tiddlers
  handleLoadRecipeTiddler: true,
  handleSaveRecipeTiddler: true,
  handleDeleteRecipeTiddler: true,
  // wiki index
  handleGetWikiIndex: true,
  // external tools
  handleDeleteBagTiddler: true,
  handleFormMultipartBagTiddler: true,
  handleFormMultipartRecipeTiddler: true,
  handleLoadBagTiddler: true,
  handleSaveBagTiddler: true,
}

export type TiddlerManagerMap = RouterRouteMap<WikiRoutes>;

serverEvents.on("mws.routes.fallback", (root, config) => {
  WikiRoutes.defineRoutes(root);
})

const BAG_PREFIX = "/bag";
const RECIPE_PREFIX = "/recipe";
const WIKI_PREFIX = "/wiki";

export class WikiRoutes {
  static defineRoutes = (root: ServerRoute) => {
    const router = new WikiRoutes();
    const keys = Object.keys(WikiRouterKeyMap);
    registerZodRoutes(root, router, keys);
  }


  handleGetWikiIndex = zodRoute({
    method: ["GET", "HEAD"],
    path: WIKI_PREFIX + "/:recipe_name",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    inner: async (state) => {

      await state.assertRecipeACL(state.pathParams.recipe_name, false);

      await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        await server.serveIndexFile(state.pathParams.recipe_name);
      });

      throw STREAM_ENDED;
    }
  });

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
    corsRequest: async state => {

      // "Access-Control-Expose-Headers"
      // https://developer.mozilla.org/en-US/docs/Glossary/CORS-safelisted_response_header
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Expose-Headers
      // The following headers are exposed by default: 
      // Cache-Control
      // Content-Language
      // Content-Length
      // Content-Type
      // Expires
      // Last-Modified
      // Pragma

      const headers = state.headers["access-control-request-headers"]
      const method = state.headers["access-control-request-method"]
      debugCORS("OPTIONS %s %s %s", state.urlInfo.pathname, method, headers);
      // CORS is currently disabled, so send an empty response
      throw state.sendEmpty(204, {
        // SameSite=strict should prevent the request from being credentialed
        // Allow-Origin * prevents credentialed requests
        // https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Credentials
        // "Access-Control-Allow-Credentials": "true",
        // "Access-Control-Allow-Origin": "*",
        // "Access-Control-Allow-Methods": "POST",
        // "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
        // "Access-Control-Expose-Headers": "*",
      });
      // https://developer.mozilla.org/en-US/docs/Glossary/Preflight_request

    },
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

  handleListRecipeTiddlers = zodRoute({
    method: ["GET", "HEAD"],
    path: RECIPE_PREFIX + "/:recipe_name/tiddlers.json",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    inner: async (state) => {

      const { recipe_name } = state.pathParams;

      await state.assertRecipeACL(recipe_name, false);

      const result = await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        // Get the recipe name from the parameters
        const bagTiddlers = await server.getRecipeTiddlersByBag(recipe_name);

        // reverse order for Map, so 0 comes after 1 and overlays it
        bagTiddlers.sort((a, b) => b.position - a.position);

        return Array.from(new Map(bagTiddlers.flatMap(bag => bag.tiddlers.map(tiddler => [tiddler.title, {
          title: tiddler.title,
          revision_id: tiddler.revision_id,
          is_deleted: tiddler.is_deleted,
          bag_name: bag.bag_name,
          bag_id: bag.bag_id
        }]))).values());
      });
      return result;
    }
  })


  handleGetBagStates = zodRoute({
    method: ["GET", "HEAD"],
    path: RECIPE_PREFIX + "/:recipe_name/bag-states",
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
      await state.assertRecipeACL(recipe_name, false);

      const
        last_known_revision_id = state.queryParams.last_known_revision_id?.[0],
        include_deleted = state.queryParams.include_deleted?.[0] === "yes",
        gzip_stream = state.queryParams.gzip_stream?.[0] === "yes";

      const result = await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        return await server.getRecipeTiddlersByBag(recipe_name, { include_deleted, last_known_revision_id });
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
      if (gzip_stream)
        state.writeHead(match ? 304 : 200, {
          "content-type": "application/gzip",
          "content-encoding": "identity",
          "x-gzip-stream": "yes",
          "etag": newEtag,
        });
      else
        state.writeHead(match ? 304 : 200, {
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


  handleLoadRecipeTiddler = zodRoute({
    method: ["GET", "HEAD"],
    path: RECIPE_PREFIX + "/:recipe_name/tiddlers/:title",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    inner: async (state) => {
      const { recipe_name, title } = state.pathParams;

      await state.assertRecipeACL(recipe_name, false);
      // we can only throw STREAM_ENDED outside the transaction
      throw await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        const bag = await server.getRecipeBagWithTiddler({ recipe_name, title });
        if (!bag) return state.sendEmpty(404, { "x-reason": "tiddler not found" });
        return await server.serveBagTiddler(
          bag.bag_id, 
          bag.bag.bag_name, 
          title
        );
      });

    }
  })


  handleSaveRecipeTiddler = zodRoute({
    method: ["PUT"],
    path: RECIPE_PREFIX + "/:recipe_name/tiddlers/:title",
    bodyFormat: "string",
    securityChecks: { requestedWithHeader: true },
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    zodRequestBody: z => z.string(),
    inner: async (state) => {

      const { recipe_name } = state.pathParams;

      await state.assertRecipeACL(recipe_name, true);

      const fields = parseTiddlerFields(state.data, state.headers["content-type"]);

      if (fields === undefined)
        throw state.sendEmpty(400, {
          "x-reason": "PUT tiddler expects a valid json or x-mws-tiddler body"
        });

      const { bag_name, revision_id } = await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        const bag = await server.getRecipeWritableBag(recipe_name);
        const { revision_id } = await server.saveBagTiddlerFields(fields, bag.bag_name, null);
        return { revision_id, bag_name: bag.bag_name };
      });

      return { bag_name, revision_id };

    }
  });


  handleDeleteRecipeTiddler = zodRoute({
    method: ["DELETE"],
    path: RECIPE_PREFIX + "/:recipe_name/tiddlers/:title",
    bodyFormat: "json",
    securityChecks: { requestedWithHeader: true },
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    zodRequestBody: z => z.undefined(),
    inner: async (state) => {

      const { recipe_name, title } = state.pathParams;
      if (!recipe_name || !title) throw state.sendEmpty(404, { "x-reason": "bag_name or title not found" });

      await state.assertRecipeACL(recipe_name, true);

      const { bag_name, revision_id } = await state.$transaction(async (prisma) => {

        const server = new WikiStateStore(state, prisma);

        const bag = await server.getRecipeWritableBag(recipe_name, title);

        if (!bag.tiddlers.length) throw new UserError("The writable bag does not contain this tiddler.");

        const { revision_id } = await server.deleteBagTiddler(bag.bag_name, title);

        return { revision_id, bag_name: bag.bag_name };

      });

      return { bag_name, revision_id };

    }
  });

  // this is not used by the sync adaptor.
  // it allows an HTML form to upload a tiddler directly with file upload
  handleFormMultipartRecipeTiddler = zodRoute({
    method: ["POST"],
    path: RECIPE_PREFIX + "/:recipe_name/tiddlers",
    bodyFormat: "stream",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    inner: async (state) => {

      await state.assertRecipeACL(state.pathParams.recipe_name, true);

      const recipe_name = state.pathParams.recipe_name;

      const tiddlerFields = await recieveTiddlerMultipartUpload(state);

      return await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        const { bag_name } = await server.getRecipeWritableBag(recipe_name) ?? {};
        if (!bag_name) throw state.sendEmpty(404, { "x-reason": "bag not found" });
        const { revision_id } = await server.saveBagTiddlerFields(tiddlerFields, bag_name, null);
        return { bag_name, results: { revision_id, bag_name } };
      });

    }
  });



  handleLoadBagTiddler = zodRoute({
    method: ["GET", "HEAD"],
    path: BAG_PREFIX + "/:bag_name/tiddlers/:title",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      bag_name: z.prismaField("Bags", "bag_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    inner: async (state) => {
      const { bag_name, title } = state.pathParams;
      const bag = await state.assertBagACL(bag_name, false);
      throw await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        return await server.serveBagTiddler(bag.bag_id, bag_name, title);
      });
    }
  });


  handleSaveBagTiddler = zodRoute({
    method: ["PUT"],
    path: BAG_PREFIX + "/:bag_name/tiddlers/:title",
    bodyFormat: "string",
    securityChecks: { requestedWithHeader: true },
    zodPathParams: z => ({
      bag_name: z.prismaField("Bags", "bag_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    zodRequestBody: z => z.string(),
    inner: async (state) => {
      const { bag_name, title } = state.pathParams;
      await state.assertBagACL(bag_name, true);
      const fields = parseTiddlerFields(state.data, state.headers["content-type"]);
      if (fields === undefined)
        throw state.sendEmpty(400, {
          "x-reason": "PUT tiddler expects a valid json or x-mws-tiddler body"
        });
      return await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        return server.saveBagTiddlerFields(fields, bag_name, null);
      });
    }
  });
  handleDeleteBagTiddler = zodRoute({
    method: ["DELETE"],
    path: BAG_PREFIX + "/:bag_name/tiddlers/:title",
    bodyFormat: "ignore",
    securityChecks: { requestedWithHeader: true },
    zodPathParams: z => ({
      bag_name: z.prismaField("Bags", "bag_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    inner: async (state) => {
      const { bag_name, title } = state.pathParams;
      await state.assertBagACL(bag_name, true);
      return await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        return server.deleteBagTiddler(bag_name, title);
      });
    }
  });
  handleFormMultipartBagTiddler = zodRoute({
    method: ["POST"],
    path: BAG_PREFIX + "/:bag_name/tiddlers",
    bodyFormat: "stream",
    zodPathParams: z => ({
      bag_name: z.prismaField("Bags", "bag_name", "string"),
    }),
    inner: async (state) => {
      const { bag_name } = state.pathParams;
      await state.assertBagACL(bag_name, true);
      const tiddlerFields = await recieveTiddlerMultipartUpload(state);
      return await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        return await server.saveBagTiddlerFields(tiddlerFields, bag_name, null);
      });
    }
  });

}


function parseTiddlerFields(input: string, ctype: string | undefined) {

  if (ctype?.startsWith("application/json"))
    return tryParseJSON<any>(input);

  if (ctype?.startsWith("application/x-mws-tiddler")) {
    //https://jsperf.app/mukuro
    // for a big text field (100k random characters)
    // splitting the string is 1000x faster!
    // but I don't really trust getFieldStringBlock 
    // because it doesn't check for fields with colon names
    // in fact, the behavior of the file system adapter when it 
    // encounters invalid field names is just to use JSON anyway.

    const headerEnd = input.indexOf("\n\n");
    if (headerEnd === -1) return tryParseJSON<any>(input);
    const header = input.slice(0, headerEnd);
    const body = input.slice(headerEnd + 2);

    const fields = tryParseJSON<any>(header);
    if (!fields) return undefined;
    fields.text = body;
    return fields;
  }
}


async function recieveTiddlerMultipartUpload(state: ZodState<"POST", "stream", {}, {}, zod.ZodTypeAny>) {

  interface UploadPart {
    name: string | null;
    headers: IncomingHttpHeaders;
    hash: string;
    length: number;
    filename: string | null;
    value?: string;
    inboxFilename?: string;
  }
  // Process the incoming data
  const inboxName = new Date().toISOString().replace(/:/g, "-");
  const inboxPath = resolve(state.config.storePath, "inbox", inboxName);
  mkdirSync(inboxPath, { recursive: true });

  /** Current file being written */
  let fileStream: Writable | null = null;
  /** Accumulating hash of current part */
  let hasher: Hash | null = null;
  /** Accumulating length of current part */
  let length = 0;
  // Array of {name:, headers:, value:, hash:} and/or {name:, filename:, headers:, inboxFilename:, hash:} 
  const parts: UploadPart[] = [];

  await state.readMultipartData({
    cbPartStart: function (headers, name, filename) {
      const part: UploadPart = {
        name: name,
        filename: filename,
        headers: headers,
        hash: "",
        length: 0,
      };
      if (filename) {
        const inboxFilename = (parts.length).toString();
        part.inboxFilename = resolve(inboxPath, inboxFilename);
        fileStream = createWriteStream(part.inboxFilename);
      } else {
        part.value = "";
      }
      // hash = new sjcl.hash.sha256();
      hasher = createHash("sha-256");
      length = 0;
      parts.push(part);
    },
    cbPartChunk: function (chunk) {
      if (fileStream) {
        fileStream.write(chunk);
      } else {
        parts[parts.length - 1]!.value! += chunk;
      }
      length += chunk.length;
      hasher!.update(chunk);
    },
    cbPartEnd: function () {
      if (fileStream) fileStream.end();
      fileStream = null;
      parts[parts.length - 1]!.hash = hasher!.digest("base64url");
      parts[parts.length - 1]!.length = length;
      hasher = null;
    },
  });

  const partFile = parts.find(part => part.name === "file-to-upload" && !!part.filename);

  if (!partFile) throw state.sendSimple(400, "Missing file to upload");

  const missingfilename = "File uploaded " + new Date().toISOString()

  const type = partFile.headers["content-type"];
  const tiddlerFields: TiddlerFields = { title: partFile.filename ?? missingfilename, type, };

  for (const part of parts) {
    const tiddlerFieldPrefix = "tiddler-field-";
    if (part.name?.startsWith(tiddlerFieldPrefix)) {
      (tiddlerFields as any)[part.name.slice(tiddlerFieldPrefix.length)] = part.value?.trim();
    }
  }

  const contentTypeInfo = state.config.getContentType(type);

  const file = await readFile(partFile.inboxFilename!);

  tiddlerFields.text = file.toString(contentTypeInfo.encoding as BufferEncoding);

  rmSync(inboxPath, { recursive: true, force: true });

  return tiddlerFields;
}