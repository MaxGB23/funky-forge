import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseYaml } from '../src/lib/yaml.js';
import { readStage, stageSummary } from '../scripts/stage-report.js';

/** The release workflow is unreachable from the suite and runs once per release, so its shape is
 * asserted here rather than discovered on a tag. The assertions read the steps, never the prose: a
 * comment that says `npm publish` must never be reachable cannot be confused with a command that makes
 * it reachable, and this repository comments its workflows heavily.
 */

const ROOT = join(import.meta.dirname, '..');
const RELEASE = join(ROOT, '.github', 'workflows', 'release.yml');
const TEXT = readFileSync(RELEASE, 'utf8');
const DOCUMENT = parseYaml(TEXT);

/** Every step the publish job runs, as declared. */
const STEPS = DOCUMENT.jobs.publish.steps;

/** Everything the publish job would execute, in order. */
const COMMANDS = STEPS.map((step) => step.run ?? '').join('\n');

/** The indented block under a top-level key, comments at column 0 included. */
function topLevelBlock(text, key) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start === -1) return null;
  const block = [lines[start]];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && !/^[\s#]/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

test('the stage id is read where npm writes it, under the package name', () => {
  const measured = JSON.stringify({
    'funky-forge': {
      id: 'funky-forge@0.1.0',
      name: 'funky-forge',
      version: '0.1.0',
      stageId: '757255bf-6422-4c38-97f8-e6c2dcbfa201',
    },
  });

  const read = readStage(measured);
  assert.equal(read.ok, true, read.problems.join('; '));
  assert.equal(read.id, '757255bf-6422-4c38-97f8-e6c2dcbfa201', 'the id is one level down, under the name');
  assert.equal(read.version, '0.1.0');
});

test('the report is read past the gate output that shares its stdout', () => {
  const polluted = [
    '> funky-forge@0.1.0 prepublishOnly',
    '> node --test && node scripts/pack-guard.js',
    '',
    '✔ a case passes (0.42ms)',
    'ℹ tests 170',
    '',
    JSON.stringify({ 'funky-forge': { name: 'funky-forge', version: '0.1.0', stageId: 'abc-123' } }, null, 2),
    '',
  ].join('\n');

  const read = readStage(polluted);
  assert.equal(read.ok, true, read.problems.join('; '));
  assert.equal(read.id, 'abc-123', 'the id survives the gate output npm inherits onto the same stdout');
});

test('a report without an id is refused, and the summary carries the approve command', () => {
  const missing = readStage(JSON.stringify({ 'funky-forge': { name: 'funky-forge', version: '0.1.0' } }));
  assert.equal(missing.ok, false, 'an unreported stage must not reach the summary');
  assert.match(missing.problems[0], /stageId/, 'the problem names what is missing');

  const summary = stageSummary({ name: 'funky-forge', version: '0.1.0', id: 'abc-123' });
  assert.match(summary, /funky-forge@0\.1\.0 is staged/);
  assert.match(summary, /npm stage approve abc-123/, 'the approve command is copied, not retyped');
});

test('publication is reachable only from a version tag', () => {
  const on = topLevelBlock(TEXT, 'on');

  assert.match(on, /^\s+push:/m, 'the release runs on a push');
  assert.match(on, /^\s+tags:\s*\[?'?v\*'?\]?\s*$/m, 'the push must be a v* tag');
  assert.doesNotMatch(on, /pull_request/, 'a pull request must never reach the publish job');
  assert.doesNotMatch(on, /branches:/, 'a branch push must never reach the publish job');
});

test('the publish job alone may mint an OIDC token, and no npm credential exists', () => {
  assert.equal((TEXT.match(/id-token:\s*write/g) ?? []).length, 1, 'id-token: write belongs here once');
  for (const credential of ['NPM_TOKEN', 'NODE_AUTH_TOKEN', '_authToken', 'npm_token']) {
    assert.doesNotMatch(TEXT, new RegExp(credential), `the release must not reference ${credential}`);
  }
  assert.match(TEXT, /permissions:\s*\n\s*contents:\s*read/, 'the token is not scoped to contents: read');
});

test('every action in the release workflow is pinned to a commit sha', () => {
  const uses = STEPS.map((step) => step.uses).filter(Boolean);

  assert.ok(uses.length > 0, 'the release workflow runs at least one action');
  for (const value of uses) {
    assert.match(value, /^[^@\s]+@[0-9a-f]{40}$/, `${value} is not pinned to a commit sha`);
  }
});

test('the npm that can stage is installed before the stage runs', () => {
  const floor = COMMANDS.match(/npm install --global npm@\^?(\d+)\.(\d+)\.\d+/);
  assert.ok(floor, 'Node 24 bundles npm 11.13.0, which has no `stage` command: the job must install npm');

  const [, major, minor] = floor;
  assert.ok(
    Number(major) > 11 || (Number(major) === 11 && Number(minor) >= 15),
    `npm ${major}.${minor} predates the stage command, which arrived in 11.15.0`,
  );
  assert.ok(
    COMMANDS.indexOf('npm install --global npm@') < COMMANDS.indexOf('npm stage publish'),
    'the upgrade must run before the stage, not after it',
  );
});

test('the tag is checked against the manifest before anything is staged', () => {
  const guard = COMMANDS.indexOf('scripts/release-guard.js --tag');
  assert.notEqual(guard, -1, 'nothing compares the tag with the version being staged');
  assert.ok(guard < COMMANDS.indexOf('npm stage publish'), 'the tag must be checked before the stage');
});

test('the release stages the version and cannot publish it directly', () => {
  assert.match(COMMANDS, /npm stage publish/, 'the release must stage the tarball, not publish it');
  assert.doesNotMatch(COMMANDS, /npm\s+publish\b/, '`npm publish` must be unreachable from the workflow');
  assert.doesNotMatch(COMMANDS, /--provenance/, 'provenance is the registry decision, not a flag this job passes');
});

test('the stage id is reported by a script the suite can run, never inline', () => {
  // Both defects met while shipping `funky-secure@0.10.2` lived in an inline read: the `--json`
  // envelope is keyed under the package name, and the gate npm runs inside `prepublishOnly` shares
  // that stdout. A heredoc is unreachable by a test, so the read lives in `scripts/stage-report.js`.
  const stage = COMMANDS.indexOf('npm stage publish');
  assert.match(COMMANDS.slice(stage, stage + 200), /--json/, 'the stage id is machine-readable only in --json');

  const report = COMMANDS.indexOf('scripts/stage-report.js');
  assert.notEqual(report, -1, 'nothing reads the id out of the report the stage wrote');
  assert.ok(report > stage, 'the report is read after the stage that produced it');

  const script = readFileSync(join(ROOT, 'scripts', 'stage-report.js'), 'utf8');
  assert.match(script, /GITHUB_STEP_SUMMARY/, 'approval happens after the job: the id must outlive it');
});
