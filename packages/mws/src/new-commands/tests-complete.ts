import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";

const info: CommandInfo = {
  name: "done",
  description: "Tests completed successfully.",
  arguments: [],
  internal: true,
};


export class TestsCompleteCommand extends BaseCommand {
  static info = info;

  async execute() {
    console.log("Tests completed successfully.");
    process.exit(0);
  }
}