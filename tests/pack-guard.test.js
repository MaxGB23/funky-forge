import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

import { checkEntriesPresent, checkPackList, isPermitted, npmCli, run } from '../scripts/pack-guard.js';

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

const BUNDLED = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

/** Probes a machine this test does not have: nothing exists and nothing resolves unless it is named here. */
function machine({ env = {}, files = [] } = {}) {
  const present = new Set(files);
  const links = new Map();
  return {
    env,
    exists: (path) => present.has(path),
    real: (path) => {
      if (!present.has(path)) throw new Error(`ENOENT: ${path}`);
      return links.get(path) ?? path;
    },
    link(from, to) {
      present.add(from);
      present.add(to);
      links.set(from, to);
      return this;
    },
  };
}

test('npm is what the running lifecycle script names, because that is the npm doing the packing', () => {
  const cli = '/opt/npm/lib/node_modules/npm/bin/npm-cli.js';
  const host = machine({ env: { npm_execpath: cli, PATH: '/usr/local/bin' }, files: [cli] });
  assert.equal(npmCli(host), cli);
});

test('npm is the CLI bundled beside this interpreter when the environment names none', () => {
  // The path CI and `prepublishOnly` already took, kept: a lifecycle script must not start reading PATH.
  const host = machine({ files: [BUNDLED] });
  assert.equal(npmCli(host), BUNDLED);
});

test('on Unix npm on the path is a symlink, and what it points at decides', () => {
  // Where a human running `node scripts/pack-guard.js` from a shell meets it: no npm_execpath, no bundled
  // CLI, and `npm` is a link into the prefix that installs it.
  const prefix = join(import.meta.dirname, 'fake-prefix');
  const link = join(prefix, 'bin', 'npm');
  const cli = join(prefix, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const host = machine({ env: { PATH: [join(prefix, 'nowhere'), join(prefix, 'bin')].join(delimiter) } }).link(link, cli);
  assert.equal(npmCli(host), cli, 'the link is followed, and the CLI it points at is what runs');
});

test('the path is read under either of its names', () => {
  // Windows spells the variable `Path`; a lookup that reads only `PATH` finds nothing on some machines and
  // reports a missing npm that is installed. The directory is built with `join` rather than written as a
  // Windows path, because `C:\\tools` splits on the `:` of a drive letter wherever the delimiter is not
  // `;` and the case would then fail on the platform it is not describing.
  const directory = join(import.meta.dirname, 'fake-prefix', 'tools');
  const cli = join(directory, 'npm-cli.js');
  const host = machine({ env: { Path: directory }, files: [cli] });
  assert.equal(npmCli(host), cli);
});

test('a shell shim is not npm, and what was tried is named when nothing is', () => {
  // A `.sh`/`.cmd` shim is not spawnable by this interpreter, so following the link and finding one is not
  // an answer: the refusal says so, and names all three places it looked so the message is actionable.
  const prefix = join(import.meta.dirname, 'fake-prefix');
  const host = machine({ env: { PATH: join(prefix, 'bin') } }).link(join(prefix, 'bin', 'npm'), join(prefix, 'bin', 'npm.sh'));
  assert.throws(() => npmCli(host), /cannot find npm: npm_execpath is unset, no CLI is bundled with this interpreter, and the path holds no npm-cli\.js/);
});

