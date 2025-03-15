import { EventEmitter } from "@angular/core";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { from, NEVER, Observable, Observer, Subscription } from "rxjs";

/** Calls func.bind with the provided args, and stores the result in useMemo, refreshing whenever the func or args change */
export function useBind<T, A extends any[], B extends any[], R>(
  func: (this: T, ...args: [...A, ...B]) => R, thisArg: T, ...argArray: A
): (...args: B) => R {
  if (thisArg === undefined) throw new Error("thisArg cannot be undefined, use null if necessary");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => func.bind(thisArg, ...argArray), [func, ...argArray]);
}


export function useSubscriptionClosed(subs: Subscription) {
  return useSyncExternalStore(
    useCallback((onStoreChange) => {
      subs.add(onStoreChange);
      return () => subs.remove(onStoreChange);
    }, [subs]),
    () => subs.closed
  );
}


/**
 * Subscribes useSyncExternalStore to the observable.
 * 
 * @param obs The observable to subscribe. Follows switchAll behavior when the instance changes. Subscribes to a Promise using `from(obs)`.
 * @param initialValue Passed to useRef and returned until the first emission from the observable.
 * @param map Maps emissions from the observable but not the initial value.
 * This is called to map the observable to subsequent values. If not specified, the latest emission is returned directly. 
 * It is not a dependancy, but is passed into the useMemo call when the observable instance changes. 
 * @returns 
 */
export function useObservable<T>(obs: Observable<T> | Promise<T> | undefined): T | undefined;
export function useObservable<T>(obs: Observable<T> | Promise<T> | undefined, initialValue: T): T;
export function useObservable<T, I>(obs: Observable<T> | Promise<T> | undefined, initialValue: I): T | I;
export function useObservable<T, U>(obs: Observable<T> | Promise<T> | undefined, initialValue: U, map?: (value: T) => U): U;
export function useObservable(obs: Observable<unknown> | Promise<unknown> | undefined, initialValue?: unknown, map?: (value: unknown) => unknown): unknown {
  const ref = useRef(initialValue);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const doCheck = useMemo(() => subscribeEffectBody(obs === undefined ? NEVER : obs instanceof Promise ? from(obs) : obs, ref, map), [obs]);
  return useSyncExternalStore(doCheck, () => ref.current);
}

/**
 * (`useLayoutEffect`) Subscribes the observer to the observable, unsubscribing when either of them change. 
 * 
 * @param obs The observable to subscribe. Subscribes to a Promise using `from(obs)`.
 * @param observerOrNext An observer object or a callback function.
 */
export function useObserver<T>(obs: Observable<T> | Promise<T>, observerOrNext?: Partial<Observer<T>> | ((value: T) => void) | undefined) {
  useLayoutEffect(() => {
    const obs2 = obs instanceof Promise ? from(obs) : obs;
    const sub = obs2.subscribe(observerOrNext);
    return () => sub?.unsubscribe();
  }, [obs, observerOrNext]);
}

/**
 * (`useLayoutEffect`) Subscribes the observer to the observable, unsubscribing when either of them change. 
 * 
 * @param obsIn The observable to subscribe. Subscribes to a Promise using `from(obs)`.
 * @param observerOrNext An observer object or a callback function.
 */
export function useForward<T>(obsIn: Observable<T> | Promise<T>, obsOut: EventEmitter<T>) {
  useLayoutEffect(() => {
    const sub = (obsIn instanceof Promise ? from(obsIn) : obsIn).subscribe((e) => { obsOut.emit(e); });
    return () => sub?.unsubscribe();
  }, [obsIn, obsOut]);
}


function subscribeEffectBody<T, U>(obs: Observable<T>, ref: { current: U }, map?: (value: T) => U) {
  return (next: () => void) => {
    const sub = obs.subscribe((e) => { ref.current = map ? map(e) : e as any; next(); });
    return () => sub.unsubscribe();
  };
}
/**
 * A useEffect wrapper which unsubscribes a cleanup subscription on cleanup.
 * 
 * @param subscribeEffect Imperative function called by useEffect that should return a cleanup subscription `{ unsubscribe: () => void }` or `undefined`.
 * @param deps Passed to useEffect with an empty array as default.
 */
export function useSubscribeEffect<T>(subscribeEffect: () => { unsubscribe: () => void } | undefined, deps: React.DependencyList = []) {
  useEffect(() => {
    const sub = subscribeEffect();
    return () => sub?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
/**
 * A useLayoutEffect wrapper which unsubscribes a cleanup subscription on cleanup.
 * 
 * @param subscribeEffect Imperative function called by useLayoutEffect that must return a cleanup subscription `{ unsubscribe: () => void }`.
 * @param deps Passed to useLayoutEffect with an empty array as default.
 */
export function useSubscribeLayoutEffect<T>(subscribeEffect: () => { unsubscribe: () => void }, deps: React.DependencyList = []) {
  useLayoutEffect(() => {
    const sub = subscribeEffect();
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}