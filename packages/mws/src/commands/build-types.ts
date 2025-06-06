import { BaseCommand, CommandInfo, Z2 } from '@tiddlywiki/server';
import { StatusKeyMap, StatusManager } from '../managers';
import { UserKeyMap, UserManager } from '../managers/admin-users';
import { RecipeKeyMap, RecipeManager } from '../managers/admin-recipes';
import { WikiRouterKeyMap, WikiRoutes } from '../managers/wiki-routes';


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
      if (endpoint.zodRequestBody) {
        const { node } = zodToTs(endpoint.zodRequestBody(Z2), 'User');
        console.log("\ninterface", key + "_RequestBody", printNode(node));
      }
      if (endpoint.zodPathParams) {
        const { node } = zodToTs(Z2.object(endpoint.zodPathParams(Z2)), 'PathParams');
        console.log("\ninterface", key + "_PathParams", printNode(node));
      }
      if (endpoint.zodQueryParams) {
        const { node } = zodToTs(Z2.object(endpoint.zodQueryParams(Z2)), 'QueryParams');
        console.log("\ninterface", key + "_QueryParams", printNode(node));
      }
    });
  }
  getEndpoints() {
    const wiki = new WikiRoutes();

    return [
      ...Object.keys(StatusKeyMap).map(e => [e, new StatusManager(this.config)[e]] as const),
      ...Object.keys(UserKeyMap).map(e => [e, new UserManager(this.config)[e]] as const),
      ...Object.keys(RecipeKeyMap).map(e => [e, new RecipeManager(this.config)[e]] as const),
      ...Object.keys(WikiRouterKeyMap).map(e => [e, wiki[e]] as const),
    ];
  }
}