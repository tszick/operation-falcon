import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
async function files(dir) {
  const found = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) found.push(...(await files(p)));
    else if (/\.(mjs|js)$/.test(e.name)) found.push(p);
  }
  return found;
}
let failures = 0;
const sources = await files(root);
for (const file of sources) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    failures++;
  }
}
console.log(`Syntax: ${sources.length} files, ${failures} errors.`);
process.exitCode = failures ? 1 : 0;
