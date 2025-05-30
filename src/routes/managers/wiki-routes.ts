import { STREAM_ENDED } from "../../listen/streamer";
import { tryParseJSON, UserError } from "../../utils";
import { registerZodRoutes, zodRoute, RouterKeyMap, RouterRouteMap } from "../../router";
import { TiddlerFields } from "tiddlywiki";
import { createWriteStream } from "fs";
import { parse, resolve } from "path";
import { createHash, Hash } from "crypto";
import sjcl from "sjcl";
import { readFile } from "fs/promises";
import { SiteConfig } from "../../ServerState";
import { PassThrough, Writable } from "stream";
import { IncomingHttpHeaders } from "http";
import { PrismaPromise } from "@prisma/client";
import { WikiStateStore } from "./WikiStateStore";


export const TiddlerKeyMap: RouterKeyMap<TiddlerRouter, true> = {
  // recipe status updates
  handleGetRecipeStatus: true,
  handleListRecipeTiddlers: true,
  handleGetBagStates: true,
  // individual tiddlers
  handleGetRecipeTiddler: true,
  handleSaveRecipeTiddler: true,
  handleDeleteRecipeTiddler: true,
  // wiki index
  handleGetWikiIndex: true,
  // external tools
  handleCreateRecipeTiddler: true,
}

export type TiddlerManagerMap = RouterRouteMap<TiddlerRouter>;

export class TiddlerRouter {
  static defineRoutes = (root: rootRoute) => {
    const router = new TiddlerRouter();
    const keys = Object.keys(TiddlerKeyMap);
    registerZodRoutes(root, router, keys);
  }

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
    path: "/recipes/:recipe_name/status",
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
        allowAnonReads: false,
        allowAnonWrites: false,
      };
    }
  });

  handleGetRecipeTiddler = zodRoute({
    method: ["GET", "HEAD"],
    path: "/recipes/:recipe_name/tiddlers/:title",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    inner: async (state) => {
      const { recipe_name, title } = state.pathParams;

      await state.assertRecipeACL(recipe_name, false);

      throw await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        const bag = await server.getRecipeBagWithTiddler({ recipe_name, title });

        if (!bag) return state.sendEmpty(404, { "x-reason": "tiddler not found" });

        const tiddler = await prisma.tiddlers.findUnique({
          where: { bag_id_title: { bag_id: bag.bag_id, title } },
          include: { fields: true }
        })

        if (!tiddler) return state.sendEmpty(404, { "x-reason": "tiddler not found" });

        const result = getTiddlerFields(title, tiddler.fields);

        const accept_json = state.headers.accept?.includes("application/json");
        const accept_mws_tiddler = state.headers.accept?.includes("application/x-mws-tiddler");

        // If application/json is requested then this is an API request, and gets the response in JSON
        if (accept_json || accept_mws_tiddler) {

          const type = accept_mws_tiddler ? "application/x-mws-tiddler"
            : accept_json ? "application/json"
              : undefined;

          if (!type) throw new Error("undefined type");

          return state.sendResponse(200, {
            "Etag": state.makeTiddlerEtag({
              bag_name: bag.bag.bag_name,
              revision_id: tiddler.revision_id,
            }),
            "Content-Type": "application/json",
            "X-Revision-Number": tiddler.revision_id,
            "X-Bag-Name": bag.bag.bag_name,
          }, formatTiddlerFields(result, type), "utf8");

        } else {

          // This is not a JSON API request, we should return the raw tiddler content

          const type = state.config.getContentType(result.type);

          return state.sendString(200, {
            "Etag": state.makeTiddlerEtag({
              bag_name: bag.bag.bag_name,
              revision_id: tiddler.revision_id,
            }),
            "Content-Type": result.type
          }, result.text ?? "", type.encoding as BufferEncoding);

        }

      });

    }
  })

  handleListRecipeTiddlers = zodRoute({
    method: ["GET", "HEAD"],
    path: "/recipes/:recipe_name/tiddlers.json",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    inner: async (state) => {

      const { recipe_name } = state.pathParams;

      await state.assertRecipeACL(recipe_name, false);

      const result = await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        return await server.getRecipeTiddlers(recipe_name);
      });
      return result;
    }
  })


  handleGetBagStates = zodRoute({
    method: ["GET", "HEAD"],
    path: "/recipes/:recipe_name/bag-states",
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



  handleSaveRecipeTiddler = zodRoute({
    method: ["PUT"],
    path: "/recipes/:recipe_name/tiddlers/:title",
    bodyFormat: "string",
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
        // The tiddlywiki client saves binary tiddlers as base64-encoded text field
        // so no special handling is required.

        return await server.saveRecipeTiddlerFields(fields, state.pathParams.recipe_name, null);
      });

      return { bag_name, revision_id };

    }
  });


  handleDeleteRecipeTiddler = zodRoute({
    method: ["DELETE"],
    path: "/recipes/:recipe_name/tiddlers/:title",
    bodyFormat: "json",
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
        return await server.deleteRecipeTiddler(recipe_name, title);
      });

      return { bag_name, revision_id };

    }
  });

  // this is not used by the sync adaptor.
  // it allows an HTML form to upload a tiddler directly with file upload
  handleCreateRecipeTiddler = zodRoute({
    method: ["POST"],
    path: "/recipes/:recipe_name/tiddlers",
    bodyFormat: "stream",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    inner: async (state) => {
      await state.assertRecipeACL(state.pathParams.recipe_name, true);

      const recipe_name = state.pathParams.recipe_name;

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
      createDirectory(inboxPath);
      
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

      deleteDirectory(inboxPath);

      return await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        const { bag_name } = await server.getRecipeWritableBag(recipe_name) ?? {};
        if (!bag_name) throw state.sendEmpty(404, { "x-reason": "bag not found" });
        const { revision_id } = await server.saveBagTiddlerFields(tiddlerFields, bag_name, null);
        return { bag_name, results: { revision_id, bag_name } };
      });

    }
  });

  handleGetWikiIndex = zodRoute({
    method: ["GET", "HEAD"],
    path: "/wiki/:recipe_name",
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


}

function getTiddlerFields(
  title: PrismaField<"Tiddlers", "title">,
  fields: { field_name: string, field_value: string }[]
) {
  return Object.fromEntries([
    ...fields.map(e => [e.field_name, e.field_value] as const),
    ["title", title]
  ]) as TiddlerFields;
};

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

function formatTiddlerFields(input: TiddlerFields, ctype: "application/x-mws-tiddler" | "application/json") {
  if (ctype === "application/x-mws-tiddler") {
    const body = input.text;
    delete input.text;
    const head = JSON.stringify(input);
    return `${head}\n\n${body}`;
  }

  if (ctype === "application/json") {
    return JSON.stringify(input);
  }

  throw new UserError("Unknown tiddler wire format " + ctype)

}