import type { Commander, CommandInfo } from "../commander";

import { UserKeyMap, UserManager } from "../routes/managers/manager-users";
import { RecipeKeyMap, RecipeManager } from "../routes/managers/manager-recipes";
import { is, Z2 } from "../utils";
import { StatusKeyMap, StatusManager } from "../routes/managers";

export const info: CommandInfo = {
  name: "build-types",
  description: "Output endpoint types to a JSON file so we don't have to include it in the runtime.",
  arguments: [],
  synchronous: true,
  internal: true,
};


export class Command {

  constructor(
    public params: string[],
    public commander: Commander,
  ) {

  }
  async execute() {
    const { zodToTs, printNode } = await import('zod-to-ts').catch(e => {
      console.log("The NPM package 'zod-to-ts' cannot be found.");
      throw "The NPM package 'zod-to-ts' cannot be found.";
    });
    this.getEndpoints().forEach(endpoint => {
      const { node } = zodToTs(endpoint.zodRequest(Z2), 'User');
      console.log("\ninterface", this.params[0], printNode(node));
    });
  }
  getEndpoints() {
    return [
      ...Object.keys(StatusKeyMap).map(e => new StatusManager(this.commander.config)[e]),
      ...Object.keys(UserKeyMap).map(e => new UserManager(this.commander.config)[e]),
      ...Object.keys(RecipeKeyMap).map(e => new RecipeManager(this.commander.config)[e]),
    ];
  }
}