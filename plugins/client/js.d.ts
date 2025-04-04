import { ITiddlyWiki, Syncer } from "tw5-typed";
declare module "tw5-typed" {
  interface ITiddlyWiki {
    browserStorage: any;
  }
  interface Syncer {
    enqueueLoadTiddler(title: string): void;
  }
}
