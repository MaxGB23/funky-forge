import assert from 'node:assert/strict';
import test from 'node:test';

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { main, USAGE, helpProblems } from '../src/cli.js';

const COMMANDS_FOR_TEST = {
  install: ['target', 'dry-run', 'with-pointer', 'force', 'check', 'json', 'help'],
  init: ['language', 'proposal-language', 'force', 'json', 'help'],
  check: ['json', 'strict', 'help'],
  approve: ['by', 'dry-run', 'force', 'json', 'help'],
  stale: ['dry-run', 'json', 'help'],
  calc: ['write', 'json', 'help'],
};

async function run(argv, cwd = mkdtempSync(join(tmpdir(), 'ff-cli-'))) {
  const out = [];
  const err = [];
  const code = await main(argv, {
    stdout: (line) => out.push(`${line}\n`),
    stderr: (line) => err.push(`${line}\n`),
    cwd,
  });
  return { code, out: out.join(''), err: err.join('') };
}

test('no arguments prints usage and succeeds', async () => {
  const { code, out } = await run([]);
  assert.equal(code, 0);
  assert.match(out, /funky-forge/);
});

test('--help prints the same usage', async () => {
  const { code, out } = await run(['--help']);
  assert.equal(code, 0);
  assert.equal(out, `${USAGE}\n`);
});

test('--version prints the version the manifest owns', async () => {
  const { code, out } = await run(['--version']);
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

  assert.equal(code, 0);
  assert.equal(out, `funky-forge ${version}\n`);
});

test('an unknown command fails with usage on stderr', async () => {
  const { code, err } = await run(['bogus']);
  assert.equal(code, 1);
  assert.match(err, /unknown command: bogus/);
  assert.match(err, /Usage:/);
});

test('every documented command is routed, not rejected as unknown', async () => {
  const phases = { check: ['design'], approve: ['design'], stale: ['design'] };
  for (const command of ['install', 'init', 'check', 'approve', 'stale', 'calc']) {
    const { err } = await run([command, ...(phases[command] ?? [])]);
    assert.doesNotMatch(err, /unknown command/, command);
    assert.doesNotMatch(err, /implemented in a later step/, command);
  }
});

test('check on a project without artifacts reports the missing artifact', async () => {
  const { code, out } = await run(['check', 'design'], mkdtempSync(join(tmpdir(), 'ff-cli-')));
  assert.equal(code, 1);
  assert.match(out, /MISSING_ARTIFACT/);
});

test('a flag that needs a value fails when the value is missing', async () => {
  const { code, err } = await run(['install', '--target']);
  assert.equal(code, 1);
  assert.match(err, /FLAG_VALUE_MISSING/);
  assert.match(err, /--target/);
});

test('an unknown flag fails instead of being ignored', async () => {
  const { code, err } = await run(['install', '--nope']);
  assert.equal(code, 1);
  assert.match(err, /UNKNOWN_FLAG/);
  assert.match(err, /--nope/);
});

test('check requires a phase argument', async () => {
  const { code, err } = await run(['check']);
  assert.equal(code, 1);
  assert.match(err, /PHASE_REQUIRED/);
});

test('-h prints the global usage', async () => {
  const { code, out } = await run(['-h']);
  assert.equal(code, 0);
  assert.equal(out, `${USAGE}\n`);
});

test('a command prints its own help and its own flags', async () => {
  const install = await run(['install', '--help']);
  assert.equal(install.code, 0);
  assert.match(install.out, /funky-forge install - copy the method pack/);
  assert.match(install.out, /--target/);
  assert.doesNotMatch(install.out, /funky-forge check <phase>/);

  const check = await run(['check', '--help']);
  assert.equal(check.code, 0);
  assert.match(check.out, /funky-forge check - /);
  assert.match(check.out, /--strict/);
});

test('install -h shows help instead of installing anything', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff-cli-'));
  const { code, out } = await run(['install', '-h'], dir);
  assert.equal(code, 0);
  assert.match(out, /funky-forge install -/);
  assert.equal(existsSync(join(dir, '.agents')), false);
});

test('an unknown short flag is refused instead of being read as a positional', async () => {
  const { code, err } = await run(['install', '-x']);
  assert.equal(code, 1);
  assert.match(err, /UNKNOWN_FLAG/);
  assert.match(err, /-x/);
});

test('the help text cannot drift from the parser', () => {
  assert.deepEqual(helpProblems(), []);
});

test('USAGE lists every command and marks optional flags as optional', () => {
  const lines = USAGE.split('\n');
  for (const command of ['install', 'init', 'check', 'approve', 'stale', 'calc']) {
    assert.ok(lines.some((line) => line.trim().startsWith(`funky-forge ${command} `)), command);
  }
  assert.ok(USAGE.includes('[--target <agents|claude>]'));
  assert.ok(USAGE.includes('check <phase>'));
  assert.ok(USAGE.includes('approve <phase> [--by <name>]'));
  assert.ok(!USAGE.includes('[<phase>]'));
});

test('every declared flag appears in its own command help', async () => {
  for (const [command, names] of Object.entries(COMMANDS_FOR_TEST)) {
    const { out } = await run([command, '--help']);
    for (const name of names) assert.ok(out.includes(`--${name}`), `${command} --${name}`);
  }
});

test('a value flag without a placeholder is reported instead of shipped', () => {
  assert.equal(helpProblems().filter((problem) => /placeholder/.test(problem)).length, 0);
});

test('approve and stale take a phase and refuse an unknown flag', async () => {
  const approve = await run(['approve', '--nope']);
  assert.equal(approve.code, 1);
  assert.match(approve.err, /UNKNOWN_FLAG: unknown flag for approve: --nope/);

  const stale = await run(['stale', '--nope']);
  assert.equal(stale.code, 1);
  assert.match(stale.err, /UNKNOWN_FLAG: unknown flag for stale: --nope/);

  for (const command of ['approve', 'stale']) {
    const missing = await run([command]);
    assert.equal(missing.code, 1, command);
    assert.match(missing.err, new RegExp(`PHASE_REQUIRED: ${command} needs a phase`), command);
    const unknown = await run([command, 'bogus']);
    assert.equal(unknown.code, 1, command);
    assert.match(unknown.err, /UNKNOWN_PHASE: "bogus" is not one of problem, design, estimate, proposal/, command);
  }
});

test('a --by flag without a name is refused by the parser', async () => {
  const { code, err } = await run(['approve', 'problem', '--by']);
  assert.equal(code, 1);
  assert.match(err, /FLAG_VALUE_MISSING: --by needs a value/);
});

test('approve writes the approval through the command line, and stale revokes it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff-cli-'));
  mkdirSync(join(dir, '.funky-forge/gates'), { recursive: true });
  writeFileSync(join(dir, '.funky-forge/gates/1-problem.md'), '---\nphase: problem\nverdict: PASS\ndepth: light\nescalation_reason: null\nreviewer: product\ndate: 2026-10-01\nfindings: 0\nnot_verified: []\naccepted_risks: []\n---\n', 'utf8');
  writeFileSync(
    join(dir, '.funky-forge/brief.md'),
    [
      '---',
      'schema: 1',
      'phase: problem',
      'status: draft',
      'depends_on: []',
      'language: en',
      'approved_by: null',
      'approved_at: null',
      'approved_hash: null',
      'method_version: 1',
      '---',
      '',
      '## One-line summary',
      '',
      'A shared-equipment checkout record.',
      '',
      '## Problem today',
      '',
      'The record lives in a spreadsheet and a chat channel.',
      '',
      '## Users and volume',
      '',
      'Forty members read it and two maintainers write it.',
      '',
      '## Core flow',
      '',
      'A member requests an item and a maintainer records the handover.',
      '',
      '## Must-haves',
      '',
      '- One catalogue with a unique identifier per item.',
      '',
      '## Out of scope',
      '',
      '- Tracking hardware.',
      '',
      '## Success metric',
      '',
      'Zero mismatches at the 90-day audit.',
      '',
      '## Deadline and constraints',
      '',
      'Three weeks at USD 35 per hour.',
      '',
      '## Current cost of the problem',
      '',
      'unknown.',
      '',
    ].join('\n'),
    'utf8',
  );

  const approved = await run(['approve', 'problem', '--by', 'the client'], dir);
  assert.equal(approved.code, 0, approved.err);
  assert.match(approved.out, /approved_by: the client/);
  assert.match(approved.out, /approved_at: \d{4}-\d{2}-\d{2}/);
  assert.match(approved.out, /wrote: .funky-forge\/brief.md/);
  assert.equal(readFileSync(join(dir, '.funky-forge/brief.md'), 'utf8').includes('status: approved'), true);

  const revoked = await run(['stale', 'problem'], dir);
  assert.equal(revoked.code, 0, revoked.err);
  assert.match(revoked.out, /wrote: .funky-forge\/brief.md \(draft\)/);
  assert.equal(readFileSync(join(dir, '.funky-forge/brief.md'), 'utf8').includes('status: draft'), true);

  rmSync(dir, { recursive: true, force: true });
});

test('the shared --force summary still describes install, and approve documents its own', async () => {
  const install = await run(['install', '--help']);
  assert.match(install.out, /--force\s+overwrite files that differ from the shipped pack/);

  const approve = await run(['approve', '--help']);
  assert.equal(approve.code, 0);
  assert.match(approve.out, /funky-forge approve - /);
  assert.match(approve.out, /--force\s+re-date an already approved artifact; never bypasses the gate/);
  assert.doesNotMatch(approve.out, /overwrite files that differ/);
});
