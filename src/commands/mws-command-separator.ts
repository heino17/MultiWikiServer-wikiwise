import { Commander, CommandInfo } from ".";

export const info: CommandInfo = {
  name: "mws-command-separator",
  synchronous: true,
};


export class Command {

  constructor(
    public params: string[],
    public commander: Commander,
  ) {
    if (this.params.length) throw `${info.name}: No parameters allowed. This is a no-op command.`;
  }
  execute() {
    // Do nothing
  }
}