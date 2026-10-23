/**
 * Process-level tests for the executable entry point.
 *
 * Every other suite calls `main()` with injected streams, so none of them observe the
 * shebang, the `process.exitCode` mapping, or the split between stdout and stderr that a
 * consumer of `pnpm add --global funky-forge` actually sees. These cases spawn
 * `bin/funky-forge.js` with the running Node binary and assert the exit code plus both
 * streams, so a regression in the wrapper fails here instead of in a user's terminal.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { USAGE } from '../src/cli.js';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const executable = join(repositoryRoot, 'bin', 'funky-forge.js');

async function project() {
  return mkdtemp(join(tmpdir(), 'ff-process-'));
}

function run(argv, cwd) {
  const result = spawnSync(process.execPath, [executable, ...argv], { cwd, encoding: 'utf8' });
  assert.equal(result.signal, null, `the process was killed by signal ${result.signal}`);
  return { code: result.status, out: result.stdout, err: result.stderr };
}

test('--help exits 0 and prints the generated usage on stdout only', async () => {
  const { code, out, err } = run(['--help'], await project());

  assert.equal(code, 0);
  assert.equal(out, `${USAGE}\n`);
  assert.equal(err, '');
});

test('an unknown command exits 1 with the error and the usage on stderr', async () => {
  const { code, out, err } = run(['bogus'], await project());

  assert.equal(code, 1);
  assert.equal(out, '', 'a rejected command must not write its usage to stdout');
  assert.match(err, /^UNKNOWN_COMMAND: unknown command: bogus\n/);
  assert.match(err, /Usage:/);
});

test('an ambiguous install target exits 2 and writes nothing', async () => {
  const root = await project();
  await mkdir(join(root, '.claude'), { recursive: true });
  await mkdir(join(root, '.agents', 'skills'), { recursive: true });

  const { code, out, err } = run(['install'], root);

  assert.equal(code, 2, 'a decision that needs the human has its own exit code');
  assert.match(out, /Detected: .*\.agents\/skills/);
  assert.match(out, /Claude Code \(\.claude\)/);
  assert.match(err, /^TARGET_AMBIGUOUS: /);
  assert.match(err, /funky-forge install --target agents/);
  assert.match(err, /funky-forge install --target claude/);

  assert.deepEqual((await readdir(root)).sort(), ['.agents', '.claude']);
  assert.deepEqual((await readdir(join(root, '.agents'))), ['skills']);
  assert.deepEqual((await readdir(join(root, '.agents', 'skills'))), [], 'the skill pack was not copied');
});

test('a missing artifact exits 1 and reports on stdout', async () => {
  const { code, out, err } = run(['check', 'design'], await project());

  assert.equal(code, 1);
  assert.match(out, /MISSING_ARTIFACT: \.funky-forge\/design\.md/);
  assert.equal(err, '');
});
