import { Commander, CommandInfo } from "../commander";

export const info: CommandInfo = {
  name: "tests-complete",
  synchronous: true,
};


export class Command {

  constructor(
    public params: string[],
    public commander: Commander,
  ) {
    // if (this.params.length) throw `${info.name}: No parameters allowed. This is a no-op command.`;
  }
  execute() {
    console.log("Tests completed successfully.");
    process.exit(0);
  }
}