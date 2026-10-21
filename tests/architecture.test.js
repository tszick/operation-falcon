import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const source = fileURLToPath(new URL('../src/', import.meta.url));
async function sources(dir) {
  const list = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list.push(...(await sources(p)));
    else if (e.name.endsWith('.js')) list.push(p);
  }
  return list;
}
test('browser modules resolve local imports without dependency cycles or server coupling', async () => {
  // Exact browser-only leaf dependencies: local JSON resources and the pinned MIT vendor bundle.
  const browserLeaves = new Set(
    ['../src/locales/messages.json', '../assets/vendor/i18next/i18next.js'].map((p) =>
      fileURLToPath(new URL(p, import.meta.url)),
    ),
  );
  const files = await sources(source),
    graph = new Map();
  for (const file of files) {
    const code = await readFile(file, 'utf8'),
      imports = [...code.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)]
        .map((m) => m[1])
        .filter((s) => s.startsWith('.'))
        .map((s) => path.resolve(path.dirname(file), s));
    for (const dependency of imports) {
      assert.ok(
        dependency.startsWith(source) || browserLeaves.has(dependency),
        `Browser/server boundary: ${file}`,
      );
      assert.ok(
        files.includes(dependency) || browserLeaves.has(dependency),
        `Missing import: ${dependency}`,
      );
    }
    graph.set(
      file,
      imports.filter((dependency) => !browserLeaves.has(dependency)),
    );
  }
  const done = new Set(),
    active = new Set();
  function visit(file) {
    assert.ok(!active.has(file), `Dependency cycle: ${file}`);
    if (done.has(file)) return;
    active.add(file);
    for (const next of graph.get(file)) visit(next);
    active.delete(file);
    done.add(file);
  }
  for (const file of files) visit(file);
});
test('combat and graphics lifecycle layers do not depend on browser UI globals', async () => {
  for (const folder of ['combat', 'graphics'])
    for (const file of await sources(path.join(source, folder))) {
      const code = await readFile(file, 'utf8');
      assert.doesNotMatch(code, /\b(?:document|window|localStorage)\b/, file);
    }
});
