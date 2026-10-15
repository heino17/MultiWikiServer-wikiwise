import { CommandClass } from "@tiddlywiki/commander";
import { serverEvents } from "@tiddlywiki/events";
import { ListenCommand } from "./listen";
import { InitDataFolderCommand } from "./init-data-folder";
import { InitStoreCommand } from "./init-store";
import { ImportWikiFileCommand } from "./import-wiki-file";
import { LoadWikiFolderCommand } from "./load-wiki-folder";
import { ProvisionSimpleWikiCommand } from "./provision-simplewiki";
import { PruneTemplateReleasesCommand } from "./prune-template-releases";
import { RenamePersonalRolesCommand } from "./rename-personal-roles";
import { RestoreWikiSnapshotCommand } from "./restore-wiki-snapshot";
import { TestArgsCommand } from "./test-args";
import { TestsCompleteCommand } from "./tests-complete";
import { UpdateSimpleWikiCommand } from "./update-simplewiki";
import { UpdateTiddlyWikiCommand } from "./update-tiddlywiki";

/**
 * The commands of this CLI, as data.
 *
 * Every command used to hang a listener of its own on "cli.register". The
 * listener count then grew with the number of commands, and Node reads a
 * count above ten as a leak and warns about it on every start. The count said
 * nothing about memory: it said that somebody added a command, which is what
 * an eleventh command is.
 *
 * A command is a class with a static info, so one table says all of it, and
 * the single listener below hands the table to the CLI. The key is the name
 * of the command. Commander and runCLI read info.name, so key and info.name
 * have to agree — a command whose two names differ is registered under
 * info.name, and the key is then only a label.
 *
 * The order of the table is the order of `mws help`.
 */
export const COMMANDS = {
  listen: ListenCommand,
  "init-data-folder": InitDataFolderCommand,
  "init-store": InitStoreCommand,
  "import-wiki-file": ImportWikiFileCommand,
  "load-wiki-folder": LoadWikiFolderCommand,
  "provision-simplewiki": ProvisionSimpleWikiCommand,
  "prune-template-releases": PruneTemplateReleasesCommand,
  "rename-personal-roles": RenamePersonalRolesCommand,
  "restore-wiki-snapshot": RestoreWikiSnapshotCommand,
  "test-args": TestArgsCommand,
  done: TestsCompleteCommand,
  "update-simplewiki": UpdateSimpleWikiCommand,
  "update-tiddlywiki": UpdateTiddlyWikiCommand,
} satisfies Record<string, CommandClass>;

serverEvents.on("cli.register", (commands) => {
  for (const [name, Command] of Object.entries(COMMANDS)) {
    commands[name] = { info: Command.info, Command };
  }
});

export * from "./listen";
export * from "./init-data-folder";
export * from "./init-store";
export * from "./import-wiki-file";
export * from "./load-wiki-folder";
export * from "./provision-simplewiki";
export * from "./prune-template-releases";
export * from "./rename-personal-roles";
export * from "./restore-wiki-snapshot";
export * from "./test-args";
export * from "./tests-complete";
export * from "./update-simplewiki";
export * from "./update-tiddlywiki";
