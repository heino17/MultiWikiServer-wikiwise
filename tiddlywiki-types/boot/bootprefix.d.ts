// Generated using Claude 3.7 Sonnet Thinking on 2025-03-25. 
declare module "tiddlywiki" {

  // Main TiddlyWiki interface - defined in global scope for augmentation
  interface TW {
    boot: TWBoot;
    config: TWConfig;
    browser: Record<string, any> | null;
    node: Record<string, any> | null;
    nodeWebKit: Record<string, any> | null;
    modules: TWModules;
    preloadTiddlers: Array<Record<string, any>>;
    preloadTiddler(fields: Record<string, any>): void;
    preloadTiddlerArray(fieldsArray: Array<Record<string, any>>): void;
  }

  // Breaking down into component interfaces for better augmentation
  interface TWBoot {
    tasks: {
      trapErrors: boolean;
      readBrowserTiddlers: boolean;
    };
  }

  interface TWConfig {
    maxEditFileSize: number;
  }

  interface TWModules {
    titles: Record<string, ModuleInfo>;
    types: Record<string, Record<string, ModuleInfo>>;
    /**
    Information about each module is kept in an object with these members:
    - `moduleType`: type of module
    - `definition`: `object`, `function` or `string` defining the module; see below
    - `exports`: exports of the module, filled in after execution

    The `definition` can be of several types:

    - An `object` can be used to directly specify the exports of the module
    - A `function` with the arguments `module, require, exports` that returns `exports`
    - A `string` function body with the same arguments

    Each moduleInfo object is stored in two hashmaps: $tw.modules.titles and $tw.modules.types. The first is indexed by title and the second is indexed by type and then title

    Define a JavaScript tiddler module for later execution
      moduleName: name of module being defined
      moduleType: type of module
      definition: module definition; see discussion above
    */
    define(moduleName: string, moduleType: string, definition: object | Function | string): void;

    execute(moduleName: string, moduleFrom: string): any;
  }

  interface ModuleInfo {
    moduleType: string;
    definition: object | Function | string;
    exports: any;
  }

}
declare module "tiddlywiki/boot/bootprefix" {

  function bootprefix(tw?: TW): TW;

  // Main TiddlyWiki interface - defined in global scope for augmentation
  interface TW {
    boot: TWBoot;
    config: TWConfig;
    browser: Record<string, any> | null;
    node: Record<string, any> | null;
    nodeWebKit: Record<string, any> | null;
    modules: TWModules;
    preloadTiddlers: Array<Record<string, any>>;
    preloadTiddler(fields: Record<string, any>): void;
    preloadTiddlerArray(fieldsArray: Array<Record<string, any>>): void;
  }

  // Breaking down into component interfaces for better augmentation
  interface TWBoot {
    tasks: {
      trapErrors: boolean;
      readBrowserTiddlers: boolean;
    };
  }

  interface TWConfig {
    maxEditFileSize: number;
  }

  interface TWModules {
    titles: Record<string, ModuleInfo>;
    types: Record<string, Record<string, ModuleInfo>>;
    define(moduleName: string, moduleType: string, definition: any): void;
  }

  interface ModuleInfo {
    moduleType: string;
    definition: object | Function | string;
    exports: any;
  }
}
