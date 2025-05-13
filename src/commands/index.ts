import * as load_plugin_bags from "./load-plugin-bags";
import * as load_wiki_folder from "./load-wiki-folder";
import * as save_archive from "./save-archive";
import * as load_archive from "./load-archive";
import * as init_store from "./init-store";
import * as divider from "./divider";
import * as manager from "./manager";
import * as tests_complete from "./tests-complete";
import * as mws_client_build from "./build-client";
import * as help from "./help";
import type { CommandInfo } from "../commander";

export { divider };

export const commands: Record<string, { info: CommandInfo, Command: any }> = {
  [load_plugin_bags.info.name]: load_plugin_bags,
  [load_wiki_folder.info.name]: load_wiki_folder,
  [save_archive.info.name]: save_archive,
  [load_archive.info.name]: load_archive,
  [init_store.info.name]: init_store,
  [manager.info.name]: manager,

  [help.info.name]: help,
  [divider.info.name]: divider,
  [tests_complete.info.name]: tests_complete,
  [mws_client_build.info.name]: mws_client_build,
};



