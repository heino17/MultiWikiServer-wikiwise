

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
import { BAG_PREFIX, RECIPE_PREFIX } from "./wiki-utils";
const debugCORS = Debug("mws:cors");
const debugSSE = Debug("mws:sse");


export class WikiExternalRoutes {
 

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

      await state.assertRecipeAccess(state.pathParams.recipe_name, true);

      const recipe_name = state.pathParams.recipe_name;

      const tiddlerFields = await recieveTiddlerMultipartUpload(state);

      const res = await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        const { bag_name, bag_id } = await server.getRecipeWritableBag(recipe_name) ?? {};
        if (!bag_name) throw state.sendEmpty(404, { "x-reason": "bag not found" });
        const { revision_id } = await server.saveBagTiddlerFields(tiddlerFields, bag_id, null);
        return { bag_name, results: { revision_id, bag_name } };
      });

      await serverEvents.emitAsync("mws.tiddler.save", {
        recipe_name,
        bag_name: res.results.bag_name,
        title: tiddlerFields.title,
        revision_id: res.results.revision_id,
      });

      return res;

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
      const bag = await state.assertBagAccess(bag_name, false);
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
      const { bag_id } = await state.assertBagAccess(bag_name, true);
      const fields = parseTiddlerFields(state.data, state.headers["content-type"]);
      if (fields === undefined)
        throw state.sendEmpty(400, {
          "x-reason": "PUT tiddler expects a valid json or x-mws-tiddler body"
        });
      const res = await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        return server.saveBagTiddlerFields(fields, bag_id, null);
      });

      await serverEvents.emitAsync("mws.tiddler.save", {
        bag_name,
        title: fields.title,
        revision_id: res.revision_id,
      });

      return res;
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
      const { bag_id } = await state.assertBagAccess(bag_name, true);
      const res = await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        return server.deleteBagTiddler(bag_id, title);
      });
      await serverEvents.emitAsync("mws.tiddler.delete", {
        bag_name,
        title,
        revision_id: res.revision_id,
      });
      return res;
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
      const { bag_id } = await state.assertBagAccess(bag_name, true);
      const tiddlerFields = await recieveTiddlerMultipartUpload(state);
      const res = await state.$transaction(async (prisma) => {
        const server = new WikiStateStore(state, prisma);
        return await server.saveBagTiddlerFields(tiddlerFields, bag_id, null);
      });
      await serverEvents.emitAsync("mws.tiddler.save", {
        bag_name,
        title: tiddlerFields.title,
        revision_id: res.revision_id,
      });
      return res;
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


async function recieveTiddlerMultipartUpload(state: ZodState<"POST", "stream", any, any, zod.ZodTypeAny>) {

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

function rethrow<T>(cb: () => T, message: string) {
  try {
    return cb();
  } catch (e) {
    if (e instanceof UserError) throw e;
    throw new UserError(message);
  }
}