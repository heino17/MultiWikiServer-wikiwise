//@ts-check
import startServer from "@tiddlywiki/mws";
import { resolve } from "node:path";
startServer({
  enableDevServer: resolve("."),
  passwordMasterKeyFile: "./runtime-config/localpass.key",
  listeners: [{
    // first run `npm run certs` to generate the certs
    key: "./runtime-config/localhost.key",
    cert: "./runtime-config/localhost.crt",
    host: "::",
    port: 5000,
  }],
  wikiPath: "./editions/mws",
}).catch(console.log);
