import { StateObject } from "./StateObject";
import { TiddlerStore } from "./TiddlerStore";
import { join, resolve } from "path";
import { createReadStream, createWriteStream, readFileSync } from "fs";
import sjcl from "sjcl";
import { createHash } from "crypto";
import { AttachmentService } from "../services/attachments";


export class TiddlerServer extends TiddlerStore {

  constructor(
    protected state: StateObject,
    prisma: PrismaTxnClient
  ) {
    const router = state.router;
    super(
      router.fieldModules,
      new AttachmentService(router.siteConfig, prisma),
      router.siteConfig.storePath,
      router.siteConfig.contentTypeInfo,
      prisma
    );
  }


  /** If neither bag_name nor bag_id are specified, the fallback will be sent. */
  async sendBagTiddler({ state, bag_name, bag_id, title }: {
    state: StateObject;
    bag_name?: PrismaField<"Bags", "bag_name">;
    bag_id?: PrismaField<"Bags", "bag_id">;
    title: PrismaField<"Tiddlers", "title">;
  }) {

    const tiddlerInfo = (bag_id || bag_name) && await this.getBagTiddler({ bag_name, bag_id, title });

    if (!tiddlerInfo || !tiddlerInfo.tiddler) {
      // Redirect to fallback URL if tiddler not found
      const fallback = state.queryParams.fallback?.[0];
      if (fallback) {
        // await state.pushStream(fallback);
        return state.redirect(fallback);
      } else {
        return state.sendEmpty(404, { "x-reason": "tiddler not found (no fallback)" });
      }
    }


    // If application/json is requested then this is an API request, and gets the response in JSON
    if (state.headers.accept && state.headers.accept.indexOf("application/json") !== -1) {

      return state.sendResponse(200, {
        "Etag": state.makeTiddlerEtag(tiddlerInfo),
        "Content-Type": "application/json",
        "X-Revision-Number": tiddlerInfo.revision_id,
        "X-Bag-Name": tiddlerInfo.bag_name,
      }, JSON.stringify(tiddlerInfo.tiddler), "utf8");

    } else {

      // This is not a JSON API request, we should return the raw tiddler content
      const result = await this.getBagTiddlerStream(title, tiddlerInfo.bag_name);
      if (!result || !result.stream) return state.sendEmpty(404);

      return state.sendStream(200, {
        "Etag": state.makeTiddlerEtag(result),
        "Content-Type": result.type
      }, result.stream);

    }

  }


  /**
   * Process an incoming new multipart/form-data stream. Options include:
   *
   * @param {Object} options
   * @param {SqlTiddlerStore} options.store
   * @param {ServerState} options.state
   * @param {ServerResponse} options.response
   * @param {string} options.bag_name
   * @param {function} options.callback
   */
  async processIncomingStream(
    bag_name: PrismaField<"Bags", "bag_name">
  ): Promise<string[]> {

    // Process the incoming data
    const inboxName = new Date().toISOString().replace(/:/g, "-");
    const inboxPath = resolve(this.storePath, "inbox", inboxName);
    createDirectory(inboxPath);
    let fileStream: { write: (arg0: any) => void; end: () => void; } | null = null; // Current file being written
    let hash: { update: (arg0: any) => void; finalize: () => any; } | null = null; // Accumulating hash of current part
    let length = 0; // Accumulating length of current part
    const parts: any[] = []; // Array of {name:, headers:, value:, hash:} and/or {name:, filename:, headers:, inboxFilename:, hash:} 

    await this.state.readMultipartData({
      cbPartStart: function (headers, name, filename) {
        const part: any = {
          name: name,
          filename: filename,
          headers: headers
        };
        if (filename) {
          const inboxFilename = (parts.length).toString();
          part.inboxFilename = resolve(inboxPath, inboxFilename);
          fileStream = createWriteStream(part.inboxFilename);
        } else {
          part.value = "";
        }
        hash = new sjcl.hash.sha256();
        length = 0;
        parts.push(part);
      },
      cbPartChunk: function (chunk) {
        if (fileStream) {
          fileStream.write(chunk);
        } else {
          parts[parts.length - 1].value += chunk;
        }
        length = length + chunk.length;
        hash!.update(chunk);
      },
      cbPartEnd: function () {
        if (fileStream) {
          fileStream.end();
        }
        fileStream = null;
        parts[parts.length - 1].hash = sjcl.codec.hex.fromBits(hash!.finalize()).slice(0, 64).toString();
        hash = null;
      },
      // if an error is given here, it will also be thrown in the promise
      cbFinished: (err) => { }
    });

    const partFile = parts.find(part => part.name === "file-to-upload" && !!part.filename);
    if (!partFile) {
      throw await this.state.sendSimple(400, "Missing file to upload");
    }

    const type = partFile.headers["content-type"];
    const tiddlerFields = { title: partFile.filename, type };

    for (const part of parts) {
      const tiddlerFieldPrefix = "tiddler-field-";
      if (part.name.startsWith(tiddlerFieldPrefix)) {
        (tiddlerFields as any)[part.name.slice(tiddlerFieldPrefix.length)] = part.value.trim();
      }
    }

    await this.saveBagTiddlerWithAttachment(tiddlerFields, bag_name, {
      filepath: partFile.inboxFilename,
      type: type,
      hash: partFile.hash
    } as any).then(() => {
      deleteDirectory(inboxPath);
      return [tiddlerFields.title];
    }, err => {
      throw err;
    });

    return parts;
  }

  async getRecipeTiddlers(recipe_name: PrismaField<"Recipes", "recipe_name">) {
    // Get the recipe name from the parameters
    const bagTiddlers = await this.getRecipeTiddlersByBag(recipe_name);

    // reverse order for Map, so 0 comes after 1 and overlays it
    bagTiddlers.sort((a, b) => b.position - a.position);

    return Array.from(new Map(bagTiddlers.flatMap(bag =>
      bag.tiddlers.map(tiddler => [tiddler.title, {
        title: tiddler.title,
        revision_id: tiddler.revision_id,
        is_deleted: tiddler.is_deleted,
        is_plugin: false,
        bag_name: bag.bag_name,
        bag_id: bag.bag_id
      }])
    )).values());

  }
  
}
