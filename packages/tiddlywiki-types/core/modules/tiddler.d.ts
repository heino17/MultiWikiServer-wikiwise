// Generated using Claude 3.7 Sonnet Thinking on 2025-03-25. 

declare module "tiddlywiki" {
  interface Tiddler {
    /**
     * Checks if a tiddler has a specific tag
     */
    hasTag(tag: string): boolean;
    
    /**
     * Checks if a tiddler is a plugin
     */
    isPlugin(): boolean;
    
    /**
     * Checks if a tiddler is a draft
     */
    isDraft(): boolean;
    
    /**
     * Gets a field value as a string
     */
    getFieldString(field: string, defaultValue?: string): string;
    
    /**
     * Gets a field value as an array/list
     */
    getFieldList(field: string): string[];
    
    /**
     * Gets all fields as a hashmap of strings
     * @param options Options including fields to exclude
     */
    getFieldStrings(options?: { exclude?: string[] }): Record<string, string>;
    
    /**
     * Gets all fields as a name:value block
     * @param options Options including fields to exclude
     */
    getFieldStringBlock(options?: { exclude?: string[] }): string;
    
    /**
     * Gets a field value as a day value (timestamp with hours/minutes/seconds set to 0)
     */
    getFieldDay(field: string): string;
  }
}
