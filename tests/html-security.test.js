import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../src/ui/html.js';
test('untrusted labels are encoded as text for both content and quoted attributes', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
  const escaped = escapeHtml(`<img src=x onerror="alert('x')">&`);
  assert.equal(escaped, '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
  assert.ok(!escaped.includes('<'));
});
