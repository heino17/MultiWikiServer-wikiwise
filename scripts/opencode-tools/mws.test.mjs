import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
Error.stackTraceLimit = 30;
process.argv = [process.argv[0], process.argv[1], "listen", "--listener", "host=127.0.0.1", "port=5001"];
process.chdir(join(ROOT, "dev/wiki"));
const { default: runMWS } = await import(pathToFileURL(join(ROOT, "dist/mws.js")).href);
runMWS().catch(console.log);