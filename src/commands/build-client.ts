import type { CommandInfo } from "../utils/BaseCommand";
import { esbuildStartup } from "../listen/setupDevServer";
import { BaseCommand } from "../utils";

export const info: CommandInfo = {
  name: "client-build",
  description: "Build the client for the TiddlyWiki5 server",
  arguments: [],
  internal: true,
};


export class Command extends BaseCommand {

  async execute() {
    
    const { ctx } = await esbuildStartup();
    ctx.dispose();
  }
}