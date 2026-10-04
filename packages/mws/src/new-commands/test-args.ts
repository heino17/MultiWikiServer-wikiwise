import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";

const info: CommandInfo = {
  name: "test-args",
  description: "Prints the command args to console. Useful for testing your inputs.",
  arguments: [],
  
};


export class TestArgsCommand extends BaseCommand {
  static info = info;

  async execute() {
    console.log(this.params);
  }
}