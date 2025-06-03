import type { CommandInfo } from "../utils/BaseCommand";

import { UserKeyMap, UserManager } from "../routes/managers/admin-users";
import { RecipeKeyMap, RecipeManager } from "../routes/managers/admin-recipes";
import { BaseCommand, is, Z2 } from "../utils";
import { StatusKeyMap, StatusManager } from "../routes/managers";

export const info: CommandInfo = {
  name: "build-types",
  description: "Output endpoint types to a JSON file so we don't have to include it in the runtime.",
  arguments: [],
  internal: true,
};


export class Command extends BaseCommand<[], {}> {


  async execute() {
    const { zodToTs, printNode } = await import('zod-to-ts').catch(e => {
      console.log("The NPM package 'zod-to-ts' cannot be found.");
      throw "The NPM package 'zod-to-ts' cannot be found.";
    });
    this.getEndpoints().forEach(([key, endpoint]) => {
      if (!endpoint.zodRequestBody) return;
      const { node } = zodToTs(endpoint.zodRequestBody(Z2), 'User');
      console.log("\ninterface", key, printNode(node));
    });
  }
  getEndpoints() {
    return [
      ...Object.keys(StatusKeyMap).map(e => [e, new StatusManager(this.config)[e]] as const),
      ...Object.keys(UserKeyMap).map(e => [e, new UserManager(this.config)[e]] as const),
      ...Object.keys(RecipeKeyMap).map(e => [e, new RecipeManager(this.config)[e]] as const),
    ];
  }
}