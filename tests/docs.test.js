import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';

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
