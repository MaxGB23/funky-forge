import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkEntriesPresent, checkPackList, isPermitted, run } from '../scripts/pack-guard.js';

const ROOT = join(import.meta.dirname, '..');
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

test('a path is permitted by an exact entry, a directory entry, or because npm always packs it', () => {
  const allowed = ['benchs/', 'README.md', 'LICENSE'];

  assert.equal(isPermitted('src/cli.js', ['src/']), true, 'a directory entry covers what is under it');
  assert.equal(isPermitted('README.md', ['README.md']), true, 'an exact entry covers itself');
  assert.equal(isPermitted('./README.md', ['README.md']), true, 'a root anchor is the same path');
  assert.equal(isPermitted('package.json', []), true, 'npm always packs package.json');
  assert.equal(isPermitted('skills/SKILL.md', allowed), false, 'nothing covers an unlisted directory');
  assert.equal(isPermitted('benchs/one.md', allowed), true, 'an unrelated entry does not interfere');
});

test('the leak check names every path the contract does not cover', () => {
  const allowed = ['bin', 'src', 'README.md'];

  assert.deepEqual(checkPackList(['package.json', 'README.md', 'LICENSE', 'bin/cli.js', 'src/lib.js'], allowed), {
    ok: true,
    problems: [],
  });

  for (const unwanted of ['tests/cli.test.js', '.env', 'odd/tasks/x.md', 'node_modules/x/index.js']) {
    const { ok, problems } = checkPackList(['package.json', unwanted], allowed);
    assert.equal(ok, false, `${unwanted} must not ship`);
    assert.match(problems[0], /must not ship: it is not in the files contract/);
  }
});

test('an entry that packed nothing is reported, because it promised something it does not ship', () => {
  const allowed = ['bin', 'src', 'docs/', 'README.md', 'LICENSE'];

  const missing = checkEntriesPresent(['package.json', 'README.md', 'LICENSE', 'bin/cli.js'], allowed);
  assert.equal(missing.ok, false);
  assert.equal(missing.problems.length, 2, 'both src and docs/ packed nothing');
  assert.match(missing.problems[0], /^src is in the files contract and packed nothing$/);
  assert.match(missing.problems[1], /^docs\/ is in the files contract and packed nothing$/);

  assert.deepEqual(checkEntriesPresent(['package.json', 'README.md', 'LICENSE', 'bin/a.js', 'src/b.js', 'docs/c.md'], allowed), {
    ok: true,
    problems: [],
  });
});

test('run reports the packed set against the contract, and a leak fails it', () => {
  const satisfiable = [
    'package.json',
    'README.md',
    'LICENSE',
    ...PACKAGE.files
      .filter((entry) => !['README.md', 'LICENSE'].includes(entry))
      .map((entry) => `${entry.replace(/\/$/, '')}/packed.js`),
  ];

  const clean = run({ pack: () => satisfiable });
  assert.equal(clean.ok, true, clean.problems.join('\n'));

  const leaking = run({ pack: () => [...satisfiable, 'tests/cli.test.js'] });
  assert.equal(leaking.ok, false);
  assert.match(leaking.problems.join('\n'), /tests\/cli\.test\.js must not ship/);

  const incomplete = run({ pack: () => ['package.json', 'README.md', 'LICENSE'] });
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.problems.join('\n'), /is in the files contract and packed nothing/);
});

test('the packed set is asked of npm in JSON, never read from its human output', () => {
  const source = readFileSync(join(ROOT, 'scripts', 'pack-guard.js'), 'utf8');
  const invocation = source.split('\n').find((line) => line.includes("'pack', '--dry-run'"));
  assert.ok(invocation, 'pack-guard no longer runs npm pack');
  assert.match(invocation, /'--json'/, 'the pack call must ask for JSON: a lifecycle script inherits npm_config_json');
});

test('the gate runs from prepublishOnly, where a failure publishes nothing', () => {
  assert.equal(typeof PACKAGE.scripts.prepublishOnly, 'string', 'package.json declares no prepublishOnly gate');
  for (const required of ['node --test', 'scripts/pack-guard.js']) {
    assert.ok(PACKAGE.scripts.prepublishOnly.includes(required), `prepublishOnly does not run ${required}`);
  }
});
