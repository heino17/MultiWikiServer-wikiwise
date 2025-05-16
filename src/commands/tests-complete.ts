import type { Commander } from "../commander";
import type { CommandInfo } from "../utils/BaseCommand";
import { BaseCommand } from "../utils";

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