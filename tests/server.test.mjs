import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createSiteServer } from '../server.mjs';

let fixtureRoot;
let server;
let port;

before(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'casa-serra-server-'));
  await mkdir(join(fixtureRoot, 'assets'));
  await mkdir(join(fixtureRoot, '.git'));
  await writeFile(join(fixtureRoot, 'index.html'), '<!doctype html><title>Casa Serra</title>');
  await writeFile(join(fixtureRoot, 'assets', 'scene.js'), 'export const room = "hall";');
  await writeFile(join(fixtureRoot, 'assets', 'theme.css'), 'body{margin:0}');
  await writeFile(join(fixtureRoot, '.git', 'config'), 'private metadata');
  for (const extension of ['jpg', 'png', 'svg', 'woff2', 'hdr']) {
    await writeFile(join(fixtureRoot, 'assets', `sample.${extension}`), extension);
  }
  await writeFile(join(fixtureRoot, 'assets', 'walk.mp4'), Buffer.from('0123456789'));
  server = createSiteServer({ root: fixtureRoot });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (fixtureRoot) await rm(fixtureRoot, { recursive: true, force: true });
});

function get(path, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('serves the root document, query strings, and HEAD without a body', async () => {
  const page = await get('/?room=hall');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /^text\/html/);
  assert.match(page.body, /Casa Serra/);
  const head = await get('/', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(Number(head.headers['content-length']), Buffer.byteLength(page.body));
  const rangedHead = await get('/', { method: 'HEAD', headers: { Range: 'bytes=0-5' } });
  assert.equal(rangedHead.status, 200);
  assert.equal(rangedHead.body, '');
  assert.equal(Number(rangedHead.headers['content-length']), Buffer.byteLength(page.body));
  assert.equal(rangedHead.headers['content-range'], undefined);
});

test('delivers source, texture, font, HDR, and video assets with usable MIME types', async () => {
  const expectations = {
    'scene.js': 'text/javascript',
    'theme.css': 'text/css',
    'sample.jpg': 'image/jpeg',
    'sample.png': 'image/png',
    'sample.svg': 'image/svg+xml',
    'sample.woff2': 'font/woff2',
    'sample.hdr': 'image/vnd.radiance',
    'walk.mp4': 'video/mp4',
  };
  for (const [filename, contentType] of Object.entries(expectations)) {
    const asset = await get(`/assets/${filename}`);
    assert.equal(asset.status, 200, filename);
    assert.ok(asset.headers['content-type'].startsWith(contentType), filename);
    assert.ok(asset.body.length > 0, filename);
  }
});

test('streams bounded, open-ended, and suffix video byte ranges', async () => {
  for (const [range, body, contentRange] of [
    ['bytes=2-5', '2345', 'bytes 2-5/10'],
    ['bytes=7-', '789', 'bytes 7-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
  ]) {
    const response = await get('/assets/walk.mp4', { headers: { Range: range } });
    assert.equal(response.status, 206);
    assert.equal(response.body, body);
    assert.equal(response.headers['content-range'], contentRange);
    assert.equal(Number(response.headers['content-length']), body.length);
  }
  for (const range of ['bytes=20-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,4-5', 'nonsense']) {
    const response = await get('/assets/walk.mp4', { headers: { Range: range } });
    assert.equal(response.status, 416, range);
    assert.equal(response.headers['content-range'], 'bytes */10');
  }
});

test('rejects hidden files, traversal, Windows path escapes, and malformed encodings', async () => {
  for (const path of [
    '/.git/config', '/%2egit/config', '/../index.html', '/assets/../index.html',
    '/%2e%2e/index.html', '/assets/%2e%2e/index.html', '/assets%5c..%5cindex.html',
    '/C:/Windows/win.ini', '/%00',
  ]) {
    assert.equal((await get(path)).status, 403, path);
  }
  assert.equal((await get('/%ZZ')).status, 400);
  assert.equal((await get('/assets/')).status, 404);
  assert.equal((await get('/missing-file.js')).status, 404);
  assert.equal((await get('/', { method: 'POST' })).status, 405);
});
