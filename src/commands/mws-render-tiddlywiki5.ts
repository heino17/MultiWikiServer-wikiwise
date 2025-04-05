/*\
title: $:/plugins/tiddlywiki/multiwikiserver/commands/mws-render-tiddler.js
type: application/javascript
module-type: command

Command to create and load a bag for the specified core editions



\*/


import { resolve } from "node:path";
import { Commander, CommandInfo } from ".";

const { writeFileSync } = require("fs");

export const info: CommandInfo = {
  name: "mws-render-tiddlywiki5",
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
        saveTiddlerFilter: `
          $:/boot/boot.css
          $:/boot/boot.js
          $:/boot/bootprefix.js
          $:/core
          $:/library/sjcl.js
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

