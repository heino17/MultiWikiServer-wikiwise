import startServer from "@tiddlywiki/mws";
import { existsSync } from "fs";
if(existsSync("./mws.run.mjs")) {
  import("./mws.run.mjs");
} else {

  // if you want to customize the server, you can copy this block into mws.run.ts
  // all paths here are resolved relative to the current working directory
  const cli = process.argv.slice(2);
  startServer({
    passwordMasterKeyFile: "./localpass.key",
    listeners: [{
      // first run `bash localhost_cert.sh` then you can uncomment the following lines
      // key: "./localhost.key",
      // cert: "./localhost.cert",
      port: 5000,
    }],
    config: {
      wikiPath: "../editions/mws",
      allowAnonReads: false,
      allowAnonWrites: false,
      allowUnreadableBags: false,
    },
    args: cli.length ? cli : ["--mws-init-store", "--mws-listen"],
  }).catch(console.log);

}

