#!/usr/bin/env node
//@ts-check
import { existsSync, readFileSync, } from "fs";

const cwd = process.cwd();

if (existsSync(`${cwd}/mws.dev.mjs`)) {
  console.error("This appears to be a development version of MWS.");
  process.exit(1);
}

import("./dist/mws.js")
  .then(mws => mws.default())
  .catch(error => {
    // Commands report user errors by throwing a plain string. Print that as a
    // normal CLI error and set a non-zero exit code instead of letting Node
    // report an unhandled promise rejection with its internal stack trace.
    if (error instanceof Error) console.error(error.stack ?? error.message);
    else console.error(`Error: ${error}`);
    process.exitCode = 1;
  });