import "./router";
import "./routes/StateObject";
import "./listen/streamer";
import "./global";
import * as opaque from "@serenity-kit/opaque";
import { existsSync } from 'node:fs';
import { Commander } from "./commander";
import { ServerState } from "./ServerState";
import { startListeners } from "./listen/listeners";
import * as commander from "commander";
import pkg from "../package.json";
import { commands } from "./commands";

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


// startServer().catch(console.log);


const program = new commander.Command();

Object.keys(commands).forEach(key => {
  const c = commands[key]!;
  if (c.info.internal) return;
  if (c.info.name === "help") return;
  const command = program.command(c.info.name);
  command.description(c.info.description);
  c.info.arguments.forEach(([name, description]) => {
    command.argument(name, description);
  });
  c.info.options?.forEach(([name, description]) => {
    command.option("--" + name, description, (val, prev) => { console.log(val, prev); return val; });
  });

  if (c.info.getHelp) command.addHelpText("after", () => c.info.getHelp?.() ?? "")

  command.action((...args) => {
    const command = args.pop();
    const options = args.pop();
    console.log(args, options)
  });
  command.helpOption(false);
  command.configureHelp({
    helpWidth: 90
  });
});

program
  .name("mws")
  .description(pkg.description
    + "\n\n"
    + "MWS commands operate on the current folder you are in."
  )
  .configureHelp({
    helpWidth: 90
  })
  .helpOption(false)
  .enablePositionalOptions()
  .passThroughOptions()
  .action(() => {
    program.outputHelp();
  })
  .helpCommand(true)
  .parse();


function getHelpInfo2() {
  const program = new commander.Command();

  const mainHelp = "Usage: mws [options] [commands]\n\n" + program
    .name("mws")
    .description(pkg.description
      + "\n\n"
      + "MWS commands operate on the current folder you are in."
    )
    // .option("--listen [options...]", "listener options, cannot be specified alongside commands (multiple --listen allowed)")
    .configureHelp({ helpWidth: 100 })
    .helpOption(false)
    .enablePositionalOptions()
    .passThroughOptions()
    .helpInformation()
    .split("\n").slice(2).join("\n");

  return mainHelp;

}