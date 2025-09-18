import "../../../prisma/global";
import { serverEvents } from "@tiddlywiki/events";

// these all use serverEvents
import "@tiddlywiki/commander";
import "@tiddlywiki/server";
import "./registerRequest";
import "./registerStartup";
import "./commands";
import "./managers";
import "./zodAssert";
import "./RequestState";
import "./ServerState";
import "./services/tw-routes";
import "./services/cache";
import "./services/sessions";
import "./SendError";

// startup
import * as opaque from "@serenity-kit/opaque";
import { startup } from "@tiddlywiki/server";
import runCLI from "@tiddlywiki/commander";

// exports
export { ZodRoute } from "@tiddlywiki/server";
export * from "./managers";

export default async function runMWS(oldOptions?: any) {
  // detect version 0.0 and exit
  if (oldOptions && oldOptions.passwordMasterKeyFile) {
    console.log([
      "=======================================================================================",
      "The wiki you are trying to open was created in a previous version of MWS.",
      "To return to a usable version of this wiki, you may run ",
      "",
      "npm install @tiddlywiki/mws@0.0",
      "",
      "Please export any wikis you want to keep by opening them and downloading them as single-file",
      "wikis by clicking on the cloud status icon and then 'save snapshot for offline use'.",
      "",
      "If you have custom options set up, we have moved to CLI commands instead of options.",
      "You can run `npx mws help` to see the available commands and `npx mws help listen` to ",
      "see the available options for the listen command. The password master key file is now",
      "stored in this folder as `passwords.key`.",
      "=======================================================================================",
    ].join("\n"));
    process.exit(1);
  }
  await opaque.ready;
  await startup();
  await runCLI();
}



serverEvents.on("cli.commander", (program) => {
  program.description("Multi-User Multi-Wiki Server for TiddlyWiki.");
})


declare global {

  /** Awaited Return Type */
  type ART<T extends (...args: any) => any> = Awaited<ReturnType<T>>
  type Complete<T> = { [K in keyof T]-?: T[K] }
  interface ObjectConstructor { keys<T>(t: T): (string & keyof T)[]; }

}

declare global {
  /** helper function which returns the arguments as an array, but typed as a tuple, which is still an array, but positional. */
  function tuple<P extends any[]>(...arg: P): P;
}
(global as any).tuple = function (...args: any[]) { return args; }

declare global {
  /** 
   * Helper function which narrows the type to only truthy values.
   * 
   * It uses `!!` so NaN will also be excluded.
   */
  function truthy<T>(obj: T): obj is Exclude<T, false | null | undefined | 0 | '' | void>
}
(global as any).truthy = function truthy(obj: any) { return !!obj; }


