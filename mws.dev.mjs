//@ts-check
import { existsSync, mkdirSync, readFileSync } from "node:fs";
//@ts-ignore
import { runCLI } from "./dist/index.js";
/** * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * For development, it is usually preferred to have a custom configuration that 
 * doesn't get committed or overwritten. For this purpose I have gitignore'd two 
 * paths: `mws.dev.json` and `runtime-config`.
 * 
 * The `runtime-config` folder is for whatever keys, certs, or other config you 
 * want to have for development which doesn't change. 
 * 
 * The `mws.dev.json` file is for whatever listen args you want. It is an "array of ListenArgs".
 * Each item in the array is converted to a listen arg with the options specified. 
 * 
 * Paths in the `mws.dev.json` file, unfortunately, must be relative to the `editions/mws` folder.
 * 
 * You may also pass arguments to the command line. The `mws.dev.json` file is only used if there
 * are no command line arguments. 
 * 
 * @typedef {Partial<Record<"host"|"port"|"prefix"|"key"|"cert"|"secure", string>>} ListenArgs 
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
// if args aren't specified on the cli, generate listen args from the json file

if(process.argv.length === 2) {
  const listenerFile = "./mws.dev.json";
  /** @type {ListenArgs[]} */
  const listeners = existsSync(listenerFile)
    ? JSON.parse(readFileSync(listenerFile, "utf8"))
    : [{}];

  const args = listeners.flatMap(e => [
    "--listener", ...Object.entries(e).map(([k, v]) => `${k}=${v}`)
  ]);
  process.argv = [process.argv[0], process.argv[1], "listen", ...args];
}
console.log("args", process.argv);
// make the editions/mws directory if it doesn't exist
mkdirSync("editions/mws", { recursive: true })
// change to the editions/mws directory for development
process.chdir("editions/mws");
// run the cli
runCLI().catch(console.log);


