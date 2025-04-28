import { Commander, CommandInfo } from "../commander";

export const info: CommandInfo = {
  name: "divider",
  description: "A no-op command to delimit param concatenation.",
  arguments: [],
  synchronous: true,
  internal: true,
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