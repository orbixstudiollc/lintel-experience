import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = dirname(fileURLToPath(import.meta.url));
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.hdr': 'image/vnd.radiance',
  '.mp4': 'video/mp4',
  '.wasm': 'application/wasm',
};

function reply(response, status, message, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  response.end(message);
}

function isWithin(root, target) {
  const path = relative(root, target);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function readRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const first = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const last = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first > last || first >= size) return null;
  return { first, last };
}

export function createSiteServer({ root = siteRoot } = {}) {
  const rootPath = resolve(root);
  return createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        reply(response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
        return;
      }

      let pathname;
      try {
        pathname = decodeURIComponent((request.url ?? '/').split(/[?#]/, 1)[0]);
      } catch {
        reply(response, 400, 'Invalid request path');
        return;
      }
      // Check the raw decoded path before URL or filesystem normalization can erase traversal.
      if (!pathname.startsWith('/') || /[\\:\x00-\x1f]/.test(pathname) || pathname.split('/').some(part => part.startsWith('.'))) {
        reply(response, 403, 'Forbidden');
        return;
      }

      let filename = resolve(rootPath, `.${pathname}`);
      if (!isWithin(rootPath, filename)) {
        reply(response, 403, 'Forbidden');
        return;
      }
      let info;
      try {
        if ((await stat(filename)).isDirectory()) filename = resolve(filename, 'index.html');
        const resolvedFile = await realpath(filename);
        const resolvedRoot = await realpath(rootPath);
        if (!isWithin(resolvedRoot, resolvedFile)) {
          reply(response, 403, 'Forbidden');
          return;
        }
        info = await stat(resolvedFile);
        filename = resolvedFile;
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EACCES') {
          reply(response, 404, 'Not found');
          return;
        }
        throw error;
      }
      if (!info.isFile()) {
        reply(response, 404, 'Not found');
        return;
      }

      const headers = {
        'Content-Type': contentTypes[extname(filename).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': info.size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      };
      let range;
      if (request.method === 'GET' && request.headers.range) {
        range = readRange(request.headers.range, info.size);
        if (!range) {
          reply(response, 416, 'Range not satisfiable', { 'Content-Range': `bytes */${info.size}` });
          return;
        }
        headers['Content-Length'] = range.last - range.first + 1;
        headers['Content-Range'] = `bytes ${range.first}-${range.last}/${info.size}`;
      }
      response.writeHead(range ? 206 : 200, headers);
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      const stream = createReadStream(filename, range ? { start: range.first, end: range.last } : {});
      stream.on('error', error => response.destroy(error));
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      console.error(error);
      if (response.headersSent) response.destroy(error);
      else reply(response, 500, 'Server error');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portFlag = process.argv.findIndex(argument => argument === '--port');
  const inlinePort = process.argv.find(argument => argument.startsWith('--port='));
  const port = Number(portFlag >= 0 ? process.argv[portFlag + 1] : inlinePort?.slice(7) ?? process.env.PORT ?? 5178);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('Choose a port between 1 and 65535 with PORT or --port.');
    process.exitCode = 1;
  } else {
    const server = createSiteServer();
    server.on('error', error => {
      console.error(`Could not start Casa Serra: ${error.message}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => console.log(`Casa Serra: http://127.0.0.1:${port}/`));
  }
}
