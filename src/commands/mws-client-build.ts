import { resolve } from "path";
import { Commander, CommandInfo } from "../commander";
import { Router } from "../routes/router";
import { esbuildStartup, setupDevServer } from "../setupDevServer";
import { writeFileSync } from "fs";

export const info: CommandInfo = {
  name: "mws-client-build",
  synchronous: true,
};


export class Command {

  constructor(
    public params: string[],
    public commander: Commander,
  ) {
    if (this.params.length) throw `${info.name}: No parameters allowed. This is a no-op command.`;
  }
  async execute() {
    if (!this.commander.config.enableDevServer) throw "Dev server is not enabled. Please set enableDevServer to true in the config file.";

    const { ctx, port, rootdir } = await esbuildStartup();


    ctx.dispose();
  }
}