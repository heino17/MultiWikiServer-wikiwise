import { BaseCommand, CommandInfo } from "@tiddlywiki/server";

export const info: CommandInfo = {
  name: "tests-complete",
  description: "Tests completed successfully.",
  arguments: [],
  internal: true,
};


export class Command extends BaseCommand {

  async execute() {
    console.log("Tests completed successfully.");
    process.exit(0);
  }
}