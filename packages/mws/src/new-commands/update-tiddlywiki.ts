import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import { serverEvents } from "@tiddlywiki/events";
import { UpdateTiddlyWiki } from "../plugin-cache/UpdateTiddlyWiki";



serverEvents.on("cli.register", (commands) => {
  commands[info.name] = { info, Command: UpdateTiddlyWikiCommand };
});


const info: CommandInfo = {
  name: "update-tiddlywiki",
  description: "Update TiddlyWiki to the latest version",
  arguments: [],
  options: [
    ["manual-version <string>", "Download the specified version of TiddlyWiki from NPM."],
    ["registry-url <string>", "Download the tiddlywiki registry entry from this URL instead of NPM."],
    ["manual-tarball <string>", "Path to a tarball file to manually extract instead of downloading. This runs the command entirely offline. The version will be extracted from the package.json file."],
  ],
  getHelp() {
    return [
      "",
      "This command does the following actions:",
      "- Download the registry entry from NPM.",
      "- Download the latest tarball specified in the registry.",
      "- Extract the tarball to a versioned directory.",
      "",
      "MWS will auto-detect and use the latest version on startup.",
    ].join("\n")
  },
};


export class UpdateTiddlyWikiCommand extends BaseCommand<[], {
  "registry-url"?: [string];
  "manual-tarball"?: [string];
  "manual-version"?: [string];
}> {
  static info = info;

  wikiPath!: string;

  async execute() {
    // this gets called early, so it cannot expect the normal MWS config environment
    // from "cli.execute.before" in startup.ts. It cannot call other commands.
    const { tw5Path, version } = await new UpdateTiddlyWiki(
      this.options["registry-url"]?.[0],
      this.options["manual-tarball"]?.[0],
    ).installLatestTiddlyWiki(this.wikiPath, this.options["manual-version"]?.[0]);
  }

}
