import assert from 'node:assert/strict';
import test from 'node:test';

import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main, USAGE, helpProblems } from '../src/cli.js';

const COMMANDS_FOR_TEST = {
  install: ['target', 'dry-run', 'with-pointer', 'force', 'check', 'json', 'help'],
  init: ['language', 'proposal-language', 'force', 'json', 'help'],
  check: ['json', 'strict', 'help'],
  calc: ['write', 'json', 'help'],
};

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

test('-h prints the global usage', () => {
  const { code, out } = run(['-h']);
  assert.equal(code, 0);
  assert.equal(out, `${USAGE}\n`);
});

test('a command prints its own help and its own flags', () => {
  const install = run(['install', '--help']);
  assert.equal(install.code, 0);
  assert.match(install.out, /funky-forge install - copy the method pack/);
  assert.match(install.out, /--target/);
  assert.doesNotMatch(install.out, /funky-forge check <phase>/);

  const check = run(['check', '--help']);
  assert.equal(check.code, 0);
  assert.match(check.out, /funky-forge check - /);
  assert.match(check.out, /--strict/);
});

test('install -h shows help instead of installing anything', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff-cli-'));
  const { code, out } = run(['install', '-h'], dir);
  assert.equal(code, 0);
  assert.match(out, /funky-forge install -/);
  assert.equal(existsSync(join(dir, '.agents')), false);
});

test('an unknown short flag is refused instead of being read as a positional', () => {
  const { code, err } = run(['install', '-x']);
  assert.equal(code, 1);
  assert.match(err, /UNKNOWN_FLAG/);
  assert.match(err, /-x/);
});

test('the help text cannot drift from the parser', () => {
  assert.deepEqual(helpProblems(), []);
});

test('USAGE lists every command and marks optional flags as optional', () => {
  const lines = USAGE.split('\n');
  for (const command of ['install', 'init', 'check', 'calc']) {
    assert.ok(lines.some((line) => line.trim().startsWith(`funky-forge ${command} `)), command);
  }
  assert.ok(USAGE.includes('[--target <agents|claude>]'));
  assert.ok(USAGE.includes('check <phase>'));
  assert.ok(!USAGE.includes('[<phase>]'));
});

test('every declared flag appears in its own command help', () => {
  for (const [command, names] of Object.entries(COMMANDS_FOR_TEST)) {
    const { out } = run([command, '--help']);
    for (const name of names) assert.ok(out.includes(`--${name}`), `${command} --${name}`);
  }
});

test('a value flag without a placeholder is reported instead of shipped', () => {
  assert.equal(helpProblems().filter((problem) => /placeholder/.test(problem)).length, 0);
});
