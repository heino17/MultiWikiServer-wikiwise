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

if(!pkg?.dependencies?.["@tiddlywiki/mws"] || pkg.name !== "@tiddlywiki/mws-instance" || !pkg.private) {
  console.error("This does not appear to be a valid MWS data folder.");
  console.error("Please run this command in the root of your MWS data folder.");
  process.exit(1);
}

import(`file://${cwd}/node_modules/@tiddlywiki/mws/dist/mws.js`).then(mws => mws.default()).catch(console.error);

function tryParseJSON(file) {
  try {
    return JSON.parse(file);
  } catch(e) {
    return undefined;
  }
}
