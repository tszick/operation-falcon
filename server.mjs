import { fileURLToPath } from 'node:url';
import { createStaticServer } from './server/static-server.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const port = process.env.PORT === undefined ? 5173 : Number(process.env.PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be an integer from 1 to 65535.');
const server = createStaticServer({ root });
server.listen(port, '127.0.0.1', () =>
  console.log(`Operation Falcon: Redline: http://localhost:${server.address().port}`),
);
