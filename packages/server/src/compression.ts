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
import { BrotliOptions, ZlibOptions } from 'zlib';
import * as zlib from 'zlib';
import { GenericRequest, GenericResponse } from "./streamer";


/**
 * @const
 * whether current node version has brotli support
 */
const hasBrotliSupport = 'createBrotliCompress' in zlib

/**
 * Module variables.
 * @private
 */
const cacheControlNoTransformRegExp = /(?:^|,)\s*?no-transform\s*?(?:,|$)/
const SUPPORTED_ENCODING = hasBrotliSupport ? ['br', 'gzip', 'deflate', 'identity'] as const : ['gzip', 'deflate', 'identity'] as const
const PREFERRED_ENCODING = hasBrotliSupport ? ['br', 'gzip'] as const : ['gzip'] as const


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

  constructor(
    private req: GenericRequest,
    private res: GenericResponse,
    { identity, brotli, threshold, defaultEncoding, deflate, gzip }: CompressorOptions,
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
    this.threshold = bytes.parse(threshold)
    this.defaultEncoding = defaultEncoding || 'identity'

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

    this.res.on("close", () => {
      if (this.stream) this.stream.end();
      this.ended = true;
    });

  }
  /** Ends the response. Shortcut for easy removal when switching streams. */
  finisher;
  enabled: boolean = true;
  method: string = "";
  threshold;
  defaultEncoding;
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

    this.method = this.getEncodingMethod(SUPPORTED_ENCODING)

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

  getEncodingMethod(supportedEncoding: readonly ('br' | 'gzip' | 'deflate' | 'identity')[]): 'br' | 'gzip' | 'deflate' | 'identity' | 'gzip-stream' | '' {
    const { req, res } = this;

    if (res.getHeader("content-type") === "application/gzip"
      && res.getHeader("content-encoding") === "identity"
      && res.getHeader("x-gzip-stream") === "yes"
    ) return "gzip-stream";

    if (!this.enabled) return "";

    const encoding = res.getHeader('Content-Encoding');
    if (encoding) {
      debug('encoding already set');
      return "";
    }



    // determine if request is filtered
    if (!this.shouldCompress()) {
      debug('should not compress');
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

    // if no accept-encoding header is found, use the default encoding
    if (!req.headers['accept-encoding'] && supportedEncoding.includes(this.defaultEncoding)) {
      debug("no accept-encoding header, using default encoding %s", this.defaultEncoding)
      return this.defaultEncoding
    }

    // determine the compression method to use for this request
    var negotiator = new Negotiator(req)
    var method = negotiator.encoding(supportedEncoding, PREFERRED_ENCODING)

    // negotiation failed, just pretend we never checked.
    if (!method) {
      debug('accept-encoding header not acceptable')
      return "";
    }

    return method;

  }
}

