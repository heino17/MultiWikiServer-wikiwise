import "./router";
import "./routes/StateObject";
import "./listen/streamer";
import "./global";
import { existsSync } from 'node:fs';
import * as commander from "commander";
import pkg from "../package.json";
import { commands } from "./commands";
import chalk from "chalk";
import { deepEqual } from "node:assert";
import { ServerState } from "./ServerState";
import opaque from "@serenity-kit/opaque";
import { BaseCommand, CommandClass, CommandFile } from "./utils";

export async function runCLI() {

  const wikiPath = process.cwd();

  if (!existsSync(wikiPath)) throw "The wiki path does not exist";

  console.log(wikiPath, process.argv)

  const cmder = getCLI()

  const cmd = process.argv[2];
  if (!cmd) {
    return cmder.outputHelp();
  }
  // const cmdDef
  const cmdDef: CommandFile | undefined = Object.values(commands).find(e => e.info.name === cmd);
  if (!cmdDef) {
    console.log(chalk.red.bold("Error: "), `Command "${cmd}" not found`);
    return cmder.outputHelp();
  }

  if (cmd === "help") {
    return cmder.parse();
  }

  // parse the CLI first since that's easy
  const { params, options } = parseCLI(cmder, cmd, process.argv.slice(3));


  console.log(wikiPath, cmd, params, options);

  await opaque.ready;

  const { $tw, config } = await ServerState.make(wikiPath);

  await config.init();

  if (config.setupRequired && !["init-store", "load-archive"].includes(cmd)) {
    console.log("MWS setup required. Please run either init-store or load-archive first");
    process.exit(1);
  }

  await new cmdDef.Command(params, options, config, $tw).execute();

}



deepEqual(
  parseCLI(getCLI(), "listen", "--listener test=test --listener hello=world hello2=test --allow-hosts test --require-https".split(" ")),
  {
    options: {
      listener: [{ test: 'test' }, { hello: 'world', hello2: 'test' }],
      'allow-hosts': ['test'],
      'require-https': true
    },
    params: [],
  }
);

function parseCLI(cmder: commander.Command, cmd: string, cli: string[]) {

  const cmd2 = cmder.commands.find(e => e.name() === cmd);
  if (!cmd2) throw `Command "${cmd2}" not found in help definition. This is a bug. ${Object.keys(cmder.commands)}`;

  const _optionMap = new Map(cmd2.options.map(e => [e.long!, e!] as const));
  const options = {};
  const params = [];
  let firstOpt = false;
  while (cli.length) {
    const e = cli.shift()!;
    if (e.startsWith("--")) {
      firstOpt = true;
      const opt = _optionMap.get(e);
      if (!opt) throw `The option "${e}" is not a valid option`;
      cli = parseOption(e, opt, cli.slice(), options);
    } else if (!firstOpt) {
      params.push(e);
    } else {
      console.log("Found unknown option", e, cli);
    }
  }
  return { params, options };
}




function parseOption(
  name: string,
  opt: commander.Option,
  cli: string[],
  result: Record<string, any>,
) {
  name = name.startsWith("--no-") ? name.slice(5) : name.slice(2);
  const kv = opt.flags.includes("[key=val...]");
  const { variadic, required, optional } = opt;
  let value: any;
  let remaining: string[];

  if (!required && !optional) {
    value = result[name] = !name.startsWith("--no-");
    remaining = cli;
  } else if (kv) { // kv is always variadic
    result[name] ??= [];
    value = {};
    result[name].push(value);
    while (cli.length && !cli[0]!.startsWith("--")) {
      const e = cli.shift()!;
      const div = e.indexOf("=")
      if (div === -1) throw `The arg "${e}" does not have an equals sign. Are you missing quotation marks?`;
      const key = e.slice(0, div);
      const val = e.slice(div + 1);
      value[key] = val;
    }
    remaining = cli;
  } else {
    if (!variadic && result[name] !== undefined)
      throw `The option "${name}" is specified more than once.`;

    value = [];

    while (cli.length && !cli[0]!.startsWith("--"))
      value.push(cli.shift()!);

    if (required && value.length === 0)
      throw `The option "${name}" must have a value`;
    if (!variadic && value.length > 1)
      throw `The option "${name}" may only have a single value`;

    result[name] ??= [];
    result[name].push(...value);

    remaining = cli;
  }
  return remaining;
}



function getCLI() {

  const program = new commander.Command();

  program
    .name("mws")
    .description(pkg.description
      + "\n\n"
      + "MWS commands operate on the current folder you are in."
    )
    .configureHelp({
      helpWidth: 90,
      subcommandTerm
    })
    .helpOption(false)
    .enablePositionalOptions()
    .allowUnknownOption(false)
    .action(() => {
      program.outputHelp();
    })
    .helpCommand(true)

  Object.keys(commands).forEach(key => {
    const c = commands[key]!;
    if (c.info.internal) return;
    if (c.info.name === "help") return;
    if (c.info.command) return void c.info.command(program);
    const command = program.command(c.info.name);
    command.description(c.info.description);
    c.info.arguments.forEach(([name, description]) => {
      command.argument(name, description);
    });
    c.info.options?.forEach(([name, description]) => {
      command.option("--" + name, description);
    });
    if (c.info.getHelp) {
      command.addHelpText("after", () => c.info.getHelp?.() ?? "")
    }
    command.enablePositionalOptions();
    command.action(() => { });
    command.helpOption(false);
    command.configureHelp({ helpWidth: 90 });
    command.usage = usage as any;
  });

  return program;

  function humanReadableArgName(arg: commander.Argument) {
    const nameOutput = arg.name() + (arg.variadic === true ? '...' : '');
    return arg.required ? '<' + nameOutput + '>' : '[' + nameOutput + ']';
  }
  function subcommandTerm(cmd: any) {
    const args = cmd.registeredArguments.map((arg: commander.Argument) => humanReadableArgName(arg)).join(" ");
    return cmd._name
      + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "")
      + (args ? " " + args : "")
      + (cmd.options.length ? " [options]" : "")
      ;
  }
  function usage(this: commander.Command & { _usage: string | undefined, _helpOption: any }, str: string) {
    if (str === undefined) {
      if (this._usage) return this._usage;

      const args = this.registeredArguments.map((arg) => humanReadableArgName(arg));

      return ([] as string[])
        .concat(
          this.registeredArguments.length ? args : [],
          this.options.length || this._helpOption !== null ? '[options]' : [],
          this.commands.length ? '[command]' : [],
        )
        .join(' ');
    }

    this._usage = str;
    return this;
  }
}

