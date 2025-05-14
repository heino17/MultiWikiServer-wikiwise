import type { CommandInfo } from "../commander";
import { BaseCommand } from "../utils";

export const info: CommandInfo = {
  name: "",
  description: "",
  arguments: [],
  synchronous: true,
};


export class Command extends BaseCommand {

  async execute() {
    
  }
}