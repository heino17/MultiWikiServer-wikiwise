import { TW } from "tiddlywiki";
import { ServerState } from "../ServerState";
import * as commander from "commander";

export type CommandClass = { 
  new(...args: ConstructorParameters<typeof BaseCommand<any, any>>): BaseCommand<any, any> 
};
export type CommandFile = {
  Command: CommandClass,
  info: CommandInfo,
}

export abstract class BaseCommand<P extends string[] = string[], O extends object = object> {

  constructor(
    public params: P,
    public options: O,
    public config: ServerState,
    public $tw: TW,
  ) {

  }

  abstract execute(): Promise<any>;
}
export interface CommandInfo {
  name: string;
  description: string;
  arguments: [string, string][];
  options?: [string, string][];
  internal?: boolean;
  getHelp?: () => string;
  command?(program: commander.Command): commander.Command;
}

