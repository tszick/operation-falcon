import { request } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStaticServer, contained } from '../server/static-server.mjs';
async function fixture(t) {
  const base = await mkdtemp(path.join(tmpdir(), 'falcon-server-')),
    root = path.join(base, 'public');
  await mkdir(root);
  await mkdir(path.join(root, 'src'));
  await mkdir(path.join(root, '.git'));
  await mkdir(path.join(root, 'tests'));
  await writeFile(path.join(root, 'index.html'), '<h1>Flight</h1>');
  await writeFile(path.join(root, 'src', 'app.js'), 'export const ready=true;');
  await writeFile(path.join(root, '.git', 'config'), 'private');
  await writeFile(path.join(root, 'package.json'), '{}');
  await writeFile(path.join(root, 'tests', 'probe.html'), '<script>0</script>');
  const server = createStaticServer({ root });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    assert.ok(contained(tmpdir(), base));
    await rm(base, { recursive: true, force: true });
  });
  return { root, base, url };
}
test('static server serves game files, HEAD and restrictive production headers', async (t) => {
  const { url } = await fixture(t);
  const r = await fetch(url);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Flight/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self';/);
  assert.doesNotMatch(r.headers.get('content-security-policy'), /unsafe-eval/);
  const head = await fetch(url + '/src/app.js', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.ok(Number(head.headers.get('content-length')) > 0);
  const diagnostic = await fetch(url + '/tests/probe.html');
  assert.match(
    diagnostic.headers.get('content-security-policy'),
    /script-src 'self' 'unsafe-inline'/,
  );
});
test('repository metadata, arbitrary files, path escapes, malformed URLs and unsupported methods are rejected', async (t) => {
  const { url } = await fixture(t);
  for (const pathname of [
    '/.git/config',
    '/package.json',
    '/node_modules/x.js',
    '/src/../.git/config',
    '/src/%2e%2e/.git/config',
    '/src/%5c..%5c.git%5cconfig',
  ])
    assert.equal((await fetch(url + pathname)).status, 403, pathname);
  assert.equal((await fetch(url + '/%ZZ')).status, 400);
  assert.equal((await fetch(url + '/%00')).status, 400);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  assert.equal((await fetch(url + '/src/missing.js')).status, 404);
  assert.equal(contained('/app/public', '/app/public-sibling/private'), false);
});
test('external Host headers are rejected to prevent DNS-rebinding access', async (t) => {
  const { url } = await fixture(t);
  for (const host of ['attacker.example', 'attacker@localhost']) {
    const status = await new Promise((resolve, reject) => {
      const req = request(url, { headers: { Host: host } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 403);
  }
});
test('symlinks cannot expose files outside the static root', async (t) => {
  const { url, root, base } = await fixture(t),
    outside = path.join(base, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'secret.js'), 'secret');
  await symlink(
    outside,
    path.join(root, 'src', 'link'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const r = await fetch(url + '/src/link/secret.js');
  assert.equal(r.status, 403);
  assert.doesNotMatch(await r.text(), /secret/);
});
