import assert from 'node:assert/strict';
import test from 'node:test';

import {
  sections,
  section,
  fencedBlocks,
  listItems,
  tableRows,
  placeholderTokens,
  htmlCommentCount,
} from '../src/lib/markdown.js';

const doc = [
  '# Design',
  '',
  'Intro.',
  '',
  '## Components and responsibilities',
  '',
  '- Catalogue - item register',
  '- Ledger - checkout rows',
  '',
  '## Data model',
  '',
  '```markdown',
  '## This heading is inside a fence',
  '- not a list item',
  'TBD is just text here',
  '```',
  '',
  '| NFR | Applies |',
  '|---|---|',
  '| Performance | yes |',
  '',
  '### Detail',
  '',
  '<!-- TBD: template hint -->',
  '',
  '### Another detail',
  '',
  'Text TBD here.',
].join('\n');

test('extracts headings without treating fenced lines as headings', () => {
  const found = sections(doc).map((entry) => `${entry.level}:${entry.title}`);
  assert.deepEqual(found, [
    '1:Design',
    '2:Components and responsibilities',
    '2:Data model',
    '3:Detail',
    '3:Another detail',
  ]);
});

test('a section ends at the next heading of the same or higher level', () => {
  const components = section(doc, 'Components and responsibilities');
  assert.match(components, /^- Catalogue/m);
  assert.match(components, /^- Ledger/m);
  assert.doesNotMatch(components, /Data model/);

  const detail = section(doc, 'Detail');
  assert.doesNotMatch(detail, /Another detail/);
});

test('an unknown section returns null', () => {
  assert.equal(section(doc, 'Missing'), null);
});

test('returns fenced blocks with their language', () => {
  const blocks = fencedBlocks(doc);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].lang, 'markdown');
  assert.match(blocks[0].content, /## This heading is inside a fence/);
});

test('lists only top-level items of the given section', () => {
  assert.deepEqual(listItems(doc, 'Components and responsibilities'), [
    'Catalogue - item register',
    'Ledger - checkout rows',
  ]);
});

test('parses table rows without the separator', () => {
  assert.deepEqual(tableRows('| Block | O | M |\n|---|---:|---:|\n| Discovery | 16 | 24 |'), [
    ['Block', 'O', 'M'],
    ['Discovery', '16', '24'],
  ]);
});

test('placeholder scan ignores fences and html comments', () => {
  assert.deepEqual(placeholderTokens(doc), ['TBD']);
});

test('counts html comments outside fences', () => {
  assert.equal(htmlCommentCount(doc), 1);
});
