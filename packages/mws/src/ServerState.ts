import { PrismaClient, Prisma } from "@prisma/client";
import { ITXClientDenyList } from "@prisma/client/runtime/library";
import { TW } from "tiddlywiki";
import pkg from "../../../package.json";
import { createPasswordService } from "./services/PasswordService";
import { startupCache } from "./services/cache";

/** This is an alias for ServerState in case we want to separate the two purposes. */
export type SiteConfig = ServerState;

/** Pre command server setup */
const DEFAULT_CONTENT_TYPE = "application/octet-stream";

export class ServerState {

  constructor(
    { wikiPath, cachePath, storePath }: {
      wikiPath: string,
      cachePath: string,
      storePath: string
    },
    // public wikiPath: string,
    /** The $tw instance needs to be disposable once commands are complete. */
    $tw: TW,
    public engine: PrismaEngineClient,
    public PasswordService: PasswordService,
    public pluginCache: TiddlerCache
  ) {
    this.wikiPath = wikiPath;
    this.cachePath = cachePath;
    this.storePath = storePath;

    this.fieldModules = $tw.Tiddler.fieldModules;
    this.contentTypeInfo = $tw.config.contentTypeInfo;

    if (!this.contentTypeInfo[DEFAULT_CONTENT_TYPE])
      throw new Error(
        "The content type info for "
        + DEFAULT_CONTENT_TYPE
        + " cannot be found in TW5"
      );

    this.enableBrowserCache = true;
    this.enableGzip = true;
    this.attachmentsEnabled = false;
    this.attachmentSizeLimit = 100 * 1024;
    this.csrfDisable = false;

    this.enableExternalPlugins = !!process.env.ENABLE_EXTERNAL_PLUGINS;
    this.enableDevServer = process.env.ENABLE_DEV_SERVER === "mws";
    this.enableDocsRoute = !!process.env.ENABLE_DOCS_ROUTE;


    this.versions = { tw5: $tw.packageInfo.version, mws: pkg.version };

  }

  async init() {
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

  wikiPath;
  storePath;
  cachePath;

  versions;

  setupRequired = false;

  enableBrowserCache;
  enableGzip;
  attachmentsEnabled;
  attachmentSizeLimit;
  enableExternalPlugins;
  enableDevServer;
  enableDocsRoute;
  csrfDisable;

  fieldModules;
  contentTypeInfo: Record<string, ContentTypeInfo>;

  getContentType(type?: string): ContentTypeInfo {
    return type && this.contentTypeInfo[type] || this.contentTypeInfo[DEFAULT_CONTENT_TYPE]!;
  }


}

declare global {
  type PrismaTxnClient = Omit<PrismaEngineClient, ITXClientDenyList>;
  type PrismaEngineClient = PrismaClient<Prisma.PrismaClientOptions, never, {
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
  }>
}

export interface ContentTypeInfo {
  encoding: string;
  extension: string | string[];
  flags?: string[];
  deserializerType?: string;
};

export type PasswordService = ART<typeof createPasswordService>;
export type TiddlerCache = ART<typeof startupCache>;
