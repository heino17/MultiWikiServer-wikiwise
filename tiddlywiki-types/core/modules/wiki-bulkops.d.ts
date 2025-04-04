// Generated using Claude 3.7 Sonnet Thinking on 2025-03-25. 

declare module "tiddlywiki" {
  interface Wiki {
    /**
     * Rename a tiddler, and relink any tags or lists that reference it
     * @param fromTitle The original title of the tiddler
     * @param toTitle The new title for the tiddler
     * @param options Options for the rename operation
     */
    renameTiddler(fromTitle: string, toTitle: string, options?: RenameOptions): void;

    /**
     * Relink any tags or lists that reference a given tiddler
     * @param fromTitle The original title to look for
     * @param toTitle The new title to replace with
     * @param options Options for the relink operation
     */
    relinkTiddler(fromTitle: string, toTitle: string, options?: RenameOptions): void;
  }

  /**
   * Options for tiddler rename operations
   */
  interface RenameOptions {
    /**
     * If true, don't rename tiddler references in tags fields
     */
    dontRenameInTags?: boolean;
    
    /**
     * If true, don't rename tiddler references in list fields
     */
    dontRenameInLists?: boolean;
  }
}
