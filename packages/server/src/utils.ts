import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export function is<T>(a: any, b: boolean): a is T { return b; }

/** Initiates a timer that must get cancelled before the current turn of the event loop ends */
export class SyncCheck {
  done;
  constructor() {
    let cancelled = false;
    const error = new Error("SyncCheck was not completed before the current turn of the event loop ended");
    process.nextTick(() => {
      if (cancelled) return;
      console.log(error);
      process.exit(1);
    });
    this.done = () => { cancelled = true };
  }
}


/** 
 * If any property returns a function, and that function returns a promise, 
 * the proxy will throw an error if the promise is not awaited before the next property access.
 * 
 * The stack trace of the error will point to the line where the promise was returned.
 */
export function createStrictAwaitProxy<T extends object>(instance: T): T {
  let outstandingPromiseError: Error | null = null;

  function wrappedFunction(value: Function) {
    return function (this: any, ...args: any[]) {
      // Protect against calling any methods while an outstanding promise exists.

      // Call the original function preserving the correct "this" context.
      const result = Reflect.apply(value, this, args);
      // If the result is a promise, wrap it to clear the outstanding lock on await.
      if (result instanceof Promise) {
        return new Proxy(result, {
          get(promiseTarget, promiseProp, promiseReceiver) {
            // When the promise's then property is accessed (i.e. when it's awaited),
            // clear the outstanding promise so that subsequent method calls are allowed.
            if (promiseProp === "then") {
              outstandingPromiseError = null;
            }
            const inner = Reflect.get(promiseTarget, promiseProp, promiseReceiver).bind(promiseTarget);
            if (promiseProp === "catch") {
              return wrappedFunction(inner);
            }
            return inner;
          }
        });
      }
      return result;
    }
  }

  return new Proxy(instance, {
    get(target, prop, receiver) {
      // throw an error if an outstanding promise exists.
      if (outstandingPromiseError !== null) {
        throw outstandingPromiseError;
      }
      // Use Reflect.get to get the property value.
      const value = Reflect.get(target, prop, receiver);

      // If the property is a function, return a wrapped function.
      if (typeof value === "function") {
        return wrappedFunction(value);
      }
      // For non-function properties, just return the value.
      return value;
    }
  });
}

export function tryParseJSON<T>(json: string): T | undefined {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}


export class TypedGenerator<T extends [any, any][]> {
  static checker<T extends [any, any][]>() {
    return {
      /** `const value1 = asV(1, yield asY(0, value0))` */
      asV<I extends number>(index: I, args: T[I][0]): T[I][0] { return args; },
      /** `const value1 = asV(1, yield asY(0, value0))` */
      asY<I extends number>(index: I, ret: T[I][1]): T[I][1] { return ret; },
    }
  }
  static wrapper<T extends [any, any][]>() {
    return <A extends any[]>(factory: (...args: A) => Generator<any, any, any>) => {
      return (...args: A) => new TypedGenerator<T>(factory(...args));
    };
  }
  constructor(private inner: Generator<any, any, any>, private index = 0) { }
  async next<I extends number>(index: I, ...args: T[I][0] extends void ? [] : [T[I][0]]): Promise<(
    T extends [...any[], T[I]] ? IteratorReturnResult<T[I][1]> : IteratorYieldResult<T[I][1]>
  )> {
    if (index !== this.index) throw new Error("Invalid index");
    this.index++;
    return this.inner.next(...args) as any;
  }
  return(value: any): any { this.inner.return(value); }
  throw(e: any): any { this.inner.throw(e); }
}

export async function mapAsync<T, U, V>(array: T[], callback: (this: V, value: T, index: number, array: T[]) => Promise<U>, thisArg?: any): Promise<U[]> {
  const results = new Array(array.length);
  for (let index = 0; index < array.length; index++) {
    results[index] = await callback.call(thisArg, array[index] as T, index, array);
  }
  return results;
};

export async function filterAsync<T, V>(array: T[], callback: (this: V, value: T, index: number, array: T[]) => Promise<boolean>, thisArg?: any): Promise<T[]> {
  const results = [];
  for (let index = 0; index < array.length; index++) {
    if (await callback.call(thisArg, array[index] as T, index, array)) {
      results.push(array[index]);
    }
  }
  return results as any;
}




export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
/** 
 * This returns the resolved path relative to the executing code file, 
 * however it uses path.resolve, not require.resolve. 
 */

export function dist_resolve(filepath: string) {
  const filename = typeof module === "undefined" ? fileURLToPath(import.meta.url) : module.filename;
  return path.resolve(path.dirname(filename), filepath);
}
export function dist_require_resolve(filepath: string) {
  const filename = typeof module === "undefined" ? fileURLToPath(import.meta.url) : module.filename;
  return createRequire(filename).resolve(filepath);
}


export declare interface JsonArray extends Array<JsonValue> { }
export declare type JsonObject = { [Key in string]?: JsonValue; };
export declare type JsonValue = string | number | boolean | JsonObject | JsonArray | null | Date;

export function caughtPromise<F extends (...args: any) => any, C extends (reason: any) => any>(
  wrapped: F,
  onrejected: C
): (...args: Parameters<F>) => ReturnType<F | C> {
  return (...args: Parameters<F>) => wrapped(...args).catch(onrejected);
}
