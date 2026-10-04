import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";

// A command registers itself nowhere. Write the class and its info like this,
// then add the class to COMMANDS in index.ts under its command name; that
// table and the one listener there are what put the command into the CLI.

const info: CommandInfo = {
  name: "",
  description: "",
  arguments: [],
};


export class EmptyCommand extends BaseCommand {
  static info = info;

  async execute() {

  }
}