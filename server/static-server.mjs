import http from 'node:http';
import { allowedHost } from './request-policy.mjs';
import { realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
const mime = {
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
export function contained(root, file) {
  const rel = path.relative(root, file);
  return rel !== '' && !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel);
}
function allowed(relative) {
  const parts = relative.split('/');
  if (parts.some((p) => !p || p.startsWith('.') || p.includes('\\') || p.includes(':')))
    return false;
  if (!mime[path.extname(relative)]) return false;
  return (
    ['src', 'assets', 'tests'].includes(parts[0]) ||
    (parts.length === 1 &&
      [
        'index.html',
        'multiplayer.html',
        'encyclopedia.html',
        'flight-log.html',
        'tutorial.html',
        'style.css',
        'flight.css',
      ].includes(parts[0]))
  );
}
function headers(testPage) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': `default-src 'self'; script-src 'self'${testPage ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'`,
    'Cache-Control': 'no-store',
  };
}
export function createStaticServer({ root, allowedHosts = [] }) {
  const server = http.createServer(async (req, res) => {
    const reply = (status, message) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers(false) });
      res.end(message);
    };
    try {
      if (!allowedHost(req.headers.host, allowedHosts)) {
        reply(403, 'Forbidden host');
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.setHeader('Allow', 'GET, HEAD');
        reply(405, 'Method not allowed');
        return;
      }
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      } catch {
        reply(400, 'Malformed URL');
        return;
      }
      if (pathname.includes('\0')) {
        reply(400, 'Malformed URL');
        return;
      }
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (!allowed(relative)) {
        reply(403, 'Forbidden');
        return;
      }
      const resolvedRoot = await realpath(root),
        file = await realpath(path.resolve(root, relative));
      if (
        !contained(resolvedRoot, file) ||
        !allowed(path.relative(resolvedRoot, file).split(path.sep).join('/'))
      ) {
        reply(403, 'Forbidden');
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) {
        reply(404, 'Not found');
        return;
      }
      // Revalidate every visit so a deployment never leaves stale code behind,
      // but reuse unchanged textures/audio instead of downloading them again.
      const etag = `W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`,
        responseHeaders = {
          ...headers(relative.startsWith('tests/')),
          'Cache-Control': 'public, max-age=0, must-revalidate',
          ETag: etag,
          'Last-Modified': info.mtime.toUTCString(),
          'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
        },
        condition = req.headers['if-none-match'],
        modifiedSince = Date.parse(req.headers['if-modified-since']);
      const unchanged =
        condition !== undefined
          ? condition
              .split(',')
              .some((tag) => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === etag.slice(2))
          : Number.isFinite(modifiedSince) &&
            Math.floor(info.mtimeMs / 1000) * 1000 <= modifiedSince;
      if (unchanged) {
        res.writeHead(304, responseHeaders);
        res.end();
        return;
      }
      res.writeHead(200, { ...responseHeaders, 'Content-Length': info.size });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      await pipeline(createReadStream(file), res);
    } catch (error) {
      if (!res.headersSent)
        reply(['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500, 'Not found');
      else res.destroy();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  return server;
}
