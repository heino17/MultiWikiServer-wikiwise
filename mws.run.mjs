#!/usr/bin/env node
//@ts-check
import { existsSync, readFileSync, } from "fs";

const cwd = process.cwd();
/** @type {import("./package.json") | null} */
const pkg = existsSync(`${cwd}/package.json`)
  ? tryParseJSON(readFileSync(`${cwd}/package.json`, "utf8"))
  : null;

if(pkg?.name === "@tiddlywiki/mws" && existsSync(`${cwd}/mws.dev.mjs`)) {
  console.error("This appears to be a development version of MWS.");
  process.exit(1);
}

if(!pkg?.dependencies?.["@tiddlywiki/mws"]) {
  console.error("This does not appear to be a valid MWS data folder.");
  console.error("Please run this command in the root of your MWS data folder.");
  process.exit(1);
}

if(pkg.name !== "@tiddlywiki/mws-instance" || !pkg.private) {
  // this might be a previous version or some other project using mws as a dependency
  console.error("This appears to be an old version of MWS or some kind of custom project.");
  process.exit(1);
}

import(`${cwd}/node_modules/@tiddlywiki/mws`).then(mws => mws.default()).catch(console.error);

function tryParseJSON(file) {
  try {
    return JSON.parse(file);
  } catch(e) {
    return undefined;
  }
}