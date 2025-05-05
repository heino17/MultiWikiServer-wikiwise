import { rootRoute, SiteConfig } from "./router";
import { ZodAssert as zodAssert } from "../utils";
import { TiddlyWiki, TW } from "tiddlywiki";
import { STREAM_ENDED } from "../streamer";

export function DocsRoute(parent: rootRoute, config: SiteConfig) {
  const wikiRouter = new TWRouter(config);
  parent.defineRoute({
    method: ["OPTIONS", "GET", "HEAD", "POST", "PUT", "DELETE"],
    bodyFormat: "stream",
    path: /^\/mws(\/|$)/,
    pathParams: []
  }, async (state) => {
    if (state.urlInfo.pathname === "/mws") throw state.redirect("/mws/");
    // @ts-expect-error because streamer is private
    const { req, res } = state.streamer;
    // regardless, this has to end with a slash
    if (req.url === "/mws") req.url = "/mws/";
    // options not required
    wikiRouter.twserver.requestHandler(req, res, {} as any);
    return new Promise((r, c) => res.on("finish", r).on("error", c));
  });
}

class TWRouter {
  $tw: TW;
  twserver!: any;

  constructor(private config: SiteConfig) {
    this.$tw = TiddlyWiki();
    // tiddlywiki [+<pluginname> | ++<pluginpath>] [<wikipath>] ...[--command ...args]
    this.$tw.boot.argv = [
      "+plugins/tiddlywiki/tiddlyweb",
      "+plugins/tiddlywiki/filesystem",
      "./editions/mws-docs",
    ];

    this.$tw.preloadTiddler({
      text: "$protocol$//$host$" + this.config.pathPrefix + "/mws/",
      title: "$:/config/tiddlyweb/host",
    });
    // Boot the TW5 app
    this.$tw.boot.boot(() => {
      const Server = this.$tw.modules.execute("$:/core/modules/server/server.js", "tw-test.ts").Server;
      this.twserver = new Server({
        wiki: this.$tw.wiki,
        variables: {
          // do not use a trailing slash
          "path-prefix": this.config.pathPrefix + "/mws",
          "root-tiddler": "$:/core/save/all",
        },
        routes: [],
      });
      this.$tw.hooks.invokeHook("th-server-command-post-start", this.twserver, null, "mws");
    });
  }
}

