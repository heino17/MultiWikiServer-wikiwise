import type { Commander } from "../commander";
import type { CommandInfo } from "../utils/BaseCommand";
import { BaseCommand } from "../utils";

export const info: CommandInfo = {
  name: "divider",
  description: "A no-op command to delimit param concatenation.",
  arguments: [],
  internal: true,
};

 
export class Command extends BaseCommand {

  async execute() {
    if (this.params.length) throw `${info.name}: No parameters allowed. This is a no-op command.`;
  }
}