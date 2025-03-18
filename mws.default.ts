import { existsSync } from "fs";
import startServer from "./src/server.ts";

if (existsSync("./mws.run.ts")) {
  // don't copy this into mws.run.ts or you'll get an infinite loop
  import("./mws.run.ts")
} else {
  // if you want to customize the server, you can copy this into mws.run.ts
  startServer({
    // enableDevServer: true,
    passwordMasterKey: "./localpass.key",
    listeners: [{
      port: 5000,
    }],
    config: {
      wikiPath: "./editions/mws",
      allowAnonReads: false,
      allowAnonWrites: false,
      allowUnreadableBags: false,
    },
  });
}


