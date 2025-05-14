import { PrismaClient, Prisma } from "@prisma/client";
import { ITXClientDenyList } from "@prisma/client/runtime/library";
import Debug from "debug";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import * as path from "path";
import { TW } from "tiddlywiki";
import { pkg } from "./commander";
import { SqliteAdapter } from "./db/sqlite-adapter";
import { startupCache } from "./routes/cache";
import { createPasswordService } from "./services/PasswordService";
import { bootTiddlyWiki } from "./tiddlywiki";
import * as opaque from "@serenity-kit/opaque";

/** Pre command server setup */

export class ServerState {
  static async make(wikiPath: string) {
    /** The $tw instance needs to be disposable once commands are complete. */
    const $tw = await bootTiddlyWiki(wikiPath);
    const passwordService = await createPasswordService(readPasswordMasterKey(wikiPath));
    const cache = await startupCache($tw, path.resolve(wikiPath, "cache"));
    const config = new ServerState(wikiPath, $tw, passwordService, cache);
    return { $tw, config };
  }

  constructor(
    wikiPath: string,
    /** The $tw instance needs to be disposable once commands are complete. */
    $tw: TW,
    public PasswordService: PasswordService,
    public pluginCache: TiddlerCache
  ) {

    this.wikiPath = wikiPath;
    this.storePath = path.resolve(this.wikiPath, "store");
    this.cachePath = path.resolve(this.wikiPath, "cache");
    this.databasePath = path.resolve(this.storePath, "database.sqlite");

    this.fieldModules = $tw.Tiddler.fieldModules;
    this.contentTypeInfo = $tw.config.contentTypeInfo;

    if (!existsSync(this.databasePath)) this.setupRequired = true;

    this.enableBrowserCache = true;
    this.enableGzip = true;
    this.attachmentsEnabled = false;
    this.attachmentSizeLimit = 100 * 1024;

    this.enableExternalPlugins = !!process.env.ENABLE_EXTERNAL_PLUGINS;
    this.enableDevServer = !!process.env.ENABLE_DEV_SERVER;


    this.adapter = new SqliteAdapter(this.databasePath);
    this.engine = new PrismaClient({
      log: [
        ...Debug.enabled("prisma:query") ? ["query" as const] : [],
        "info", "warn"
      ],
      adapter: this.adapter.adapter
    });

    this.versions = { tw5: $tw.packageInfo.version, mws: pkg.version };

  }

  async init() {
    mkdirSync(this.storePath, { recursive: true });
    mkdirSync(this.cachePath, { recursive: true });

    await this.adapter.init();
    this.setupRequired = false;
    const users = await this.engine.users.count();
    if (!users) { this.setupRequired = true; }
  }


  $transaction<R>(
    fn: (prisma: Omit<ServerState["engine"], ITXClientDenyList>) => Promise<R>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): Promise<R> {
    // $transaction doesn't have the client extensions types,
    // but should have them available (were they not just types).
    return this.engine.$transaction(fn as (prisma: any) => Promise<any>, options);
  }


  fieldModules;

  wikiPath;
  storePath;
  cachePath;
  databasePath;

  versions;

  setupRequired = false;

  enableBrowserCache;
  enableGzip;
  attachmentsEnabled;
  attachmentSizeLimit;
  enableExternalPlugins;
  enableDevServer;


  contentTypeInfo: Record<string, {
    encoding: string;
    extension: string | string[];
    flags?: string[];
    deserializerType?: string;
  }>;

  adapter!: SqliteAdapter;
  engine!: PrismaClient<Prisma.PrismaClientOptions, never, {
    result: {
      [T in Uncapitalize<Prisma.ModelName>]: {
        [K in keyof PrismaPayloadScalars<Capitalize<T>>]: () => {
          compute: () => PrismaField<Capitalize<T>, K>;
        };
      };
    };
    client: {};
    model: {};
    query: {};
  }>;


}
export type PasswordService = ART<typeof createPasswordService>;
export type TiddlerCache = ART<typeof startupCache>;
export function readPasswordMasterKey(wikiPath: string) {
  const passwordKeyFile = path.join(wikiPath, "passwords.key");
  if (typeof passwordKeyFile === "string"
    && passwordKeyFile
    && !existsSync(passwordKeyFile)) {
    writeFileSync(passwordKeyFile, opaque.server.createSetup());
    console.log("Password master key created at", passwordKeyFile);
  }

  const passwordMasterKey = readFileSync(passwordKeyFile, "utf8").trim();
  return passwordMasterKey;
}


