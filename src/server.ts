import "./routes/router";
import "./StateObject";
import "./streamer";
import "./global";
import * as opaque from "@serenity-kit/opaque";
import { existsSync, mkdirSync, PathOrFileDescriptor, readFileSync, writeFileSync } from 'node:fs';
import * as sessions from "./services/sessions";
import * as attacher from "./services/attachments";
import { bootTiddlyWiki } from "./tiddlywiki";
import { Commander } from "./commander";
import { ListenerBase } from "./commands/listen";
import { createPasswordService } from "./services/PasswordService";
import { resolve } from "node:path";

export * from "./services/sessions";

export interface MWSConfig {
  /** 
   * Listener config for the mws-listen command. 
   * This is extracted from the config early and passed directly to mws-listen. 
   */
  listeners: {
    /** The key file for the HTTPS server. If either key or cert are set, both are required, and HTTPS is enforced. */
    key?: string
    /** The cert file for the HTTPS server. If either key or cert are set, both are required, and HTTPS is enforced. */
    cert?: string
    /** The port to listen on. If not specified, listen will not be called. */
    port?: number
    /** The hostname to listen on. If this is specified, then port is required. */
    host?: string
  }[]
  /**
   * Called and awaited by the mws-listen command. 
   * This is extracted from the config early and passed directly to mws-listen. 
   */
  onListenersCreated?: (listeners: ListenerBase[]) => Promise<void>;

  /** 
   * Enables the dev configuration of the server.
   */
  enableDevServer?: boolean
  /** 
   * Path or file descriptor to the password master key.
   * If this key changes, all passwords will be invalid and need to be changed.
   */
  passwordMasterKeyFile: string | number
  onPasswordKeyFileRead?: () => void;
  /** Path to the datafolder. */
  wikiPath: string
  /** MWS site configuration */
  config?: MWSConfigConfig
  /** 
   * The session manager class registers the login handler routes and sets the auth user 
   */
  SessionManager?: typeof sessions.SessionManager;
  /** 
   * The attachment service class is used by routes to handle attachments
   */
  AttachmentService?: typeof attacher.AttachmentService;

}


export interface MWSConfigConfig {
  /** If true, allow users that aren't logged in to read. */
  readonly allowAnonReads?: boolean
  /** If true, allow users that aren't logged in to write. */
  readonly allowAnonWrites?: boolean
  /** If true, recipes will allow access to a user who does not have read access to all its bags. */
  readonly allowUnreadableBags?: boolean
  /** If true, files larger than `this * 1024` will be saved to disk alongside the database instead of in the database. */
  readonly saveLargeTextToFileSystem?: number;
  readonly enableGzip?: boolean
  readonly enableBrowserCache?: boolean
  /** The path prefix must start with a slash, and end without a slash */
  readonly pathPrefix?: string;
  readonly enablePluginCache?: boolean;
}


export interface SiteConfig extends MWSConfigConfig {
  wikiPath: string;
  attachmentSizeLimit: number;
  attachmentsEnabled: boolean;
  contentTypeInfo: Record<string, any>;
  saveLargeTextToFileSystem: never;
  storePath: string;
  /** 
   * The path prefix is a essentially folder mount point. 
   * 
   * It starts with a slash, and ends without a slash (`"/dev"`). 
   * 
   * If there is not a prefix, it is an empty string (`""`). 
   */
  pathPrefix: string;
}


/**
 * 
 * The promise returned will resolve once the commander has completed.
 * It will reject if the commander or anything else throws an error.
 * 
```
import startServer from "./src/server.ts";

startServer({
  // enableDevServer: true,
  passwordMasterKey: "./localpass.key",
  listeners: [{
    key: "./localhost.key",
    cert: "./localhost.crt",
    port: 5000,
  }],
  config: {
    wikiPath: "./editions/mws",
    allowAnonReads: false,
    allowAnonWrites: false,
    allowUnreadableBags: false,
  },
});

```
 */
export default async function startServer(config: MWSConfig) {

  await opaque.ready;

  if (!["string", "number"].includes(typeof config.passwordMasterKeyFile)) {
    throw new Error("passwordMasterKeyFile must be a string or number");
  }

  if (typeof config.passwordMasterKeyFile === "string"
    && config.passwordMasterKeyFile
    && !existsSync(config.passwordMasterKeyFile)
  ) {
    writeFileSync(config.passwordMasterKeyFile, opaque.server.createSetup());
    console.log("Password master key created at", config.passwordMasterKeyFile);
  }

  const passwordMasterKey = readFileSync(config.passwordMasterKeyFile, "utf8").trim();

  config.onPasswordKeyFileRead?.();

  config.wikiPath = resolve(config.wikiPath);

  const commander = new Commander(
    config,
    await bootTiddlyWiki(config.wikiPath),
    await createPasswordService(passwordMasterKey)
  );

  await commander.init();
  const cli = process.argv.slice(2);
  // mws-command-separator prevents params after it from being applied to the command before it.
  // it throws an error if it ends up with any params.
  if (cli.length)
    await commander.execute(cli);
  else
    await commander.executeInternal([
      "--init-store",
      "--listen"
    ]);

  if (commander.setupRequired) {
    console.log("MWS setup required. Please run either init-store or load-archive");
    process.exit(1);
  }

}

