import { resolve } from "path";
import type { Commander } from "../commander";
import type { CommandInfo } from "../utils/BaseCommand";
import { Router } from "../router";
import { esbuildStartup, setupDevServer } from "../listen/setupDevServer";
import { writeFileSync } from "fs";
import { BaseCommand } from "../utils";

export const info: CommandInfo = {
  name: "client-build",
  description: "Build the client for the TiddlyWiki5 server",
  arguments: [],
  internal: true,
};


export class Command extends BaseCommand {

  async execute() {
    
    const { ctx, port, rootdir } = await esbuildStartup();
    ctx.dispose();
  }
}