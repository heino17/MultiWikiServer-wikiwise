import { Subject } from "rxjs";

export type RxArrayEvents<T> = {
  [K in "push" | "pop" | "shift" | "unshift" | "splice" | "sort" | "copyWithin" | "reverse"]?:
  [K, Parameters<Array<T>[K]>, ReturnType<Array<T>[K]>];
}
/** An array which emits events for each call to mutable functions on the array. */
export class ReactiveArray<T> extends Array<T> {
  #subject = new Subject<RxArrayEvents<T>[keyof RxArrayEvents<T>]>();
  get events() { return this.#subject.asObservable(); }

  constructor(length: number);
  constructor(...items: T[]);
  constructor(...args: any[]) {
    super(...args);
    const factory = (method: keyof RxArrayEvents<T>) => {
      return (...args: any[]) => {
        const result = Array.prototype[method].apply(this, args);
        this.#subject.next([method as any, args, result]);
        return result;
      };
    };
    this.push = factory("push");
    this.pop = factory("pop");
    this.shift = factory("shift");
    this.unshift = factory("unshift");
    this.splice = factory("splice");
    this.sort = factory("sort");
    this.copyWithin = factory("copyWithin");
    this.reverse = factory("reverse");
  }
}
