import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const SKILL = 'skill/SKILL.md';

/** @param {string} file @returns {string[]} */
function lines(file) {
  return readFileSync(join(ROOT, file), 'utf8')
    .split('\n')
    .map((line) => line.replace(/\r$/, ''));
}

/**
 * The frontmatter block a harness reads, without its fences. A file that does not open with `---`
 * or never closes it gives the harness an empty skill instead of an error, so the coverage here is
 * the only warning anyone gets.
 * @param {string[]} text
 * @returns {string[]}
 */
function block(text) {
  assert.equal(text[0], '---', `${SKILL} must open with the frontmatter fence`);
  const end = text.indexOf('---', 1);
  assert.ok(end > 0, `${SKILL} must close the frontmatter fence`);
  return text.slice(1, end);
}

/**
 * One top-level scalar, with the continuation lines YAML folds together. A plain value holding
 * ": " is what a strict parser reads as a nested mapping: `mapping values are not allowed in this
 * context`. Quoting the whole value keeps the colon inside the scalar.
 * @param {string[]} text
 * @param {string} key
 * @returns {string} the value, without quotes
 */
function scalar(text, key) {
  const start = text.findIndex((line) => line.startsWith(`${key}:`));
  assert.notEqual(start, -1, `the frontmatter declares no "${key}" key`);
  const parts = [text[start].slice(key.length + 1).trim()];
  for (let index = start + 1; index < text.length; index += 1) {
    const line = text[index];
    if (line.trim() === '' || !/^\s/.test(line)) break;
    parts.push(line.trim());
  }
  const raw = parts.join(' ').trim();
  assert.notEqual(raw, '', `"${key}" is empty`);
  const quote = raw[0];
  if (quote === "'" || quote === '"') {
    assert.ok(raw.length > 1 && raw.endsWith(quote), `"${key}" opens ${quote} and never closes it`);
    return raw.slice(1, -1);
  }
  assert.ok(
    !raw.includes(': ') && !raw.endsWith(':'),
    `"${key}" is a plain scalar holding ": ", which a strict parser reads as a nested mapping; quote the whole value`,
  );
  return raw;
}

test('the shipped skill opens and closes a frontmatter block', () => {
  assert.ok(block(lines(SKILL)).length > 0, `${SKILL} ships an empty frontmatter block`);
});

test('the frontmatter declares exactly the two keys a harness reads', () => {
  const keys = block(lines(SKILL))
    .filter((line) => /^[A-Za-z0-9_-]+:/.test(line))
    .map((line) => line.slice(0, line.indexOf(':')));
  assert.deepEqual(keys, ['name', 'description']);
});

test('the skill name matches the package name, so install and frontmatter cannot disagree', () => {
  const name = scalar(block(lines(SKILL)), 'name');
  const { name: packageName } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(name, packageName);
});

test('the description is one scalar, so its colon stays inside the value', () => {
  const description = scalar(block(lines(SKILL)), 'description');
  assert.ok(description.length > 40, 'the description has to say when to use the skill');
});

test('the description is quoted, which is what keeps the colon inside the scalar', () => {
  const line = block(lines(SKILL)).find((entry) => entry.startsWith('description:'));
  assert.notEqual(line, undefined, `${SKILL} ships no description`);
  const value = line.slice('description:'.length).trim();
  assert.match(value, /^['"]/, 'quote the description: an unquoted colon makes a strict parser refuse the file');
});

test('the guard rejects the unquoted value that broke the published page', () => {
  const rejected = [
    'name: funky-forge',
    'description: Plan and quote projects in four gated phases: problem, design, estimate, proposal.',
  ];
  assert.throws(() => scalar(rejected, 'description'), /nested mapping/);
});

test('the guard rejects a quoted value that never closes', () => {
  assert.throws(() => scalar(["description: 'Plan and quote projects"], 'description'), /never closes/);
});

test('the guard accepts the folded form a strict parser also accepts', () => {
  const folded = ["description: 'Plan and quote projects: problem,", "  design, estimate.'"];
  assert.equal(scalar(folded, 'description'), 'Plan and quote projects: problem, design, estimate.');
});
