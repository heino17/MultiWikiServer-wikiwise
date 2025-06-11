import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import { esbuildStartup } from "../services/setupDevServer";


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