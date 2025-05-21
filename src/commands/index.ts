import * as load_wiki_folder from "./load-wiki-folder";
import * as save_archive from "./save-archive";
import * as load_archive from "./load-archive";
import * as init_store from "./init-store";
import * as divider from "./divider";
import * as manager from "./manager";
import * as tests_complete from "./tests-complete";
import * as mws_client_build from "./build-client";
import * as help from "./help";
import * as listen from "./listen";
import type { CommandInfo } from "../utils/BaseCommand";
import { BaseCommand } from "../utils";

export { divider };

export const commands = {
  load_wiki_folder,
  load_archive,
  save_archive,
  init_store,
  manager,
  listen,
  help,
  divider,
  tests_complete,
  mws_client_build,
} as const satisfies Record<string, {
  info: CommandInfo,
  Command: {
    new(...args: ConstructorParameters<typeof BaseCommand<any, any>>): BaseCommand<any, any>
  }
}>;



