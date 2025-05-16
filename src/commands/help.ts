import type { CommandInfo } from "../utils/BaseCommand";
import { BaseCommand } from "../utils";

export const info: CommandInfo = {
  name: "help",
  description: "Print this help message",
  arguments: [],
};


export class Command extends BaseCommand {

  async execute() {
    // console.log(this.commander.getHelpInfo());
  }
}
