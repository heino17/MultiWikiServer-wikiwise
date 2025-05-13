import { resolve } from "path";
import type { Commander, CommandInfo } from "../commander";
import { Router } from "../routes/router";
import { esbuildStartup, setupDevServer } from "../setupDevServer";
import { writeFileSync } from "fs";

export const info: CommandInfo = {
  name: "client-build",
  description: "Build the client for the TiddlyWiki5 server",
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
  async execute() {

    const { ctx, port, rootdir } = await esbuildStartup();
    ctx.dispose();
  }
}