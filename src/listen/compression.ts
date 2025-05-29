/*!
 * compression
 * Copyright(c) 2010 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import { DuplexOptions, PassThrough } from "stream";

const Negotiator = require('negotiator')
const bytes = require('bytes')
const compressible = require('compressible')
const debug = require('debug')('compression')
const vary = require('vary')
import zlib, { BrotliOptions, ZlibOptions } from 'zlib';


/**
 * @const
 * whether current node version has brotli support
 */
var hasBrotliSupport = 'createBrotliCompress' in zlib

/**
 * Module variables.
 * @private
 */
var cacheControlNoTransformRegExp = /(?:^|,)\s*?no-transform\s*?(?:,|$)/
var SUPPORTED_ENCODING = hasBrotliSupport ? ['br', 'gzip', 'deflate', 'identity'] : ['gzip', 'deflate', 'identity']
var PREFERRED_ENCODING = hasBrotliSupport ? ['br', 'gzip'] : ['gzip']

var encodingSupported = ['gzip', 'deflate', 'identity', 'br']


export interface CompressorOptions {
  /** Opts passed to brotli. The default quality param is 4. */
  brotli?: BrotliOptions;
  /** Opts passed to gzip */
  gzip?: ZlibOptions;
  /** Opts passed to deflate */
  deflate?: ZlibOptions;
  /** 
   * Filter function to determine whether the request should be compressed.  
   * 
   * Defaults to `compressor.shouldCompress()`, which checks the mime type.
   * 
   * You can also call it from the filter function itself. 
   */
  filter?: (this: Compressor) => boolean;
  /** 
   * source threshold below which to skip compression. 
   * only works if content-length header is set. 
   */
  threshold?: number;
  /** use a specific encoding as default, defaults to identity */
  enforceEncoding?: string;
  /** options to pass to the Passthrough stream used for identity encoding. */
  identity?: DuplexOptions;
}

export class Compressor {

  constructor(
    private req: import("http").IncomingMessage | import("http2").Http2ServerRequest,
    private res: import("http").ServerResponse | import("http2").Http2ServerResponse,
    { identity, brotli, filter, threshold, enforceEncoding, deflate, gzip }: CompressorOptions,
  ) {
    var optsBrotli: any = {}

    if (hasBrotliSupport) {
      Object.assign(optsBrotli, brotli)

      var brotliParams: any = {}
      brotliParams[zlib.constants.BROTLI_PARAM_QUALITY] = 4

      // set the default level to a reasonable value with balanced speed/ratio
      optsBrotli.params = Object.assign(brotliParams, optsBrotli.params)
    }

    // options
    this.filter = filter ?? (() => this.shouldCompress());
    this.threshold = bytes.parse(threshold)
    this.enforceEncoding = enforceEncoding || 'identity'

    if (this.threshold == null) { this.threshold = 1; }

    this.createStream = (method: string) => {
      switch (method) {
        case "gzip-stream":
        case "gzip": return zlib.createGzip(gzip);
        case "br": return zlib.createBrotliCompress(optsBrotli);
        case "deflate": return zlib.createDeflate(deflate);
        default: return new PassThrough(identity);
      }
    }

    this.finisher = () => this.res.end();

  }
  /** Ends the response. Shortcut for easy removal when switching streams. */
  finisher;
  method: string = "";
  filter;
  threshold;
  enforceEncoding;
  ended = false;
  createStream;
  length: number = 0;
  listeners: any[] | null = [];
  stream: PassThrough | zlib.Gzip | zlib.BrotliCompress | zlib.Deflate | undefined;

  shouldCompress() {
    const { req, res } = this;
    const type = res.getHeader('Content-Type')

    if (type === undefined || !compressible(type)) {
      debug('%s not compressible', type)
      return false
    }

    return true
  }

  /** This checks all of the headers that have been already set and sets up encoding. */
  beforeWriteHead() {
    const { req, res } = this;

    this.method = this.getEncodingMethod()

    // compression stream
    debug('using %s compression', this.method)
    this.stream = this.createStream(this.method);

    if (this.method && this.method !== "gzip-stream") {
      res.setHeader('Content-Encoding', this.method)
      res.removeHeader('Content-Length')
    }

    // vary
    vary(res, 'Accept-Encoding');

    this.stream.pipe(this.res, { end: false });
    this.res.on("unpipe", this.finisher);

  }

  async splitStream() {
    await new Promise(resolve => {
      this.res.off("unpipe", this.finisher);
      this.res.once("unpipe", resolve);
      this.stream!.end();
    });
    this.stream = this.createStream(this.method);
    await new Promise(resolve => {
      this.res.on("pipe", resolve);
      this.res.on("unpipe", this.finisher);
      this.stream!.pipe(this.res, { end: false });
    });
  }

  getEncodingMethod(): string {
    const { req, res } = this;



    if (res.getHeader("content-type") === "application/gzip"
      && res.getHeader("content-encoding") === "identity"
      && res.getHeader("x-gzip-stream") === "yes"
    ) return "gzip-stream";

    const encoding = res.getHeader('Content-Encoding');
    if (encoding) return ""; //the content is already encoded

    // determine if request is filtered
    if (!this.filter()) {
      debug('filtered')
      return "";
    }

    var cacheControl = res.getHeader('cache-control') as string;
    if (cacheControl && cacheControlNoTransformRegExp.test(cacheControl)) {
      // Don't compress for Cache-Control: no-transform
      // https://tools.ietf.org/html/rfc7234#section-5.2.2.4
      debug('no transform')
      return "";
    }



    // content-length below threshold
    if (res.getHeader('Content-Length') && Number(res.getHeader('Content-Length')) < this.threshold) {
      debug('size below threshold')
      return "";
    }

    // head
    if (req.method === 'HEAD') {
      debug("HEAD request")
      return "";
    }

    // compression method
    var negotiator = new Negotiator(req)
    var method = negotiator.encoding(SUPPORTED_ENCODING, PREFERRED_ENCODING)

    // if no method is found, use the default encoding
    if (!req.headers['accept-encoding'] && encodingSupported.indexOf(this.enforceEncoding) !== -1) {
      method = this.enforceEncoding
    }

    // negotiation failed
    if (!method) {
      debug('not acceptable')
      return "";
    }

    return method;

  }
}

