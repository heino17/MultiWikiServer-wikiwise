import type { CommandInfo } from "../utils/BaseCommand";
import { BaseCommand } from "../utils";

export const info: CommandInfo = {
  name: "commander",
  description: "Execute commands using the TW5 commander syntax, including chaining commands.",
  arguments: [["[args...]", "Arguments to pass to the command."]],
  internal: true,

};


export class Command extends BaseCommand {

  async execute() {
    
  }
}