import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { parsePublicOrigin, sameOriginRequest } from '../server/request-policy.mjs';
import { createStaticServer } from '../server/static-server.mjs';
import { attachMultiplayer } from '../server/multiplayer-server.mjs';

const host = 'falcon.example.com';
const origin = 'https://' + host;
const request = (value = origin, headers = {}, encrypted = false) => ({
  headers: { host, origin: value, ...headers },
  socket: { encrypted },
});

test('public origin configuration accepts only an explicit HTTPS origin', () => {
  assert.equal(parsePublicOrigin(undefined), null);
  assert.equal(parsePublicOrigin(''), null);
  assert.equal(parsePublicOrigin(origin + '/'), origin);
  assert.equal(parsePublicOrigin(origin + ':8443'), origin + ':8443');
  for (const value of [
    'invalid',
    'http://' + host,
    origin + '/game',
    origin + '?q=1',
    origin + '#hash',
    'https://user:password@' + host,
  ])
    assert.throws(() => parsePublicOrigin(value));
});

test('TLS termination requires explicit public origin and an allowed matching host', () => {
  assert.equal(sameOriginRequest(request(), [host]), false);
  assert.equal(sameOriginRequest(request(), [host], origin), true);
  assert.equal(sameOriginRequest(request(), [], origin), false);
  assert.equal(
    sameOriginRequest(
      request(origin, { host: 'other.example.com' }),
      [host, 'other.example.com'],
      origin,
    ),
    false,
  );
  assert.equal(sameOriginRequest({ headers: { host }, socket: {} }, [host], origin), false);
  for (const value of [
    'null',
    'https://evil.test',
    'http://' + host,
    origin + ':8443',
    origin + '/game',
    origin + '?q=1',
    origin + '#hash',
    'https://user:password@' + host,
  ])
    assert.equal(sameOriginRequest(request(value), [host], origin), false);
});

test('forwarded headers cannot change the expected origin or bypass host validation', () => {
  const headers = {
    'x-forwarded-proto': 'https',
    'x-forwarded-host': host,
    forwarded: 'proto=https;host=' + host,
  };
  assert.equal(sameOriginRequest(request(origin, headers), [host]), false);
  assert.equal(sameOriginRequest(request('https://evil.test', headers), [host], origin), false);
  assert.equal(
    sameOriginRequest(request(origin, { ...headers, host: 'evil.test' }), [host], origin),
    false,
  );
  assert.equal(sameOriginRequest(request(origin, {}, true), [host]), true);
  assert.equal(
    sameOriginRequest({
      headers: { host: 'localhost:5173', origin: 'http://localhost:5173' },
      socket: {},
    }),
    true,
  );
});

test(
  'WebSocket upgrades work on the HTTP backend with an explicitly configured public HTTPS origin',
  { timeout: 5000 },
  async (t) => {
    const server = createStaticServer({ root: process.cwd(), allowedHosts: [host] });
    const multiplayer = attachMultiplayer(server, { allowedHosts: [host], publicOrigin: origin });
    t.after(async () => {
      multiplayer.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/multiplayer`, {
      origin,
      headers: { Host: host },
    });
    t.after(() => ws.terminate());
    await once(ws, 'open');
    assert.equal(ws.readyState, WebSocket.OPEN);
    ws.close();
    await once(ws, 'close');
  },
);
