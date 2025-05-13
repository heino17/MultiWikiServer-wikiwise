import type { Commander, CommandInfo } from "../commander";

export const info: CommandInfo = {
  name: "help",
  description: "Print this help message",
  arguments: [],
  synchronous: true,
};


export class Command {

  constructor(
    public params: string[],
    public commander: Commander,
  ) {
    // if (this.params.length) throw `${info.name}: No parameters allowed.`;
  }
  async execute() {
    console.log(this.commander.getHelpInfo());
  }
}
