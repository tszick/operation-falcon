import test from 'node:test';
import assert from 'node:assert/strict';
import { createShaderProgram } from '../src/graphics/shaderProgram.js';
function fake(fail) {
  let id = 0;
  const deleted = [],
    programs = [],
    gl = {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      LINK_STATUS: 4,
      createProgram: () => ({ program: true }),
      createShader: (type) => ({ id: ++id, type }),
      shaderSource() {},
      compileShader() {},
      getShaderParameter: (s) => s.type !== fail,
      attachShader() {},
      linkProgram() {},
      getProgramParameter: () => fail !== 'link',
      getShaderInfoLog: () => 'bad shader',
      getProgramInfoLog: () => 'bad link',
      deleteShader: (s) => deleted.push(s),
      deleteProgram: (p) => programs.push(p),
    };
  return { gl, deleted, programs };
}
test('WebGL program compilation releases both shaders after success', () => {
  const { gl, deleted, programs } = fake();
  assert.ok(createShaderProgram(gl, 'vertex', 'fragment'));
  assert.equal(deleted.length, 2);
  assert.equal(programs.length, 0);
});
test('WebGL compilation and link errors release every allocated resource', () => {
  for (const stage of [1, 2, 'link']) {
    const { gl, deleted, programs } = fake(stage);
    assert.throws(() => createShaderProgram(gl, 'vertex', 'fragment'), /bad/);
    assert.equal(programs.length, 1);
    assert.equal(deleted.length, stage === 1 ? 1 : 2);
  }
});
