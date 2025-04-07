import * as mws_load_plugin_bags from "./mws-load-plugin-bags";
import * as mws_render_tiddler from "./mws-render-tiddlywiki5";
import * as mws_load_wiki_folder from "./mws-load-wiki-folder";
import * as mws_save_archive from "./mws-save-archive";
import * as mws_load_archive from "./mws-load-archive";
import * as mws_init_store from "./mws-init-store";
import * as mws_listen from "./mws-listen";
import * as divider from "./divider";
import * as tests_complete from "./tests-complete";
import { CommandInfo } from "../commander";

export { mws_listen, divider };

export const commands: Record<string, { info: CommandInfo, Command: any }> = {
  [mws_load_plugin_bags.info.name]: mws_load_plugin_bags,
  [mws_render_tiddler.info.name]: mws_render_tiddler,
  [mws_load_wiki_folder.info.name]: mws_load_wiki_folder,
  [mws_save_archive.info.name]: mws_save_archive,
  [mws_load_archive.info.name]: mws_load_archive,
  [mws_init_store.info.name]: mws_init_store,
  [mws_listen.info.name]: mws_listen,
  [divider.info.name]: divider,
  [tests_complete.info.name]: tests_complete,
};
