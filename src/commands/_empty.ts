import type { CommandInfo } from "../utils/BaseCommand";
import { BaseCommand } from "../utils";

export const info: CommandInfo = {
  name: "",
  description: "",
  arguments: [],
};


export class Command extends BaseCommand {

  async execute() {
    
  }
}