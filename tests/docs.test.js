import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';

import { CLAUDE_MARKER, SHARED_MARKERS } from '../src/commands/install.js';

const ROOT = resolve(import.meta.dirname, '..');

/** @param {string} file */
function markdown(file) {
  return readFileSync(join(ROOT, file), 'utf8');
}

/** @returns {string[]} */
function docsFiles() {
  const files = ['README.md'];
  const walk = (dir) => {
    for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.md')) files.push(path);
    }
  };
  walk('docs');
  return files;
}

/** Markdown links plus the raw HTML image sources a document may use to size a picture. Both are
 * checked, so an image that moves cannot quietly stop rendering.
 * @param {string} text */
function links(text) {
  const inline = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
  const raw = [...text.matchAll(/<img[^>]*\bsrc="([^"]+)"/g)].map((match) => match[1]);
  return [...inline, ...raw];
}

/**
 * GitHub-style heading slug.
 * @param {string} heading
 * @returns {string}
 */
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    // GitHub drops a leading emoji and keeps the slug clean; without this trim a heading like
    // "## 📄 License" would be recorded as `-license` and a correct `#license` link would fail.
    .replace(/^-+|-+$/g, '');
}

/** @param {string} file */
function anchors(file) {
  const headings = readFileSync(join(ROOT, file), 'utf8')
    .split('\n')
    .filter((line) => /^#{1,6}\s/.test(line))
    .map((line) => slug(line.replace(/^#{1,6}\s*/, '')));
  return new Set(headings);
}

test('every path named in the AGENTS.md map exists', () => {
  const rows = markdown('AGENTS.md')
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => line.slice(2, line.indexOf('`', 2)));
  // A map with fewer rows than the parser expects means the row parser broke, not the map.
  assert.ok(rows.length >= 8, `parsed only ${rows.length} map rows; the parser is broken, not the map`);
  const missing = rows.filter((path) => {
    const stat = statSync(join(ROOT, path), { throwIfNoEntry: false });
    return !stat || !(stat.isFile() || stat.isDirectory());
  });
  assert.deepEqual(missing, []);
});

test('every relative documentation link points at a file that exists', () => {
  const files = docsFiles();
  const broken = [];
  for (const file of files) {
    for (const link of links(markdown(file))) {
      if (/^(https?:|mailto:|#)/.test(link)) continue;
      const [target] = link.split('#');
      const path = resolve(ROOT, dirname(file), target);
      const stat = statSync(path, { throwIfNoEntry: false });
      if (!stat || !(stat.isFile() || stat.isDirectory())) broken.push(`${file} -> ${link}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('every anchor link matches a heading in its target document', () => {
  const files = docsFiles();
  const broken = [];
  for (const file of files) {
    for (const link of links(markdown(file))) {
      if (!link.includes('#') || /^(https?:|mailto:|#)/.test(link)) continue;
      const [target, anchor] = link.split('#');
      const path = relative(ROOT, resolve(ROOT, dirname(file), target)).replace(/\\/g, '/');
      if (!anchors(path).has(anchor)) broken.push(`${file} -> ${link}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('every top-level document is reachable from the README', () => {
  const readme = markdown('README.md');
  const topLevel = readdirSync(join(ROOT, 'docs'), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `docs/${entry.name}`);
  const missing = topLevel.filter((file) => !readme.includes(file));
  assert.deepEqual(missing, []);
});

test('the README stays an introduction, not the reference', () => {
  const lines = markdown('README.md').split('\n').length;
  assert.ok(lines <= 170, `README grew to ${lines} lines; move detail into docs/`);
});

/// A version written into a document is a second copy of a fact `package.json` and the tag already
/// own, and README.md travels inside every tarball, so the copy reaches npm one release late by
/// construction. The rule here is the narrow one: a document may restate the version, and never a
/// different one.

test('no document names a version the manifest does not own', () => {
  const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  assert.match(version, /^\d+\.\d+\.\d+$/, 'package.json carries no semver version');

  for (const file of docsFiles()) {
    for (const match of markdown(file).matchAll(/funky-forge@(\d+\.\d+\.\d+)/g)) {
      assert.equal(
        match[1],
        version,
        `${file} names funky-forge@${match[1]}, and the manifest says ${version}`,
      );
    }
  }
});

test('the CLI reference names exactly the markers detection checks', () => {
  const row = markdown('docs/cli.md')
    .split('\n')
    .find((line) => line.startsWith('| Detection |'));
  assert.notEqual(row, undefined, 'docs/cli.md describes no detection markers');
  const documented = new Set([...row.matchAll(/`(\.[^`]*)`/g)].map((match) => match[1].replace(/\/$/, '')));
  assert.deepEqual(documented, new Set([CLAUDE_MARKER, ...SHARED_MARKERS]));
});

test('the CLI reference documents the two write commands and the codes approve reports', () => {
  const cli = markdown('docs/cli.md');
  for (const heading of ['### `approve <phase>`', '### `stale <phase>`']) assert.ok(cli.includes(heading), heading);
  for (const code of ['APPROVAL_GATE_FAILED', 'ALREADY_APPROVED', 'STATUS_NOT_APPROVABLE']) assert.ok(cli.includes(code), code);
  const rows = cli.split('\n').filter((line) => line.startsWith('| `'));
  for (const row of ['| `approve <phase>`', '| `stale <phase>`']) {
    assert.ok(rows.some((line) => line.startsWith(row)), `${row} is missing from the command table`);
  }
});

test('the shipped skill performs approval and propagation with the commands, not by editing YAML', () => {
  const skill = markdown('skill/SKILL.md');
  assert.ok(skill.includes('funky-forge approve <phase>'), 'SKILL.md does not name funky-forge approve');
  assert.ok(skill.includes('funky-forge stale <phase>'), 'SKILL.md does not name funky-forge stale');

  const map = markdown('skill/references/00-map.md');
  assert.ok(map.includes('funky-forge approve <phase>'), '00-map.md does not name funky-forge approve');
  assert.ok(map.includes('funky-forge stale <phase>'), '00-map.md does not name funky-forge stale');
  assert.doesNotMatch(map, /set its status back to `draft` and clear `approved_\*`/, '00-map.md still tells an agent to edit the YAML by hand');
});

test('the README names the commands that write the gate', () => {
  const readme = markdown('README.md');
  assert.ok(readme.includes('funky-forge approve'), 'README.md does not name funky-forge approve');
  assert.ok(readme.includes('funky-forge stale'), 'README.md does not name funky-forge stale');
});
