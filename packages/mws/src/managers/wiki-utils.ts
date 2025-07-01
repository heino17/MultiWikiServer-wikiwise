import { BodyFormat, IncomingHttpHeaders, JsonValue, tryParseJSON, UserError, zod, ZodRoute, ZodState } from "@tiddlywiki/server";
import { createHash, Hash } from "crypto";
import { createWriteStream, mkdirSync, rmSync } from "fs";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { Writable } from "stream";
import { TiddlerFields } from "tiddlywiki";


export interface WikiRoute<
  M extends string,
  B extends BodyFormat,
  P extends Record<string, zod.ZodType<any, string | undefined>>,
  Q extends Record<string, zod.ZodType<any, string[] | undefined>>,
  T extends zod.ZodTypeAny,
  R extends JsonValue
> extends ZodRoute<M, B, P, Q, T, R> {
  routeType: "wiki" | "recipe" | "bag";
  routeName: string;
}

export const BAG_PREFIX = "/bag";
export const RECIPE_PREFIX = "/recipe";
export const WIKI_PREFIX = "/wiki";

export function parseTiddlerFields(input: string, ctype: string | undefined) {

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


export async function recieveTiddlerMultipartUpload(state: ZodState<"POST", "stream", any, any, zod.ZodTypeAny>) {

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

export function rethrow<T>(cb: () => T, message: string) {
  try {
    return cb();
  } catch (e) {
    if (e instanceof UserError) throw e;
    throw new UserError(message);
  }
}