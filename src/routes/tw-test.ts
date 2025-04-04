import { Server } from "http";
import { rootRoute } from "./router";
import { ZodAssert as zodAssert } from "../utils";
import { Tiddler, TiddlyWiki, TW } from "tiddlywiki";

export function TWRoutes(parent: rootRoute) {
  const wikiRouter = new TWRouter();
  parent.defineRoute({
    useACL: {},
    method: ["OPTIONS", "GET", "HEAD", "POST", "PUT"],
    bodyFormat: "stream",
    path: /^\/mws(\/|$)/,
    pathParams: ["final_slash"]
  }, async (state) => {
    zodAssert.pathParams(state, z => ({ final_slash: z.string().optional() }));
    if (!state.pathParams.final_slash) throw state.redirect(state.urlInfo.pathname + "/");
    // literally don't do this
    const { req, res } = (state as any).streamer;
    // options not required
    wikiRouter.twserver.requestHandler(req, res, {} as any);
  });
}

class TWRouter {
  $tw: TW;
  twserver!: any;

  constructor() {
    this.$tw = TiddlyWiki();
    // tiddlywiki [+<pluginname> | ++<pluginpath>] [<wikipath>] ...[--command ...args]
    this.$tw.boot.argv = [
      // "++plugins/client",
      // "++plugins/server",
      // "+tiddlywiki/filesystem",
      // "+tiddlywiki/tiddlyweb",
      // "./editions/mws-server",
      // "--mws-load-plugin-bags",
      // "--build", "load-mws-demo-data",
      // "--mws-listen", "port=5001", "host=::"
    ];
    this.$tw.boot.boot(() => {


      this.$tw.preloadTiddler({
        text: "$protocol$//$host$" + "/mws/",
        title: "$:/config/tiddlyweb/host",
      });
      // Boot the TW5 app
      this.$tw.boot.boot(() => {
        const Server = this.$tw.modules.execute("$:/core/modules/server/server.js", "tw-test.ts").Server;
        this.twserver = new Server({
          wiki: this.$tw.wiki,
          variables: {
            // do not use a trailing slash
            "path-prefix": "/mws",
            "root-tiddler": "$:/core/save/all",
          },
          routes: [],
        });
        this.$tw.hooks.invokeHook("th-server-command-post-start", this.twserver, null, "mws");
      });

    });
  }
}

