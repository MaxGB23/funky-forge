import assert from 'node:assert/strict';
import test from 'node:test';

import { readDocument, normalizeBody, bodyHash, frontmatterBlock } from '../src/lib/frontmatter.js';

const artifact = ['---', 'phase: design', 'depends_on: [problem]', 'status: draft', '---', '', '# Design', '', 'Body line.', ''].join('\n');

test('splits frontmatter from body', () => {
  const doc = readDocument(artifact);
  assert.equal(doc.data.phase, 'design');
  assert.deepEqual(doc.data.depends_on, ['problem']);
  assert.equal(doc.body, '\n# Design\n\nBody line.\n');
  assert.equal(doc.frontmatterRaw, ['phase: design', 'depends_on: [problem]', 'status: draft'].join('\n'));
});

test('a document without frontmatter has empty data and the whole body', () => {
  const doc = readDocument('# Just markdown\n');
  assert.deepEqual(doc.data, {});
  assert.equal(doc.body, '# Just markdown\n');
  assert.equal(doc.frontmatterRaw, null);
});

test('an unterminated frontmatter block is a frontmatter error', () => {
  assert.throws(() => readDocument('---\nphase: design\n# no close\n'), /FRONTMATTER_INVALID/);
});

test('normalization is independent of line endings and trailing spaces', () => {
  const lf = 'body\r\nwith spaces   \r\n';
  assert.equal(normalizeBody(lf), 'body\nwith spaces\n');
});

test('normalization trims outer blank lines and keeps exactly one trailing LF', () => {
  assert.equal(normalizeBody('\n\nbody\n\n\n'), 'body\n');
});

test('normalization excludes frontmatter', () => {
  const withFm = '---\nphase: design\n---\n\nbody\n';
  assert.equal(normalizeBody(withFm), 'body\n');
});

test('the body hash is stable and prefixed', () => {
  const a = bodyHash(readDocument(artifact));
  const b = bodyHash(readDocument(artifact));
  assert.match(a, /^sha256:[0-9a-f]{64}$/);
  assert.equal(a, b);
});

test('the body hash ignores frontmatter changes and detects body changes', () => {
  const before = bodyHash(readDocument(artifact));
  const frontmatterChanged = artifact.replace('status: draft', 'status: approved');
  const bodyChanged = artifact.replace('Body line.', 'Body line, edited.');
  assert.equal(bodyHash(readDocument(frontmatterChanged)), before);
  assert.notEqual(bodyHash(readDocument(bodyChanged)), before);
});

test('frontmatterBlock returns the raw block for diagnostics', () => {
  assert.match(frontmatterBlock(artifact), /^phase: design/);
  assert.equal(frontmatterBlock('# no frontmatter'), null);
});
