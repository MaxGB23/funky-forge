import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main, USAGE } from '../src/cli.js';

function run(argv, cwd = mkdtempSync(join(tmpdir(), 'ff-cli-'))) {
  const out = [];
  const err = [];
  const code = main(argv, {
    stdout: (line) => out.push(`${line}
`),
    stderr: (line) => err.push(`${line}
`),
    cwd,
  });
  return { code, out: out.join(''), err: err.join('') };
}

test('no arguments prints usage and succeeds', () => {
  const { code, out } = run([]);
  assert.equal(code, 0);
  assert.match(out, /funky-forge/);
});

test('--help prints the same usage', () => {
  const { code, out } = run(['--help']);
  assert.equal(code, 0);
  assert.equal(out, `${USAGE}\n`);
});

test('an unknown command fails with usage on stderr', () => {
  const { code, err } = run(['bogus']);
  assert.equal(code, 1);
  assert.match(err, /unknown command: bogus/);
  assert.match(err, /Usage:/);
});

test('every documented command is routed, not rejected as unknown', () => {
  const phases = { check: ['design'] };
  for (const command of ['install', 'init', 'check', 'calc']) {
    const { err } = run([command, ...(phases[command] ?? [])]);
    assert.doesNotMatch(err, /unknown command/, command);
  }
});

test('check on a project without artifacts reports the missing artifact', () => {
  const { code, out } = run(['check', 'design'], mkdtempSync(join(tmpdir(), 'ff-cli-')));
  assert.equal(code, 1);
  assert.match(out, /MISSING_ARTIFACT/);
});

test('a flag that needs a value fails when the value is missing', () => {
  const { code, err } = run(['install', '--target']);
  assert.equal(code, 1);
  assert.match(err, /FLAG_VALUE_MISSING/);
  assert.match(err, /--target/);
});

test('an unknown flag fails instead of being ignored', () => {
  const { code, err } = run(['install', '--nope']);
  assert.equal(code, 1);
  assert.match(err, /UNKNOWN_FLAG/);
  assert.match(err, /--nope/);
});

test('check requires a phase argument', () => {
  const { code, err } = run(['check']);
  assert.equal(code, 1);
  assert.match(err, /PHASE_REQUIRED/);
});
