/*\
title: $:/plugins/tiddlywiki/multiwikiserver/commands/mws-render-tiddler.js
type: application/javascript
module-type: command

Command to create and load a bag for the specified core editions



\*/


import { resolve } from "node:path";
import { Commander, CommandInfo } from "../commander";

const { writeFileSync } = require("fs");

export const info: CommandInfo = {
  name: "render-tiddlywiki5",
  description: "Render the TiddlyWiki5 HTML file",
  arguments: [],
  synchronous: true
};

export class Command {

  constructor(
    public params: string[],
    public commander: Commander,
    public callback: (err?: any) => void
  ) {

  }
  async execute() {

    const result = this.commander.$tw.wiki.renderTiddler("text/plain", "$:/core/templates/tiddlywiki5.html", {
      variables: {
        // the boot and library tiddlers get rendered into the page
        // this list gets saved in the store array
        // we have to render at least one tiddler
        saveTiddlerFilter: /* this.commander.siteConfig.enableExternalPlugins */ true ? `
          $:/temp/nothing
        ` : `
          $:/core
          $:/plugins/tiddlywiki/tiddlyweb
          $:/plugins/tiddlywiki/multiwikiclient
          $:/themes/tiddlywiki/snowwhite
          $:/themes/tiddlywiki/vanilla
        `
      }
    });

    const filepath = resolve(this.commander.wikiPath, "tiddlywiki5.html")

    writeFileSync(filepath, result);
  }
};

