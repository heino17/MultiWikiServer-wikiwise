
import { IModules, Tiddler, Wiki } from "tiddlywiki"
import { Router, SiteConfig } from "../routes/router";
import * as path from "node:path";
import * as mws_load_plugin_bags from "./mws-load-plugin-bags";
import * as mws_render_tiddler from "./mws-render-tiddlywiki5";
import * as mws_load_wiki_folder from "./mws-load-wiki-folder";
import * as mws_save_archive from "./mws-save-archive";
import * as mws_load_archive from "./mws-load-archive";
import * as mws_init_store from "./mws-init-store";
import * as mws_listen from "./mws-listen";
import * as mws_command_separator from "./mws-command-separator";
import { MWSConfig } from "../server";
import { Prisma, PrismaClient } from "@prisma/client";
import { createClient } from "@libsql/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import * as sessions from "../routes/services/sessions";
import * as attacher from "../routes/services/attachments";
import { createPasswordService, PasswordService } from "../routes/services/PasswordService";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { ITXClientDenyList } from "@prisma/client/runtime/library";

export interface $TW {
  utils: any;
  wiki: any;
  config: any;
  boot: any;
  loadTiddlersFromPath: any;
  Tiddler: {
    // TW5-typed for some reason just types this as a record of modules, which is incorrect
    fieldModules: Record<string, {
      name: string;
      parse?: (value: any) => any;
      stringify?: (value: any) => string;
    }>;
  }
}

export interface CommandInfo {
  name: string;
  /** 
   * @default false
   * 
   * @description
   * 
   * - Regardless of the value of `synchronous`, the execute method is always awaited.
   * - Let `result` be any value thrown by the constructor or returned or thrown by the execute method. 
   * ```
   * synchronous: false
   * ```
   * - `result` is awaited (if result is not then-able, this has no effect).
   * - If `result` is truthy, the command is failed without waiting for the callback.
   * - If `result` is falsy, the command waits for the callback result.
   * - The callback value is NOT awaited. 
   * - if the callback value is truthy, the command is failed.
   * - if the callback value is falsy, the command is completed.
   * ```
   * synchronous: true
   * ```
   * - `result` is awaited (if result is not then-able, this has no effect).
   * - If `result` is truthy, the command is failed.
   * - If `result` is falsy, the command is completed.
   * 
   * - The callback is not available if `synchronous` is true. 
   * 
   */
  synchronous?: boolean;
  namedParameterMode?: boolean;
  mandatoryParameters?: string[];
}
/**
Parse a sequence of commands
  commandTokens: an array of command string tokens
  wiki: reference to the wiki store object
  streams: {output:, error:}, each of which has a write(string) method
  callback: a callback invoked as callback(err) where err is null if there was no error
*/
export class Commander {

  commands: Record<string, { info: CommandInfo, Command: any }> = {
    [mws_load_plugin_bags.info.name]: mws_load_plugin_bags,
    [mws_render_tiddler.info.name]: mws_render_tiddler,
    [mws_load_wiki_folder.info.name]: mws_load_wiki_folder,
    [mws_save_archive.info.name]: mws_save_archive,
    [mws_load_archive.info.name]: mws_load_archive,
    [mws_init_store.info.name]: mws_init_store,
    [mws_listen.info.name]: mws_listen,
    [mws_command_separator.info.name]: mws_command_separator,
  };

  commandTokens!: string[];
  nextToken
  verbose
  outputPath: string;


  wikiPath: string;
  storePath: string;
  databasePath: string;
  libsql;
  engine: PrismaClient<Prisma.PrismaClientOptions, never, {
    result: {
      // this types every output field with PrismaField
      [T in Uncapitalize<Prisma.ModelName>]: {
        [K in keyof PrismaPayloadScalars<Capitalize<T>>]: () => {
          compute: () => PrismaField<Capitalize<T>, K>
        }
      }
    },
    client: {},
    model: {},
    query: {},
  }>;

  $transaction<R>(
    fn: (prisma: Omit<Commander["engine"], ITXClientDenyList>) => Promise<R>,
    options?: {
      maxWait?: number,
      timeout?: number,
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
  ): Promise<R> {
    // $transaction doesn't have the client extensions types,
    // but should have them available (were they not just types).
    return this.engine.$transaction(fn as (prisma: any) => Promise<any>, options);
  }


  siteConfig: SiteConfig;

  /** 
   * The promise of the current execution. 
   * It is created and returned by execute, 
   * but also accessible here. 
   * 
   * After the promise is resolved, it will 
   * be available until execute is called again. 
   */
  promise!: Promise<void>;
  private callback!: (err?: any) => void;

  SessionManager: typeof sessions.SessionManager;
  AttachmentService: typeof attacher.AttachmentService;

  create_mws_listen;

  /** Signals that database setup is required. May be set to false by any qualified setup command. */
  setupRequired: boolean = true;

  constructor(
    public config: MWSConfig,
    public $tw: $TW,
    public PasswordService: PasswordService,
  ) {
    this.nextToken = 0;
    this.verbose = false;

    const listeners = config.listeners;
    config.listeners = [];
    // there's nothing that can't be hacked in a Node process,
    // but this just makes it a little bit harder for the listeners to be read.
    // this can be replaced, but it only recieves the listeners via closure.
    this.create_mws_listen = (params: string[]) => {
      return new mws_listen.Command(params, this, listeners);
    }

    this.wikiPath = path.resolve(config.config.wikiPath);
    this.storePath = path.resolve(config.config.wikiPath, "store");
    this.databasePath = path.resolve(this.storePath, "database.sqlite");
    this.outputPath = path.resolve($tw.boot.wikiPath, $tw.config.wikiOutputSubDir);

    if (!existsSync(this.storePath)) {
      mkdirSync(this.storePath, { recursive: true });
      this.setupRequired = true;
    }

    // using the libsql adapter because for some reason prisma was 
    // freezing when loading the system bag favicons.
    // the libsql adapter has an additional advantage of letting us specify pragma 
    // and also gives us more control over connections. 

    this.libsql = createClient({ url: "file:" + this.databasePath });

    // this.libsql.execute("pragma synchronous=off");
    this.engine = new PrismaClient({
      log: ["info", "warn"],
      adapter: new PrismaLibSQL(this.libsql)
    });

    this.siteConfig = {
      ...config.config,
      attachmentsEnabled: !!config.config.saveLargeTextToFileSystem,
      attachmentSizeLimit: config.config.saveLargeTextToFileSystem ?? 0,
      contentTypeInfo: $tw.config.contentTypeInfo,
      saveLargeTextToFileSystem: undefined as never,
      storePath: this.storePath,
    };

    this.SessionManager = config.SessionManager || sessions.SessionManager;
    this.AttachmentService = config.AttachmentService || attacher.AttachmentService;

  }

  async init() {
    this.setupRequired = false;

    const tables = await this.libsql.batch([{
      sql: `SELECT count(*) as count FROM sqlite_master WHERE type='table'`,
      args: [],
    }]).then(e => e[0]?.rows[0]?.count);

    if (tables === 0) {
      await this.libsql.executeMultiple(readFileSync("./prisma/schema.prisma.sql", "utf8"));
    }

    const users = await this.engine.users.count();
    if (!users) { this.setupRequired = true; }
  }

  static initCommands(moduleType?: string) {
    if (moduleType) throw new Error("moduleType is not implemented");
  }
  /*
  Add a string of tokens to the command queue
  */
  addCommandTokens(params: string[]) {
    if (this.verbose) console.log("Commander addCommandTokens", params);
    this.commandTokens.splice(this.nextToken, 0, ...params);
  }
  /*
  Execute the sequence of commands and invoke a callback on completion
  */
  execute(commandTokens: string[]) {
    console.log("Commander", commandTokens);
    this.commandTokens = commandTokens;
    this.promise = new Promise<void>((resolve, reject) => {
      this.callback = (err: any) => {
        if (err) this.$tw.utils.error("Error: " + err);
        err ? reject(err) : resolve();
      };
    });
    this.executeNextCommand();
    return this.promise;
  }
  /*
  Execute the next command in the sequence
  */
  executeNextCommand() {

    // Invoke the callback if there are no more commands
    if (this.nextToken >= this.commandTokens.length) {
      this.callback(null);
      return;
    }

    // Get and check the command token
    let commandName = this.commandTokens[this.nextToken++] as string;
    if (commandName.slice(0, 2) !== "--") {
      console.log(this.commandTokens);
      this.callback("Missing command: " + commandName);
      return;
    }

    commandName = commandName.slice(2); // Trim off the --

    // Get the command info
    var command = this.commands[commandName], c, err;
    if (!command) {
      this.callback("Unknown command: " + commandName);
      return;
    }

    // Accumulate the parameters to the command
    const nextCommand = this.commandTokens.findIndex((token, i) => i >= this.nextToken && token.startsWith("--"));
    const params = this.commandTokens.slice(this.nextToken, nextCommand === -1 ? undefined : nextCommand);
    this.nextToken = nextCommand === -1 ? this.commandTokens.length : nextCommand;

    if (commandName !== mws_command_separator.info.name)
      console.log("Commander executing", commandName, params);


    // Parse named parameters if required
    const paramsIfMandetory = !command.info.mandatoryParameters ? params :
      this.extractNamedParameters(params, command.info.mandatoryParameters);
    if (typeof params === "string") { this.callback(params); return; }

    new Promise<any>(async (resolve) => {
      const { Command, info } = command!;
      try {
        c = info.name === "mws-listen"
          ? this.create_mws_listen(paramsIfMandetory)
          : new Command(paramsIfMandetory, this, info.synchronous ? undefined : resolve);
        err = await c.execute();
        if (err || info.synchronous) resolve(err);
      } catch (e) {
        resolve(e);
      }
    }).then((err: any) => {
      if (err) {
        console.log(err);
        this.callback(err);
      } else {
        this.executeNextCommand();
      }
    });

  }
  /*
  Given an array of parameter strings `params` in name=value format, and an array of mandatory parameter names in `mandatoryParameters`, returns a hashmap of values or a string if error
  */
  extractNamedParameters(params: string[], mandatoryParameters?: string[]) {
    mandatoryParameters = mandatoryParameters || [];
    var errors: any[] = [], paramsByName = Object.create(null);
    // Extract the parameters
    each(params, function (param: string) {
      var index = param.indexOf("=");
      if (index < 1) {
        errors.push("malformed named parameter: '" + param + "'");
      }
      paramsByName[param.slice(0, index)] = param.slice(index + 1).trim();
    });
    // Check the mandatory parameters are present
    each(mandatoryParameters, function (mandatoryParameter: string) {
      if (!hop(paramsByName, mandatoryParameter)) {
        errors.push("missing mandatory parameter: '" + mandatoryParameter + "'");
      }
    });
    // Return any errors
    if (errors.length > 0) {
      return errors.join(" and\n");
    } else {
      return paramsByName;
    }
  }
}

