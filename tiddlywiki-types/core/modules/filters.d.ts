// Generated using Claude 3.7 Sonnet Thinking on 2025-03-25. 
declare module "tiddlywiki" {
  interface Wiki {
    /**
     * Parses a filter string into a parse tree
     * @param filterString The string expression to parse
     * @returns An array of operations, each containing operator objects
     */
    parseFilter(filterString: string): ParsedFilter;

    /**
     * Returns a hashmap of all the filter operators
     * @returns Object containing all filter operator functions
     */
    getFilterOperators(): Record<string, FilterOperator>;

    /**
     * Returns a hashmap of all filter run prefixes
     * @returns Object containing all filter run prefix functions
     */
    getFilterRunPrefixes(): Record<string, FilterRunPrefix>;

    /**
     * Filters an array of tiddlers by a filter string
     * @param filterString The filter to apply
     * @param widget Optional widget node for context
     * @param source Optional source iterator function for tiddlers
     * @returns Array of tiddler titles
     */
    filterTiddlers(filterString: string, widget?: any, source?: TiddlerIterator | any[]): string[];

    /**
     * Compiles a filter into a function
     * @param filterString The filter to compile
     * @returns A function that will execute the filter
     */
    compileFilter(filterString: string): (source?: TiddlerIterator | any[] | object, widget?: any) => string[];
  }

  /**
   * The parse tree representation of a filter
   */
  type ParsedFilter = Array<{
    prefix: string;
    operators: Array<ParsedOperator>;
    namedPrefix?: string;
    suffixes?: Array<Array<string>>;
  }>;

  /**
   * An operator in a parsed filter
   */
  interface ParsedOperator {
    operator: string;
    prefix?: string;
    suffix?: string;
    suffixes?: Array<Array<string>>;
    regexp?: RegExp;
    operands: Array<{
      text: string;
      value?: string;
      indirect?: boolean;
      variable?: boolean;
    }>;
  }

  /**
   * A filter operator function
   */
  interface FilterOperator {
    (accumulator: TiddlerIterator, operatorOptions: OperatorOptions, context: FilterContext): string[] | TiddlerIterator;
  }

  /**
   * Options passed to a filter operator
   */
  interface OperatorOptions {
    operator: string;
    operand?: string;
    operands: string[];
    prefix?: string;
    suffix?: string;
    suffixes?: Array<Array<string>>;
    regexp?: RegExp;
  }

  /**
   * Context for filter execution
   */
  interface FilterContext {
    wiki: Wiki;
    widget?: any;
  }

  /**
   * Filter run prefix processor function
   */
  interface FilterRunPrefix {
    (operationFunction: (results: any, source: TiddlerIterator, widget: any) => void, options: { wiki: Wiki, suffixes: Array<Array<string>> }): 
      (results: any, source: TiddlerIterator, widget: any) => void;
  }

  /**
   * Function that iterates through tiddlers
   */
  type TiddlerIterator = (callback: (tiddler: Tiddler, title: string) => void) => void;
}
