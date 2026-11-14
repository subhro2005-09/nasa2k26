// Zero-dependency Brotli + gzip pre-compression for static hosts (nginx `brotli_static` / `gzip_static`,
// Caddy `precompressed`, Cloudflare Pages). The server then serves bytes straight from disk with no per-request CPU.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

const TEXT = new Set(['.html', '.js', '.css', '.json', '.svg', '.xml', '.txt', '.wasm']);
let raw = 0, br = 0, files = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name), s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    if (!TEXT.has(extname(p)) || s.size < 1024) continue;
    const buf = readFileSync(p);
    const q = s.size > 1_000_000 ? 9 : 11;
    const b = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: q } });
    writeFileSync(p + '.br', b); writeFileSync(p + '.gz', gzipSync(buf, { level: 9 }));
    raw += s.size; br += b.length; files++;
  }
})('dist');
console.log(`precompress: ${files} files, ${(raw / 1024).toFixed(0)} KB -> ${(br / 1024).toFixed(0)} KB brotli`);
