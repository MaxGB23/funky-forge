import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { install } from '../src/commands/install.js';

async function project() {
  const dir = await mkdtemp(join(tmpdir(), 'ff-install-'));
  return dir;
}

function run(dir, flags = {}) {
  const out = [];
  const err = [];
  const code = install({
    cwd: dir,
    flags,
    stdout: (line) => out.push(`${line}\n`),
    stderr: (line) => err.push(`${line}\n`),
  });
  return { code, out: out.join(''), err: err.join('') };
}

const SKILL_FILES = [
  'SKILL.md',
  'references/00-map.md',
  'references/01-problem.md',
  'references/02-design.md',
  'references/03-estimate.md',
  'references/04-proposal.md',
  'references/revision.md',
  'references/reviewers/product.md',
  'references/reviewers/design.md',
  'references/reviewers/commercial.md',
  'references/schemas/artifacts.md',
  'references/schemas/estimation.md',
  'templates/assumptions.md',
  'templates/brief.md',
  'templates/design.md',
  'templates/estimate.md',
  'templates/proposal.md',
  'templates/decisions.md',
];

test('installs the whole pack into the shared path when nothing is detected', async () => {
  const dir = await project();
  const result = run(dir);
  assert.equal(result.code, 0);
  assert.match(result.out, /shared default/);
  for (const file of SKILL_FILES) {
    assert.ok(existsSync(join(dir, '.agents/skills/funky-forge', file)), file);
  }
  await rm(dir, { recursive: true, force: true });
});

test('detects the Claude marker and installs there', async () => {
  const dir = await project();
  await mkdir(join(dir, '.claude'), { recursive: true });
  const result = run(dir);
  assert.equal(result.code, 0);
  assert.match(result.out, /Detected: Claude Code/);
  assert.ok(existsSync(join(dir, '.claude/skills/funky-forge/SKILL.md')));
  await rm(dir, { recursive: true, force: true });
});

test('both markers exit 2 without writing and print both re-run commands', async () => {
  const dir = await project();
  await mkdir(join(dir, '.claude'), { recursive: true });
  await mkdir(join(dir, '.agents/skills'), { recursive: true });
  const result = run(dir);
  assert.equal(result.code, 2);
  assert.match(result.err, /TARGET_AMBIGUOUS/);
  assert.match(result.err, /funky-forge install --target agents/);
  assert.match(result.err, /funky-forge install --target claude/);
  assert.equal(existsSync(join(dir, '.agents/skills/funky-forge')), false);
  assert.equal(existsSync(join(dir, '.claude/skills/funky-forge')), false);
  await rm(dir, { recursive: true, force: true });
});

test('a second run is idempotent and reports unmodified files', async () => {
  const dir = await project();
  assert.equal(run(dir).code, 0);
  const second = run(dir);
  assert.equal(second.code, 0);
  assert.match(second.out, /Unmodified: 18/);
  await rm(dir, { recursive: true, force: true });
});

test('a modified installed file stops the install unless --force is passed', async () => {
  const dir = await project();
  assert.equal(run(dir).code, 0);
  const target = join(dir, '.agents/skills/funky-forge/SKILL.md');
  await writeFile(target, '# fork\n', 'utf8');

  const blocked = run(dir);
  assert.equal(blocked.code, 1);
  assert.match(blocked.err, /MODIFIED_FILE/);
  assert.match(blocked.err, /SKILL\.md/);
  assert.equal(await readFile(target, 'utf8'), '# fork\n');

  const forced = run(dir, { force: true });
  assert.equal(forced.code, 0);
  assert.doesNotMatch(await readFile(target, 'utf8'), /^# fork$/m);
  await rm(dir, { recursive: true, force: true });
});

test('--check exits 0 when in sync and 1 when a file is missing', async () => {
  const dir = await project();
  assert.equal(run(dir).code, 0);
  assert.equal(run(dir, { check: true }).code, 0);

  await rm(join(dir, '.agents/skills/funky-forge/templates/estimate.md'));
  const missing = run(dir, { check: true });
  assert.equal(missing.code, 1);
  assert.match(missing.out, /missing/);
  await rm(dir, { recursive: true, force: true });
});

test('--dry-run writes nothing but prints the plan', async () => {
  const dir = await project();
  const result = run(dir, { 'dry-run': true });
  assert.equal(result.code, 0);
  assert.match(result.out, /SKILL\.md/);
  assert.equal(existsSync(join(dir, '.agents/skills')), false);
  await rm(dir, { recursive: true, force: true });
});

test('--with-pointer appends one marked block and refuses a second', async () => {
  const dir = await project();
  await writeFile(join(dir, 'AGENTS.md'), '# House rules\n', 'utf8');

  assert.equal(run(dir, { 'with-pointer': true }).code, 0);
  const content = await readFile(join(dir, 'AGENTS.md'), 'utf8');
  assert.match(content, /<!-- funky-forge -->/);
  assert.match(content, /# House rules/);
  assert.equal(content.match(/<!-- funky-forge -->/g).length, 1);

  const again = run(dir, { 'with-pointer': true });
  assert.equal(again.code, 1);
  assert.match(again.err, /POINTER_EXISTS/);
  assert.equal((await readFile(join(dir, 'AGENTS.md'), 'utf8')).match(/<!-- funky-forge -->/g).length, 1);
  await rm(dir, { recursive: true, force: true });
});

test('without --with-pointer no user-owned file is written', async () => {
  const dir = await project();
  assert.equal(run(dir).code, 0);
  assert.equal(existsSync(join(dir, 'AGENTS.md')), false);
  assert.equal(existsSync(join(dir, 'CLAUDE.md')), false);
  await rm(dir, { recursive: true, force: true });
});
