#!/usr/bin/env node
//@ts-check
import startServer from "@tiddlywiki/mws";
startServer({
  passwordMasterKeyFile: "./localpass.key",
  wikiPath: "./wiki",
  listeners: [{
    // key: "./localhost.key",
    // cert: "./localhost.crt",
    // host: "::",
    port: 5000,
  }],
}).catch(console.log);
