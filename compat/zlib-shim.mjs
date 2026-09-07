// node:zlib 兼容层: node 22.7 缺 createZstdCompress/createZstdDecompress(22.16+)。
// 用 zstd-codec(wasm) 以缓冲式 Transform 补齐; 其余导出原样透传。
export * from 'node:zlib';
import { Transform } from 'node:stream';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ZstdCodec } = require('zstd-codec');
const codec = await new Promise((resolve) => ZstdCodec.run((z) => resolve(z)));
const simple = new codec.Simple();

function zstdStream(kind) {
  return class ZstdStream extends Transform {
    constructor(options = {}) {
      super(options);
      this._chunks = [];
    }
    _transform(chunk, _enc, cb) {
      this._chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    }
    _flush(cb) {
      try {
        const buf = Buffer.concat(this._chunks);
        const input = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        const out = kind === 'decompress' ? simple.decompress(input) : simple.compress(input, 3);
        if (!out) return cb(new Error('zstd ' + kind + ' failed'));
        this.push(Buffer.from(out));
        cb();
      } catch (e) { cb(e); }
    }
  };
}
export function createZstdCompress(options) { return new (zstdStream('compress'))(options); }
export function createZstdDecompress(options) { return new (zstdStream('decompress'))(options); }

const toU8 = (b) => (b instanceof Uint8Array ? b : Buffer.from(b));
export function zstdCompressSync(buf, options) { return Buffer.from(simple.compress(toU8(buf), options?.level ?? 3)); }
export function zstdDecompressSync(buf, options) { return Buffer.from(simple.decompress(toU8(buf))); }
export function zstdCompress(buf, options, cb) {
  if (typeof options === 'function') { cb = options; options = undefined; }
  const run = () => { try { return zstdCompressSync(buf, options); } catch (e) { throw e; } };
  if (typeof cb === 'function') { try { cb(null, run()); } catch (e) { cb(e); } return; }
  return Promise.resolve().then(run);
}
export function zstdDecompress(buf, options, cb) {
  if (typeof options === 'function') { cb = options; options = undefined; }
  if (typeof cb === 'function') { try { cb(null, zstdDecompressSync(buf, options)); } catch (e) { cb(e); } return; }
  return Promise.resolve().then(() => zstdDecompressSync(buf, options));
}
