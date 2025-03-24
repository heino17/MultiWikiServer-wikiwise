import { existsSync, mkdirSync } from "fs";
import startServer from "./src/server";

if (existsSync("./mws.run.ts")) {
  // don't copy this into mws.run.ts or you'll get an infinite loop
  import("./mws.run")
} else {
  // if you want to customize the server, you can copy this block into mws.run.ts
  // all paths here are resolved relative to the current working directory

  if (!existsSync("runtime-config")) mkdirSync("runtime-config");

  const cli = process.argv.slice(2);

  startServer({
    // enableDevServer: true, // set to true to enable the dev server for the react ui
    passwordMasterKey: "./runtime-config/localpass.key",
    listeners: [{
      // key: "./runtime-config/localhost.key",
      // cert: "./runtime-config/localhost.cert",
      port: 5000,
    }],
    config: {
      wikiPath: "./editions/mws",
      allowAnonReads: false,
      allowAnonWrites: false,
      allowUnreadableBags: false,
    },
    args: cli.length ? cli : ["--mws-init-store", "--mws-listen"],
  }).catch(console.log);
}


