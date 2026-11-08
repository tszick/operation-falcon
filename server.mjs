import { attachMultiplayer } from './server/multiplayer-server.mjs';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './server/static-server.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const port = process.env.PORT === undefined ? 5173 : Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be an integer from 1 to 65535.');
const host = process.env.HOST || '127.0.0.1';
const allowedHosts = (process.env.ALLOWED_HOSTS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const server = createStaticServer({ root, allowedHosts });
attachMultiplayer(server, {
  allowedHosts,
  onPerformance:
    process.env.MULTIPLAYER_DIAGNOSTICS === '1'
      ? (sample) => console.log(JSON.stringify({ multiplayerPerformance: sample }))
      : undefined,
});
server.listen(port, host, () =>
  console.log(`Operation Falcon: Redline: http://${host}:${server.address().port}`),
);
