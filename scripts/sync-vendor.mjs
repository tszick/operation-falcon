import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const destination = new URL('assets/vendor/i18next/', root);
await mkdir(destination, { recursive: true });
await copyFile(
  new URL('node_modules/i18next/dist/esm/i18next.js', root),
  new URL('i18next.js', destination),
);
await copyFile(new URL('node_modules/i18next/LICENSE', root), new URL('LICENSE.txt', destination));
const { version } = JSON.parse(
  await readFile(new URL('node_modules/i18next/package.json', root), 'utf8'),
);
await writeFile(
  new URL('version.json', destination),
  JSON.stringify({ name: 'i18next', version, license: 'MIT' }, null, 2) + '\n',
);
