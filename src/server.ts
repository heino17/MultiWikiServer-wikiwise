import "./routes/router";
import "./StateObject";
import "./streamer";
import "./global";
import * as opaque from "@serenity-kit/opaque";
import { existsSync } from 'node:fs';
import { Commander, ServerState } from "./commander";
import { startListeners } from "./listeners";

async function startServer() {

  await opaque.ready;

  const cli = process.argv.slice(2);

  const wikiPath = process.cwd();

  if (!existsSync(wikiPath))
    throw "The wiki path does not exist";

  const { $tw, config } = await ServerState.make(wikiPath);

  await config.init();

  const commander = new Commander(config, $tw);

  if (cli[0] === "--listen") {
    await startListeners(cli, commander);
  } else {

    if (config.setupRequired && cli[0] !== "--init-store" && cli[0] !== "--load-archive") {
      console.log("MWS setup required. Please run either --init-store or --load-archive first");
      process.exit(1);
    }

    await commander.execute(cli);
  }
}


startServer().catch(console.log);