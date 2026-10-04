import { serverEvents } from "@tiddlywiki/events";

// Every command file in this folder registers one listener for "cli.register",
// so the number of listeners on that event is exactly the number of commands.
// Node warns from eleven listeners on and reads that as a leak; it is not one.
// The listeners are added once, while the modules load, and never again.
//
// This has to live in a module of its own, imported first in index.ts: ESM
// evaluates every import of a module before that module's body runs, so a
// setMaxListeners() call in index.ts itself would arrive after the warning it
// is meant to prevent.
serverEvents.setMaxListeners(64);
