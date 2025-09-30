declare module "packages/commander/src/BaseCommand" {
    import * as commander from "commander";
    export type CommandClass = {
        new (...args: ConstructorParameters<typeof BaseCommand<any, any>>): BaseCommand<any, any>;
    };
    export type CommandFile = {
        Command: CommandClass;
        info: CommandInfo;
    };
    /**
     * The types for the BaseCommand are as follows:
     *
     * @example
     *
     * BaseCommand<Params, Options>
     * type Params = string[]
     * type Options = { [K: string]: string[] | boolean }
     *
     * @description
     *
     * - Params is all of the strings before the first option
     * - Options is a hashmap of each option, with either a boolean, or an array of strings.
     *
     * The option declaration in info determines how it is parsed.
     *
     * - For options declared with an argument, the value will be an array.
     *   - If no value is given, the array will be empty.
     *   - If the option is not present in the cli, it will not be added to the hashmap.
     * - For options declared without an argument, the value will be true or it will not be present.
     *
     *
     */
    export abstract class BaseCommand<P extends string[] = string[], O extends object = object> {
        params: P;
        options: O;
        constructor(params: P, options: O);
        abstract execute(): Promise<any>;
    }
    export interface CommandInfo {
        name: string;
        description: string;
        /** The values end up as an array in this.params, so the order is important. */
        arguments: [string, string][];
        /** The values end up in a hashmap of "key": "value", so order is only used in the help. */
        options?: [string, string][];
        internal?: boolean;
        getHelp?: () => string;
        command?(program: commander.Command): commander.Command;
    }
}
declare module "packages/events/src/index" {
    import { EventEmitter } from "events";
    /**
     * Server events used throughout the entire server.
     *
     * To find all references to a specific event, use find all occurrences
     * on a usage of the event name string, not on the definition of the event.
     */
    export interface ServerEventsMap {
    }
    export class ServerEvents extends EventEmitter<ServerEventsMap> {
        /** Use emitAsync instead */
        emit: never;
        emitAsync<K>(eventName: keyof ServerEventsMap | K, ...args: K extends keyof ServerEventsMap ? ServerEventsMap[K] : never): Promise<void>;
    }
    /**
     * Server events used throughout the entire server.
     *
     * To find all references to a specific event, use find all occurrences
     * on a usage of the event name string.
     *
     * The listener function is awaited, but the return value is ignored.
     *
     * If any listener throws, the await rejects, and the error is
     * caught by the nearest error handler, if one exists.
     */
    export const serverEvents: ServerEvents;
}
declare module "packages/commander/src/runCLI" {
    import { BaseCommand, CommandFile } from "packages/commander/src/BaseCommand";
    import * as commander from "commander";
    module "packages/events/src/index" {
        interface ServerEventsMap {
            "cli.register": [commands: Record<string, CommandFile>];
            "cli.commander": [commander.Command];
            "cli.execute.before": [
                name: string,
                params: string[],
                options: Record<string, string | boolean>,
                instance: BaseCommand
            ];
            "cli.execute.after": [
                name: string,
                params: string[],
                options: Record<string, string | boolean>,
                instance: BaseCommand
            ];
        }
    }
    /**
     * Run the following events in order:
     *
     * - `"cli.register"`
     * - `"cli.commander"`
     * - End here if help is requested or no command is specified
     * - `"cli.execute.before"`
     * - The specified command's `execute` method
     * - `"cli.execute.after"`
     */
    export function runCLI(): Promise<undefined>;
}
declare module "packages/commander/src/index" {
    import { runCLI } from "packages/commander/src/runCLI";
    export * from "packages/commander/src/BaseCommand";
    export * from "packages/commander/src/runCLI";
    export default runCLI;
}
declare module "packages/multipart-parser/src/headers/lib/header-value" {
    export interface HeaderValue {
        toString(): string;
    }
}
declare module "packages/multipart-parser/src/headers/lib/param-values" {
    export function parseParams(input: string, delimiter?: ';' | ','): [string, string | undefined][];
    export function quote(value: string): string;
}
declare module "packages/multipart-parser/src/headers/lib/utils" {
    export function capitalize(str: string): string;
    export function isIterable<T>(value: any): value is Iterable<T>;
    export function isValidDate(date: unknown): boolean;
    export function quoteEtag(tag: string): string;
}
declare module "packages/multipart-parser/src/headers/lib/accept" {
    import { type HeaderValue } from "packages/multipart-parser/src/headers/lib/header-value";
    export type AcceptInit = Iterable<string | [string, number]> | Record<string, number>;
    /**
     * The value of a `Accept` HTTP header.
     *
     * [MDN `Accept` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept)
     *
     * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7231#section-5.3.2)
     */
    export class Accept implements HeaderValue, Iterable<[string, number]> {
        #private;
        constructor(init?: string | AcceptInit);
        /**
         * An array of all media types in the header.
         */
        get mediaTypes(): string[];
        /**
         * An array of all weights (q values) in the header.
         */
        get weights(): number[];
        /**
         * The number of media types in the `Accept` header.
         */
        get size(): number;
        /**
         * Returns `true` if the header matches the given media type (i.e. it is "acceptable").
         * @param mediaType The media type to check.
         * @returns `true` if the media type is acceptable, `false` otherwise.
         */
        accepts(mediaType: string): boolean;
        /**
         * Gets the weight of a given media type. Also supports wildcards, so e.g. `text/*` will match `text/html`.
         * @param mediaType The media type to get the weight of.
         * @returns The weight of the media type.
         */
        getWeight(mediaType: string): number;
        /**
         * Returns the most preferred media type from the given list of media types.
         * @param mediaTypes The list of media types to choose from.
         * @returns The most preferred media type or `null` if none match.
         */
        getPreferred(mediaTypes: string[]): string | null;
        /**
         * Returns the weight of a media type. If it is not in the header verbatim, this returns `null`.
         * @param mediaType The media type to get the weight of.
         * @returns The weight of the media type, or `null` if it is not in the header.
         */
        get(mediaType: string): number | null;
        /**
         * Sets a media type with the given weight.
         * @param mediaType The media type to set.
         * @param weight The weight of the media type. Defaults to 1.
         */
        set(mediaType: string, weight?: number): void;
        /**
         * Removes the given media type from the header.
         * @param mediaType The media type to remove.
         */
        delete(mediaType: string): void;
        /**
         * Checks if a media type is in the header.
         * @param mediaType The media type to check.
         * @returns `true` if the media type is in the header (verbatim), `false` otherwise.
         */
        has(mediaType: string): boolean;
        /**
         * Removes all media types from the header.
         */
        clear(): void;
        entries(): IterableIterator<[string, number]>;
        [Symbol.iterator](): IterableIterator<[string, number]>;
        forEach(callback: (mediaType: string, weight: number, header: Accept) => void, thisArg?: any): void;
        toString(): string;
    }
}
declare module "packages/multipart-parser/src/headers/lib/accept-encoding" {
    import { type HeaderValue } from "packages/multipart-parser/src/headers/lib/header-value";
    export type AcceptEncodingInit = Iterable<string | [string, number]> | Record<string, number>;
    /**
     * The value of a `Accept-Encoding` HTTP header.
     *
     * [MDN `Accept-Encoding` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Encoding)
     *
     * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7231#section-5.3.4)
     */
    export class AcceptEncoding implements HeaderValue, Iterable<[string, number]> {
        #private;
        constructor(init?: string | AcceptEncodingInit);
        /**
         * An array of all encodings in the header.
         */
        get encodings(): string[];
        /**
         * An array of all weights (q values) in the header.
         */
        get weights(): number[];
        /**
         * The number of encodings in the header.
         */
        get size(): number;
        /**
         * Returns `true` if the header matches the given encoding (i.e. it is "acceptable").
         * @param encoding The encoding to check.
         * @returns `true` if the encoding is acceptable, `false` otherwise.
         */
        accepts(encoding: string): boolean;
        /**
         * Gets the weight an encoding. Performs wildcard matching so `*` matches all encodings.
         * @param encoding The encoding to get.
         * @returns The weight of the encoding, or `0` if it is not in the header.
         */
        getWeight(encoding: string): number;
        /**
         * Returns the most preferred encoding from the given list of encodings.
         * @param encodings The encodings to choose from.
         * @returns The most preferred encoding or `null` if none match.
         */
        getPreferred(encodings: string[]): string | null;
        /**
         * Gets the weight of an encoding. If it is not in the header verbatim, this returns `null`.
         * @param encoding The encoding to get.
         * @returns The weight of the encoding, or `null` if it is not in the header.
         */
        get(encoding: string): number | null;
        /**
         * Sets an encoding with the given weight.
         * @param encoding The encoding to set.
         * @param weight The weight of the encoding. Defaults to 1.
         */
        set(encoding: string, weight?: number): void;
        /**
         * Removes the given encoding from the header.
         * @param encoding The encoding to remove.
         */
        delete(encoding: string): void;
        /**
         * Checks if the header contains a given encoding.
         * @param encoding The encoding to check.
         * @returns `true` if the encoding is in the header, `false` otherwise.
         */
        has(encoding: string): boolean;
        /**
         * Removes all encodings from the header.
         */
        clear(): void;
        entries(): IterableIterator<[string, number]>;
        [Symbol.iterator](): IterableIterator<[string, number]>;
        forEach(callback: (encoding: string, weight: number, header: AcceptEncoding) => void, thisArg?: any): void;
        toString(): string;
    }
}
declare module "packages/multipart-parser/src/headers/lib/accept-language" {
    import { type HeaderValue } from "packages/multipart-parser/src/headers/lib/header-value";
    export type AcceptLanguageInit = Iterable<string | [string, number]> | Record<string, number>;
    /**
     * The value of a `Accept-Language` HTTP header.
     *
     * [MDN `Accept-Language` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language)
     *
     * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7231#section-5.3.5)
     */
    export class AcceptLanguage implements HeaderValue, Iterable<[string, number]> {
        #private;
        constructor(init?: string | AcceptLanguageInit);
        /**
         * An array of all languages in the header.
         */
        get languages(): string[];
        /**
         * An array of all weights (q values) in the header.
         */
        get weights(): number[];
        /**
         * The number of languages in the header.
         */
        get size(): number;
        /**
         * Returns `true` if the header matches the given language (i.e. it is "acceptable").
         * @param language The locale identifier of the language to check.
         * @returns `true` if the language is acceptable, `false` otherwise.
         */
        accepts(language: string): boolean;
        /**
         * Gets the weight of a language with the given locale identifier. Performs wildcard and subtype
         * matching, so `en` matches `en-US` and `en-GB`, and `*` matches all languages.
         * @param language The locale identifier of the language to get.
         * @returns The weight of the language, or `0` if it is not in the header.
         */
        getWeight(language: string): number;
        /**
         * Returns the most preferred language from the given list of languages.
         * @param languages The locale identifiers of the languages to choose from.
         * @returns The most preferred language or `null` if none match.
         */
        getPreferred(languages: string[]): string | null;
        /**
         * Gets the weight of a language with the given locale identifier. If it is not in the header
         * verbatim, this returns `null`.
         * @param language The locale identifier of the language to get.
         * @returns The weight of the language, or `null` if it is not in the header.
         */
        get(language: string): number | null;
        /**
         * Sets a language with the given weight.
         * @param language The locale identifier of the language to set.
         * @param weight The weight of the language. Defaults to 1.
         */
        set(language: string, weight?: number): void;
        /**
         * Removes a language with the given locale identifier.
         * @param language The locale identifier of the language to remove.
         */
        delete(language: string): void;
        /**
         * Checks if the header contains a language with the given locale identifier.
         * @param language The locale identifier of the language to check.
         * @returns `true` if the language is in the header, `false` otherwise.
         */
        has(language: string): boolean;
        /**
         * Removes all languages from the header.
         */
        clear(): void;
        entries(): IterableIterator<[string, number]>;
        [Symbol.iterator](): IterableIterator<[string, number]>;
        forEach(callback: (language: string, weight: number, header: AcceptLanguage) => void, thisArg?: any): void;
        toString(): string;
    }
}
declare module "packages/multipart-parser/src/headers/lib/cache-control" {
    import { type HeaderValue } from "packages/multipart-parser/src/headers/lib/header-value";
    export interface CacheControlInit {
        /**
         * The `max-age=N` **request directive** indicates that the client allows a stored response that
         * is generated on the origin server within _N_ seconds — where _N_ may be any non-negative
         * integer (including `0`).
         *
         * The `max-age=N` **response directive** indicates that the response remains
         * [fresh](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#fresh_and_stale_based_on_age)
         * until _N_ seconds after the response is generated.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#max-age)
         */
        maxAge?: number;
        /**
         * The `max-stale=N` **request directive** indicates that the client allows a stored response
         * that is [stale](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#fresh_and_stale_based_on_age)
         * within _N_ seconds.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#max-stale)
         */
        maxStale?: number;
        /**
         * The `min-fresh=N` **request directive** indicates that the client allows a stored response
         * that is [fresh](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#fresh_and_stale_based_on_age)
         * for at least _N_ seconds.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#min-fresh)
         */
        minFresh?: number;
        /**
         * The `s-maxage` **response directive** also indicates how long the response is
         * [fresh](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#fresh_and_stale_based_on_age) for (similar to `max-age`) —
         * but it is specific to shared caches, and they will ignore `max-age` when it is present.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#s-maxage)
         */
        sMaxage?: number;
        /**
         * The `no-cache` **request directive** asks caches to validate the response with the origin
         * server before reuse. If you want caches to always check for content updates while reusing
         * stored content, `no-cache` is the directive to use.
         *
         * The `no-cache` **response directive** indicates that the response can be stored in caches, but
         * the response must be validated with the origin server before each reuse, even when the cache
         * is disconnected from the origin server.
         *
         * `no-cache` allows clients to request the most up-to-date response even if the cache has a
         * [fresh](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#fresh_and_stale_based_on_age)
         * response.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#no-cache)
         */
        noCache?: true;
        /**
         * The `no-store` **request directive** allows a client to request that caches refrain from
         * storing the request and corresponding response — even if the origin server's response could
         * be stored.
         *
         * The `no-store` **response directive** indicates that any caches of any kind (private or shared)
         * should not store this response.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#no-store)
         */
        noStore?: true;
        /**
         * `no-transform` indicates that any intermediary (regardless of whether it implements a cache)
         * shouldn't transform the response contents.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#no-transform)
         */
        noTransform?: true;
        /**
         * The client indicates that cache should obtain an already-cached response. If a cache has
         * stored a response, it's reused.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#only-if-cached)
         */
        onlyIfCached?: true;
        /**
         * The `must-revalidate` **response directive** indicates that the response can be stored in
         * caches and can be reused while [fresh](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#fresh_and_stale_based_on_age).
         * If the response becomes [stale](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#fresh_and_stale_based_on_age),
         * it must be validated with the origin server before reuse.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#must-revalidate)
         */
        mustRevalidate?: true;
        /**
         * The `proxy-revalidate` **response directive** is the equivalent of `must-revalidate`, but
         * specifically for shared caches only.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#proxy-revalidate)
         */
        proxyRevalidate?: true;
        /**
         * The `must-understand` **response directive** indicates that a cache should store the response
         * only if it understands the requirements for caching based on status code.
         *
         * `must-understand` should be coupled with `no-store` for fallback behavior.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#must-understand)
         */
        mustUnderstand?: true;
        /**
         * The `private` **response directive** indicates that the response can be stored only in a
         * private cache (e.g. local caches in browsers).
         *
         * You should add the `private` directive for user-personalized content, especially for responses
         * received after login and for sessions managed via cookies.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#private)
         */
        private?: true;
        /**
         * The `public` **response directive** indicates that the response can be stored in a shared
         * cache. Responses for requests with `Authorization` header fields must not be stored in a
         * shared cache; however, the `public` directive will cause such responses to be stored in a
         * shared cache.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#public)
         */
        public?: true;
        /**
         * The `immutable` **response directive** indicates that the response will not be updated while
         * it's [fresh](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#fresh_and_stale_based_on_age).
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#public)
         */
        immutable?: true;
        /**
         * The `stale-while-revalidate` **response directive** indicates that the cache could reuse a
         * stale response while it revalidates it to a cache.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#stale-while-revalidate)
         */
        staleWhileRevalidate?: number;
        /**
         * The `stale-if-error` **response directive** indicates that the cache can reuse a
         * [stale response](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching#fresh_and_stale_based_on_age)
         * when an upstream server generates an error, or when the error is generated locally. Here, an
         * error is considered any response with a status code of 500, 502, 503, or 504.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#stale-if-error)
         */
        staleIfError?: number;
    }
    /**
     * The value of a `Cache-Control` HTTP header.
     *
     * [MDN `Cache-Control` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
     *
     * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7234#section-5.2)
     */
    export class CacheControl implements HeaderValue, CacheControlInit {
        maxAge?: number;
        maxStale?: number;
        minFresh?: number;
        sMaxage?: number;
        noCache?: true;
        noStore?: true;
        noTransform?: true;
        onlyIfCached?: true;
        mustRevalidate?: true;
        proxyRevalidate?: true;
        mustUnderstand?: true;
        private?: true;
        public?: true;
        immutable?: true;
        staleWhileRevalidate?: number;
        staleIfError?: number;
        constructor(init?: string | CacheControlInit);
        toString(): string;
    }
}
declare module "packages/multipart-parser/src/headers/lib/content-disposition" {
    import { type HeaderValue } from "packages/multipart-parser/src/headers/lib/header-value";
    export interface ContentDispositionInit {
        /**
         * For file uploads, the name of the file that the user selected.
         */
        filename?: string;
        /**
         * For file uploads, the name of the file that the user selected, encoded as a [RFC 8187](https://tools.ietf.org/html/rfc8187) `filename*` parameter.
         * This parameter allows non-ASCII characters in filenames, and specifies the character encoding.
         */
        filenameSplat?: string;
        /**
         * For `multipart/form-data` requests, the name of the `<input>` field associated with this content.
         */
        name?: string;
        /**
         * The disposition type of the content, such as `attachment` or `inline`.
         */
        type?: string;
    }
    /**
     * The value of a `Content-Disposition` HTTP header.
     *
     * [MDN `Content-Disposition` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition)
     *
     * [RFC 6266](https://tools.ietf.org/html/rfc6266)
     */
    export class ContentDisposition implements HeaderValue, ContentDispositionInit {
        filename?: string;
        filenameSplat?: string;
        name?: string;
        type?: string;
        constructor(init?: string | ContentDispositionInit);
        /**
         * The preferred filename for the content, using the `filename*` parameter if present, falling back to the `filename` parameter.
         *
         * From [RFC 6266](https://tools.ietf.org/html/rfc6266):
         *
         * Many user agent implementations predating this specification do not understand the "filename*" parameter.
         * Therefore, when both "filename" and "filename*" are present in a single header field value, recipients SHOULD
         * pick "filename*" and ignore "filename". This way, senders can avoid special-casing specific user agents by
         * sending both the more expressive "filename*" parameter, and the "filename" parameter as fallback for legacy recipients.
         */
        get preferredFilename(): string | undefined;
        toString(): string;
    }
}
declare module "packages/multipart-parser/src/headers/lib/content-type" {
    import { type HeaderValue } from "packages/multipart-parser/src/headers/lib/header-value";
    export interface ContentTypeInit {
        /**
         * For multipart entities, the boundary that separates the different parts of the message.
         */
        boundary?: string;
        /**
         * Indicates the [character encoding](https://developer.mozilla.org/en-US/docs/Glossary/Character_encoding) of the content.
         *
         * For example, `utf-8`, `iso-8859-1`.
         */
        charset?: string;
        /**
         * The media type (or MIME type) of the content. This consists of a type and subtype, separated by a slash.
         *
         * For example, `text/html`, `application/json`, `image/png`.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types)
         */
        mediaType?: string;
    }
    /**
     * The value of a `Content-Type` HTTP header.
     *
     * [MDN `Content-Type` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type)
     *
     * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7231#section-3.1.1.5)
     */
    export class ContentType implements HeaderValue, ContentTypeInit {
        boundary?: string;
        charset?: string;
        mediaType?: string;
        constructor(init?: string | ContentTypeInit);
        toString(): string;
    }
}
declare module "packages/multipart-parser/src/headers/lib/cookie" {
    import { type HeaderValue } from "packages/multipart-parser/src/headers/lib/header-value";
    export type CookieInit = Iterable<[string, string]> | Record<string, string>;
    /**
     * The value of a `Cookie` HTTP header.
     *
     * [MDN `Cookie` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cookie)
     *
     * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc6265#section-4.2)
     */
    export class Cookie implements HeaderValue, Iterable<[string, string]> {
        #private;
        constructor(init?: string | CookieInit);
        /**
         * An array of the names of the cookies in the header.
         */
        get names(): string[];
        /**
         * An array of the values of the cookies in the header.
         */
        get values(): string[];
        /**
         * The number of cookies in the header.
         */
        get size(): number;
        /**
         * Gets the value of a cookie with the given name from the header.
         * @param name The name of the cookie.
         * @returns The value of the cookie, or `null` if the cookie does not exist.
         */
        get(name: string): string | null;
        /**
         * Sets a cookie with the given name and value in the header.
         * @param name The name of the cookie.
         * @param value The value of the cookie.
         */
        set(name: string, value: string): void;
        /**
         * Removes a cookie with the given name from the header.
         * @param name The name of the cookie.
         */
        delete(name: string): void;
        /**
         * True if a cookie with the given name exists in the header.
         * @param name The name of the cookie.
         * @returns True if a cookie with the given name exists in the header.
         */
        has(name: string): boolean;
        /**
         * Removes all cookies from the header.
         */
        clear(): void;
        entries(): IterableIterator<[string, string]>;
        [Symbol.iterator](): IterableIterator<[string, string]>;
        forEach(callback: (name: string, value: string, header: Cookie) => void, thisArg?: any): void;
        toString(): string;
    }
}
declare module "packages/multipart-parser/src/headers/lib/if-none-match" {
    import { type HeaderValue } from "packages/multipart-parser/src/headers/lib/header-value";
    export interface IfNoneMatchInit {
        /**
         * The entity tags to compare against the current entity.
         */
        tags: string[];
    }
    /**
     * The value of an `If-None-Match` HTTP header.
     *
     * [MDN `If-None-Match` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match)
     *
     * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7232#section-3.2)
     */
    export class IfNoneMatch implements HeaderValue, IfNoneMatchInit {
        tags: string[];
        constructor(init?: string | string[] | IfNoneMatchInit);
        /**
         * Checks if the header contains the given entity tag.
         *
         * Note: This method checks only for exact matches and does not consider wildcards.
         *
         * @param tag The entity tag to check for.
         * @returns `true` if the tag is present in the header, `false` otherwise.
         */
        has(tag: string): boolean;
        /**
         * Checks if this header matches the given entity tag.
         *
         * @param tag The entity tag to check for.
         * @returns `true` if the tag is present in the header (or the header contains a wildcard), `false` otherwise.
         */
        matches(tag: string): boolean;
        toString(): string;
    }
}
declare module "packages/multipart-parser/src/headers/lib/set-cookie" {
    import { type HeaderValue } from "packages/multipart-parser/src/headers/lib/header-value";
    type SameSiteValue = 'Strict' | 'Lax' | 'None';
    export interface SetCookieInit {
        /**
         * The domain of the cookie. For example, `example.com`.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#domaindomain-value)
         */
        domain?: string;
        /**
         * The expiration date of the cookie. If not specified, the cookie is a session cookie.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#expiresdate)
         */
        expires?: Date;
        /**
         * Indicates this cookie should not be accessible via JavaScript.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#httponly)
         */
        httpOnly?: true;
        /**
         * The maximum age of the cookie in seconds.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#max-age)
         */
        maxAge?: number;
        /**
         * The name of the cookie.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#cookie-namecookie-value)
         */
        name?: string;
        /**
         * The path of the cookie. For example, `/` or `/admin`.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#pathpath-value)
         */
        path?: string;
        /**
         * The `SameSite` attribute of the cookie. This attribute lets servers require that a cookie shouldn't be sent with
         * cross-site requests, which provides some protection against cross-site request forgery attacks.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#samesitesamesite-value)
         */
        sameSite?: SameSiteValue;
        /**
         * Indicates the cookie should only be sent over HTTPS.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#secure)
         */
        secure?: true;
        /**
         * The value of the cookie.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#cookie-namecookie-value)
         */
        value?: string;
    }
    /**
     * The value of a `Set-Cookie` HTTP header.
     *
     * [MDN `Set-Cookie` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
     *
     * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc6265#section-4.1)
     */
    export class SetCookie implements HeaderValue, SetCookieInit {
        domain?: string;
        expires?: Date;
        httpOnly?: true;
        maxAge?: number;
        name?: string;
        path?: string;
        sameSite?: SameSiteValue;
        secure?: true;
        value?: string;
        constructor(init?: string | SetCookieInit);
        toString(): string;
    }
}
declare module "packages/multipart-parser/src/headers/lib/header-names" {
    export function canonicalHeaderName(name: string): string;
}
declare module "packages/multipart-parser/src/headers/lib/super-headers" {
    import { type AcceptInit, Accept } from "packages/multipart-parser/src/headers/lib/accept";
    import { type AcceptEncodingInit, AcceptEncoding } from "packages/multipart-parser/src/headers/lib/accept-encoding";
    import { type AcceptLanguageInit, AcceptLanguage } from "packages/multipart-parser/src/headers/lib/accept-language";
    import { type CacheControlInit, CacheControl } from "packages/multipart-parser/src/headers/lib/cache-control";
    import { type ContentDispositionInit, ContentDisposition } from "packages/multipart-parser/src/headers/lib/content-disposition";
    import { type ContentTypeInit, ContentType } from "packages/multipart-parser/src/headers/lib/content-type";
    import { type CookieInit, Cookie } from "packages/multipart-parser/src/headers/lib/cookie";
    import { type HeaderValue } from "packages/multipart-parser/src/headers/lib/header-value";
    import { type IfNoneMatchInit, IfNoneMatch } from "packages/multipart-parser/src/headers/lib/if-none-match";
    import { type SetCookieInit, SetCookie } from "packages/multipart-parser/src/headers/lib/set-cookie";
    type DateInit = number | Date;
    interface SuperHeadersPropertyInit {
        /**
         * The [`Accept`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept) header value.
         */
        accept?: string | AcceptInit;
        /**
         * The [`Accept-Encoding`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Encoding) header value.
         */
        acceptEncoding?: string | AcceptEncodingInit;
        /**
         * The [`Accept-Language`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language) header value.
         */
        acceptLanguage?: string | AcceptLanguageInit;
        /**
         * The [`Accept-Ranges`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Ranges) header value.
         */
        acceptRanges?: string;
        /**
         * The [`Age`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Age) header value.
         */
        age?: string | number;
        /**
         * The [`Cache-Control`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control) header value.
         */
        cacheControl?: string | CacheControlInit;
        /**
         * The [`Connection`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Connection) header value.
         */
        connection?: string;
        /**
         * The [`Content-Disposition`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition) header value.
         */
        contentDisposition?: string | ContentDispositionInit;
        /**
         * The [`Content-Encoding`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding) header value.
         */
        contentEncoding?: string | string[];
        /**
         * The [`Content-Language`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Language) header value.
         */
        contentLanguage?: string | string[];
        /**
         * The [`Content-Length`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Length) header value.
         */
        contentLength?: string | number;
        /**
         * The [`Content-Type`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type) header value.
         */
        contentType?: string | ContentTypeInit;
        /**
         * The [`Cookie`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cookie) header value.
         */
        cookie?: string | CookieInit;
        /**
         * The [`Date`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Date) header value.
         */
        date?: string | DateInit;
        /**
         * The [`ETag`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag) header value.
         */
        etag?: string;
        /**
         * The [`Expires`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Expires) header value.
         */
        expires?: string | DateInit;
        /**
         * The [`Host`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host) header value.
         */
        host?: string;
        /**
         * The [`If-Modified-Since`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Modified-Since) header value.
         */
        ifModifiedSince?: string | DateInit;
        /**
         * The [`If-None-Match`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match) header value.
         */
        ifNoneMatch?: string | string[] | IfNoneMatchInit;
        /**
         * The [`If-Unmodified-Since`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Unmodified-Since) header value.
         */
        ifUnmodifiedSince?: string | DateInit;
        /**
         * The [`Last-Modified`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Last-Modified) header value.
         */
        lastModified?: string | DateInit;
        /**
         * The [`Location`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Location) header value.
         */
        location?: string;
        /**
         * The [`Referer`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referer) header value.
         */
        referer?: string;
        /**
         * The [`Set-Cookie`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie) header value(s).
         */
        setCookie?: string | (string | SetCookieInit)[];
    }
    export type SuperHeadersInit = Iterable<[string, string]> | (SuperHeadersPropertyInit & Record<string, string | HeaderValue>);
    /**
     * An enhanced JavaScript `Headers` interface with type-safe access.
     *
     * [API Reference](https://github.com/mjackson/remix-the-web/tree/main/packages/headers)
     *
     * [MDN `Headers` Base Class Reference](https://developer.mozilla.org/en-US/docs/Web/API/Headers)
     */
    export class SuperHeaders extends Headers {
        #private;
        constructor(init?: string | SuperHeadersInit | Headers);
        /**
         * Appends a new header value to the existing set of values for a header,
         * or adds the header if it does not already exist.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Headers/append)
         */
        append(name: string, value: string): void;
        /**
         * Removes a header.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Headers/delete)
         */
        delete(name: string): void;
        /**
         * Returns a string of all the values for a header, or `null` if the header does not exist.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Headers/get)
         */
        get(name: string): string | null;
        /**
         * Returns an array of all values associated with the `Set-Cookie` header. This is
         * useful when building headers for a HTTP response since multiple `Set-Cookie` headers
         * must be sent on separate lines.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Headers/getSetCookie)
         */
        getSetCookie(): string[];
        /**
         * Returns `true` if the header is present in the list of headers.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Headers/has)
         */
        has(name: string): boolean;
        /**
         * Sets a new value for the given header. If the header already exists, the new value
         * will replace the existing value.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Headers/set)
         */
        set(name: string, value: string): void;
        /**
         * Returns an iterator of all header keys (lowercase).
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Headers/keys)
         */
        keys(): IterableIterator<string>;
        /**
         * Returns an iterator of all header values.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Headers/values)
         */
        values(): IterableIterator<string>;
        /**
         * Returns an iterator of all header key/value pairs.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Headers/entries)
         */
        entries(): IterableIterator<[string, string]>;
        [Symbol.iterator](): IterableIterator<[string, string]>;
        /**
         * Invokes the `callback` for each header key/value pair.
         *
         * [MDN Reference](https://developer.mozilla.org/en-US/docs/Web/API/Headers/forEach)
         */
        forEach(callback: (value: string, key: string, headers: SuperHeaders) => void, thisArg?: any): void;
        /**
         * Returns a string representation of the headers suitable for use in a HTTP message.
         */
        toString(): string;
        /**
         * The `Accept` header is used by clients to indicate the media types that are acceptable
         * in the response.
         *
         * [MDN `Accept` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7231#section-5.3.2)
         */
        get accept(): Accept;
        set accept(value: string | AcceptInit | undefined | null);
        /**
         * The `Accept-Encoding` header contains information about the content encodings that the client
         * is willing to accept in the response.
         *
         * [MDN `Accept-Encoding` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Encoding)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7231#section-5.3.4)
         */
        get acceptEncoding(): AcceptEncoding;
        set acceptEncoding(value: string | AcceptEncodingInit | undefined | null);
        /**
         * The `Accept-Language` header contains information about preferred natural language for the
         * response.
         *
         * [MDN `Accept-Language` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7231#section-5.3.5)
         */
        get acceptLanguage(): AcceptLanguage;
        set acceptLanguage(value: string | AcceptLanguageInit | undefined | null);
        /**
         * The `Accept-Ranges` header indicates the server's acceptance of range requests.
         *
         * [MDN `Accept-Ranges` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Ranges)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7233#section-2.3)
         */
        get acceptRanges(): string | null;
        set acceptRanges(value: string | undefined | null);
        /**
         * The `Age` header contains the time in seconds an object was in a proxy cache.
         *
         * [MDN `Age` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Age)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7234#section-5.1)
         */
        get age(): number | null;
        set age(value: string | number | undefined | null);
        /**
         * The `Cache-Control` header contains directives for caching mechanisms in both requests and responses.
         *
         * [MDN `Cache-Control` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7234#section-5.2)
         */
        get cacheControl(): CacheControl;
        set cacheControl(value: string | CacheControlInit | undefined | null);
        /**
         * The `Connection` header controls whether the network connection stays open after the current
         * transaction finishes.
         *
         * [MDN `Connection` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Connection)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7230#section-6.1)
         */
        get connection(): string | null;
        set connection(value: string | undefined | null);
        /**
         * The `Content-Disposition` header is a response-type header that describes how the payload is displayed.
         *
         * [MDN `Content-Disposition` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition)
         *
         * [RFC 6266](https://datatracker.ietf.org/doc/html/rfc6266)
         */
        get contentDisposition(): ContentDisposition;
        set contentDisposition(value: string | ContentDispositionInit | undefined | null);
        /**
         * The `Content-Encoding` header specifies the encoding of the resource.
         *
         * Note: If multiple encodings have been used, this value may be a comma-separated list. However, most often this
         * header will only contain a single value.
         *
         * [MDN `Content-Encoding` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding)
         *
         * [HTTP/1.1 Specification](https://httpwg.org/specs/rfc9110.html#field.content-encoding)
         */
        get contentEncoding(): string | null;
        set contentEncoding(value: string | string[] | undefined | null);
        /**
         * The `Content-Language` header describes the natural language(s) of the intended audience for the response content.
         *
         * Note: If the response content is intended for multiple audiences, this value may be a comma-separated list. However,
         * most often this header will only contain a single value.
         *
         * [MDN `Content-Language` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Language)
         *
         * [HTTP/1.1 Specification](https://httpwg.org/specs/rfc9110.html#field.content-language)
         */
        get contentLanguage(): string | null;
        set contentLanguage(value: string | string[] | undefined | null);
        /**
         * The `Content-Length` header indicates the size of the entity-body in bytes.
         *
         * [MDN `Content-Length` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Length)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7230#section-3.3.2)
         */
        get contentLength(): number | null;
        set contentLength(value: string | number | undefined | null);
        /**
         * The `Content-Type` header indicates the media type of the resource.
         *
         * [MDN `Content-Type` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7231#section-3.1.1.5)
         */
        get contentType(): ContentType;
        set contentType(value: string | ContentTypeInit | undefined | null);
        /**
         * The `Cookie` request header contains stored HTTP cookies previously sent by the server with
         * the `Set-Cookie` header.
         *
         * [MDN `Cookie` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cookie)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc6265#section-5.4)
         */
        get cookie(): Cookie;
        set cookie(value: string | CookieInit | undefined | null);
        /**
         * The `Date` header contains the date and time at which the message was sent.
         *
         * [MDN `Date` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Date)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7231#section-7.1.1.2)
         */
        get date(): Date | null;
        set date(value: string | DateInit | undefined | null);
        /**
         * The `ETag` header provides a unique identifier for the current version of the resource.
         *
         * [MDN `ETag` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7232#section-2.3)
         */
        get etag(): string | null;
        set etag(value: string | undefined | null);
        /**
         * The `Expires` header contains the date/time after which the response is considered stale.
         *
         * [MDN `Expires` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Expires)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7234#section-5.3)
         */
        get expires(): Date | null;
        set expires(value: string | DateInit | undefined | null);
        /**
         * The `Host` header specifies the domain name of the server and (optionally) the TCP port number.
         *
         * [MDN `Host` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7230#section-5.4)
         */
        get host(): string | null;
        set host(value: string | undefined | null);
        /**
         * The `If-Modified-Since` header makes a request conditional on the last modification date of the
         * requested resource.
         *
         * [MDN `If-Modified-Since` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Modified-Since)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7232#section-3.3)
         */
        get ifModifiedSince(): Date | null;
        set ifModifiedSince(value: string | DateInit | undefined | null);
        /**
         * The `If-None-Match` header makes a request conditional on the absence of a matching ETag.
         *
         * [MDN `If-None-Match` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7232#section-3.2)
         */
        get ifNoneMatch(): IfNoneMatch;
        set ifNoneMatch(value: string | string[] | IfNoneMatchInit | undefined | null);
        /**
         * The `If-Unmodified-Since` header makes a request conditional on the last modification date of the
         * requested resource.
         *
         * [MDN `If-Unmodified-Since` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Unmodified-Since)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7232#section-3.4)
         */
        get ifUnmodifiedSince(): Date | null;
        set ifUnmodifiedSince(value: string | DateInit | undefined | null);
        /**
         * The `Last-Modified` header contains the date and time at which the resource was last modified.
         *
         * [MDN `Last-Modified` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Last-Modified)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7232#section-2.2)
         */
        get lastModified(): Date | null;
        set lastModified(value: string | DateInit | undefined | null);
        /**
         * The `Location` header indicates the URL to redirect to.
         *
         * [MDN `Location` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Location)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7231#section-7.1.2)
         */
        get location(): string | null;
        set location(value: string | undefined | null);
        /**
         * The `Referer` header contains the address of the previous web page from which a link to the
         * currently requested page was followed.
         *
         * [MDN `Referer` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referer)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc7231#section-5.5.2)
         */
        get referer(): string | null;
        set referer(value: string | undefined | null);
        /**
         * The `Set-Cookie` header is used to send cookies from the server to the user agent.
         *
         * [MDN `Set-Cookie` Reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
         *
         * [HTTP/1.1 Specification](https://datatracker.ietf.org/doc/html/rfc6265#section-4.1)
         */
        get setCookie(): SetCookie[];
        set setCookie(value: (string | SetCookieInit)[] | string | SetCookieInit | undefined | null);
    }
}
declare module "packages/multipart-parser/src/headers/index" {
    export { type AcceptInit, Accept } from "packages/multipart-parser/src/headers/lib/accept";
    export { type AcceptEncodingInit, AcceptEncoding } from "packages/multipart-parser/src/headers/lib/accept-encoding";
    export { type AcceptLanguageInit, AcceptLanguage } from "packages/multipart-parser/src/headers/lib/accept-language";
    export { type CacheControlInit, CacheControl } from "packages/multipart-parser/src/headers/lib/cache-control";
    export { type ContentDispositionInit, ContentDisposition } from "packages/multipart-parser/src/headers/lib/content-disposition";
    export { type ContentTypeInit, ContentType } from "packages/multipart-parser/src/headers/lib/content-type";
    export { type CookieInit, Cookie } from "packages/multipart-parser/src/headers/lib/cookie";
    export { type IfNoneMatchInit, IfNoneMatch } from "packages/multipart-parser/src/headers/lib/if-none-match";
    export { type SetCookieInit, SetCookie } from "packages/multipart-parser/src/headers/lib/set-cookie";
    export { type SuperHeadersInit, SuperHeaders, SuperHeaders as default, } from "packages/multipart-parser/src/headers/lib/super-headers";
}
declare module "packages/multipart-parser/src/lib/read-stream" {
    export function readStream(stream: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array>;
}
declare module "packages/multipart-parser/src/lib/buffer-search" {
    export interface SearchFunction {
        (haystack: Uint8Array, start?: number): number;
    }
    export function createSearch(pattern: string): SearchFunction;
    export interface PartialTailSearchFunction {
        (haystack: Uint8Array): number;
    }
    export function createPartialTailSearch(pattern: string): PartialTailSearchFunction;
}
declare module "packages/multipart-parser/src/lib/multipart" {
    import Headers from "packages/multipart-parser/src/headers/index";
    /**
     * The base class for errors thrown by the multipart parser.
     */
    export class MultipartParseError extends Error {
        constructor(message: string);
    }
    /**
     * An error thrown when the maximum allowed size of a header is exceeded.
     */
    export class MaxHeaderSizeExceededError extends MultipartParseError {
        constructor(maxHeaderSize: number);
    }
    /**
     * An error thrown when the maximum allowed size of a file is exceeded.
     */
    export class MaxFileSizeExceededError extends MultipartParseError {
        constructor(maxFileSize: number);
    }
    export interface ParseMultipartOptions {
        /**
         * The boundary string used to separate parts in the multipart message,
         * e.g. the `boundary` parameter in the `Content-Type` header.
         */
        boundary: string;
        /**
         * The maximum allowed size of a header in bytes. If an individual part's header
         * exceeds this size, a `MaxHeaderSizeExceededError` will be thrown.
         *
         * Default: 8 KiB
         */
        maxHeaderSize?: number;
        /**
         * The maximum allowed size of a file in bytes. If an individual part's content
         * exceeds this size, a `MaxFileSizeExceededError` will be thrown.
         *
         * Default: 2 MiB
         */
        maxFileSize?: number;
        onCreatePart?(part: MultipartPart): void;
    }
    /**
     * Parse a `multipart/*` message from a buffer/iterable and yield each part as a `MultipartPart` object.
     *
     * Note: This is a low-level API that requires manual handling of the content and boundary. If you're
     * building a web server, consider using `parseMultipartRequest(request)` instead.
     *
     * @param message The multipart message as a `Uint8Array` or an iterable of `Uint8Array` chunks
     * @param options Options for the parser
     * @return A generator that yields `MultipartPart` objects
     */
    export function parseMultipart(message: Uint8Array | Iterable<Uint8Array>, options: ParseMultipartOptions): Generator<MultipartPart, void, unknown>;
    /**
     * Parse a `multipart/*` message stream and yield each part as a `MultipartPart` object.
     *
     * Note: This is a low-level API that requires manual handling of the content and boundary. If you're
     * building a web server, consider using `parseMultipartRequest(request)` instead.
     *
     * @param stream A stream containing multipart data as a `ReadableStream<Uint8Array>`
     * @param options Options for the parser
     * @return An async generator that yields `MultipartPart` objects
     */
    export function parseMultipartStream(stream: ReadableStream<Uint8Array>, options: ParseMultipartOptions): AsyncGenerator<MultipartPart, void, unknown>;
    export type MultipartParserOptions = Omit<ParseMultipartOptions, 'boundary'>;
    /**
     * A streaming parser for `multipart/*` HTTP messages.
     */
    export class MultipartParser {
        #private;
        readonly boundary: string;
        readonly maxHeaderSize: number;
        readonly maxFileSize: number;
        constructor(boundary: string, options?: MultipartParserOptions);
        /**
         * Write a chunk of data to the parser.
         *
         * @param chunk A chunk of data to write to the parser
         * @return A generator yielding `MultipartPart` objects as they are parsed
         */
        write(chunk: Uint8Array): Generator<MultipartPart, void, unknown>;
        /**
         * Should be called after all data has been written to the parser.
         *
         * Note: This will throw if the multipart message is incomplete or
         * wasn't properly terminated.
         *
         * @return void
         */
        finish(): void;
    }
    /**
     * A part of a `multipart/*` HTTP message.
     */
    export class MultipartPart {
        #private;
        /**
         * The raw content of this part as an array of `Uint8Array` chunks.
         */
        readonly content: Uint8Array[];
        constructor(header: Uint8Array, content: Uint8Array[]);
        /**
         * The content of this part as an `ArrayBuffer`.
         */
        get arrayBuffer(): ArrayBuffer;
        /**
         * The content of this part as a single `Uint8Array`. In `multipart/form-data` messages, this is useful
         * for reading the value of files that were uploaded using `<input type="file">` fields.
         */
        get bytes(): Uint8Array;
        /**
         * The headers associated with this part.
         */
        get headers(): Headers;
        /**
         * True if this part originated from a file upload.
         */
        get isFile(): boolean;
        /**
         * True if this part originated from a text input field in a form submission.
         */
        get isText(): boolean;
        /**
         * The filename of the part, if it is a file upload.
         */
        get filename(): string | undefined;
        /**
         * The media type of the part.
         */
        get mediaType(): string | undefined;
        /**
         * The name of the part, usually the `name` of the field in the `<form>` that submitted the request.
         */
        get name(): string | undefined;
        /**
         * The size of the content in bytes.
         */
        get size(): number;
        /**
         * The content of this part as a string. In `multipart/form-data` messages, this is useful for
         * reading the value of parts that originated from `<input type="text">` fields.
         *
         * Note: Do not use this for binary data, use `part.bytes` or `part.arrayBuffer` instead.
         */
        get text(): string;
    }
}
declare module "packages/multipart-parser/src/lib/multipart-request" {
    import type { MultipartParserOptions, MultipartPart } from "packages/multipart-parser/src/lib/multipart";
    /**
     * Extracts the boundary string from a `multipart/*` content type.
     *
     * @param contentType The `Content-Type` header value from the request
     * @return The boundary string if found, or null if not present
     */
    export function getMultipartBoundary(contentType: string): string | null;
    /**
     * Returns true if the given request contains multipart data.
     *
     * @param request The `Request` object to check
     * @return `true` if the request is a multipart request, `false` otherwise
     */
    export function isMultipartRequest(request: Request): boolean;
    /**
     * Returns true if the given request is a multipart request.
     *
     * @param req The Node.js `http.IncomingMessage` object to check
     * @return `true` if the request is a multipart request, `false` otherwise
     */
    export function isMultipartRequestHeader(contentTypeHeader: string | null | undefined): boolean;
    /**
     * Parse a multipart [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) and yield each part as
     * a `MultipartPart` object. Useful in HTTP server contexts for handling incoming `multipart/*` requests.
     *
     * @param request The `Request` object containing multipart data
     * @param options Optional parser options, such as `maxHeaderSize` and `maxFileSize`
     * @return An async generator yielding `MultipartPart` objects
     */
    export function parseMultipartRequest(request: Request, options?: MultipartParserOptions): AsyncGenerator<MultipartPart, void, unknown>;
}
declare module "packages/multipart-parser/src/lib/multipart.node" {
    import type * as http from 'node:http';
    import { Readable } from 'node:stream';
    import type { ParseMultipartOptions, MultipartParserOptions, MultipartPart } from "packages/multipart-parser/src/lib/multipart";
    /**
     * Parse a `multipart/*` Node.js `Buffer` and yield each part as a `MultipartPart` object.
     *
     * Note: This is a low-level API that requires manual handling of the content and boundary. If you're
     * building a web server, consider using `parseMultipartRequest(request)` instead.
     *
     * @param message The multipart message as a `Buffer` or an iterable of `Buffer` chunks
     * @param options Options for the parser
     * @return A generator yielding `MultipartPart` objects
     */
    export function parseMultipart(message: Buffer | Iterable<Buffer>, options: ParseMultipartOptions): Generator<MultipartPart, void, unknown>;
    /**
     * Parse a `multipart/*` Node.js `Readable` stream and yield each part as a `MultipartPart` object.
     *
     * Note: This is a low-level API that requires manual handling of the stream and boundary. If you're
     * building a web server, consider using `parseMultipartRequest(request)` instead.
     *
     * @param stream A Node.js `Readable` stream containing multipart data
     * @param options Options for the parser
     * @return An async generator yielding `MultipartPart` objects
     */
    export function parseMultipartStream(stream: Readable, options: ParseMultipartOptions): AsyncGenerator<MultipartPart, void, unknown>;
    /**
     * Returns true if the given request is a multipart request.
     *
     * @param req The Node.js `http.IncomingMessage` object to check
     * @return `true` if the request is a multipart request, `false` otherwise
     */
    export function isMultipartRequest(req: http.IncomingMessage): boolean;
    /**
     * Parse a multipart Node.js request and yield each part as a `MultipartPart` object.
     *
     * @param req The Node.js `http.IncomingMessage` object containing multipart data
     * @param options Options for the parser
     * @return An async generator yielding `MultipartPart` objects
     */
    export function parseMultipartRequest(req: http.IncomingMessage, options?: MultipartParserOptions): AsyncGenerator<MultipartPart, void, unknown>;
}
declare module "packages/multipart-parser/src/index" {
    export type { ParseMultipartOptions, MultipartParserOptions } from "packages/multipart-parser/src/lib/multipart";
    export { MultipartParseError, MaxHeaderSizeExceededError, MaxFileSizeExceededError, MultipartParser, MultipartPart, } from "packages/multipart-parser/src/lib/multipart";
    export { parseMultipart, parseMultipartStream, } from "packages/multipart-parser/src/lib/multipart";
    export { isMultipartRequest, isMultipartRequestHeader, getMultipartBoundary, parseMultipartRequest, } from "packages/multipart-parser/src/lib/multipart-request";
    export { isMultipartRequest as isNodeMultipartRequest, parseMultipartRequest as parseNodeMultipartRequest, parseMultipart as parseNodeMultipart, parseMultipartStream as parseNodeMultipartStream } from "packages/multipart-parser/src/lib/multipart.node";
    export * from "packages/multipart-parser/src/headers/index";
}
declare module "packages/multipart-parser/src/multipart-parser.node" {
    export type { ParseMultipartOptions, MultipartParserOptions } from "packages/multipart-parser/src/lib/multipart";
    export { MultipartParseError, MaxHeaderSizeExceededError, MaxFileSizeExceededError, MultipartParser, MultipartPart, } from "packages/multipart-parser/src/lib/multipart";
    export { getMultipartBoundary } from "packages/multipart-parser/src/lib/multipart-request";
    export { isMultipartRequest, parseMultipartRequest, parseMultipart, parseMultipartStream } from "packages/multipart-parser/src/lib/multipart.node";
}
declare module "packages/multipart-parser/src/multipart-parser" {
    export type { ParseMultipartOptions, MultipartParserOptions } from "packages/multipart-parser/src/lib/multipart";
    export { MultipartParseError, MaxHeaderSizeExceededError, MaxFileSizeExceededError, parseMultipart, parseMultipartStream, MultipartParser, MultipartPart, } from "packages/multipart-parser/src/lib/multipart";
    export { getMultipartBoundary, isMultipartRequest, parseMultipartRequest, } from "packages/multipart-parser/src/lib/multipart-request";
}
declare module "packages/multipart-parser/src/headers/lib/accept-encoding.test" { }
declare module "packages/multipart-parser/src/headers/lib/accept-language.test" { }
declare module "packages/multipart-parser/src/headers/lib/accept.test" { }
declare module "packages/multipart-parser/src/headers/lib/cache-control.test" { }
declare module "packages/multipart-parser/src/headers/lib/content-disposition.test" { }
declare module "packages/multipart-parser/src/headers/lib/content-type.test" { }
declare module "packages/multipart-parser/src/headers/lib/cookie.test" { }
declare module "packages/multipart-parser/src/headers/lib/header-names.test" { }
declare module "packages/multipart-parser/src/headers/lib/if-none-match.test" { }
declare module "packages/multipart-parser/src/headers/lib/param-values.test" { }
declare module "packages/multipart-parser/src/headers/lib/set-cookie.test" { }
declare module "packages/multipart-parser/src/headers/lib/super-headers.test" { }
declare module "packages/utils/src/index" {
    global {
        /** Awaited Return Type */
        type ART<T extends (...args: any) => any> = Awaited<ReturnType<T>>;
        interface ObjectConstructor {
            keys<T>(t: T): (string & keyof T)[];
        }
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
        function truthy<T>(obj: T): obj is Exclude<T, false | null | undefined | 0 | '' | void>;
    }
    export {};
}
declare module "packages/server/src/utils" {
    export function is<T>(a: any, b: boolean): a is T;
    /** Initiates a timer that must get cancelled before the current turn of the event loop ends */
    export class SyncCheck {
        done: () => void;
        constructor();
    }
    /**
     * If any property returns a function, and that function returns a promise,
     * the proxy will throw an error if the promise is not awaited before the next property access.
     *
     * The stack trace of the error will point to the line where the promise was returned.
     */
    export function createStrictAwaitProxy<T extends object>(instance: T): T;
    export function tryParseJSON<T>(json: string): T | undefined;
    export class TypedGenerator<T extends [any, any][]> {
        private inner;
        private index;
        static checker<T extends [any, any][]>(): {
            /** `const value1 = asV(1, yield asY(0, value0))` */
            asV<I extends number>(index: I, args: T[I][0]): T[I][0];
            /** `const value1 = asV(1, yield asY(0, value0))` */
            asY<I extends number>(index: I, ret: T[I][1]): T[I][1];
        };
        static wrapper<T extends [any, any][]>(): <A extends any[]>(factory: (...args: A) => Generator<any, any, any>) => (...args: A) => TypedGenerator<T>;
        constructor(inner: Generator<any, any, any>, index?: number);
        next<I extends number>(index: I, ...args: T[I][0] extends void ? [] : [T[I][0]]): Promise<(T extends [...any[], T[I]] ? IteratorReturnResult<T[I][1]> : IteratorYieldResult<T[I][1]>)>;
        return(value: any): any;
        throw(e: any): any;
    }
    export function mapAsync<T, U, V>(array: T[], callback: (this: V, value: T, index: number, array: T[]) => Promise<U>, thisArg?: any): Promise<U[]>;
    export function filterAsync<T, V>(array: T[], callback: (this: V, value: T, index: number, array: T[]) => Promise<boolean>, thisArg?: any): Promise<T[]>;
    export class UserError extends Error {
        constructor(message: string);
    }
    /**
     * This returns the resolved path relative to the executing code file,
     * however it uses path.resolve, not require.resolve.
     */
    export function dist_resolve(filepath: string): string;
    export function dist_require_resolve(filepath: string): string;
    export interface JsonArray extends Array<JsonValue> {
    }
    export type JsonObject = {
        [Key in string]?: JsonValue;
    };
    export type JsonValue = string | number | boolean | JsonObject | JsonArray | null | Date;
}
declare module "packages/server/src/compression" {
    /*!
     * compression
     * Copyright(c) 2010 Sencha Inc.
     * Copyright(c) 2011 TJ Holowaychuk
     * Copyright(c) 2014 Jonathan Ong
     * Copyright(c) 2014-2015 Douglas Christopher Wilson
     * MIT Licensed
     */
    import { DuplexOptions, PassThrough } from "stream";
    import { BrotliOptions, ZlibOptions } from 'zlib';
    import * as zlib from 'zlib';
    export interface CompressorOptions {
        /** Opts passed to brotli. The default quality param is 4. */
        brotli?: BrotliOptions;
        /** Opts passed to gzip */
        gzip?: ZlibOptions;
        /** Opts passed to deflate */
        deflate?: ZlibOptions;
        /** options to pass to the Passthrough stream used for identity encoding. */
        identity?: DuplexOptions;
        /**
         * source threshold below which to skip compression.
         * only works if content-length header is set.
         *
         * If a string, may be any number with a byte suffix (kb, mb, etc).
         */
        threshold?: number | string;
        /** use a specific encoding if the accept-encoding header is not present, defaults to identity */
        defaultEncoding?: 'br' | 'gzip' | 'deflate' | 'identity';
    }
    export class Compressor {
        private req;
        private res;
        constructor(req: import("http").IncomingMessage | import("http2").Http2ServerRequest, res: import("http").ServerResponse | import("http2").Http2ServerResponse, { identity, brotli, threshold, defaultEncoding, deflate, gzip }: CompressorOptions);
        /** Ends the response. Shortcut for easy removal when switching streams. */
        finisher: () => import("http").ServerResponse<import("http").IncomingMessage> | import("http2").Http2ServerResponse<import("http2").Http2ServerRequest>;
        enabled: boolean;
        method: string;
        threshold: any;
        defaultEncoding: "deflate" | "gzip" | "br" | "identity";
        ended: boolean;
        createStream: (method: string) => PassThrough;
        length: number;
        listeners: any[] | null;
        stream: PassThrough | zlib.Gzip | zlib.BrotliCompress | zlib.Deflate | undefined;
        shouldCompress(): boolean;
        /** This checks all of the headers that have been already set and sets up encoding. */
        beforeWriteHead(): void;
        splitStream(): Promise<void>;
        getEncodingMethod(supportedEncoding: readonly ('br' | 'gzip' | 'deflate' | 'identity')[]): 'br' | 'gzip' | 'deflate' | 'identity' | 'gzip-stream' | '';
    }
}
declare module "packages/server/src/streamer" {
    import * as http2 from 'node:http2';
    import { SendOptions } from 'send';
    import { Readable } from 'stream';
    import { IncomingMessage, ServerResponse, IncomingHttpHeaders as NodeIncomingHeaders, OutgoingHttpHeaders } from 'node:http';
    import { Writable } from 'node:stream';
    import { Compressor } from "packages/server/src/compression";
    module 'node:net' {
        interface Socket {
            /** Not defined on net.Socket instances.
             *
             * On tls.Socket instances,  */
            encrypted?: boolean;
        }
    }
    export interface IncomingHttpHeaders extends NodeIncomingHeaders {
        "x-requested-with"?: string;
    }
    export const SYMBOL_IGNORE_ERROR: unique symbol;
    export interface SendFileOptions extends Omit<SendOptions, "root" | "dotfiles" | "index" | "start" | "end"> {
        root: string;
        reqpath: string;
        offset?: number;
        length?: number;
        on404?: () => Promise<typeof STREAM_ENDED>;
        onDir?: () => Promise<typeof STREAM_ENDED>;
        /** Index file to send, defaults to false. */
        index?: SendOptions["index"];
        /** @deprecated not implemented */
        prefix?: Buffer;
        /** @deprecated not implemented */
        suffix?: Buffer;
    }
    export type StreamerChunk = {
        data: string;
        encoding: NodeJS.BufferEncoding;
    } | NodeJS.ReadableStream | Readable | Buffer;
    /**
     * The HTTP2 shims used in the request handler are only used for HTTP2 requests.
     * The NodeJS HTTP2 server actually calls the HTTP1 parser for all HTTP1 requests.
     */
    export class Streamer {
        private req;
        private res;
        pathPrefix: string;
        expectSecure: boolean;
        host: string;
        method: string;
        urlInfo: URL;
        /** The request url with path prefix removed. */
        url: string;
        headers: IncomingHttpHeaders;
        cookies: URLSearchParams;
        compressor: Compressor;
        constructor(req: IncomingMessage | http2.Http2ServerRequest, res: ServerResponse | http2.Http2ServerResponse, pathPrefix: string, expectSecure: boolean);
        parseCookieString(cookieString: string): URLSearchParams;
        get reader(): Readable;
        get writer(): Writable;
        throw(statusCode: number): void;
        catcher: (error: unknown) => void;
        checkHeadersSentBy(setError: boolean): void;
        toHeadersMap(headers: {
            [x: string]: string | string[] | number | undefined;
        }): Map<string, string[]>;
        readBody: () => Promise<Buffer<ArrayBufferLike>>;
        sendEmpty(status: number, headers?: OutgoingHttpHeaders): typeof STREAM_ENDED;
        sendString(status: number, headers: OutgoingHttpHeaders, data: string, encoding: NodeJS.BufferEncoding): typeof STREAM_ENDED;
        sendBuffer(status: number, headers: OutgoingHttpHeaders, data: Buffer): typeof STREAM_ENDED;
        /** If this is a HEAD request, the stream will be destroyed. */
        sendStream(status: number, headers: OutgoingHttpHeaders, stream: Readable): typeof STREAM_ENDED;
        private sendFD;
        /**
         * Sends a file with the appropriate cache headers, using the `send` npm module.
         *
         * Think of it like a static file server where you are serving files from a directory.
         *
         * @param options.root The directory to serve files from.
         * @param options.reqpath The path to the file relative to the `root` directory.
         * @param options.offset The offset in bytes to start reading the file from.
         * @param options.length The number of bytes to read from the file.
         * @param options.index "index.html" by default, to disable this set false or
         * to supply a new index pass a string or an array in preferred order.
         *
         * If an index.html file is not found, `send` will NOT generate a directory listing.
         *
         * The `send` method will automatically set the `Content-Type` header based on the file extension.
         *
         * If the file is not found, the `send` method will automatically send a 404 response.
         *
      
         * @returns STREAM_ENDED
         */
        sendFile(status: number, headers: OutgoingHttpHeaders, options: SendFileOptions): Promise<typeof STREAM_ENDED>;
        sendSSE(retryMilliseconds?: number): {
            /** Emit an SSE event */
            emitEvent: (eventName: string, eventData: any, eventId: string) => void;
            emitComment: (comment: string) => void;
            onClose: (callback: () => void) => void;
            close: () => void;
        };
        setCookie(name: string, value: string, options: {
            /**
         
              Defines the host to which the cookie will be sent.
         
              Only the current domain can be set as the value, or a domain of a higher order, unless it is a public suffix. Setting the domain will make the cookie available to it, as well as to all its subdomains.
         
              If omitted, this attribute defaults to the host of the current document URL, not including subdomains.
         
              Contrary to earlier specifications, leading dots in domain names (.example.com) are ignored.
         
              Multiple host/domain values are not allowed, but if a domain is specified, then subdomains are always included.
         
             */
            domain?: string;
            /**
         
            Indicates the path that must exist in the requested URL for the browser to send the Cookie header.
         
            The forward slash (`/`) character is interpreted as a directory separator, and subdirectories are matched as well.
            
            For example, for `Path=/docs`,
         
            - the request paths `/docs`,` /docs/`, `/docs/Web/`, and `/docs/Web/HTTP` will all match.
            - the request paths `/`, `/docsets`, `/fr/docs` will not match.
         
             */
            path?: string;
            expires?: Date;
            maxAge?: number;
            secure?: boolean;
            httpOnly?: boolean;
            /**
              Controls whether or not a cookie is sent with cross-site requests: that is, requests originating from a different site, including the scheme, from the site that set the cookie. This provides some protection against certain cross-site attacks, including cross-site request forgery (CSRF) attacks.
         
              The possible attribute values are:
         
              ### Strict
         
              Send the cookie only for requests originating from the same site that set the cookie.
         
              ### Lax
         
              Send the cookie only for requests originating from the same site that set the cookie, and for cross-site requests that meet both of the following criteria:
         
              - The request is a top-level navigation: this essentially means that the request causes the URL shown in the browser's address bar to change.
         
                - This would exclude, for example, requests made using the fetch() API, or requests for subresources from <img> or <script> elements, or navigations inside <iframe> elements.
         
                - It would include requests made when the user clicks a link in the top-level browsing context from one site to another, or an assignment to document.location, or a <form> submission.
         
              - The request uses a safe method: in particular, this excludes POST, PUT, and DELETE.
         
              Some browsers use Lax as the default value if SameSite is not specified: see Browser compatibility for details.
         
              > Note: When Lax is applied as a default, a more permissive version is used. In this more permissive version, cookies are also included in POST requests, as long as they were set no more than two minutes before the request was made.
         
              ### None
         
              Send the cookie with both cross-site and same-site requests. The Secure attribute must also be set when using this value.
             */
            sameSite?: "Strict" | "Lax" | "None";
        }): void;
        appendHeader(name: string, value: string): void;
        setHeader(name: string, value: string): void;
        writeHead(status: number, headers?: OutgoingHttpHeaders): void;
        /**
         * Write early hints using 103 Early Hints,
         * silently ignored if the request version is prior to 2.
         *
         * Despite this being an HTTP/1.1 feature, not all browsers
         * correctly implemented it, so this is commonly restricted
         * to HTTP/2.
         *
         * @example
          state.writeEarlyHints({
            'link': [
              '</styles.css>; rel=preload; as=style',
              '</scripts.js>; rel=preload; as=script',
            ],
            'x-trace-id': 'id for diagnostics',
          });
         * @param hints
         * @returns
         */
        writeEarlyHints(hints: Record<string, string | string[]>): void;
        pause: boolean;
        /** awaiting is not required. everything happens sync'ly */
        write(chunk: Buffer | string, encoding?: NodeJS.BufferEncoding): Promise<void>;
        end(): typeof STREAM_ENDED;
        /** Destroy the transport stream and possibly the entire connection. */
        destroy(): void;
        get headersSent(): boolean;
        headersSentBy: Error | undefined;
    }
    /**
     * This can be used as the basis of state objects and exposes the
     * relevant streamer interface without allowing private members to be exposed.
     *
     */
    export class StreamerState {
        protected streamer: Streamer;
        readBody: () => Promise<Buffer<ArrayBufferLike>>;
        sendEmpty: (status: number, headers?: OutgoingHttpHeaders) => typeof STREAM_ENDED;
        sendString: (status: number, headers: OutgoingHttpHeaders, data: string, encoding: NodeJS.BufferEncoding) => typeof STREAM_ENDED;
        sendBuffer: (status: number, headers: OutgoingHttpHeaders, data: Buffer) => typeof STREAM_ENDED;
        sendStream: (status: number, headers: OutgoingHttpHeaders, stream: Readable) => typeof STREAM_ENDED;
        sendFile: (status: number, headers: OutgoingHttpHeaders, options: SendFileOptions) => Promise<typeof STREAM_ENDED>;
        sendSSE: (retryMilliseconds?: number) => {
            /** Emit an SSE event */
            emitEvent: (eventName: string, eventData: any, eventId: string) => void;
            emitComment: (comment: string) => void;
            onClose: (callback: () => void) => void;
            close: () => void;
        };
        setCookie: (name: string, value: string, options: {
            /**
         
              Defines the host to which the cookie will be sent.
         
              Only the current domain can be set as the value, or a domain of a higher order, unless it is a public suffix. Setting the domain will make the cookie available to it, as well as to all its subdomains.
         
              If omitted, this attribute defaults to the host of the current document URL, not including subdomains.
         
              Contrary to earlier specifications, leading dots in domain names (.example.com) are ignored.
         
              Multiple host/domain values are not allowed, but if a domain is specified, then subdomains are always included.
         
             */
            domain?: string;
            /**
         
            Indicates the path that must exist in the requested URL for the browser to send the Cookie header.
         
            The forward slash (`/`) character is interpreted as a directory separator, and subdirectories are matched as well.
            
            For example, for `Path=/docs`,
         
            - the request paths `/docs`,` /docs/`, `/docs/Web/`, and `/docs/Web/HTTP` will all match.
            - the request paths `/`, `/docsets`, `/fr/docs` will not match.
         
             */
            path?: string;
            expires?: Date;
            maxAge?: number;
            secure?: boolean;
            httpOnly?: boolean;
            /**
              Controls whether or not a cookie is sent with cross-site requests: that is, requests originating from a different site, including the scheme, from the site that set the cookie. This provides some protection against certain cross-site attacks, including cross-site request forgery (CSRF) attacks.
         
              The possible attribute values are:
         
              ### Strict
         
              Send the cookie only for requests originating from the same site that set the cookie.
         
              ### Lax
         
              Send the cookie only for requests originating from the same site that set the cookie, and for cross-site requests that meet both of the following criteria:
         
              - The request is a top-level navigation: this essentially means that the request causes the URL shown in the browser's address bar to change.
         
                - This would exclude, for example, requests made using the fetch() API, or requests for subresources from <img> or <script> elements, or navigations inside <iframe> elements.
         
                - It would include requests made when the user clicks a link in the top-level browsing context from one site to another, or an assignment to document.location, or a <form> submission.
         
              - The request uses a safe method: in particular, this excludes POST, PUT, and DELETE.
         
              Some browsers use Lax as the default value if SameSite is not specified: see Browser compatibility for details.
         
              > Note: When Lax is applied as a default, a more permissive version is used. In this more permissive version, cookies are also included in POST requests, as long as they were set no more than two minutes before the request was made.
         
              ### None
         
              Send the cookie with both cross-site and same-site requests. The Secure attribute must also be set when using this value.
             */
            sameSite?: "Strict" | "Lax" | "None";
        }) => void;
        /**
         *
         * Sets a single header value. If the header already exists in the to-be-sent
         * headers, its value will be replaced. Use an array of strings to send multiple
         * headers with the same name
         *
         * When headers have been set with `response.setHeader()`, they will be merged
         * with any headers passed to `response.writeHead()`, with the headers passed
         * to `response.writeHead()` given precedence.
         *
         */
        setHeader: (name: string, value: string) => void;
        writeHead: (status: number, headers?: OutgoingHttpHeaders) => void;
        writeEarlyHints: (hints: Record<string, string | string[]>) => void;
        write: (chunk: Buffer | string, encoding?: NodeJS.BufferEncoding) => Promise<void>;
        end: () => typeof STREAM_ENDED;
        /**
         * this will pipe from the specified stream, but will not end the
         * response when the input stream ends. Input stream errors will be
         * caught and reject the promise. The promise will resolve once the
         * input stream ends.
         */
        pipeFrom(stream: Readable): Promise<void>;
        /** sends a status and plain text string body */
        sendSimple(status: number, msg: string): typeof STREAM_ENDED;
        /** Stringify the value (unconditionally) and send it with content-type `application/json` */
        sendJSON<T>(status: number, obj: T): typeof STREAM_ENDED;
        /** End the compression stream, flushing the rest of the compressed data, then begin a brand new stream to concatenate. */
        splitCompressionStream(): Promise<void>;
        STREAM_ENDED: typeof STREAM_ENDED;
        constructor(streamer: Streamer);
        /** The request url with path prefix removed. */
        get url(): string;
        get method(): string;
        get headers(): IncomingHttpHeaders;
        get host(): string;
        get urlInfo(): URL;
        get headersSent(): boolean;
        get reader(): Readable;
        get cookies(): URLSearchParams;
        /** This is based on the listener either having a key + cert or having secure set */
        get expectSecure(): boolean;
        /**
         * The path prefix is a essentially folder mount point.
         *
         * It starts with a slash, and ends without a slash (`"/dev"`).
         *
         * If there is not a prefix, it is an empty string (`""`).
         */
        get pathPrefix(): string;
    }
}
declare module "packages/server/src/SendError" {
    export interface SendErrorItem<STATUS extends number, DETAIL extends (object & {}) | null> {
        status: STATUS;
        details: DETAIL;
    }
    export interface SendErrorReasonData {
        /** Check the server logs for this one */
        "INTERNAL_SERVER_ERROR": SendErrorItem<500, {
            message: string;
            details?: any;
        }>;
        "INVALID_X_REQUESTED_WITH": SendErrorItem<400, null>;
        "MALFORMED_JSON": SendErrorItem<400, null>;
        "NO_ROUTE_MATCHED": SendErrorItem<400, null>;
        "METHOD_NOT_ALLOWED": SendErrorItem<405, {
            allowedMethods: string[];
        }>;
        "INVALID_BODY_FORMAT": SendErrorItem<500, null>;
        "REQUEST_DROPPED": SendErrorItem<500, null>;
        MULTIPART_INVALID_REQUEST: SendErrorItem<400, null>;
        MULTIPART_MISSING_BOUNDARY: SendErrorItem<400, null>;
    }
    export class SendError<REASON extends SendErrorReason> extends Error {
        reason: REASON;
        status: SendErrorReasonData[REASON]["status"];
        details: SendErrorReasonData[REASON]["details"];
        constructor(reason: REASON, status: SendErrorReasonData[REASON]["status"], details: SendErrorReasonData[REASON]["details"]);
        get message(): string;
        toJSON(): {
            status: SendErrorReasonData[REASON]["status"];
            reason: REASON;
            details: SendErrorReasonData[REASON]["details"];
        };
    }
    export type SendErrorReason = keyof SendErrorReasonData;
}
declare module "packages/server/src/StateObject" {
    import { Streamer, StreamerState } from "packages/server/src/streamer";
    import { BodyFormat, Router } from "packages/server/src/router";
    import { RouteMatch } from "packages/server/src/router";
    import { MultipartPart } from "packages/multipart-parser/src/index";
    export interface ServerRequest<B extends BodyFormat = BodyFormat, M extends string = string, D = unknown> extends ServerRequestClass<B, M, D> {
    }
    export class ServerRequestClass<B extends BodyFormat = BodyFormat, M extends string = string, D = unknown> extends StreamerState {
        /** The bodyformat that ended up taking precedence. This should be correctly typed. */
        bodyFormat: B;
        protected router: Router;
        get method(): M;
        data: B extends "string" ? string : B extends "buffer" ? Buffer : B extends "www-form-urlencoded-urlsearchparams" ? URLSearchParams : B extends "stream" ? undefined : B extends "ignore" ? undefined : D;
        /**
         * an *object from entries* of all the pathParams in the tree mapped to the path regex matches from that route.
         *
         * Object.fromEntries takes the last value if there are duplicates, so conflicting names will have the last value in the path.
         *
         * Conflicting names would be defined on the route definitions, so just change the name there if there is a conflict.
         *
         * pathParams are parsed with `decodeURIComponent` one time.
         */
        pathParams: Record<string, string | undefined>;
        /**
         * The query params. Because these aren't checked anywhere,
         * the value includes undefined since it will be that if
         * the key is not specified at all.
         *
         * This will always satisfy the zod schema: `z.record(z.string(), z.array(z.string()))`
         */
        queryParams: Record<string, string[] | undefined>;
        constructor(streamer: Streamer, 
        /** The array of Route tree nodes the request matched. */
        routePath: RouteMatch[], 
        /** The bodyformat that ended up taking precedence. This should be correctly typed. */
        bodyFormat: B, router: Router);
        /** type-narrowing helper function. This affects anywhere T is used. */
        isBodyFormat<T extends B, S extends {
            [K in B]: ServerRequest<K, M, D>;
        }[T]>(format: T): this is S;
        /**
         * Checks the request and response headers and calculates the appropriate
         * encoding to use for the response. This may be checked early if you
         * can only support a subset of normal encodings or have precompressed data.
         */
        acceptsEncoding(encoding: ('br' | 'gzip' | 'deflate' | 'identity')[]): "" | "deflate" | "gzip" | "br" | "identity" | "gzip-stream";
        /**
         *
         * Sends a **302** status code and **Location** header to the client.
         *
         * This will add the path prefix to the redirect path
         *
         * - **301 Moved Permanently:** The resource has been permanently moved to a new URL.
         * - **302 Found:** The resource is temporarily located at a different URL.
         * - **303 See Other:** Fetch the resource from another URI using a GET request.
         * - **307 Temporary Redirect:** The resource is temporarily located at a different URL; the same HTTP method should be used.
         * - **308 Permanent Redirect:** The resource has permanently moved; the client should use the new URL in future requests.
         */
        redirect(location: string): typeof STREAM_ENDED;
        readMultipartData(this: ServerRequest<"stream", any>, options: {
            cbPartStart: (part: MultipartPart) => void;
            cbPartChunk: (part: MultipartPart, chunk: Buffer) => void;
            cbPartEnd: (part: MultipartPart) => void;
        }): Promise<void>;
    }
}
declare module "packages/server/src/zodRoute" {
    import { JsonValue } from "packages/server/src/utils";
    import { BodyFormat } from "packages/server/src/router";
    import { ServerRequest } from "packages/server/src/StateObject";
    import { RouteDef } from "packages/server/src/router";
    import { Z2, zod as z } from "packages/server/src/Z2";
    import * as core from "zod/v4/core";
    export function zodRoute<M extends string, B extends "GET" | "HEAD" extends M ? "ignore" : BodyFormat, P extends Record<string, z.ZodType<any, string | undefined>>, Q extends Record<string, z.ZodType<any, string[] | undefined>>, T extends z.ZodTypeAny, R extends JsonValue>(route: Omit<ZodRoute<M, B, P, Q, T, R>, "registerError">): ZodRoute<M, B, P, Q, T, R>;
    export type FieldTypeGroups = "STRING" | "JSON";
    export interface ZodRoute<M extends string, B extends BodyFormat, P extends Record<string, z.ZodType<any, string | undefined>>, Q extends Record<string, z.ZodType<any, string[] | undefined>>, T extends z.ZodTypeAny, R extends JsonValue> {
        /**
         * The input will be `Record<string, string>`
         * If a path variable is not set in the request, the path will not match.
         *
         * Expects a Record of zod checks. Every path variable must be included.
         *
         * pathParams are parsed with `decodeURIComponent` one time before being passed to the zod check.
        */
        zodPathParams: (z: Z2<"STRING">) => P;
        /**
         * The input will be `Record<string, string[]>`.
         * If a value is not set, an empty string is used.
         *
         * Expects a Record of zod checks.
         *
         * The default behavior is to remove all query params.
         */
        zodQueryParams?: (z: Z2<"STRING">) => Q;
        /**
         * A zod check of the request body result.
         *
         * Only valid for `string`, `json`, and `www-form-urlencoded` body types
         *
         * The default is `undefined` for those types.
         */
        zodRequestBody?: (z: B extends "www-form-urlencoded" ? Z2<"STRING"> : B extends "json" ? Z2<"JSON"> : Z2<any>) => T;
        securityChecks?: RouteDef["securityChecks"];
        method: M[];
        path: string;
        bodyFormat: B;
        registerError: Error;
        inner: (state: {
            [K in M]: ZodState<K, B, P, Q, T>;
        }[M]) => Promise<R>;
    }
    export interface ZodState<M extends string, B extends BodyFormat, P extends Record<string, z.ZodType<any, string | undefined>>, Q extends Record<string, z.ZodType<any, string[] | undefined>>, T extends z.ZodTypeAny> extends ServerRequest<B, M, z.output<T>> {
        pathParams: z.output<z.ZodObject<P, core.$strict>> & Record<string, any>;
        queryParams: z.output<z.ZodObject<Q, core.$strict>> & Record<string, any>;
    }
    export type RouterRouteMap<T> = {
        [K in keyof T as T[K] extends ZodRoute<any, any, any, any, any, any> ? K : never]: T[K] extends ZodRoute<any, any, any, any, infer REQ, infer RES> ? ((data: z.input<REQ>) => Promise<jsonify<RES>>) : `${K & string} does not extend`;
    };
    export type jsonify<T> = T extends void ? null : T extends Promise<any> ? unknown : T extends Date ? string : T extends string | number | boolean | null | undefined ? T : T extends [...any[]] ? number extends T["length"] ? jsonify<T[number]>[] : [...jsonifyTuple<T>] : T extends Array<infer U> ? jsonify<U>[] : T extends object ? {
        [K in keyof T]: jsonify<T[K]>;
    } : unknown;
    export type jsonifyTuple<T> = T extends [infer A, ...infer B] ? [jsonify<A>, ...jsonifyTuple<B>] : T extends [infer A] ? [jsonify<A>] : [];
    export type RouterKeyMap<T, V> = {
        [K in keyof T as T[K] extends ZodRoute<any, any, any, any, any, any> ? K : never]: V;
    };
}
declare module "packages/server/src/Z2" {
    import * as z4 from "zod/v4";
    import { FieldTypeGroups } from "packages/server/src/zodRoute";
    export type _zod = typeof z4;
    export interface Z2<T extends FieldTypeGroups> extends _zod {
    }
    export { z4 as zod };
    export const Z2: Z2<any>;
}
declare module "packages/server/src/listeners" {
    import { IncomingMessage, Server, ServerResponse } from "node:http";
    import { Http2SecureServer, Http2ServerRequest, Http2ServerResponse } from "node:http2";
    import { Router } from "packages/server/src/router";
    export class ListenerBase {
        server: Http2SecureServer | Server;
        router: Router;
        bindInfo: string;
        options: ListenOptions;
        constructor(server: Http2SecureServer | Server, router: Router, bindInfo: string, options: ListenOptions);
        handleRequest(req: IncomingMessage | Http2ServerRequest, res: ServerResponse | Http2ServerResponse): void;
    }
    export class ListenerHTTPS extends ListenerBase {
        constructor(router: Router, config: ListenOptions);
    }
    export class ListenerHTTP extends ListenerBase {
        /** Create an http1 server */
        constructor(router: Router, config: ListenOptions);
    }
    export interface ListenOptions {
        port: string;
        host: string;
        prefix: string;
        secure: boolean;
        key?: string;
        cert?: string;
        redirect?: number;
    }
}
declare module "packages/server/src/router" {
    import { zod } from "packages/server/src/Z2";
    import { ServerRequest, ServerRequestClass } from "packages/server/src/StateObject";
    import { Streamer } from "packages/server/src/streamer";
    import { IncomingMessage, ServerResponse } from "node:http";
    import { Http2ServerRequest, Http2ServerResponse } from "node:http2";
    import { ListenOptions } from "packages/server/src/listeners";
    export interface AllowedRequestedWithHeaderKeys {
        fetch: true;
        XMLHttpRequest: true;
    }
    export class Router {
        rootRoute: ServerRoute;
        allowedRequestedWithHeaders: (keyof AllowedRequestedWithHeaderKeys)[];
        constructor(rootRoute: ServerRoute);
        handle(req: IncomingMessage | Http2ServerRequest, res: ServerResponse | Http2ServerResponse, options: ListenOptions): void;
        handleRequest(req: IncomingMessage | Http2ServerRequest, res: ServerResponse | Http2ServerResponse, options: ListenOptions): Promise<void>;
        handleStreamer(streamer: Streamer): Promise<void | typeof STREAM_ENDED>;
        /**
         * This is for overriding the server request that gets created. It is not async.
         * If you need to do anything substantial, use the server events.
         */
        createServerRequest<B extends BodyFormat>(streamer: Streamer, 
        /** The array of Route tree nodes the request matched. */
        routePath: RouteMatch[], 
        /** The bodyformat that ended up taking precedence. This should be correctly typed. */
        bodyFormat: B): ServerRequestClass<B, string, unknown>;
        handleRoute(state: ServerRequest<BodyFormat>, route: RouteMatch[]): Promise<void>;
        findRouteRecursive(routes: ServerRoute[], testPath: string, method: string | null, returnAll: boolean): RouteMatch[][];
        /**
         *
         * Top-level function that starts matching from the root routes.
         * Notice that the pathPrefix is assumed to have been handled beforehand.
         *
         * @param streamer
         * @returns The tree path matched
         */
        findRoute(streamer: Streamer): RouteMatch[];
    }
    export interface RouteMatch {
        route: ServerRoute;
        params: (string | undefined)[];
        remainingPath: string;
    }
    export const zodTransformJSON: (arg: string, ctx: zod.RefinementCtx<string>) => any;
    export const zodDecodeURIComponent: (arg: string, ctx: zod.RefinementCtx<string>) => string;
    export const BodyFormats: readonly ["stream", "string", "json", "buffer", "www-form-urlencoded", "www-form-urlencoded-urlsearchparams", "ignore"];
    export type BodyFormat = (typeof BodyFormats)[number];
    export interface RouteDef {
        /**
         * Regex to test the pathname on. It must start with `^`. If this is a child route,
         * it will be tested against the remaining portion of the parent route.
         */
        path: RegExp;
        pathParams?: string[];
        /**
         * The uppercase method names to match this route.
         *
         * If the array is empty and denyFinal is true, it will match all methods.
         *
         * If the array is empty and denyFinal is false, it will throw an error.
         */
        method: string[];
        /**
         * The highest bodyformat in the chain always takes precedent. Type-wise, only one is allowed,
         * but at runtime the first one found is the one used.
         *
         * Note that bodyFormat is completely ignored for GET and HEAD requests.
         */
        bodyFormat?: BodyFormat;
        /** If this route is the last one matched, it will NOT be called, and a 404 will be returned. */
        denyFinal?: boolean;
        securityChecks?: {
            /**
             * If true, the request must have the "x-requested-with" header set to keyof AllowedRequestedWithHeaderKeys.
             * This is a common way to check if the request is an AJAX request.
             * If the header is not set, the request will be rejected with a 403 Forbidden.
             *
             * @see {@link AllowedRequestedWithHeaderKeys}
             */
            requestedWithHeader?: boolean;
        };
    }
    export interface ServerRoute extends RouteDef {
        /**
         * If this route's handler sends headers, the matched child route will not be called.
         */
        handler: (state: ServerRequest) => Promise<typeof STREAM_ENDED>;
        /**
         * If the handler promise rejects, this function will be called as a second attempt.
         *
         * Same rules apply as for handler.
         */
        catchHandler?: (state: ServerRequest, error: any) => Promise<typeof STREAM_ENDED>;
        registerError: Error;
        /**
         * ### ROUTING
         *
         * @param route The route definition.
         *
         * If the parent route sends headers, or returns the STREAM_ENDED symbol,
         * this route will not be called.
         *
         * Inner routes are matched on the remaining portion of the parent route
         * using `pathname.slice(match[0].length)`. If the parent route entirely
         * matches the pathname, this route will be matched on "/".
         *
         * If the body format is "stream", "buffer", "ignore" or not yet defined at this level in the tree,
         * then zod cannot be used.
         *
         * Note that GET and HEAD are always bodyFormat: "ignore", regardless of what is set here.
         */
        defineRoute: (route: RouteDef, handler: (state: ServerRequest) => Promise<symbol | void>, catchHandler?: (state: ServerRequest, error: any) => Promise<symbol | void>) => ServerRoute;
    }
    export const ROOT_ROUTE: unique symbol;
    export function createRootRoute(method: string[], handler: (state: ServerRequest) => Promise<void>): ServerRoute;
}
declare module "packages/server/src/zodRegister" {
    import { ServerRequest } from "packages/server/src/StateObject";
    import { Z2 } from "packages/server/src/Z2";
    import { ServerRoute } from "packages/server/src/router";
    import { zod } from "packages/server/src/index";
    import * as core from "zod/v4/core";
    export const registerZodRoutes: (parent: ServerRoute, router: any, keys: string[]) => void;
    export function checkData<T extends core.$ZodType>(state: ServerRequest, zodRequestBody: (z: Z2<any>) => T, registerError: Error): asserts state is ServerRequest & {
        data: zod.infer<T>;
    };
    export function checkQuery<T extends {
        [x: string]: core.$ZodType<unknown, string[] | undefined>;
    }>(state: ServerRequest, zodQueryParams: (z: Z2<"STRING">) => T, registerError: Error): asserts state is ServerRequest & {
        queryParams: zod.infer<zod.ZodObject<T>>;
    };
    export function checkPath<T extends {
        [x: string]: core.$ZodType<unknown, string | undefined>;
    }>(state: ServerRequest, zodPathParams: (z: Z2<"STRING">) => T, registerError: Error): asserts state is ServerRequest & {
        pathParams: zod.infer<zod.ZodObject<T>>;
    };
}
declare module "packages/server/src/index" {
    import "packages/utils/src/index";
    import { Router, type RouteMatch } from "packages/server/src/router";
    import { ListenerHTTP, ListenerHTTPS, ListenOptions } from "packages/server/src/listeners";
    import type { Streamer } from "packages/server/src/streamer";
    import type { IncomingMessage, ServerResponse } from "http";
    import type { Http2ServerRequest, Http2ServerResponse } from "http2";
    import type { ServerRequest } from "packages/server/src/StateObject";
    import { Z2 } from "packages/server/src/Z2";
    export * from "packages/server/src/listeners";
    export * from "packages/server/src/router";
    export * from "packages/server/src/SendError";
    export * from "packages/server/src/StateObject";
    export * from "packages/server/src/streamer";
    export * from "packages/server/src/utils";
    export * from "packages/server/src/Z2";
    export * from "packages/server/src/zodRegister";
    export * from "packages/server/src/zodRoute";
    /**
     *
     * Runs the following events in order:
     * - `"zod.make"`
     */
    export function startup(): Promise<void>;
    export function startListening(router: Router, options?: Partial<ListenOptions>[]): Promise<(ListenerHTTPS | ListenerHTTP)[]>;
    module "packages/events/src/index" {
        interface ServerEventsMap {
            "zod.make": [zod: Z2<any>];
            "request.middleware": [router: Router, req: IncomingMessage | Http2ServerRequest, res: ServerResponse | Http2ServerResponse, options: ListenOptions];
            "request.streamer": [router: Router, streamer: Streamer];
            "request.state": [router: Router, state: ServerRequest, streamer: Streamer];
            "request.handle": [state: ServerRequest, route: RouteMatch[]];
            "request.fallback": [state: ServerRequest, route: RouteMatch[]];
            "exit": [];
        }
    }
    global {
        const STREAM_ENDED: unique symbol;
    }
}
declare module "packages/mws/src/services/PasswordService" {
    import { TypedGenerator } from "packages/server/src/index";
    export type PasswordService = Awaited<ReturnType<typeof createPasswordService>>;
    export function createPasswordService(serverSetup: string): Promise<{
        serverState: Map<string, TypedGenerator<LoginGeneratorStates>>;
        LoginGenerator: (args_0: {
            user_id: PrismaField<"Users", "user_id">;
            startLoginRequest: string;
            registrationRecord: string;
        }) => TypedGenerator<LoginGeneratorStates>;
        PasswordCreation: (userID: string, password: string) => Promise<string & {
            __prisma_table: "Users";
            __prisma_field: "password";
        }>;
        createRegistrationResponse: ({ userID, registrationRequest }: {
            userID: PrismaField<"Users", "user_id">;
            registrationRequest: string;
        }) => Promise<string>;
        startLoginSession: (stater: TypedGenerator<LoginGeneratorStates>) => Promise<string>;
        finishLoginSession: (loginSession: string) => Promise<TypedGenerator<LoginGeneratorStates> | undefined>;
    }>;
    type LoginGeneratorStates = [
        [
            void,
            loginResponse: string
        ],
        [
            finishLoginRequest: string,
            {
                user_id: PrismaField<"Users", "user_id">;
                session: {
                    sessionKey: string;
                } | undefined;
            }
        ]
    ];
}
declare module "packages/mws/src/services/cache" {
    import { TW } from "tiddlywiki";
    export function startupCache($tw: TW, cachePath: string): Promise<{
        pluginFiles: Map<string, string>;
        pluginHashes: Map<string, string>;
        filePlugins: Map<string, string>;
        requiredPlugins: string[];
        cachePath: string;
        prefix: Buffer<ArrayBuffer>;
        suffix: Buffer<ArrayBuffer>;
    }>;
    export type CacheState = ART<typeof startupCache>;
}
declare module "packages/mws/src/ServerState" {
    import { PrismaClient, Prisma } from "@tiddlywiki/mws-prisma";
    import { ITXClientDenyList } from "@tiddlywiki/mws-prisma/runtime/library";
    import { TW } from "tiddlywiki";
    import { createPasswordService } from "packages/mws/src/services/PasswordService";
    import { startupCache } from "packages/mws/src/services/cache";
    import { Types } from "@tiddlywiki/mws-prisma/runtime/library";
    /** This is an alias for ServerState in case we want to separate the two purposes. */
    export type SiteConfig = ServerState;
    export class ServerState {
        engine: PrismaEngineClient;
        PasswordService: PasswordService;
        pluginCache: TiddlerCache;
        constructor({ wikiPath, cachePath, storePath }: {
            wikiPath: string;
            cachePath: string;
            storePath: string;
        }, 
        /** The $tw instance needs to be disposable once commands are complete. */
        $tw: TW, engine: PrismaEngineClient, PasswordService: PasswordService, pluginCache: TiddlerCache);
        settings: {
            key: string;
            description: string;
            valueType: "string" | "boolean" | "number";
            value?: any;
        }[];
        init(): Promise<void>;
        initSettings(existing: Record<string, string>): Promise<void>;
        $transaction<R>(fn: (prisma: Omit<ServerState["engine"], ITXClientDenyList>) => Promise<R>, options?: {
            maxWait?: number;
            timeout?: number;
            isolationLevel?: Prisma.TransactionIsolationLevel;
        }): Promise<R>;
        $transactionTupleDebug<P extends Prisma.PrismaPromise<any>[]>(fn: (prisma: PrismaTxnClient) => [...P], options?: {
            isolationLevel?: Prisma.TransactionIsolationLevel;
        }): Promise<Types.Utils.UnwrapTuple<P>>;
        wikiPath: string;
        storePath: string;
        cachePath: string;
        versions: {
            tw5: any;
            mws: string;
        };
        setupRequired: boolean;
        enableExternalPlugins: boolean;
        enableGzip: boolean;
        attachmentsEnabled: boolean;
        attachmentSizeLimit: number;
        enableDevServer: boolean;
        enableDocsRoute: boolean;
        fieldModules: Record<string, import("tiddlywiki").TiddlerFieldModule>;
        contentTypeInfo: Record<string, ContentTypeInfo>;
        getContentType(type?: string): ContentTypeInfo;
    }
    global {
        type PrismaTxnClient = Omit<PrismaEngineClient, ITXClientDenyList>;
        type PrismaEngineClient = PrismaClient<Prisma.PrismaClientOptions, never, {
            result: {
                [T in Uncapitalize<Prisma.ModelName>]: {
                    [K in keyof PrismaPayloadScalars<Capitalize<T>>]: () => {
                        compute: () => PrismaField<Capitalize<T>, K>;
                    };
                };
            };
            client: {};
            model: {};
            query: {};
        }>;
    }
    export interface ContentTypeInfo {
        encoding: string;
        extension: string | string[];
        flags?: string[];
        deserializerType?: string;
    }
    export type PasswordService = ART<typeof createPasswordService>;
    export type TiddlerCache = ART<typeof startupCache>;
}
declare module "packages/mws/src/RequestState" {
    import { Prisma } from '@tiddlywiki/mws-prisma';
    import { Types } from '@tiddlywiki/mws-prisma/runtime/library';
    import { ServerState } from "packages/mws/src/ServerState";
    import { BodyFormat, RouteMatch, Router, ServerRequestClass, Streamer } from "packages/server/src/index";
    import { SendErrorReasonData } from "packages/server/src/index";
    export class StateObject<B extends BodyFormat = BodyFormat, M extends string = string, D = unknown> extends ServerRequestClass<B, M, D> {
        config: ServerState;
        user: import("packages/mws/src/services/sessions").AuthUser;
        engine: PrismaEngineClient;
        sendAdmin: (status: number, response: string) => Promise<typeof STREAM_ENDED>;
        asserted: boolean;
        PasswordService: {
            serverState: Map<string, import("packages/server/src/index").TypedGenerator<[[void, loginResponse: string], [finishLoginRequest: string, {
                user_id: PrismaField<"Users", "user_id">;
                session: {
                    sessionKey: string;
                } | undefined;
            }]]>>;
            LoginGenerator: (args_0: {
                user_id: PrismaField<"Users", "user_id">;
                startLoginRequest: string;
                registrationRecord: string;
            }) => import("packages/server/src/index").TypedGenerator<[[void, loginResponse: string], [finishLoginRequest: string, {
                user_id: PrismaField<"Users", "user_id">;
                session: {
                    sessionKey: string;
                } | undefined;
            }]]>;
            PasswordCreation: (userID: string, password: string) => Promise<string & {
                __prisma_table: "Users";
                __prisma_field: "password";
            }>;
            createRegistrationResponse: ({ userID, registrationRequest }: {
                userID: PrismaField<"Users", "user_id">;
                registrationRequest: string;
            }) => Promise<string>;
            startLoginSession: (stater: import("packages/server/src/index").TypedGenerator<[[void, loginResponse: string], [finishLoginRequest: string, {
                user_id: PrismaField<"Users", "user_id">;
                session: {
                    sessionKey: string;
                } | undefined;
            }]]>) => Promise<string>;
            finishLoginSession: (loginSession: string) => Promise<import("packages/server/src/index").TypedGenerator<[[void, loginResponse: string], [finishLoginRequest: string, {
                user_id: PrismaField<"Users", "user_id">;
                session: {
                    sessionKey: string;
                } | undefined;
            }]]> | undefined>;
        };
        pluginCache: {
            pluginFiles: Map<string, string>;
            pluginHashes: Map<string, string>;
            filePlugins: Map<string, string>;
            requiredPlugins: string[];
            cachePath: string;
            prefix: Buffer<ArrayBuffer>;
            suffix: Buffer<ArrayBuffer>;
        };
        constructor(streamer: Streamer, routePath: RouteMatch[], bodyFormat: B, router: Router);
        okUser(): void;
        okAdmin(): void;
        $transaction<T>(fn: (prisma: PrismaTxnClient) => Promise<T>): Promise<T>;
        $transactionTuple<P extends Prisma.PrismaPromise<any>[]>(arg: (prisma: ServerState["engine"]) => [...P], options?: {
            isolationLevel?: Prisma.TransactionIsolationLevel;
        }): Promise<Types.Utils.UnwrapTuple<P>>;
        sendError<ReasonStr extends keyof SendErrorReasonData>(reason: ReasonStr, status: SendErrorReasonData[ReasonStr]["status"], details: SendErrorReasonData[ReasonStr]["details"]): typeof STREAM_ENDED;
        makeTiddlerEtag(options: {
            bag_name: string;
            revision_id: string | number;
        }): string;
        getRecipeACL(recipe_name: PrismaField<"Recipes", "recipe_name">, needWrite: boolean): Promise<{
            recipe: {
                recipe_id: string & {
                    __prisma_table: "Recipes";
                    __prisma_field: "recipe_id";
                };
            } | null;
            canRead: unknown;
            canWrite: unknown;
            referer: (string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }) | undefined;
        }>;
        getRefererRecipe(): (string & {
            __prisma_table: "Recipes";
            __prisma_field: "recipe_name";
        }) | undefined;
        assertRecipeAccess(recipe_name: PrismaField<"Recipes", "recipe_name">, needWrite: boolean): Promise<{
            recipe_id: string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_id";
            };
        }>;
        assertBagAccess(bag_name: PrismaField<"Bags", "bag_name">, needWrite: boolean): Promise<{
            owner_id: PrismaField<"Bags", "owner_id">;
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
        }>;
        getBagACL(bag_name: PrismaField<"Bags", "bag_name">, needWrite: boolean): Promise<{
            bag: {
                owner_id: PrismaField<"Bags", "owner_id">;
                bag_id: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_id";
                };
            } | null;
            canRead: unknown;
            canWrite: unknown;
        }>;
        /** If the user isn't logged in, user_id is 0. */
        getBagWhereACL({ recipe_id, permission, user_id, role_ids }: {
            /** Recipe ID can be provided as an extra restriction */
            recipe_id?: string;
            permission: ACLPermissionName;
            user_id: string;
            role_ids: string[];
        }): ({
            owner_id: {
                equals: string;
                not: null;
            };
            acl?: undefined;
        } | {
            acl: {
                some: {
                    permission: {
                        in: ("READ" | "WRITE" | "ADMIN")[];
                    };
                    role_id: {
                        in: string[];
                    };
                };
            };
            owner_id?: undefined;
        } | {
            owner_id: {
                equals: null;
                not: null;
            };
            acl?: undefined;
        } | {
            recipe_bags: {
                some: {
                    position: number | undefined;
                    recipe: {
                        OR: ({
                            owner_id: {
                                equals: string;
                                not: null;
                            };
                            acl?: undefined;
                        } | {
                            acl: {
                                some: {
                                    permission: {
                                        in: ("READ" | "WRITE" | "ADMIN")[];
                                    };
                                    role_id: {
                                        in: string[];
                                    };
                                };
                            };
                            owner_id?: undefined;
                        } | {
                            owner_id: {
                                equals: null;
                                not: null;
                            };
                            acl?: undefined;
                        })[];
                    };
                    with_acl: true;
                    recipe_id: string | undefined;
                };
            };
        })[];
        getWhereACL({ permission, user_id, role_ids }: {
            permission: ACLPermissionName;
            user_id?: string;
            role_ids?: string[];
        }): ({
            owner_id: {
                equals: string;
                not: null;
            };
            acl?: undefined;
        } | {
            acl: {
                some: {
                    permission: {
                        in: ("READ" | "WRITE" | "ADMIN")[];
                    };
                    role_id: {
                        in: string[];
                    };
                };
            };
            owner_id?: undefined;
        } | {
            owner_id: {
                equals: null;
                not: null;
            };
            acl?: undefined;
        })[];
    }
    export type ACLPermissionName = "READ" | "WRITE" | "ADMIN";
}
declare module "packages/mws/src/SendError" {
    import { SendErrorItem } from "packages/server/src/index";
    module "packages/server/src/index" {
        interface SendErrorReasonData {
            "RECIPE_NOT_FOUND": SendErrorItem<404, {
                recipeName: string;
            }>;
            "RECIPE_NO_READ_PERMISSION": SendErrorItem<403, {
                recipeName: string;
            }>;
            "RECIPE_NO_WRITE_PERMISSION": SendErrorItem<403, {
                recipeName: string;
            }>;
            "RECIPE_MUST_HAVE_BAGS": SendErrorItem<400, {
                recipeName: string;
            }>;
            "RECIPE_NO_BAG_AT_POSITION_ZERO": SendErrorItem<403, {
                recipeName: string;
            }>;
            "BAG_NOT_FOUND": SendErrorItem<404, {
                bagName: string;
            }>;
            "BAG_NO_READ_PERMISSION": SendErrorItem<403, {
                bagName: string;
            }>;
            "BAG_NO_WRITE_PERMISSION": SendErrorItem<403, {
                bagName: string;
            }>;
            "BAG_DOES_NOT_HAVE_THIS_TIDDLER": SendErrorItem<403, {
                bagName: string;
                tiddlerTitle: string;
            }>;
            "PAGE_NOT_AUTHORIZED_FOR_ENDPOINT": SendErrorItem<403, null>;
            "RESPONSE_INTERCEPTED_BY_CHECKER": SendErrorItem<500, null>;
            "TIDDLER_WIRE_FORMAT_UNKNOWN": SendErrorItem<403, {
                contentType: string;
            }>;
            "SETTING_KEY_INVALID": SendErrorItem<403, {
                key: string;
            }>;
            "LAST_EVENT_ID_NOT_PROVIDED": SendErrorItem<403, null>;
        }
    }
}
declare module "packages/mws/src/globals" {
    import type { Prisma } from "@tiddlywiki/mws-prisma";
    global {
        namespace PrismaJson {
            type Recipes_plugin_names = string[];
            type Recipe_bags_partitioned_bags = {
                /** partitioned bags allow each user with write access to write to `${title_prefix}${username}` */
                title_prefix: string;
                /**
                 * everyone with acl read can read all tiddlers
                 *
                 * if this is false, admins can still do this, but they will be in a restricted readonly mode.
                 */
                everyone_readable: boolean;
                /**
                 * everyone with acl write can write normal tiddlers.
                 *
                 * site and entity admins can always do this.
                 */
                normally_writable: boolean;
            };
        }
    }
    global {
        /**
         * This primarily makes sure that positional arguments are used correctly
         * (so you can't switch a title and bag_name around).
         *
         * If you assign the wrong value (like `5 as PrismaField<"Bags", "bag_name">`),
         * this will result in a type error on the as keyword, allowing you to catch incorrect types quickly.
        */
        type PrismaField<T extends Prisma.ModelName, K extends keyof PrismaPayloadScalars<T>> = ([
            T,
            K
        ] extends ["Tiddlers", "bag_id"] ? PrismaField<"Bags", "bag_id"> : [
            T,
            K
        ] extends ["Sessions", "user_id"] ? PrismaField<"Users", "user_id"> : [
            T,
            K
        ] extends ["Recipe_bags", "bag_id"] ? PrismaField<"Bags", "bag_id"> : [
            T,
            K
        ] extends ["Recipe_bags", "recipe_id"] ? PrismaField<"Recipes", "recipe_id"> : [
            T,
            K
        ] extends ["Recipes", "owner_id"] ? PrismaField<"Users", "user_id"> : [
            T,
            K
        ] extends ["Bags", "owner_id"] ? PrismaField<"Users", "user_id"> : (PrismaPayloadScalars<T>[K] & {
            __prisma_table: T;
            __prisma_field: K;
        })) | (null extends PrismaPayloadScalars<T>[K] ? null : never);
        type PrismaPayloadScalars<T extends Prisma.ModelName> = Prisma.TypeMap["model"][T]["payload"]["scalars"];
    }
    export {};
}
declare module "packages/mws/src/services/sessions" {
    import { jsonify, JsonValue, RouterKeyMap, ServerRoute, Streamer, Z2, zod, ZodRoute, ZodState } from "packages/server/src/index";
    import { ServerState } from "packages/mws/src/ServerState";
    export interface AuthUser {
        /** User ID. 0 if the user is not logged in. */
        user_id: PrismaField<"Users", "user_id">;
        /** User role_ids. This may have length even if the user isn't logged in, to allow ACL for anon. */
        role_ids: PrismaField<"Roles", "role_id">[];
        /** Username passed to the client */
        username: PrismaField<"Users", "username">;
        /** A session_id isn't guarenteed. There may be a session even if the user isn't logged in, and may not be even if they are, depending on the the situation. */
        sessionId: PrismaField<"Sessions", "session_id"> | undefined;
        /** Is this user considered a site-admin. This is determined by the auth service, not MWS. */
        isAdmin: boolean;
        /** Is the user logged in? This also means that user_id should be 0. role_ids may still be specified. */
        isLoggedIn: boolean;
    }
    export const SessionKeyMap: RouterKeyMap<SessionManager, true>;
    /**
     *
     * @param path path starting with a forward slash
     * @param zodRequest the zod for state.data
     * @param inner the handler to call
     * @returns the ZodRoute
     */
    export function zodSession<P extends string, T extends zod.ZodTypeAny, R extends JsonValue>(path: P, zodRequest: (z: Z2<"JSON">) => T, inner: (state: ZodState<"POST", "json", {}, {}, T>, prisma: PrismaTxnClient) => Promise<R>): ZodSessionRoute<P, T, R>;
    export interface ZodSessionRoute<PATH extends string, T extends zod.ZodTypeAny, R extends JsonValue> extends ZodRoute<"POST", "json", {}, {}, T, R> {
        path: PATH;
    }
    export type RouterPathRouteMap<T> = {
        [K in keyof T as T[K] extends ZodSessionRoute<any, any, any> ? K : never]: T[K] extends ZodSessionRoute<infer P, infer REQ, infer RES> ? {
            (data: zod.input<REQ>): Promise<jsonify<RES>>;
            path: P;
            key: K;
        } : never;
    };
    export type SessionManagerMap = RouterPathRouteMap<SessionManager>;
    export class SessionManager {
        static defineRoutes(root: ServerRoute): void;
        static parseIncomingRequest(streamer: Streamer, config: ServerState): Promise<AuthUser>;
        login1: ZodSessionRoute<"/login/1", zod.ZodObject<{
            username: zod.ZodType<string & {
                __prisma_table: "Users";
                __prisma_field: "username";
            }, string, zod.z.core.$ZodTypeInternals<string & {
                __prisma_table: "Users";
                __prisma_field: "username";
            }, string>>;
            startLoginRequest: zod.ZodString;
        }, zod.z.core.$strip>, {
            loginResponse: string;
            loginSession: string;
        }>;
        login2: ZodSessionRoute<"/login/2", zod.ZodObject<{
            finishLoginRequest: zod.ZodString;
            loginSession: zod.ZodString;
            skipCookie: zod.ZodDefault<zod.ZodOptional<zod.ZodBoolean>>;
        }, zod.z.core.$strip>, {
            user_id: string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            };
            session_id: string & {
                __prisma_table: "Sessions";
                __prisma_field: "session_id";
            };
        }>;
        logout: ZodSessionRoute<"/logout", zod.ZodOptional<zod.ZodObject<{
            session_id: zod.ZodString;
            signature: zod.ZodString;
            skipCookie: zod.ZodBoolean;
        }, zod.z.core.$strip>>, null>;
    }
    export function assertSignature({ session_id, signature, session_key }: {
        session_id: string;
        signature: string;
        session_key: string;
    }): void;
}
declare module "packages/mws/src/services/setupDevServer" {
    import { ServerState } from "packages/mws/src/ServerState";
    import { ServerRequest } from "packages/server/src/index";
    export function setupDevServer(config: ServerState): Promise<(state: ServerRequest, status: number, serverResponse: string) => Promise<typeof STREAM_ENDED>>;
    export function esbuildStartup(): Promise<{
        ctx: import("esbuild").BuildContext<{
            entryPoints: string[];
            bundle: true;
            target: string;
            platform: "browser";
            jsx: "automatic";
            outdir: string;
            minify: true;
            sourcemap: true;
            metafile: true;
            splitting: true;
            format: "esm";
        }>;
        port: number;
        result: import("esbuild").BuildResult<{
            entryPoints: string[];
            bundle: true;
            target: string;
            platform: "browser";
            jsx: "automatic";
            outdir: string;
            minify: true;
            sourcemap: true;
            metafile: true;
            splitting: true;
            format: "esm";
        }>;
        rootdir: string;
        publicdir: string;
    }>;
}
declare module "packages/mws/src/registerRequest" {
    import { Router, ServerRoute, BodyFormat } from "packages/server/src/index";
    import { StateObject } from "packages/mws/src/RequestState";
    import { ServerState } from "packages/mws/src/ServerState";
    import { AuthUser } from "packages/mws/src/services/sessions";
    import { setupDevServer } from "packages/mws/src/services/setupDevServer";
    import helmet from "helmet";
    module "packages/events/src/index" {
        /**
         * - "mws.router.init" event is emitted after setting the augmentations on Router.
         */
        interface ServerEventsMap {
            "mws.router.init": [router: Router];
            "mws.routes.important": [root: ServerRoute, config: ServerState];
            "mws.routes": [root: ServerRoute, config: ServerState];
            "mws.routes.fallback": [root: ServerRoute, config: ServerState];
        }
    }
    module "packages/server/src/index" {
        interface ServerRequest<B extends BodyFormat = BodyFormat, M extends string = string, D = unknown> extends StateObject<B, M, D> {
        }
        interface Router {
            config: ServerState;
            sendAdmin: ART<typeof setupDevServer>;
            helmet: ART<typeof helmet>;
        }
        interface Streamer {
            user: AuthUser;
        }
        interface AllowedRequestedWithHeaderKeys {
            TiddlyWiki: true;
        }
    }
}
declare module "packages/mws/src/db/sqlite-adapter" {
    import { SqlDriverAdapter, SqlMigrationAwareDriverAdapterFactory } from "@prisma/driver-adapter-utils";
    export class SqliteAdapter {
        private databasePath;
        private isDevMode;
        constructor(databasePath: string, isDevMode: boolean);
        adapter: SqlMigrationAwareDriverAdapterFactory;
        init(): Promise<void>;
        createMigrationsTable(libsql: SqlDriverAdapter): Promise<void>;
        checkMigrationsTable(libsql: SqlDriverAdapter, migrateExisting: boolean, applied_migrations: Set<string>, prismaFolder: string, initMigration: string): Promise<void>;
    }
}
declare module "packages/mws/src/services/tiddlywiki" {
    module "tiddlywiki" {
        interface TWUtils {
            eachAsync: (array: any[], callback: (item: any, index: number) => Promise<void>) => Promise<void>;
        }
        interface TWBoot {
        }
    }
    export function bootTiddlyWiki(wikiPath: string): Promise<import("tiddlywiki").TW>;
}
declare module "packages/mws/src/registerStartup" {
    import { TW } from "tiddlywiki";
    import { SqliteAdapter } from "packages/mws/src/db/sqlite-adapter";
    import { ServerState, TiddlerCache } from "packages/mws/src/ServerState";
    module "packages/events/src/index" {
        interface ServerEventsMap {
            "mws.config.init.before": [config: ServerState, $tw: TW];
            "mws.config.init.after": [config: ServerState, $tw: TW];
            "mws.adapter.init.before": [adapter: SqliteAdapter];
            "mws.adapter.init.after": [adapter: SqliteAdapter];
            "mws.cache.init.before": [cachePath: string, $tw: TW];
            "mws.cache.init.after": [cache: TiddlerCache, $tw: TW];
        }
    }
    module "packages/commander/src/index" {
        interface BaseCommand {
            config: ServerState;
            $tw: TW;
        }
    }
}
declare module "packages/mws/src/managers/TiddlerStore" {
    import { TiddlerFields } from "tiddlywiki";
    /**
     *
      @example
    
      const store = new TiddlerStore_PrismaBase(this.config.engine);
      await this.config.engine.$transaction(
        store.saveTiddlersFromPath_PrismaArray(...)
      );
    
      await this.config.engine.$transaction(async (prisma) => {
        const store = new TiddlerStore_PrismaTransaction(prisma);
        // use the store here
      });
     */
    export class TiddlerStore_PrismaBase {
        prisma: PrismaTxnClient;
        constructor(prisma: PrismaTxnClient);
        validateItemName(name: string, allowPrivilegedCharacters: boolean): "Not a valid string" | "Too long" | "Invalid character(s)" | null;
        validateItemNames(names: string[], allowPrivilegedCharacters: boolean): string | null;
        upsertRecipe_PrismaArray(recipe_name: PrismaField<"Recipes", "recipe_name">, description: PrismaField<"Recipes", "description">, bags: {
            bag_id: PrismaField<"Bags", "bag_id">;
            with_acl: PrismaField<"Recipe_bags", "with_acl">;
        }[], plugin_names: string[], { allowPrivilegedCharacters }?: {
            allowPrivilegedCharacters?: boolean;
        }): [import("@tiddlywiki/mws-prisma").Prisma.Prisma__RecipesClient<{
            recipe_id: string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_id";
            };
        }, never, {
            result: { [T in Uncapitalize<import("@tiddlywiki/mws-prisma").Prisma.ModelName>]: { [K in keyof PrismaPayloadScalars<Capitalize<T>>]: () => {
                compute: () => PrismaField<Capitalize<T>, K>;
            }; }; };
            client: {};
            model: {};
            query: {};
        }, import("@tiddlywiki/mws-prisma").Prisma.PrismaClientOptions>, import("@tiddlywiki/mws-prisma").Prisma.Prisma__RecipesClient<{
            description: string & {
                __prisma_table: "Recipes";
                __prisma_field: "description";
            };
            recipe_id: string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_id";
            };
            recipe_name: string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            };
            owner_id: PrismaField<"Recipes", "owner_id">;
            plugin_names: PrismaJson.Recipes_plugin_names & {
                __prisma_table: "Recipes";
                __prisma_field: "plugin_names";
            };
            skip_required_plugins: PrismaField<"Recipes", "skip_required_plugins">;
            skip_core: PrismaField<"Recipes", "skip_core">;
            preload_store: PrismaField<"Recipes", "preload_store">;
            custom_wiki: PrismaField<"Recipes", "custom_wiki">;
        }, never, {
            result: { [T in Uncapitalize<import("@tiddlywiki/mws-prisma").Prisma.ModelName>]: { [K in keyof PrismaPayloadScalars<Capitalize<T>>]: () => {
                compute: () => PrismaField<Capitalize<T>, K>;
            }; }; };
            client: {};
            model: {};
            query: {};
        }, import("@tiddlywiki/mws-prisma").Prisma.PrismaClientOptions>];
        upsertBag_PrismaPromise(bag_name: PrismaField<"Bags", "bag_name">, description: PrismaField<"Bags", "description">, { allowPrivilegedCharacters }?: {
            allowPrivilegedCharacters?: boolean;
        }): import("@tiddlywiki/mws-prisma").Prisma.Prisma__BagsClient<{
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
        }, never, {
            result: { [T in Uncapitalize<import("@tiddlywiki/mws-prisma").Prisma.ModelName>]: { [K in keyof PrismaPayloadScalars<Capitalize<T>>]: () => {
                compute: () => PrismaField<Capitalize<T>, K>;
            }; }; };
            client: {};
            model: {};
            query: {};
        }, import("@tiddlywiki/mws-prisma").Prisma.PrismaClientOptions>;
        saveTiddlersFromPath_PrismaArray(bag_id: PrismaField<"Bags", "bag_id">, tiddlers: TiddlerFields[]): [import("@tiddlywiki/mws-prisma").Prisma.PrismaPromise<import("@tiddlywiki/mws-prisma").Prisma.BatchPayload>, ...(import("@tiddlywiki/mws-prisma").Prisma.PrismaPromise<import("@tiddlywiki/mws-prisma").Prisma.BatchPayload> | import("@tiddlywiki/mws-prisma").Prisma.Prisma__TiddlersClient<{
            bag: {
                bag_id: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_id";
                };
                bag_name: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_name";
                };
            };
        } & {
            title: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            };
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            revision_id: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            };
            is_deleted: PrismaField<"Tiddlers", "is_deleted">;
            attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
        }, never, {
            result: { [T in Uncapitalize<import("@tiddlywiki/mws-prisma").Prisma.ModelName>]: { [K in keyof PrismaPayloadScalars<Capitalize<T>>]: () => {
                compute: () => PrismaField<Capitalize<T>, K>;
            }; }; };
            client: {};
            model: {};
            query: {};
        }, import("@tiddlywiki/mws-prisma").Prisma.PrismaClientOptions>)[]];
        saveBagTiddlerFields_PrismaArray(tiddlerFields: TiddlerFields, bag_id: PrismaField<"Bags", "bag_id">, attachment_hash: PrismaField<"Tiddlers", "attachment_hash">): [import("@tiddlywiki/mws-prisma").Prisma.PrismaPromise<import("@tiddlywiki/mws-prisma").Prisma.BatchPayload>, import("@tiddlywiki/mws-prisma").Prisma.Prisma__TiddlersClient<{
            bag: {
                bag_id: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_id";
                };
                bag_name: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_name";
                };
            };
        } & {
            title: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            };
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            revision_id: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            };
            is_deleted: PrismaField<"Tiddlers", "is_deleted">;
            attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
        }, never, {
            result: { [T in Uncapitalize<import("@tiddlywiki/mws-prisma").Prisma.ModelName>]: { [K in keyof PrismaPayloadScalars<Capitalize<T>>]: () => {
                compute: () => PrismaField<Capitalize<T>, K>;
            }; }; };
            client: {};
            model: {};
            query: {};
        }, import("@tiddlywiki/mws-prisma").Prisma.PrismaClientOptions>];
        /**
          Returns {revision_id:} of the delete marker
          */
        deleteBagTiddler_PrismaArray(bag_id: PrismaField<"Bags", "bag_id">, title: PrismaField<"Tiddlers", "title">): [import("@tiddlywiki/mws-prisma").Prisma.PrismaPromise<import("@tiddlywiki/mws-prisma").Prisma.BatchPayload>, import("@tiddlywiki/mws-prisma").Prisma.Prisma__TiddlersClient<{
            title: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            };
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            revision_id: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            };
            is_deleted: PrismaField<"Tiddlers", "is_deleted">;
            attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
        }, never, {
            result: { [T in Uncapitalize<import("@tiddlywiki/mws-prisma").Prisma.ModelName>]: { [K in keyof PrismaPayloadScalars<Capitalize<T>>]: () => {
                compute: () => PrismaField<Capitalize<T>, K>;
            }; }; };
            client: {};
            model: {};
            query: {};
        }, import("@tiddlywiki/mws-prisma").Prisma.PrismaClientOptions>];
    }
    export class TiddlerStore_PrismaTransaction extends TiddlerStore_PrismaBase {
        prisma: PrismaTxnClient;
        constructor(prisma: PrismaTxnClient);
        saveBagTiddlerFields(tiddlerFields: TiddlerFields, bag_id: PrismaField<"Bags", "bag_id">, attachment_hash: PrismaField<"Tiddlers", "attachment_hash">): Promise<{
            bag: {
                bag_id: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_id";
                };
                bag_name: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_name";
                };
            };
        } & {
            title: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            };
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            revision_id: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            };
            is_deleted: PrismaField<"Tiddlers", "is_deleted">;
            attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
        }>;
        deleteBagTiddler(bag_id: PrismaField<"Bags", "bag_id">, title: PrismaField<"Tiddlers", "title">): Promise<{
            title: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            };
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            revision_id: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            };
            is_deleted: PrismaField<"Tiddlers", "is_deleted">;
            attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
        }>;
        /**
        * Get the writable bag for the specified recipe.
        *
        * If title is specified, the tiddler will be included in bag.tiddlers, if it exists.
        *
        * The bag will still be returned even if the tiddler does not exist.
        */
        getRecipeWritableBag(recipe_name: PrismaField<"Recipes", "recipe_name">, title?: PrismaField<"Tiddlers", "title">): Promise<{
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            bag_name: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            };
            tiddlers: {
                title: string & {
                    __prisma_table: "Tiddlers";
                    __prisma_field: "title";
                };
                bag_id: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_id";
                };
                revision_id: string & {
                    __prisma_table: "Tiddlers";
                    __prisma_field: "revision_id";
                };
                is_deleted: PrismaField<"Tiddlers", "is_deleted">;
                attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
            }[];
        }>;
        getRecipeBagWithTiddler({ recipe_name, title }: {
            recipe_name: string;
            title: string;
        }): Promise<({
            recipe: {
                description: string & {
                    __prisma_table: "Recipes";
                    __prisma_field: "description";
                };
                recipe_id: string & {
                    __prisma_table: "Recipes";
                    __prisma_field: "recipe_id";
                };
                recipe_name: string & {
                    __prisma_table: "Recipes";
                    __prisma_field: "recipe_name";
                };
                owner_id: PrismaField<"Recipes", "owner_id">;
                plugin_names: PrismaJson.Recipes_plugin_names & {
                    __prisma_table: "Recipes";
                    __prisma_field: "plugin_names";
                };
                skip_required_plugins: PrismaField<"Recipes", "skip_required_plugins">;
                skip_core: PrismaField<"Recipes", "skip_core">;
                preload_store: PrismaField<"Recipes", "preload_store">;
                custom_wiki: PrismaField<"Recipes", "custom_wiki">;
            };
            bag: {
                description: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "description";
                };
                owner_id: PrismaField<"Bags", "owner_id">;
                bag_id: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_id";
                };
                bag_name: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_name";
                };
            };
        } & {
            position: number & {
                __prisma_table: "Recipe_bags";
                __prisma_field: "position";
            };
            recipe_id: string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_id";
            };
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            with_acl: PrismaField<"Recipe_bags", "with_acl">;
            load_modules: PrismaField<"Recipe_bags", "load_modules">;
        }) | null>;
        getRecipeBags(recipe_name: PrismaField<"Recipes", "recipe_name">): Promise<{
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            bag_name: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            };
            position: number & {
                __prisma_table: "Recipe_bags";
                __prisma_field: "position";
            };
        }[]>;
        getBagTiddlers(bag_name: PrismaField<"Bags", "bag_name">, options?: {
            last_known_revision_id?: PrismaField<"Tiddlers", "revision_id">;
            include_deleted?: boolean;
        }): Promise<{
            bag_id: string;
            bag_name: string;
            tiddlers: {
                title: string;
                revision_id: string;
                is_deleted: boolean;
            }[];
        }>;
        getBagTiddlers_PrismaQuery(bag_name: PrismaField<"Bags", "bag_name">, options?: {
            last_known_revision_id?: PrismaField<"Tiddlers", "revision_id">;
            include_deleted?: boolean;
        }): import("@tiddlywiki/mws-prisma").Prisma.Prisma__BagsClient<{
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            bag_name: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            };
            tiddlers: {
                title: string & {
                    __prisma_table: "Tiddlers";
                    __prisma_field: "title";
                };
                revision_id: string & {
                    __prisma_table: "Tiddlers";
                    __prisma_field: "revision_id";
                };
                is_deleted: PrismaField<"Tiddlers", "is_deleted">;
            }[];
        } | null, null, {
            result: { [T in Uncapitalize<import("@tiddlywiki/mws-prisma").Prisma.ModelName>]: { [K in keyof PrismaPayloadScalars<Capitalize<T>>]: () => {
                compute: () => PrismaField<Capitalize<T>, K>;
            }; }; };
            client: {};
            model: {};
            query: {};
        }, import("@tiddlywiki/mws-prisma").Prisma.PrismaClientOptions>;
    }
}
declare module "packages/mws/src/commands/load-wiki-folder" {
    import { BaseCommand, CommandInfo } from "packages/commander/src/index";
    export const info: CommandInfo;
    export class Command extends BaseCommand<[string], {
        "bag-name"?: string[];
        "bag-description"?: string[];
        "recipe-name"?: string[];
        "recipe-description"?: string[];
        "overwrite"?: boolean;
    }> {
        execute(): Promise<null | undefined>;
    }
}
declare module "packages/mws/src/commands/save-archive" {
    import { BaseCommand, CommandInfo } from "packages/commander/src/index";
    export const info: CommandInfo;
    export class Command extends BaseCommand {
        get archivePath(): string;
        prisma?: PrismaTxnClient;
        execute(): Promise<null>;
        getRecipes(): Promise<({
            recipe_bags: {
                position: number & {
                    __prisma_table: "Recipe_bags";
                    __prisma_field: "position";
                };
                recipe_id: string & {
                    __prisma_table: "Recipes";
                    __prisma_field: "recipe_id";
                };
                bag_id: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_id";
                };
                with_acl: PrismaField<"Recipe_bags", "with_acl">;
                load_modules: PrismaField<"Recipe_bags", "load_modules">;
            }[];
            acl: {
                recipe_id: string & {
                    __prisma_table: "RecipeAcl";
                    __prisma_field: "recipe_id";
                };
                acl_id: number & {
                    __prisma_table: "RecipeAcl";
                    __prisma_field: "acl_id";
                };
                role_id: string & {
                    __prisma_table: "RecipeAcl";
                    __prisma_field: "role_id";
                };
                permission: PrismaField<"RecipeAcl", "permission">;
            }[];
        } & {
            description: string & {
                __prisma_table: "Recipes";
                __prisma_field: "description";
            };
            recipe_id: string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_id";
            };
            recipe_name: string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            };
            owner_id: PrismaField<"Recipes", "owner_id">;
            plugin_names: PrismaJson.Recipes_plugin_names & {
                __prisma_table: "Recipes";
                __prisma_field: "plugin_names";
            };
            skip_required_plugins: PrismaField<"Recipes", "skip_required_plugins">;
            skip_core: PrismaField<"Recipes", "skip_core">;
            preload_store: PrismaField<"Recipes", "preload_store">;
            custom_wiki: PrismaField<"Recipes", "custom_wiki">;
        })[]>;
        getBags(): Promise<{
            tiddlers: {
                fields: {
                    [k: string]: string & {
                        __prisma_table: "Fields";
                        __prisma_field: "field_value";
                    };
                };
                title: string & {
                    __prisma_table: "Tiddlers";
                    __prisma_field: "title";
                };
                bag_id: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_id";
                };
                revision_id: string & {
                    __prisma_table: "Tiddlers";
                    __prisma_field: "revision_id";
                };
                is_deleted: PrismaField<"Tiddlers", "is_deleted">;
                attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
            }[];
            acl: {
                acl_id: number & {
                    __prisma_table: "BagAcl";
                    __prisma_field: "acl_id";
                };
                role_id: string & {
                    __prisma_table: "BagAcl";
                    __prisma_field: "role_id";
                };
                permission: PrismaField<"BagAcl", "permission">;
                bag_id: string & {
                    __prisma_table: "BagAcl";
                    __prisma_field: "bag_id";
                };
            }[];
            description: string & {
                __prisma_table: "Bags";
                __prisma_field: "description";
            };
            owner_id: PrismaField<"Bags", "owner_id">;
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            bag_name: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            };
        }[]>;
        getUsers(): Promise<({
            roles: {
                description: PrismaField<"Roles", "description">;
                role_id: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                };
                role_name: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_name";
                };
            }[];
            sessions: {
                session_id: string & {
                    __prisma_table: "Sessions";
                    __prisma_field: "session_id";
                };
                user_id: string & {
                    __prisma_table: "Users";
                    __prisma_field: "user_id";
                };
                created_at: Date & {
                    __prisma_table: "Sessions";
                    __prisma_field: "created_at";
                };
                last_accessed: Date & {
                    __prisma_table: "Sessions";
                    __prisma_field: "last_accessed";
                };
                session_key: PrismaField<"Sessions", "session_key">;
            }[];
        } & {
            username: string & {
                __prisma_table: "Users";
                __prisma_field: "username";
            };
            email: string & {
                __prisma_table: "Users";
                __prisma_field: "email";
            };
            user_id: string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            };
            password: string & {
                __prisma_table: "Users";
                __prisma_field: "password";
            };
            created_at: Date & {
                __prisma_table: "Users";
                __prisma_field: "created_at";
            };
            last_login: PrismaField<"Users", "last_login">;
        })[]>;
        getRoles(): Promise<{
            description: PrismaField<"Roles", "description">;
            role_id: string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            };
            role_name: string & {
                __prisma_table: "Roles";
                __prisma_field: "role_name";
            };
        }[]>;
        saveArchive(): Promise<void>;
    }
}
declare module "packages/mws/src/commands/load-archive" {
    import { BaseCommand, CommandInfo } from "packages/commander/src/index";
    export const info: CommandInfo;
    export class Command extends BaseCommand {
        execute(): Promise<void>;
    }
    /**
     * This is copied in from the tsup build types for this command, although built with
     * a modified PrismaField. This should represent the last form of the version 2
     * archive.
     */
    export interface Archiver2Saves {
        getRecipes(): Promise<({
            recipe_bags: {
                recipe_id: number;
                bag_id: number;
                with_acl: boolean;
                position: number;
            }[];
            acl: {
                role_id: number;
                recipe_id: number;
                permission: "READ" | "WRITE" | "ADMIN";
                acl_id: number;
            }[];
        } & {
            description: string;
            recipe_name: string;
            recipe_id: number;
            owner_id: number | null;
        })[]>;
        getBags(): Promise<{
            tiddlers: {
                fields: {
                    [k: string]: string;
                };
                bag_id: number;
                title: string;
                tiddler_id: number;
                is_deleted: boolean;
                attachment_hash: string | null;
            }[];
            acl: {
                role_id: number;
                bag_id: number;
                permission: "READ" | "WRITE" | "ADMIN";
                acl_id: number;
            }[];
            description: string;
            owner_id: number | null;
            bag_id: number;
            bag_name: string;
            is_plugin: boolean;
        }[]>;
        getUsers(): Promise<({
            roles: {
                role_id: number;
                role_name: string;
                description: string | null;
            }[];
            sessions: {
                user_id: number;
                created_at: Date;
                session_id: string;
                last_accessed: Date;
                session_key: string | null;
            }[];
            groups: {
                description: string | null;
                group_id: number;
                group_name: string;
            }[];
        } & {
            user_id: number;
            username: string;
            email: string;
            password: string;
            created_at: Date;
            last_login: Date | null;
        })[]>;
        getGroups(): Promise<({
            roles: {
                role_id: number;
                role_name: string;
                description: string | null;
            }[];
        } & {
            description: string | null;
            group_id: number;
            group_name: string;
        })[]>;
        getRoles(): Promise<{
            role_id: number;
            role_name: string;
            description: string | null;
        }[]>;
    }
}
declare module "packages/mws/src/commands/init-store" {
    import { BaseCommand, CommandInfo } from "packages/commander/src/index";
    export const info: CommandInfo;
    export class Command extends BaseCommand {
        execute(): Promise<any>;
        setupStore(): Promise<void>;
    }
}
declare module "packages/mws/src/commands/manager" {
    import { BaseCommand, CommandInfo } from "packages/commander/src/index";
    export const info: CommandInfo;
    export class Command extends BaseCommand {
        execute(): Promise<void>;
    }
}
declare module "packages/mws/src/commands/tests-complete" {
    import { BaseCommand, CommandInfo } from "packages/commander/src/index";
    export const info: CommandInfo;
    export class Command extends BaseCommand {
        execute(): Promise<void>;
    }
}
declare module "packages/mws/src/commands/build-client" {
    import { BaseCommand, CommandInfo } from "packages/commander/src/index";
    export const info: CommandInfo;
    export class Command extends BaseCommand {
        execute(): Promise<void>;
    }
}
declare module "packages/mws/src/managers/admin-utils" {
    import { JsonValue, Z2, zod, ZodState } from "packages/server/src/index";
    export function admin<T extends zod.ZodTypeAny, R extends JsonValue>(zodRequest: (z: Z2<"JSON">) => T, inner: (state: ZodState<"POST", "json", {}, {}, T>, prisma: PrismaTxnClient) => Promise<R>): import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, T, R>;
}
declare module "packages/mws/src/managers/admin-recipes" {
    import { RouterKeyMap, RouterRouteMap, ServerRequest, ServerRoute } from "packages/server/src/index";
    export const RecipeKeyMap: RouterKeyMap<RecipeManager, true>;
    export type RecipeManagerMap = RouterRouteMap<RecipeManager>;
    export class RecipeManager {
        static defineRoutes(root: ServerRoute): void;
        constructor();
        recipe_create_or_update: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            recipe_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
            description: import("zod/v4").ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "description";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "description";
            }, string>>;
            bag_names: import("zod/v4").ZodArray<import("zod/v4").ZodObject<{
                bag_name: import("zod/v4").ZodString;
                with_acl: import("zod/v4").ZodBoolean;
            }, import("zod/v4/core").$strip>>;
            plugin_names: import("zod/v4").ZodArray<import("zod/v4").ZodString>;
            owner_id: import("zod/v4").ZodOptional<import("zod/v4").ZodType<PrismaField<"Recipes", "owner_id">, string | null, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Recipes", "owner_id">, string | null>>>;
            skip_required_plugins: import("zod/v4").ZodType<PrismaField<"Recipes", "skip_required_plugins">, boolean, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Recipes", "skip_required_plugins">, boolean>>;
            skip_core: import("zod/v4").ZodType<PrismaField<"Recipes", "skip_core">, boolean, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Recipes", "skip_core">, boolean>>;
            preload_store: import("zod/v4").ZodType<PrismaField<"Recipes", "preload_store">, boolean, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Recipes", "preload_store">, boolean>>;
            custom_wiki: import("zod/v4").ZodType<PrismaField<"Recipes", "custom_wiki">, string | null, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Recipes", "custom_wiki">, string | null>>;
            create_only: import("zod/v4").ZodBoolean;
        }, import("zod/v4/core").$strip>, {
            description: string & {
                __prisma_table: "Recipes";
                __prisma_field: "description";
            };
            recipe_id: string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_id";
            };
            recipe_name: string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            };
            owner_id: PrismaField<"Recipes", "owner_id">;
            plugin_names: PrismaJson.Recipes_plugin_names & {
                __prisma_table: "Recipes";
                __prisma_field: "plugin_names";
            };
            skip_required_plugins: PrismaField<"Recipes", "skip_required_plugins">;
            skip_core: PrismaField<"Recipes", "skip_core">;
            preload_store: PrismaField<"Recipes", "preload_store">;
            custom_wiki: PrismaField<"Recipes", "custom_wiki">;
        }>;
        bag_create_or_update: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            bag_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string>>;
            description: import("zod/v4").ZodType<string & {
                __prisma_table: "Bags";
                __prisma_field: "description";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Bags";
                __prisma_field: "description";
            }, string>>;
            owner_id: import("zod/v4").ZodOptional<import("zod/v4").ZodType<PrismaField<"Bags", "owner_id">, string | null, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Bags", "owner_id">, string | null>>>;
            create_only: import("zod/v4").ZodBoolean;
        }, import("zod/v4/core").$strip>, {
            description: string & {
                __prisma_table: "Bags";
                __prisma_field: "description";
            };
            owner_id: PrismaField<"Bags", "owner_id">;
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            bag_name: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            };
        }>;
        assertCreateOrUpdate({ existing, isCreate, owner_id, type, user }: {
            user: ServerRequest["user"];
            isCreate: boolean;
            owner_id?: PrismaField<"Users", "user_id"> | null;
            existing: {
                owner_id: PrismaField<"Users", "user_id"> | null;
            } | null;
            type: "recipe" | "bag";
        }): void;
        recipe_delete: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            recipe_name: import("zod/v4").ZodString;
        }, import("zod/v4/core").$strip>, null>;
        bag_delete: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            bag_name: import("zod/v4").ZodString;
        }, import("zod/v4/core").$strip>, null>;
        recipe_acl_update: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            recipe_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
            acl: import("zod/v4").ZodArray<import("zod/v4").ZodObject<{
                role_id: import("zod/v4").ZodType<string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                }, string>>;
                permission: import("zod/v4").ZodEnum<{
                    READ: "READ";
                    WRITE: "WRITE";
                    ADMIN: "ADMIN";
                }>;
            }, import("zod/v4/core").$strip>>;
        }, import("zod/v4/core").$strip>, null>;
        bag_acl_update: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            bag_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string>>;
            acl: import("zod/v4").ZodArray<import("zod/v4").ZodObject<{
                role_id: import("zod/v4").ZodType<string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                }, string>>;
                permission: import("zod/v4").ZodEnum<{
                    READ: "READ";
                    WRITE: "WRITE";
                    ADMIN: "ADMIN";
                }>;
            }, import("zod/v4/core").$strip>>;
        }, import("zod/v4/core").$strip>, null>;
    }
}
declare module "packages/mws/src/managers/admin-users" {
    import { RouterKeyMap, RouterRouteMap, ServerRoute } from "packages/server/src/index";
    export const UserKeyMap: RouterKeyMap<UserManager, true>;
    export type UserManagerMap = RouterRouteMap<UserManager>;
    export class UserManager {
        static defineRoutes(root: ServerRoute): void;
        constructor();
        user_edit_data: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            user_id: import("zod/v4").ZodType<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string>>;
        }, import("zod/v4/core").$strip>, {
            user: {
                username: string & {
                    __prisma_table: "Users";
                    __prisma_field: "username";
                };
                email: string & {
                    __prisma_table: "Users";
                    __prisma_field: "email";
                };
                roles: {
                    description: PrismaField<"Roles", "description">;
                    role_id: string & {
                        __prisma_table: "Roles";
                        __prisma_field: "role_id";
                    };
                    role_name: string & {
                        __prisma_table: "Roles";
                        __prisma_field: "role_name";
                    };
                }[];
                user_id: string & {
                    __prisma_table: "Users";
                    __prisma_field: "user_id";
                };
                created_at: Date & {
                    __prisma_table: "Users";
                    __prisma_field: "created_at";
                };
                last_login: PrismaField<"Users", "last_login">;
            };
            allRoles: {
                description: PrismaField<"Roles", "description">;
                role_id: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                };
                role_name: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_name";
                };
            }[];
        }>;
        user_list: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodUndefined, {
            username: string & {
                __prisma_table: "Users";
                __prisma_field: "username";
            };
            email: string & {
                __prisma_table: "Users";
                __prisma_field: "email";
            };
            roles: {
                description: PrismaField<"Roles", "description">;
                role_id: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                };
                role_name: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_name";
                };
            }[];
            user_id: string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            };
            created_at: Date & {
                __prisma_table: "Users";
                __prisma_field: "created_at";
            };
            last_login: PrismaField<"Users", "last_login">;
        }[]>;
        user_create: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            username: import("zod/v4").ZodString;
            email: import("zod/v4").ZodString;
            role_ids: import("zod/v4").ZodArray<import("zod/v4").ZodType<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            }, string>>>;
        }, import("zod/v4/core").$strip>, {
            user_id: string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            };
            created_at: Date & {
                __prisma_table: "Users";
                __prisma_field: "created_at";
            };
        }>;
        user_update: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            user_id: import("zod/v4").ZodType<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string>>;
            username: import("zod/v4").ZodType<string & {
                __prisma_table: "Users";
                __prisma_field: "username";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Users";
                __prisma_field: "username";
            }, string>>;
            email: import("zod/v4").ZodType<string & {
                __prisma_table: "Users";
                __prisma_field: "email";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Users";
                __prisma_field: "email";
            }, string>>;
            role_ids: import("zod/v4").ZodArray<import("zod/v4").ZodType<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            }, string>>>;
        }, import("zod/v4/core").$strip>, null>;
        user_delete: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            user_id: import("zod/v4").ZodType<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string>>;
        }, import("zod/v4/core").$strip>, null>;
        user_update_password: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            user_id: import("zod/v4").ZodType<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string>>;
            registrationRequest: import("zod/v4").ZodOptional<import("zod/v4").ZodString>;
            registrationRecord: import("zod/v4").ZodOptional<import("zod/v4").ZodString>;
            session_id: import("zod/v4").ZodOptional<import("zod/v4").ZodString>;
            signature: import("zod/v4").ZodOptional<import("zod/v4").ZodString>;
        }, import("zod/v4/core").$strip>, string | null>;
        role_create: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            role_name: import("zod/v4").ZodString;
            description: import("zod/v4").ZodString;
        }, import("zod/v4/core").$strip>, {
            description: PrismaField<"Roles", "description">;
            role_id: string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            };
            role_name: string & {
                __prisma_table: "Roles";
                __prisma_field: "role_name";
            };
        }>;
        role_update: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            role_id: import("zod/v4").ZodType<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            }, string>>;
            role_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_name";
            }, string>>;
            description: import("zod/v4").ZodType<PrismaField<"Roles", "description">, string | null, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Roles", "description">, string | null>>;
        }, import("zod/v4/core").$strip>, {
            description: PrismaField<"Roles", "description">;
            role_id: string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            };
            role_name: string & {
                __prisma_table: "Roles";
                __prisma_field: "role_name";
            };
        }>;
    }
}
declare module "packages/mws/src/managers/admin-settings" {
    import { RouterKeyMap, RouterRouteMap, ServerRoute } from "packages/server/src/index";
    export const SettingsKeyMap: RouterKeyMap<SettingsManager, true>;
    export type SettingsManagerMap = RouterRouteMap<SettingsManager>;
    class SettingsManager {
        static defineRoutes(root: ServerRoute): void;
        settings_read: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodUndefined, {
            value: string & {
                __prisma_table: "Settings";
                __prisma_field: "value";
            };
            key: string;
            description: string;
            valueType: "string" | "boolean" | "number";
        }[]>;
        settings_update: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            key: import("zod/v4").ZodString;
            value: import("zod/v4").ZodString;
        }, import("zod/v4/core").$strip>, {
            success: true;
        }>;
    }
}
declare module "packages/mws/src/managers/WikiStateStore" {
    import { TiddlerStore_PrismaTransaction } from "packages/mws/src/managers/TiddlerStore";
    import { ServerRequest } from "packages/server/src/index";
    /** Basically a bunch of methods to help with wiki routes. */
    export class WikiStateStore extends TiddlerStore_PrismaTransaction {
        protected state: ServerRequest;
        constructor(state: ServerRequest, prisma: PrismaTxnClient);
        serveIndexFile(recipe_name: PrismaField<"Recipes", "recipe_name">): Promise<symbol>;
        private writeStoreTiddlers;
        private serveStoreTiddlers;
        serveBagTiddler(bag_id: PrismaField<"Bags", "bag_id">, bag_name: PrismaField<"Bags", "bag_name">, title: PrismaField<"Tiddlers", "title">): Promise<symbol>;
    }
}
declare module "packages/mws/src/managers/wiki-utils" {
    import { BodyFormat, JsonValue, zod, ZodRoute, ZodState } from "packages/server/src/index";
    import { TiddlerFields } from "tiddlywiki";
    export interface WikiRoute<M extends string, B extends BodyFormat, P extends Record<string, zod.ZodType<any, string | undefined>>, Q extends Record<string, zod.ZodType<any, string[] | undefined>>, T extends zod.ZodTypeAny, R extends JsonValue> extends ZodRoute<M, B, P, Q, T, R> {
        routeType: "wiki" | "recipe" | "bag";
        routeName: string;
    }
    export const BAG_PREFIX = "/bag";
    export const RECIPE_PREFIX = "/recipe";
    export const WIKI_PREFIX = "/wiki";
    export function parseTiddlerFields(input: string, ctype: string | undefined): any;
    export function recieveTiddlerMultipartUpload(state: ZodState<"POST", "stream", any, any, zod.ZodTypeAny>): Promise<TiddlerFields>;
    export function rethrow<T>(cb: () => T, message: string): T;
}
declare module "packages/mws/src/managers/wiki-recipe" {
    import { TiddlerFields } from "tiddlywiki";
    export class WikiRecipeRoutes {
        handleLoadRecipeTiddler: import("packages/server/src/index").ZodRoute<"GET" | "HEAD", "ignore", {
            recipe_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
            title: import("zod/v4").ZodType<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string>>;
        }, Record<string, import("zod/v4").ZodType<any, string[] | undefined, import("zod/v4/core").$ZodTypeInternals<any, string[] | undefined>>>, import("zod/v4").ZodType<unknown, unknown, import("zod/v4/core").$ZodTypeInternals<unknown, unknown>>, never>;
        rpcLoadRecipeTiddlerList: import("packages/server/src/index").ZodRoute<"PUT", "json", {
            recipe_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
        }, Record<string, import("zod/v4").ZodType<any, string[] | undefined, import("zod/v4/core").$ZodTypeInternals<any, string[] | undefined>>>, import("zod/v4").ZodObject<{
            titles: import("zod/v4").ZodArray<import("zod/v4").ZodType<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string>>>;
        }, import("zod/v4/core").$strict>, {
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            bag_name: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            };
            tiddler: TiddlerFields;
        }[]>;
        handleSaveRecipeTiddler: import("packages/server/src/index").ZodRoute<"PUT", "string", {
            recipe_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
            title: import("zod/v4").ZodType<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string>>;
        }, Record<string, import("zod/v4").ZodType<any, string[] | undefined, import("zod/v4/core").$ZodTypeInternals<any, string[] | undefined>>>, import("zod/v4").ZodString, {
            bag_name: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            };
            revision_id: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            };
        }>;
        rpcSaveRecipeTiddlerList: import("packages/server/src/index").ZodRoute<"PUT", "json", {
            recipe_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
        }, Record<string, import("zod/v4").ZodType<any, string[] | undefined, import("zod/v4/core").$ZodTypeInternals<any, string[] | undefined>>>, import("zod/v4").ZodObject<{
            tiddlers: import("zod/v4").ZodArray<import("zod/v4").ZodRecord<import("zod/v4").ZodString, import("zod/v4").ZodString>>;
        }, import("zod/v4/core").$strict>, ({
            bag: {
                bag_id: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_id";
                };
                bag_name: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_name";
                };
            };
        } & {
            title: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            };
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            revision_id: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            };
            is_deleted: PrismaField<"Tiddlers", "is_deleted">;
            attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
        })[]>;
        handleDeleteRecipeTiddler: import("packages/server/src/index").ZodRoute<"DELETE", "json", {
            recipe_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
            title: import("zod/v4").ZodType<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string>>;
        }, Record<string, import("zod/v4").ZodType<any, string[] | undefined, import("zod/v4/core").$ZodTypeInternals<any, string[] | undefined>>>, import("zod/v4").ZodUndefined, {
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            bag_name: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            };
            revision_id: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            };
        }>;
        rpcDeleteRecipeTiddlerList: import("packages/server/src/index").ZodRoute<"PUT", "json", {
            recipe_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
        }, Record<string, import("zod/v4").ZodType<any, string[] | undefined, import("zod/v4/core").$ZodTypeInternals<any, string[] | undefined>>>, import("zod/v4").ZodObject<{
            titles: import("zod/v4").ZodArray<import("zod/v4").ZodType<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string>>>;
        }, import("zod/v4/core").$strict>, {
            title: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            };
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            revision_id: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            };
            is_deleted: PrismaField<"Tiddlers", "is_deleted">;
            attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
        }[]>;
    }
    module "packages/events/src/index" {
        interface ServerEventsMap {
            "mws.tiddler.events": [
                {
                    recipe_id?: string;
                    recipe_name?: string;
                    bag_id: string;
                    bag_name: string;
                    results: {
                        title: string;
                        revision_id: string;
                        is_deleted: boolean;
                    }[];
                }
            ];
        }
    }
}
declare module "packages/mws/src/managers/wiki-status" {
    import { zod } from "packages/server/src/index";
    export class WikiStatusRoutes {
        handleGetRecipeStatus: import("packages/server/src/index").ZodRoute<"GET" | "HEAD", "ignore", {
            recipe_name: zod.ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, zod.z.core.$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
        }, Record<string, zod.ZodType<any, string[] | undefined, zod.z.core.$ZodTypeInternals<any, string[] | undefined>>>, zod.ZodType<unknown, unknown, zod.z.core.$ZodTypeInternals<unknown, unknown>>, {
            isAdmin: boolean;
            user_id: string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            };
            username: string & {
                __prisma_table: "Users";
                __prisma_field: "username";
            };
            isLoggedIn: boolean;
            isReadOnly: boolean;
        }>;
        handleGetRecipeEvents: import("packages/server/src/index").ZodRoute<"GET" | "HEAD", "ignore", {
            recipe_name: zod.ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, zod.z.core.$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
        }, {
            "first-event-id": zod.ZodOptional<zod.ZodArray<zod.ZodString>>;
        }, zod.ZodType<unknown, unknown, zod.z.core.$ZodTypeInternals<unknown, unknown>>, never>;
        handleGetBags: import("packages/server/src/index").ZodRoute<"GET" | "HEAD", "ignore", {
            recipe_name: zod.ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, zod.z.core.$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
        }, Record<string, zod.ZodType<any, string[] | undefined, zod.z.core.$ZodTypeInternals<any, string[] | undefined>>>, zod.ZodType<unknown, unknown, zod.z.core.$ZodTypeInternals<unknown, unknown>>, {
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            bag_name: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            };
            position: number & {
                __prisma_table: "Recipe_bags";
                __prisma_field: "position";
            };
        }[]>;
        handleGetBagState: import("packages/server/src/index").ZodRoute<"GET" | "HEAD", "ignore", {
            recipe_name: zod.ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, zod.z.core.$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
            bag_name: zod.ZodType<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string, zod.z.core.$ZodTypeInternals<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string>>;
        }, {
            last_known_revision_id: zod.ZodOptional<zod.ZodArray<zod.ZodType<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            }, string, zod.z.core.$ZodTypeInternals<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            }, string>>>>;
            include_deleted: zod.ZodOptional<zod.ZodArray<zod.ZodEnum<{
                yes: "yes";
                no: "no";
            }>>>;
        }, zod.ZodType<unknown, unknown, zod.z.core.$ZodTypeInternals<unknown, unknown>>, {
            bag_id: string;
            bag_name: string;
            tiddlers: {
                title: string;
                revision_id: string;
                is_deleted: boolean;
            }[];
        }>;
        handleGetAllBagStates: import("packages/server/src/index").ZodRoute<"GET" | "HEAD", "ignore", {
            recipe_name: zod.ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, zod.z.core.$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
        }, {
            last_known_revision_id: zod.ZodOptional<zod.ZodArray<zod.ZodType<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            }, string, zod.z.core.$ZodTypeInternals<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            }, string>>>>;
            include_deleted: zod.ZodOptional<zod.ZodArray<zod.ZodEnum<{
                yes: "yes";
                no: "no";
            }>>>;
            gzip_stream: zod.ZodOptional<zod.ZodArray<zod.ZodEnum<{
                yes: "yes";
                no: "no";
            }>>>;
        }, zod.ZodType<unknown, unknown, zod.z.core.$ZodTypeInternals<unknown, unknown>>, {
            bag_id: string;
            bag_name: string;
            position: number;
            tiddlers: {
                title: string;
                revision_id: string;
                is_deleted: boolean;
            }[];
        }[]>;
    }
}
declare module "packages/mws/src/managers/wiki-external" {
    export class WikiExternalRoutes {
        handleFormMultipartRecipeTiddler: import("packages/server/src/index").ZodRoute<"POST", "stream", {
            recipe_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
        }, Record<string, import("zod/v4").ZodType<any, string[] | undefined, import("zod/v4/core").$ZodTypeInternals<any, string[] | undefined>>>, import("zod/v4").ZodType<unknown, unknown, import("zod/v4/core").$ZodTypeInternals<unknown, unknown>>, {
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            bag_name: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            };
            results: {
                revision_id: string & {
                    __prisma_table: "Tiddlers";
                    __prisma_field: "revision_id";
                };
                bag_name: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_name";
                };
            };
        }>;
        handleLoadBagTiddler: import("packages/server/src/index").ZodRoute<"GET" | "HEAD", "ignore", {
            bag_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string>>;
            title: import("zod/v4").ZodType<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string>>;
        }, Record<string, import("zod/v4").ZodType<any, string[] | undefined, import("zod/v4/core").$ZodTypeInternals<any, string[] | undefined>>>, import("zod/v4").ZodType<unknown, unknown, import("zod/v4/core").$ZodTypeInternals<unknown, unknown>>, never>;
        handleSaveBagTiddler: import("packages/server/src/index").ZodRoute<"PUT", "string", {
            bag_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string>>;
            title: import("zod/v4").ZodType<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string>>;
        }, Record<string, import("zod/v4").ZodType<any, string[] | undefined, import("zod/v4/core").$ZodTypeInternals<any, string[] | undefined>>>, import("zod/v4").ZodString, {
            bag: {
                bag_id: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_id";
                };
                bag_name: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_name";
                };
            };
        } & {
            title: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            };
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            revision_id: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            };
            is_deleted: PrismaField<"Tiddlers", "is_deleted">;
            attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
        }>;
        handleDeleteBagTiddler: import("packages/server/src/index").ZodRoute<"DELETE", "ignore", {
            bag_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string>>;
            title: import("zod/v4").ZodType<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            }, string>>;
        }, Record<string, import("zod/v4").ZodType<any, string[] | undefined, import("zod/v4/core").$ZodTypeInternals<any, string[] | undefined>>>, import("zod/v4").ZodType<unknown, unknown, import("zod/v4/core").$ZodTypeInternals<unknown, unknown>>, {
            title: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            };
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            revision_id: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            };
            is_deleted: PrismaField<"Tiddlers", "is_deleted">;
            attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
        }>;
        handleFormMultipartBagTiddler: import("packages/server/src/index").ZodRoute<"POST", "stream", {
            bag_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string>>;
        }, Record<string, import("zod/v4").ZodType<any, string[] | undefined, import("zod/v4/core").$ZodTypeInternals<any, string[] | undefined>>>, import("zod/v4").ZodType<unknown, unknown, import("zod/v4/core").$ZodTypeInternals<unknown, unknown>>, {
            bag: {
                bag_id: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_id";
                };
                bag_name: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_name";
                };
            };
        } & {
            title: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "title";
            };
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            revision_id: string & {
                __prisma_table: "Tiddlers";
                __prisma_field: "revision_id";
            };
            is_deleted: PrismaField<"Tiddlers", "is_deleted">;
            attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
        }>;
    }
}
declare module "packages/mws/src/managers/wiki-index" {
    import { WikiRecipeRoutes } from "packages/mws/src/managers/wiki-recipe";
    import { WikiStatusRoutes } from "packages/mws/src/managers/wiki-status";
    import { WikiExternalRoutes } from "packages/mws/src/managers/wiki-external";
    export { WikiExternalRoutes, WikiRecipeRoutes, WikiStatusRoutes };
    module "packages/server/src/index" {
        interface IncomingHttpHeaders {
            'last-event-id'?: string;
        }
    }
}
declare module "packages/mws/src/managers/index" {
    import "packages/mws/src/managers/admin-recipes";
    import "packages/mws/src/managers/admin-users";
    import "packages/mws/src/managers/admin-settings";
    import "packages/mws/src/managers/wiki-index";
    import { RouterKeyMap, RouterRouteMap, ServerRoute } from "packages/server/src/index";
    export * from "packages/mws/src/managers/admin-recipes";
    export * from "packages/mws/src/managers/admin-users";
    export * from "packages/mws/src/managers/wiki-index";
    export const StatusKeyMap: RouterKeyMap<StatusManager, true>;
    export type StatusManagerMap = RouterRouteMap<StatusManager>;
    export class StatusManager {
        static defineRoutes(root: ServerRoute): void;
        constructor();
        index_json: import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodUndefined, {
            bagList: ({
                _count: {
                    recipe_bags: number;
                    tiddlers: number;
                    acl: number;
                };
                acl: {
                    acl_id: number & {
                        __prisma_table: "BagAcl";
                        __prisma_field: "acl_id";
                    };
                    role_id: string & {
                        __prisma_table: "BagAcl";
                        __prisma_field: "role_id";
                    };
                    permission: PrismaField<"BagAcl", "permission">;
                    bag_id: string & {
                        __prisma_table: "BagAcl";
                        __prisma_field: "bag_id";
                    };
                }[];
            } & {
                description: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "description";
                };
                owner_id: PrismaField<"Bags", "owner_id">;
                bag_id: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_id";
                };
                bag_name: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_name";
                };
            })[];
            recipeList: ({
                _count: {
                    recipe_bags: number;
                    acl: number;
                };
                recipe_bags: {
                    position: number & {
                        __prisma_table: "Recipe_bags";
                        __prisma_field: "position";
                    };
                    bag_id: string & {
                        __prisma_table: "Bags";
                        __prisma_field: "bag_id";
                    };
                    with_acl: PrismaField<"Recipe_bags", "with_acl">;
                }[];
                acl: {
                    recipe_id: string & {
                        __prisma_table: "RecipeAcl";
                        __prisma_field: "recipe_id";
                    };
                    acl_id: number & {
                        __prisma_table: "RecipeAcl";
                        __prisma_field: "acl_id";
                    };
                    role_id: string & {
                        __prisma_table: "RecipeAcl";
                        __prisma_field: "role_id";
                    };
                    permission: PrismaField<"RecipeAcl", "permission">;
                }[];
            } & {
                description: string & {
                    __prisma_table: "Recipes";
                    __prisma_field: "description";
                };
                recipe_id: string & {
                    __prisma_table: "Recipes";
                    __prisma_field: "recipe_id";
                };
                recipe_name: string & {
                    __prisma_table: "Recipes";
                    __prisma_field: "recipe_name";
                };
                owner_id: PrismaField<"Recipes", "owner_id">;
                plugin_names: PrismaJson.Recipes_plugin_names & {
                    __prisma_table: "Recipes";
                    __prisma_field: "plugin_names";
                };
                skip_required_plugins: PrismaField<"Recipes", "skip_required_plugins">;
                skip_core: PrismaField<"Recipes", "skip_core">;
                preload_store: PrismaField<"Recipes", "preload_store">;
                custom_wiki: PrismaField<"Recipes", "custom_wiki">;
            })[];
            isAdmin: boolean;
            user_id: string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            };
            userListUser: false | {
                username: string & {
                    __prisma_table: "Users";
                    __prisma_field: "username";
                };
                user_id: string & {
                    __prisma_table: "Users";
                    __prisma_field: "user_id";
                };
            }[];
            userListAdmin: false | {
                username: string & {
                    __prisma_table: "Users";
                    __prisma_field: "username";
                };
                email: string & {
                    __prisma_table: "Users";
                    __prisma_field: "email";
                };
                roles: {
                    description: PrismaField<"Roles", "description">;
                    role_id: string & {
                        __prisma_table: "Roles";
                        __prisma_field: "role_id";
                    };
                    role_name: string & {
                        __prisma_table: "Roles";
                        __prisma_field: "role_name";
                    };
                }[];
                user_id: string & {
                    __prisma_table: "Users";
                    __prisma_field: "user_id";
                };
                created_at: Date & {
                    __prisma_table: "Users";
                    __prisma_field: "created_at";
                };
                last_login: PrismaField<"Users", "last_login">;
            }[];
            roleList: {
                description: PrismaField<"Roles", "description">;
                role_id: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                };
                role_name: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_name";
                };
            }[];
            username: string & {
                __prisma_table: "Users";
                __prisma_field: "username";
            };
            clientPlugins: string[];
            corePlugins: string[];
            isLoggedIn: boolean;
            allowAnonReads: false;
            allowAnonWrites: false;
            versions: {
                tw5: any;
                mws: string;
            };
        }>;
    }
}
declare module "packages/mws/src/commands/build-types" {
    import { BaseCommand, CommandInfo } from "packages/commander/src/index";
    export const info: CommandInfo;
    export class Command extends BaseCommand<[], {}> {
        execute(): Promise<void>;
        getEndpoints(): (readonly ["index_json", import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodUndefined, {
            bagList: ({
                _count: {
                    recipe_bags: number;
                    tiddlers: number;
                    acl: number;
                };
                acl: {
                    acl_id: number & {
                        __prisma_table: "BagAcl";
                        __prisma_field: "acl_id";
                    };
                    role_id: string & {
                        __prisma_table: "BagAcl";
                        __prisma_field: "role_id";
                    };
                    permission: PrismaField<"BagAcl", "permission">;
                    bag_id: string & {
                        __prisma_table: "BagAcl";
                        __prisma_field: "bag_id";
                    };
                }[];
            } & {
                description: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "description";
                };
                owner_id: PrismaField<"Bags", "owner_id">;
                bag_id: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_id";
                };
                bag_name: string & {
                    __prisma_table: "Bags";
                    __prisma_field: "bag_name";
                };
            })[];
            recipeList: ({
                _count: {
                    recipe_bags: number;
                    acl: number;
                };
                recipe_bags: {
                    position: number & {
                        __prisma_table: "Recipe_bags";
                        __prisma_field: "position";
                    };
                    bag_id: string & {
                        __prisma_table: "Bags";
                        __prisma_field: "bag_id";
                    };
                    with_acl: PrismaField<"Recipe_bags", "with_acl">;
                }[];
                acl: {
                    recipe_id: string & {
                        __prisma_table: "RecipeAcl";
                        __prisma_field: "recipe_id";
                    };
                    acl_id: number & {
                        __prisma_table: "RecipeAcl";
                        __prisma_field: "acl_id";
                    };
                    role_id: string & {
                        __prisma_table: "RecipeAcl";
                        __prisma_field: "role_id";
                    };
                    permission: PrismaField<"RecipeAcl", "permission">;
                }[];
            } & {
                description: string & {
                    __prisma_table: "Recipes";
                    __prisma_field: "description";
                };
                recipe_id: string & {
                    __prisma_table: "Recipes";
                    __prisma_field: "recipe_id";
                };
                recipe_name: string & {
                    __prisma_table: "Recipes";
                    __prisma_field: "recipe_name";
                };
                owner_id: PrismaField<"Recipes", "owner_id">;
                plugin_names: PrismaJson.Recipes_plugin_names & {
                    __prisma_table: "Recipes";
                    __prisma_field: "plugin_names";
                };
                skip_required_plugins: PrismaField<"Recipes", "skip_required_plugins">;
                skip_core: PrismaField<"Recipes", "skip_core">;
                preload_store: PrismaField<"Recipes", "preload_store">;
                custom_wiki: PrismaField<"Recipes", "custom_wiki">;
            })[];
            isAdmin: boolean;
            user_id: string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            };
            userListUser: false | {
                username: string & {
                    __prisma_table: "Users";
                    __prisma_field: "username";
                };
                user_id: string & {
                    __prisma_table: "Users";
                    __prisma_field: "user_id";
                };
            }[];
            userListAdmin: false | {
                username: string & {
                    __prisma_table: "Users";
                    __prisma_field: "username";
                };
                email: string & {
                    __prisma_table: "Users";
                    __prisma_field: "email";
                };
                roles: {
                    description: PrismaField<"Roles", "description">;
                    role_id: string & {
                        __prisma_table: "Roles";
                        __prisma_field: "role_id";
                    };
                    role_name: string & {
                        __prisma_table: "Roles";
                        __prisma_field: "role_name";
                    };
                }[];
                user_id: string & {
                    __prisma_table: "Users";
                    __prisma_field: "user_id";
                };
                created_at: Date & {
                    __prisma_table: "Users";
                    __prisma_field: "created_at";
                };
                last_login: PrismaField<"Users", "last_login">;
            }[];
            roleList: {
                description: PrismaField<"Roles", "description">;
                role_id: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                };
                role_name: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_name";
                };
            }[];
            username: string & {
                __prisma_table: "Users";
                __prisma_field: "username";
            };
            clientPlugins: string[];
            corePlugins: string[];
            isLoggedIn: boolean;
            allowAnonReads: false;
            allowAnonWrites: false;
            versions: {
                tw5: any;
                mws: string;
            };
        }>] | readonly ["user_edit_data" | "user_list" | "user_create" | "user_update" | "user_delete" | "user_update_password" | "role_create" | "role_update", import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            user_id: import("zod/v4").ZodType<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string>>;
        }, import("zod/v4/core").$strip>, {
            user: {
                username: string & {
                    __prisma_table: "Users";
                    __prisma_field: "username";
                };
                email: string & {
                    __prisma_table: "Users";
                    __prisma_field: "email";
                };
                roles: {
                    description: PrismaField<"Roles", "description">;
                    role_id: string & {
                        __prisma_table: "Roles";
                        __prisma_field: "role_id";
                    };
                    role_name: string & {
                        __prisma_table: "Roles";
                        __prisma_field: "role_name";
                    };
                }[];
                user_id: string & {
                    __prisma_table: "Users";
                    __prisma_field: "user_id";
                };
                created_at: Date & {
                    __prisma_table: "Users";
                    __prisma_field: "created_at";
                };
                last_login: PrismaField<"Users", "last_login">;
            };
            allRoles: {
                description: PrismaField<"Roles", "description">;
                role_id: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                };
                role_name: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_name";
                };
            }[];
        }> | import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodUndefined, {
            username: string & {
                __prisma_table: "Users";
                __prisma_field: "username";
            };
            email: string & {
                __prisma_table: "Users";
                __prisma_field: "email";
            };
            roles: {
                description: PrismaField<"Roles", "description">;
                role_id: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                };
                role_name: string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_name";
                };
            }[];
            user_id: string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            };
            created_at: Date & {
                __prisma_table: "Users";
                __prisma_field: "created_at";
            };
            last_login: PrismaField<"Users", "last_login">;
        }[]> | import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            username: import("zod/v4").ZodString;
            email: import("zod/v4").ZodString;
            role_ids: import("zod/v4").ZodArray<import("zod/v4").ZodType<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            }, string>>>;
        }, import("zod/v4/core").$strip>, {
            user_id: string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            };
            created_at: Date & {
                __prisma_table: "Users";
                __prisma_field: "created_at";
            };
        }> | import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            user_id: import("zod/v4").ZodType<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string>>;
            username: import("zod/v4").ZodType<string & {
                __prisma_table: "Users";
                __prisma_field: "username";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Users";
                __prisma_field: "username";
            }, string>>;
            email: import("zod/v4").ZodType<string & {
                __prisma_table: "Users";
                __prisma_field: "email";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Users";
                __prisma_field: "email";
            }, string>>;
            role_ids: import("zod/v4").ZodArray<import("zod/v4").ZodType<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            }, string>>>;
        }, import("zod/v4/core").$strip>, null> | import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            user_id: import("zod/v4").ZodType<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string>>;
        }, import("zod/v4/core").$strip>, null> | import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            user_id: import("zod/v4").ZodType<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Users";
                __prisma_field: "user_id";
            }, string>>;
            registrationRequest: import("zod/v4").ZodOptional<import("zod/v4").ZodString>;
            registrationRecord: import("zod/v4").ZodOptional<import("zod/v4").ZodString>;
            session_id: import("zod/v4").ZodOptional<import("zod/v4").ZodString>;
            signature: import("zod/v4").ZodOptional<import("zod/v4").ZodString>;
        }, import("zod/v4/core").$strip>, string | null> | import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            role_name: import("zod/v4").ZodString;
            description: import("zod/v4").ZodString;
        }, import("zod/v4/core").$strip>, {
            description: PrismaField<"Roles", "description">;
            role_id: string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            };
            role_name: string & {
                __prisma_table: "Roles";
                __prisma_field: "role_name";
            };
        }> | import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            role_id: import("zod/v4").ZodType<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            }, string>>;
            role_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Roles";
                __prisma_field: "role_name";
            }, string>>;
            description: import("zod/v4").ZodType<PrismaField<"Roles", "description">, string | null, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Roles", "description">, string | null>>;
        }, import("zod/v4/core").$strip>, {
            description: PrismaField<"Roles", "description">;
            role_id: string & {
                __prisma_table: "Roles";
                __prisma_field: "role_id";
            };
            role_name: string & {
                __prisma_table: "Roles";
                __prisma_field: "role_name";
            };
        }>] | readonly ["recipe_create_or_update" | "bag_create_or_update" | "recipe_delete" | "bag_delete" | "recipe_acl_update" | "bag_acl_update", import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            recipe_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
            description: import("zod/v4").ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "description";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "description";
            }, string>>;
            bag_names: import("zod/v4").ZodArray<import("zod/v4").ZodObject<{
                bag_name: import("zod/v4").ZodString;
                with_acl: import("zod/v4").ZodBoolean;
            }, import("zod/v4/core").$strip>>;
            plugin_names: import("zod/v4").ZodArray<import("zod/v4").ZodString>;
            owner_id: import("zod/v4").ZodOptional<import("zod/v4").ZodType<PrismaField<"Recipes", "owner_id">, string | null, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Recipes", "owner_id">, string | null>>>;
            skip_required_plugins: import("zod/v4").ZodType<PrismaField<"Recipes", "skip_required_plugins">, boolean, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Recipes", "skip_required_plugins">, boolean>>;
            skip_core: import("zod/v4").ZodType<PrismaField<"Recipes", "skip_core">, boolean, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Recipes", "skip_core">, boolean>>;
            preload_store: import("zod/v4").ZodType<PrismaField<"Recipes", "preload_store">, boolean, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Recipes", "preload_store">, boolean>>;
            custom_wiki: import("zod/v4").ZodType<PrismaField<"Recipes", "custom_wiki">, string | null, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Recipes", "custom_wiki">, string | null>>;
            create_only: import("zod/v4").ZodBoolean;
        }, import("zod/v4/core").$strip>, {
            description: string & {
                __prisma_table: "Recipes";
                __prisma_field: "description";
            };
            recipe_id: string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_id";
            };
            recipe_name: string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            };
            owner_id: PrismaField<"Recipes", "owner_id">;
            plugin_names: PrismaJson.Recipes_plugin_names & {
                __prisma_table: "Recipes";
                __prisma_field: "plugin_names";
            };
            skip_required_plugins: PrismaField<"Recipes", "skip_required_plugins">;
            skip_core: PrismaField<"Recipes", "skip_core">;
            preload_store: PrismaField<"Recipes", "preload_store">;
            custom_wiki: PrismaField<"Recipes", "custom_wiki">;
        }> | import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            bag_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string>>;
            description: import("zod/v4").ZodType<string & {
                __prisma_table: "Bags";
                __prisma_field: "description";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Bags";
                __prisma_field: "description";
            }, string>>;
            owner_id: import("zod/v4").ZodOptional<import("zod/v4").ZodType<PrismaField<"Bags", "owner_id">, string | null, import("zod/v4/core").$ZodTypeInternals<PrismaField<"Bags", "owner_id">, string | null>>>;
            create_only: import("zod/v4").ZodBoolean;
        }, import("zod/v4/core").$strip>, {
            description: string & {
                __prisma_table: "Bags";
                __prisma_field: "description";
            };
            owner_id: PrismaField<"Bags", "owner_id">;
            bag_id: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_id";
            };
            bag_name: string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            };
        }> | import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            recipe_name: import("zod/v4").ZodString;
        }, import("zod/v4/core").$strip>, null> | import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            bag_name: import("zod/v4").ZodString;
        }, import("zod/v4/core").$strip>, null> | import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            recipe_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Recipes";
                __prisma_field: "recipe_name";
            }, string>>;
            acl: import("zod/v4").ZodArray<import("zod/v4").ZodObject<{
                role_id: import("zod/v4").ZodType<string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                }, string>>;
                permission: import("zod/v4").ZodEnum<{
                    READ: "READ";
                    WRITE: "WRITE";
                    ADMIN: "ADMIN";
                }>;
            }, import("zod/v4/core").$strip>>;
        }, import("zod/v4/core").$strip>, null> | import("packages/server/src/index").ZodRoute<"POST", "json", {}, {}, import("zod/v4").ZodObject<{
            bag_name: import("zod/v4").ZodType<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                __prisma_table: "Bags";
                __prisma_field: "bag_name";
            }, string>>;
            acl: import("zod/v4").ZodArray<import("zod/v4").ZodObject<{
                role_id: import("zod/v4").ZodType<string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                }, string, import("zod/v4/core").$ZodTypeInternals<string & {
                    __prisma_table: "Roles";
                    __prisma_field: "role_id";
                }, string>>;
                permission: import("zod/v4").ZodEnum<{
                    READ: "READ";
                    WRITE: "WRITE";
                    ADMIN: "ADMIN";
                }>;
            }, import("zod/v4/core").$strip>>;
        }, import("zod/v4/core").$strip>, null>])[];
    }
}
declare module "packages/mws/src/commands/listen" {
    import { Router } from "packages/server/src/index";
    import { BaseCommand, CommandInfo } from "packages/commander/src/index";
    export const info: CommandInfo;
    export const AllowedMethods: ("GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "OPTIONS")[];
    export type AllowedMethod = (typeof AllowedMethods)[number];
    export type ListenerRaw = {
        [key in "port" | "host" | "prefix" | "key" | "cert" | "secure" | "redirect"]?: string | undefined;
    };
    module "packages/events/src/index" {
        interface ServerEventsMap {
            "listen.router.init": [command: Command, router: Router];
        }
    }
    export class Command extends BaseCommand<[], {
        listener: ListenerRaw[];
        allow_hosts: string[];
        subdomains: boolean;
        require_https: boolean;
    }> {
        execute(): Promise<void>;
    }
}
declare module "packages/mws/src/commands/index" {
    import * as load_wiki_folder from "packages/mws/src/commands/load-wiki-folder";
    import * as save_archive from "packages/mws/src/commands/save-archive";
    import * as load_archive from "packages/mws/src/commands/load-archive";
    import * as init_store from "packages/mws/src/commands/init-store";
    import * as manager from "packages/mws/src/commands/manager";
    import * as tests_complete from "packages/mws/src/commands/tests-complete";
    import * as build_client from "packages/mws/src/commands/build-client";
    import * as build_types from "packages/mws/src/commands/build-types";
    import * as listen from "packages/mws/src/commands/listen";
    export const commands: {
        readonly listen: typeof listen;
        readonly load_wiki_folder: typeof load_wiki_folder;
        readonly load_archive: typeof load_archive;
        readonly save_archive: typeof save_archive;
        readonly init_store: typeof init_store;
        readonly manager: typeof manager;
        readonly tests_complete: typeof tests_complete;
        readonly build_client: typeof build_client;
        readonly build_types: typeof build_types;
    };
}
declare module "packages/mws/src/zodAssert" {
    import { Prisma } from "@tiddlywiki/mws-prisma";
    import { zod } from "packages/server/src/index";
    type _zod = typeof zod;
    type ExtraFieldType = "string" | "number" | "parse-number" | "boolean" | "parse-boolean";
    type FieldTypeGroups = "STRING" | "JSON";
    type FieldTypeStringSelector<T extends FieldTypeGroups> = T extends "STRING" ? "string" : "string";
    type FieldTypeNumberSelector<T extends FieldTypeGroups> = T extends "STRING" ? "parse-number" : "number";
    type FieldTypeBooleanSelector<T extends FieldTypeGroups> = T extends "STRING" ? "parse-boolean" : "boolean";
    module "packages/server/src/index" {
        interface Z2<T extends FieldTypeGroups> extends _zod {
            /**
             * Tags the resulting value as being from the specified table field.
             *
             * The third argument is a string literal that specifies the field type based on the selected field.
             *
             * "string" and "parse-number"
             * - will use decodeURIComponent on the value.
             * - Require a string length at least one
             *
             * You can use .optional(), .nullable(), .nulish() after this to make the field optional.
             */
            prismaField<Table extends Prisma.ModelName, Field extends keyof PrismaPayloadScalars<Table>>(table: Table, field: Field, fieldtype: string extends (PrismaPayloadScalars<Table>[Field]) ? FieldTypeStringSelector<T> : number extends (PrismaPayloadScalars<Table>[Field]) ? FieldTypeNumberSelector<T> : boolean extends (PrismaPayloadScalars<Table>[Field]) ? FieldTypeBooleanSelector<T> : never, nullable?: null extends PrismaPayloadScalars<Table>[Field] ? true : false): zod.ZodType<PrismaField<Table, Field>, PrismaPayloadScalars<Table>[Field]>;
        }
    }
    export function prismaField(table: any, field: any, fieldtype: ExtraFieldType, nullable?: boolean): any;
}
declare module "packages/mws/src/services/tw-routes" {
    import { ServerRequest } from "packages/server/src/index";
    /**
     * `tiddlywiki [+<pluginname> | ++<pluginpath>] [<wikipath>] ...[--command ...args]`
     *
     *
     *
     * @param options
     * @param options.rootRoute
     */
    export function TW5Route({ mountPath, singleFile, argv, variables, }: {
        mountPath: string;
        singleFile: boolean;
        argv: string[];
        variables?: Record<string, string>;
    }): (state: ServerRequest) => Promise<symbol>;
}
declare module "packages/mws/src/index" {
    import "packages/mws/src/globals";
    import "packages/utils/src/index";
    import "packages/commander/src/index";
    import "packages/server/src/index";
    import "packages/mws/src/registerRequest";
    import "packages/mws/src/registerStartup";
    import "packages/mws/src/commands/index";
    import "packages/mws/src/managers/index";
    import "packages/mws/src/zodAssert";
    import "packages/mws/src/RequestState";
    import "packages/mws/src/ServerState";
    import "packages/mws/src/services/tw-routes";
    import "packages/mws/src/services/cache";
    import "packages/mws/src/services/sessions";
    import "packages/mws/src/SendError";
    export { ZodRoute } from "packages/server/src/index";
    export * from "packages/mws/src/managers/index";
    export default function runMWS(oldOptions?: any): Promise<void>;
}
declare module "packages/mws/src/commands/_empty" {
    import { BaseCommand, CommandInfo } from "packages/commander/src/index";
    export const info: CommandInfo;
    export class Command extends BaseCommand {
        execute(): Promise<void>;
    }
}
declare module "packages/mws/src/commands/load-tiddlers" {
    import { BaseCommand, CommandInfo } from "packages/commander/src/index";
    export const info: CommandInfo;
    export class Command extends BaseCommand {
        tiddlersPath: string;
        bagName: PrismaField<"Bags", "bag_name">;
        constructor(...args: ConstructorParameters<typeof BaseCommand>);
        execute(): Promise<string | null>;
    }
}
declare module "packages/mws/src/commands/save-tiddler-text" {
    import { BaseCommand, CommandInfo } from "packages/commander/src/index";
    export const info: CommandInfo;
    export class Command extends BaseCommand {
        execute(): Promise<string | undefined>;
    }
}
declare module "packages/mws/src/services/attachments" {
    import * as fs from "fs";
    import { TiddlerFields } from "tiddlywiki";
    import { ServerState } from "packages/mws/src/ServerState";
    export class AttachmentService {
        protected config: ServerState;
        protected prisma: PrismaTxnClient;
        constructor(config: ServerState, prisma: PrismaTxnClient);
        makeCanonicalUri(bag_name: string, title: string): string;
        processOutgoingTiddler({ tiddler, revision_id, bag_name, attachment_hash }: {
            tiddler: TiddlerFields;
            revision_id: any;
            bag_name: PrismaField<"Bags", "bag_name">;
            attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
        }): TiddlerFields;
        processIncomingTiddler({ tiddlerFields, existing_attachment_hash, existing_canonical_uri }: {
            tiddlerFields: TiddlerFields;
            existing_attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
            existing_canonical_uri: any;
        }): Promise<{
            tiddlerFields: TiddlerFields;
            attachment_hash: PrismaField<"Tiddlers", "attachment_hash">;
        }>;
        isValidAttachmentName(content_hash: string): boolean;
        saveAttachment(options: {
            text: string;
            type: string;
            reference: string;
            _canonical_uri: string;
        }): Promise<PrismaField<"Tiddlers", "attachment_hash">>;
        private writeMetaFile;
        adoptAttachment({ incomingFilepath, type, hash, _canonical_uri }: {
            incomingFilepath: any;
            type: string;
            hash: any;
            _canonical_uri: any;
        }): Promise<any>;
        getAttachmentStream(content_hash: string): Promise<{
            stream: fs.ReadStream;
            type: any;
        } | null>;
        getAttachmentFileSize(content_hash: PrismaField<"Tiddlers", "attachment_hash"> & {}): Promise<number | null>;
        getAttachmentMetadata(content_hash: PrismaField<"Tiddlers", "attachment_hash"> & {}): Promise<any>;
    }
}
declare module "packages/mws/src/utils/index" {
    export {};
}
declare module "packages/mws/src/utils/prisma-proxy" { }
