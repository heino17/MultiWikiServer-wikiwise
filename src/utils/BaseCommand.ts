import type { Commander } from "../commander";



export abstract class BaseCommand {
  get $tw() { return this.commander.$tw; }
  config;
  constructor(
    public params: string[],
    public commander: Commander,
    public callback: (err?: any) => void
  ) {
    this.config = commander.config;
  }

  abstract execute(): Promise<any>;
}
