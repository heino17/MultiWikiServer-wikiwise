import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import { serverEvents } from "@tiddlywiki/events";
import { dist_resolve } from "@tiddlywiki/server";
import { existsSync, readFileSync, writeFileSync } from "fs";
import * as path from "path";

serverEvents.on("cli.register", (commands) => {
  commands[info.name] = { info, Command: InitDataFolderCommand };
});

const info: CommandInfo = {
  name: "init-data-folder",
  description: "Write the package.json that marks this folder as an MWS data folder",
  arguments: [],
  options: [],
  getHelp() {
    return [
      "",
      "MWS needs a package.json in the data folder that says:",
      '  "name": "@tiddlywiki/mws-instance", "private": true and a "0.2.x" version.',
      "That file is what keeps the tiddlers of a data folder out of a public",
      "registry, so the server refuses to start when it is missing or wrong",
      "instead of guessing.",
      "",
      "This command creates it from the template shipped in this package, keeps",
      "what is already in the file - the dependencies npm wrote, for example -",
      "and never overwrites a name that somebody chose on purpose.",
      "",
      "Run it in a new, empty folder, then continue with:",
      "  npx mws update-tiddlywiki",
      "  npx mws init-store",
      "  npx mws listen --listener",
    ].join("\n");
  },
};

const INSTANCE_NAME = "@tiddlywiki/mws-instance";

type DataFolderManifest = {
  name: string;
  private: boolean;
  version: string;
  scripts?: Record<string, string>;
  [key: string]: unknown;
};

export class InitDataFolderCommand extends BaseCommand<[]> {
  static info = info;

  async execute() {
    const wikiPath = path.resolve(process.cwd());
    const manifestPath = path.join(wikiPath, "package.json");
    const template = readTemplate();

    if (!existsSync(manifestPath)) {
      writeFileSync(manifestPath, JSON.stringify(template, null, 2) + "\n", "utf8");
      console.log(`Created ${manifestPath}`);
      console.log(`This folder is now a data folder. Next: npx mws update-tiddlywiki`);
      return;
    }

    const existing = readManifest(manifestPath);

    if (isDataFolderManifest(existing)) {
      console.log(`${manifestPath} already describes a data folder. Nothing to do.`);
      return;
    }

    // A package.json written by npm in an empty folder has no name at all, and
    // "npm init -y" names it after the folder. Anything else was chosen by
    // somebody, and overwriting it would destroy their intent.
    if (existing.name && existing.name !== path.basename(wikiPath)) {
      console.error([
        `Refusing to touch ${manifestPath}:`,
        `it is named "${existing.name}", which is neither "${INSTANCE_NAME}" nor this`,
        `folder's name. That looks deliberate, so it is not overwritten.`,
        "",
        "If this really is a new MWS data folder, set these three fields yourself:",
        `  "name": "${INSTANCE_NAME}"`,
        `  "private": true`,
        `  "version": "0.2.x"`,
      ].join("\n"));
      process.exit(1);
    }

    // The template wins for the three fields the startup check insists on, the
    // rest of the folder keeps what it had. Scripts are merged entry by entry so
    // that a folder with its own scripts does not lose them.
    const merged: DataFolderManifest = {
      ...existing,
      ...template,
      name: template.name,
      scripts: { ...(existing.scripts ?? {}), ...(template.scripts ?? {}) },
    };
    writeFileSync(manifestPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
    console.log(`Updated ${manifestPath}`);
    if (existing.dependencies) {
      console.log("Kept the dependencies that were already listed.");
    }
    if (existing.scripts && Object.keys(existing.scripts).length > 0) {
      console.log(`Kept ${Object.keys(existing.scripts).length} existing script(s) and added the MWS ones.`);
    }
    console.log(`This folder is now a data folder. Next: npx mws update-tiddlywiki`);
  }
}

function readTemplate(): DataFolderManifest {
  const templatePath = dist_resolve("../create-package/files/package.json");
  return JSON.parse(readFileSync(templatePath, "utf8")) as DataFolderManifest;
}

function readManifest(manifestPath: string): DataFolderManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    console.error(`${manifestPath} is not valid JSON (${(e as Error).message}). Not touching it.`);
    process.exit(1);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    console.error(`${manifestPath} does not contain a JSON object. Not touching it.`);
    process.exit(1);
  }
  return parsed as DataFolderManifest;
}

function isDataFolderManifest(manifest: DataFolderManifest): boolean {
  return manifest.name === INSTANCE_NAME
    && manifest.private === true
    && typeof manifest.version === "string"
    && manifest.version.startsWith("0.2");
}
