// Generated using Claude 3.7 Sonnet Thinking on 2025-03-25. 

declare module "tiddlywiki" {



  interface Wiki {
    addIndexersToWiki(): void;
    getTextReference(textRef: string, defaultText?: string, currTiddlerTitle?: string): string;
    setTextReference(textRef: string, value: string, currTiddlerTitle?: string): void;
    setText(title: string, field?: string, index?: string, value?: string, options?: SetTextOptions): void;
    deleteTextReference(textRef: string, currTiddlerTitle?: string): void;
    addEventListener(type: string, listener: Function): void;
    removeEventListener(type: string, listener: Function): void;
    dispatchEvent(type: string, ...args: any[]): void;
    enqueueTiddlerEvent(title: string, isDeleted?: boolean, isShadow?: boolean): void;
    getSizeOfTiddlerEventQueue(): number;
    clearTiddlerEventQueue(): void;
    getChangeCount(title: string): number;
    generateNewTitle(baseTitle: string, options?: GenerateNewTitleOptions): string;
    isSystemTiddler(title: string): boolean;
    isTemporaryTiddler(title: string): boolean;
    isVolatileTiddler(title: string): boolean;
    isImageTiddler(title: string): boolean | null;
    isBinaryTiddler(title: string): boolean | null;
    importTiddler(tiddler: Tiddler): boolean;
    getCreationFields(): TiddlerFields;
    getModificationFields(): TiddlerFields;
    getTiddlers(options?: GetTiddlersOptions): string[];
    countTiddlers(excludeTag?: string): number;
    makeTiddlerIterator(titles: string[] | Record<string, any>): (callback: (tiddler: Tiddler, title: string) => void) => void;
    sortTiddlers(titles: string[], sortField: string, isDescending?: boolean, isCaseSensitive?: boolean, isNumeric?: boolean, isAlphaNumeric?: boolean): void;
    forEachTiddler(options: ForEachTiddlerOptions, callback: (title: string, tiddler: Tiddler) => void): void;
    forEachTiddler(callback: (title: string, tiddler: Tiddler) => void): void;
    extractLinks(parseTreeRoot: any[]): string[];
    getTiddlerLinks(title: string): string[];
    getTiddlerBacklinks(targetTitle: string): string[];
    extractTranscludes(parseTreeRoot: any[], title: string): string[];
    getTiddlerTranscludes(title: string): string[];
    getTiddlerBacktranscludes(targetTitle: string): string[];
    getMissingTitles(): string[];
    getOrphanTitles(): string[];
    getTiddlersWithTag(tag: string): string[];
    getTagMap(): Record<string, string[]>;
    findListingsOfTiddler(targetTitle: string, fieldName?: string): string[];
    sortByList(array: string[], listTitle?: string): string[];
    getSubTiddler(title: string, subTiddlerTitle: string): Tiddler | null;
    getTiddlerAsJson(title: string): string;
    getTiddlersAsJson(filter: string, spaces?: number): string;
    getTiddlerDataCached<T>(titleOrTiddler: string | Tiddler, defaultData?: T): T;
    getTiddlerData<T>(titleOrTiddler: string | Tiddler, defaultData?: T): T;
    extractTiddlerDataItem(titleOrTiddler: string | Tiddler, index: string, defaultText?: string): string;
    setTiddlerData(title: string, data: any, fields?: TiddlerFields, options?: SetTiddlerDataOptions): void;
    getTiddlerList(title: string, field?: string, index?: string): string[];
    getGlobalCache<T>(cacheName: string, initializer: () => T): T;
    clearGlobalCache(): void;
    getCacheForTiddler<T>(title: string, cacheName: string, initializer: () => T): T;
    clearCache(title: string | null): void;
    initParsers(moduleType: string): void;
    parseText(type: string, text?: string, options?: ParseTextOptions): any;
    parseTiddler(title: string, options?: ParseTiddlerOptions): any;
    parseTextReference(title: string, field?: string, index?: string, options?: ParseTextReferenceOptions): any;
    getTextReferenceParserInfo(title: string, field?: string, index?: string, options?: any): { sourceText: string | null, parserType: string, _canonical_uri?: string };
    getSubstitutedText(text: string, widget: any, options?: SubstitutedTextOptions): string;
    makeWidget(parser: any, options?: MakeWidgetOptions): any;
    makeTranscludeWidget(title: string, options?: MakeTranscludeWidgetOptions): any;
    renderText(outputType: string, textType: string, text: string, options?: RenderTextOptions): string;
    renderTiddler(outputType: string, title: string, options?: RenderTiddlerOptions): string;
    search(text: string, options?: SearchOptions): string[];
    getTiddlerText(title: string, defaultText?: string): string | undefined | null;
    checkTiddlerText(title: string, targetText: string, options?: CheckTiddlerTextOptions): boolean;
    invokeActionString(actions: string, event?: Event, variables?: any, options?: InvokeActionStringOptions): void;
    readFiles(files: File[], options: ReadFilesOptions | ReadFilesCallback): number;
    readFiles(files: File[], callback: ReadFilesCallback): number;
    readFile(file: File, options: ReadFileOptions | ReadFileCallback): void;
    readFile(file: File, callback: ReadFileCallback): void;
    readFileContent(file: File, type: string, isBinary: boolean, deserializer: string | undefined, callback: ReadFileCallback): void;
    findDraft(targetTitle: string): string | undefined;
    isDraftModified(title: string): boolean;
    addToHistory(title: string | string[], fromPageRect?: DOMRect, historyTitle?: string): void;
    addToStory(title: string | string[], fromTitle?: string, storyTitle?: string, options?: AddToStoryOptions): void;
    generateDraftTitle(title: string): string;
    invokeUpgraders(titles: string[], tiddlers: Record<string, TiddlerFields>): Record<string, string>;
    doesPluginRequireReload(title: string): boolean | null;
    doesPluginInfoRequireReload(pluginInfo: any): boolean | null;
    slugify(title: string, options?: any): string;
  }

  interface SetTextOptions {
    suppressTimestamp?: boolean;
  }

  interface GenerateNewTitleOptions {
    prefix?: string;
    template?: string;
    startCount?: number;
  }

  interface GetTiddlersOptions {
    sortField?: string;
    excludeTag?: string;
    includeSystem?: boolean;
  }

  interface ForEachTiddlerOptions {
    sortField?: string;
    excludeTag?: string;
    includeSystem?: boolean;
  }

  interface ParseTextOptions {
    parseAsInline?: boolean;
    _canonical_uri?: string;
    defaultType?: string;
    configTrimWhiteSpace?: boolean;
  }

  interface ParseTiddlerOptions {
    parseAsInline?: boolean;
  }

  interface ParseTextReferenceOptions {
    subTiddler?: string;
    parseAsInline?: boolean;
    defaultType?: string;
  }

  interface SubstitutedTextOptions {
    substitutions?: Array<{ name: string, value: string }>;
  }

  interface MakeWidgetOptions {
    document?: Document;
    variables?: Record<string, any>;
    parentWidget?: any;
  }

  interface MakeTranscludeWidgetOptions extends MakeWidgetOptions {
    field?: string;
    mode?: "inline" | "block";
    recursionMarker?: string;
    children?: any[];
    importVariables?: string;
    importPageMacros?: boolean;
    parseAsInline?: boolean;
  }

  interface RenderTextOptions extends MakeWidgetOptions {
  }

  interface RenderTiddlerOptions extends MakeWidgetOptions {
    parseAsInline?: boolean;
  }

  interface SearchOptions {
    source?: (iterator: (tiddler: Tiddler, title: string) => void) => void;
    exclude?: string[];
    invert?: boolean;
    caseSensitive?: boolean;
    field?: string | string[];
    anchored?: boolean;
    excludeField?: boolean;
    literal?: boolean;
    whitespace?: boolean;
    regexp?: boolean;
    words?: boolean;
    some?: boolean;
  }

  interface CheckTiddlerTextOptions {
    noTrim?: boolean;
    caseSensitive?: boolean;
  }

  interface InvokeActionStringOptions {
    parentWidget?: any;
  }

  interface ReadFilesCallback {
    (tiddlerFieldsArray: TiddlerFields[]): void;
  }

  interface ReadFilesOptions {
    callback: ReadFilesCallback;
    deserializer?: string;
  }

  interface ReadFileCallback {
    (tiddlerFieldsArray: TiddlerFields[]): void;
  }

  interface ReadFileOptions {
    callback: ReadFileCallback;
    deserializer?: string;
  }

  interface AddToStoryOptions {
    openLinkFromInsideRiver?: boolean;
    openLinkFromOutsideRiver?: boolean;
    focussedTiddler?: string;
  }

  interface SetTiddlerDataOptions {
    suppressTimestamp?: boolean;
  }


}