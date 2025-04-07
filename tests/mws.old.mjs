#!/usr/bin/env node
//@ts-check
import startServer from "@tiddlywiki/mws-old";
startServer({
  passwordMasterKeyFile: "./localpass.key",
  // this is used for testing migration paths from this version
  wikiPath: "./wiki",
  listeners: [{
    // key: "./localhost.key",
    // cert: "./localhost.crt",
    // host: "::",
    port: 5000,
  }],
}).catch(console.log);
