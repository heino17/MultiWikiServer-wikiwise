#!/usr/bin/env node
//@ts-check
const wikipath = process.argv[2];
const cli = process.argv.slice(3);
if(!wikipath){
  console.log("TiddlyWiki MultiWikiServer")
  console.log("Version:", require("./package.json").version);
  console.log("Usage: mws wikipath ( --commands args)[]");
  process.exit(1);
}
require("@tiddlywiki/mws").default({
  passwordMasterKeyFile: "./localpass.key",
  listeners: [],
  config: {
    wikiPath: require("node:path").resolve(wikipath),
    allowAnonReads: false,
    allowAnonWrites: false,
    allowUnreadableBags: false,
  },
  args: cli,
}).catch(console.log);
