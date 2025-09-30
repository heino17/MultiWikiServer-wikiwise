import { InteropObservable, Subject } from "rxjs";

declare global {

  /** Awaited Return Type */
  type ART<T extends (...args: any) => any> = Awaited<ReturnType<T>>
  interface ObjectConstructor { keys<T>(t: T): (string & keyof T)[]; }
  /** 
   * helper function which returns the arguments as an array, 
   * but typed as a tuple, which is still an array, but positional. 
   */
  function Tuple<P extends any[]>(...arg: P): P;
  /** 
   * Helper function which returns tells whether an item is truthy.
   * 
   * Useful for removing falsey values and the corresponding types from an array.
   * 
   * It uses `!!` to to determine truthiness
   */
  function truthy<T>(obj: T): obj is Exclude<T, false | null | undefined | 0 | '' | void>
}

(global as any).Tuple = function Tuple(...args: any[]) { return args; };
(global as any).truthy = function truthy(obj: any) { return !!obj; };

export { };

export * from "./ReactiveArray";