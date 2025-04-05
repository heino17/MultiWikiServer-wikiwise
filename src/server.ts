import "./routes/router";
import "./StateObject"; 
import "./streamer";
import "./global";
import * as opaque from "@serenity-kit/opaque";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as sessions from "./routes/services/sessions";
import * as attacher from "./routes/services/attachments";
import { bootTiddlyWiki } from "./tiddlywiki";
import { Commander } from "./commands";
import { ListenerBase } from "./commands/mws-listen";
import { createPasswordService } from "./routes/services/PasswordService";

export * from "./routes/services/sessions";

export interface MWSConfig {
  /** Command line args which will be processed before process.argv */
  args?: string[];
  /** Listener config for the mws-listen command. */
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
  /** Called and awaited by the mws-listen command. */
  onListenersCreated?: (listeners: ListenerBase[]) => Promise<void>
  /** If true, enable the dev server for the react client, otherwise it will just serve the files that are already built. */
  enableDevServer?: boolean
  /** The key file for the password encryption. If this key changes, all passwords will be invalid and need to be changed. */
  passwordMasterKey: string
  /** MWS site configuration */
  config: MWSConfigConfig
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
  /** Path to the mws datafolder. */
  readonly wikiPath: string
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
  // await lazy-loaded or async models
  await opaque.ready;

  if (!config.passwordMasterKey) {
    throw new Error("passwordMasterKey is required");
  }

  if (config.passwordMasterKey && !existsSync(config.passwordMasterKey)) {
    writeFileSync(config.passwordMasterKey, opaque.server.createSetup());
    console.log("Password master key created at", config.passwordMasterKey);
  }

  const commander = new Commander(
    config,
    await bootTiddlyWiki(config.config.wikiPath),
    await createPasswordService(
      readFileSync(config.passwordMasterKey, "utf8").trim()
    )
  );

  await commander.init();

  // mws-command-separator prevents params after it from being applied to the command before it.
  // it throws an error if it ends up with any params.
  await commander.execute([
    "--mws-render-tiddlywiki5",
    "--mws-command-separator",
    ...config.args ?? [],
  ]);

  if (commander.setupRequired) {
    console.log("MWS setup required. Please run either --mws-init-store or --mws-load-archive");
    process.exit(1);
  }

}

