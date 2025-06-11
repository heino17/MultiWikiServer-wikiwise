import * as load_wiki_folder from "./load-wiki-folder";
import * as save_archive from "./save-archive";
import * as load_archive from "./load-archive";
import * as init_store from "./init-store";
import * as manager from "./manager";
import * as tests_complete from "./tests-complete";
import * as build_client from "./build-client";
import * as build_types from "./build-types";
import * as listen from "./listen";
import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";


export const commands = {
  listen,
  load_wiki_folder,
  load_archive,
  save_archive,
  init_store,
  manager,
  tests_complete,
  build_client,
  build_types,
} as const satisfies Record<string, {
  info: CommandInfo,
  Command: {
    new(...args: ConstructorParameters<typeof BaseCommand<any, any>>): BaseCommand<any, any>
  }
}>;
