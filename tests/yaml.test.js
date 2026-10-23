import assert from 'node:assert/strict';
import test from 'node:test';

import { parseYaml } from '../src/lib/yaml.js';

test('parses flat scalars with the types the artifacts use', () => {
  const data = parseYaml(
    [
      'schema: 1',
      'phase: design',
      'status: draft',
      'approved_by: null',
      'approved: true',
      'ratio: 0.2',
      'quoted: "hello: world"',
      "single: 'it''s fine'",
      'empty:',
    ].join('\n'),
  );

  assert.equal(data.schema, 1);
  assert.equal(data.phase, 'design');
  assert.equal(data.approved_by, null);
  assert.equal(data.approved, true);
  assert.equal(data.ratio, 0.2);
  assert.equal(data.quoted, 'hello: world');
  assert.equal(data.single, "it's fine");
  assert.equal(data.empty, null);
});

test('parses inline lists and inline empty list', () => {
  const data = parseYaml('depends_on: [problem, design]\nempty: []');
  assert.deepEqual(data.depends_on, ['problem', 'design']);
  assert.deepEqual(data.empty, []);
});

test('parses a nested map', () => {
  const data = parseYaml(['pricing:', '  currency: USD', '  contingency: 0.2'].join('\n'));
  assert.deepEqual(data.pricing, { currency: 'USD', contingency: 0.2 });
});

test('parses a list of maps', () => {
  const data = parseYaml(
    [
      'blocks:',
      '  - id: discovery',
      '    name: Discovery',
      '    optimistic: 16',
      '    rationale: "Requirements workshop"',
      '  - id: backend',
      '    name: Backend',
      '    likely: 24',
    ].join('\n'),
  );

  assert.equal(data.blocks.length, 2);
  assert.equal(data.blocks[0].id, 'discovery');
  assert.equal(data.blocks[0].optimistic, 16);
  assert.equal(data.blocks[1].name, 'Backend');
});

test('parses a list of scalars', () => {
  const data = parseYaml(['items:', '  - one', '  - two'].join('\n'));
  assert.deepEqual(data.items, ['one', 'two']);
});

test('ignores blank lines and full-line comments', () => {
  const data = parseYaml(['# leading comment', '', 'phase: problem', '  ', '# trailing'].join('\n'));
  assert.deepEqual(data, { phase: 'problem' });
});

test('keeps a hash character inside a quoted string', () => {
  const data = parseYaml('note: "issue #42"');
  assert.equal(data.note, 'issue #42');
});

test('rejects a line that is not a key/value pair', () => {
  assert.throws(() => parseYaml('phase problem'), /YAML_INVALID/);
});

test('rejects inconsistent indentation inside a list item', () => {
  assert.throws(() => parseYaml(['blocks:', '  - id: a', '     name: A'].join('\n')), /YAML_INVALID/);
});
