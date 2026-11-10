import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { install } from '../src/commands/install.js';

/**
 * The version this binary ships, read from the manifest rather than from the skill: the pair is tied
 * together by the guard in `skill.test.js`, so a stale frontmatter fails there and cannot quietly
 * become the expectation here.
 */
const SHIPPED = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const DESTINATION = '.agents/skills/funky-forge';

async function project() {
  return mkdtemp(join(tmpdir(), 'ff-install-'));
}

async function run(dir, flags = {}, options = {}) {
  const out = [];
  const err = [];
  const code = await install({
    cwd: dir,
    flags,
    stdout: (line) => out.push(`${line}\n`),
    stderr: (line) => err.push(`${line}\n`),
    ...options,
  });
  return { code, out: out.join(''), err: err.join('') };
}

/** A stdin that claims to be a terminal and answers with these lines, in order. */
function terminal(...answers) {
  const stream = Readable.from(answers.map((answer) => `${answer}\n`));
  stream.isTTY = true;
  return stream;
}

/** Rewrite the installed copy so that it declares a different version, as a real release would. */
async function installedAs(dir, version) {
  const path = join(dir, DESTINATION, 'SKILL.md');
  const body = (await readFile(path, 'utf8')).replace(/^version: .*$/m, `version: ${version}`);
  await writeFile(path, `${body}\n<!-- shipped by ${version} -->\n`, 'utf8');
}

/** A copy with local changes on the version it already declares: same version, different bytes. */
async function editedLocally(dir) {
  const path = join(dir, DESTINATION, 'SKILL.md');
  await writeFile(path, `${await readFile(path, 'utf8')}\n<!-- my note -->\n`, 'utf8');
}

/** The copy the 0.1.0 pack produced before the frontmatter carried a version. */
async function withoutVersionLine(dir) {
  const path = join(dir, DESTINATION, 'SKILL.md');
  const body = (await readFile(path, 'utf8')).replace(/^version: .*$/m, '');
  await writeFile(path, body, 'utf8');
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
  const result = await run(dir);
  assert.equal(result.code, 0);
  assert.match(result.out, /shared default/);
  assert.ok(
    result.out.includes(`Installed · ${DESTINATION} (${SHIPPED})`),
    `a clean install states the version once: ${result.out}`,
  );
  for (const file of SKILL_FILES) {
    assert.ok(existsSync(join(dir, DESTINATION, file)), file);
  }
  await rm(dir, { recursive: true, force: true });
});

test('detects the Claude marker and installs there', async () => {
  const dir = await project();
  await mkdir(join(dir, '.claude'), { recursive: true });
  const result = await run(dir);
  assert.equal(result.code, 0);
  assert.match(result.out, /Detected: Claude Code/);
  assert.ok(existsSync(join(dir, '.claude/skills/funky-forge/SKILL.md')));
  await rm(dir, { recursive: true, force: true });
});

test('both markers exit 2 without writing and print both re-run commands', async () => {
  const dir = await project();
  await mkdir(join(dir, '.claude'), { recursive: true });
  await mkdir(join(dir, '.agents/skills'), { recursive: true });
  const result = await run(dir);
  assert.equal(result.code, 2);
  assert.match(result.err, /TARGET_AMBIGUOUS/);
  assert.match(result.err, /funky-forge install --target agents/);
  assert.match(result.err, /funky-forge install --target claude/);
  assert.equal(existsSync(join(dir, '.agents/skills/funky-forge')), false);
  assert.equal(existsSync(join(dir, '.claude/skills/funky-forge')), false);
  await rm(dir, { recursive: true, force: true });
});

test('a second run reports the copy as current and writes nothing', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  const skill = join(dir, DESTINATION, 'SKILL.md');
  const before = statSync(skill).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 20));

  const second = await run(dir);
  assert.equal(second.code, 0);
  assert.ok(
    second.out.includes(`Current · ${DESTINATION} (${SHIPPED})`),
    `a current copy says so once: ${second.out}`,
  );
  assert.equal(statSync(skill).mtimeMs, before, 'a current copy must not be rewritten');
  await rm(dir, { recursive: true, force: true });
});

test('local changes on the same version need an answer, and without a terminal they get a reason', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await editedLocally(dir);
  const skill = join(dir, DESTINATION, 'SKILL.md');
  const before = await readFile(skill, 'utf8');

  const refused = await run(dir);
  assert.equal(refused.code, 2, 'a differing copy is a decision, not a failure');
  assert.match(refused.err, /PACK_NOT_ASKED/);
  assert.match(refused.err, /reason: cannot ask whether to replace/);
  assert.match(refused.err, new RegExp(`local changes on version ${SHIPPED.replaceAll('.', '\\.')}`));
  assert.match(refused.err, /stdin is not a terminal/);
  assert.match(refused.err, /--force/);
  assert.equal(await readFile(skill, 'utf8'), before, 'the refusal writes nothing');
  await rm(dir, { recursive: true, force: true });
});

test('an answer to replace overwrites the copy and states what was there', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await editedLocally(dir);

  const replaced = await run(dir, {}, { confirm: () => true });
  assert.equal(replaced.code, 0);
  assert.ok(
    replaced.out.includes(`Replaced · ${DESTINATION} (${SHIPPED}, was ${SHIPPED} with local changes)`),
    replaced.out,
  );
  assert.doesNotMatch(await readFile(join(dir, DESTINATION, 'SKILL.md'), 'utf8'), /my note/);
  await rm(dir, { recursive: true, force: true });
});

test('an answer to keep leaves the copy byte for byte and still succeeds', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await editedLocally(dir);
  const skill = join(dir, DESTINATION, 'SKILL.md');
  const before = await readFile(skill, 'utf8');

  const kept = await run(dir, {}, { confirm: () => false });
  assert.equal(kept.code, 0);
  assert.ok(kept.out.includes(`Kept · ${DESTINATION} (${SHIPPED} with local changes)`), kept.out);
  assert.equal(await readFile(skill, 'utf8'), before);
  await rm(dir, { recursive: true, force: true });
});

test('an older copy names both versions and needs an answer', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await installedAs(dir, '0.0.9');

  const refused = await run(dir);
  assert.equal(refused.code, 2);
  assert.match(refused.err, /it is version 0\.0\.9 and this binary ships/);
  assert.match(refused.err, new RegExp(`ships ${SHIPPED.replaceAll('.', '\\.')}`));

  const replaced = await run(dir, { force: true });
  assert.equal(replaced.code, 0);
  assert.ok(replaced.out.includes(`Replaced · ${DESTINATION} (${SHIPPED}, was 0.0.9)`), replaced.out);
  assert.match(await readFile(join(dir, DESTINATION, 'SKILL.md'), 'utf8'), new RegExp(`^version: ${SHIPPED}$`, 'm'));
  await rm(dir, { recursive: true, force: true });
});

test('a copy newer than the binary is refused without asking, because no answer would help', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await installedAs(dir, '0.2.0');
  const skill = join(dir, DESTINATION, 'SKILL.md');
  const before = await readFile(skill, 'utf8');

  const refused = await run(dir, {}, { stdin: terminal('2'), interactive: true });
  assert.equal(refused.code, 1, 'a validator cannot accept a protocol newer than itself');
  assert.match(refused.err, /NEWER_PACK/);
  assert.match(refused.err, /is version 0\.2\.0/);
  assert.doesNotMatch(refused.err, /choose 1 or 2/, 'there is no question to ask');
  assert.equal(await readFile(skill, 'utf8'), before);

  const downgraded = await run(dir, { force: true });
  assert.equal(downgraded.code, 0);
  assert.ok(downgraded.out.includes(`Replaced · ${DESTINATION} (${SHIPPED}, was 0.2.0)`), downgraded.out);
  await rm(dir, { recursive: true, force: true });
});

test('a copy with no version line is a question, not an accusation of an edit', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await withoutVersionLine(dir);

  const refused = await run(dir);
  assert.equal(refused.code, 2);
  assert.match(refused.err, /declares no version line, so where it came from cannot be told/);

  const replaced = await run(dir, {}, { confirm: () => true });
  assert.equal(replaced.code, 0);
  assert.ok(replaced.out.includes(`Replaced · ${DESTINATION} (${SHIPPED}, was unversioned)`), replaced.out);
  assert.match(await readFile(join(dir, DESTINATION, 'SKILL.md'), 'utf8'), new RegExp(`^version: ${SHIPPED}$`, 'm'));
  await rm(dir, { recursive: true, force: true });
});

test('a terminal asks in one place, and key 1 keeps the copy', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await editedLocally(dir);

  const kept = await run(dir, {}, { stdin: terminal('1'), interactive: true });
  assert.equal(kept.code, 0);
  assert.match(kept.err, new RegExp(`funky-forge install: replace ${DESTINATION.replaceAll('.', '\\.')}\\?`));
  assert.match(kept.err, /installed: version .* with local changes/);
  assert.match(kept.err, new RegExp(`shipped: {3}version ${SHIPPED.replaceAll('.', '\\.')}`));
  assert.match(kept.err, /choose 1 or 2 \[1\]:/);
  assert.ok(kept.out.includes(`Kept · ${DESTINATION}`), kept.out);
  assert.match(await readFile(join(dir, DESTINATION, 'SKILL.md'), 'utf8'), /my note/);
  await rm(dir, { recursive: true, force: true });
});

test('a terminal asks in one place, and key 2 replaces the copy', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await editedLocally(dir);

  const replaced = await run(dir, {}, { stdin: terminal('2'), interactive: true });
  assert.equal(replaced.code, 0);
  assert.ok(replaced.out.includes(`Replaced · ${DESTINATION}`), replaced.out);
  assert.doesNotMatch(await readFile(join(dir, DESTINATION, 'SKILL.md'), 'utf8'), /my note/);
  await rm(dir, { recursive: true, force: true });
});

test('an answer that is neither key is asked again, and a terminal that gives up keeps the copy', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await editedLocally(dir);

  const kept = await run(dir, {}, { stdin: terminal('maybe', '3', 'later'), interactive: true });
  assert.equal(kept.code, 0);
  assert.equal((kept.err.match(/choose 1 or 2 \[1\]:/g) ?? []).length, 3, kept.err);
  assert.ok(kept.out.includes(`Kept · ${DESTINATION}`), kept.out);
  assert.match(await readFile(join(dir, DESTINATION, 'SKILL.md'), 'utf8'), /my note/);
  await rm(dir, { recursive: true, force: true });
});

test('--check prints the state and the versions, writes nothing, and keeps its exit codes', async () => {
  const dir = await project();

  const absent = await run(dir, { check: true });
  assert.equal(absent.code, 1);
  assert.ok(absent.out.includes(`Absent · ${DESTINATION} (ships ${SHIPPED})`), absent.out);
  assert.match(absent.out, /missing: .*\/SKILL\.md/);
  assert.equal(existsSync(join(dir, '.agents/skills')), false, '--check never creates the directory');

  assert.equal((await run(dir)).code, 0);
  const current = await run(dir, { check: true });
  assert.equal(current.code, 0);
  assert.ok(current.out.includes(`Current · ${DESTINATION} (${SHIPPED})`), current.out);

  await installedAs(dir, '0.0.9');
  const skill = join(dir, DESTINATION, 'SKILL.md');
  const before = await readFile(skill, 'utf8');
  const older = await run(dir, { check: true });
  assert.equal(older.code, 1);
  assert.ok(older.out.includes(`Older · ${DESTINATION} (installed 0.0.9, this binary ships ${SHIPPED})`), older.out);
  assert.match(older.out, /modified: .*\/SKILL\.md/);
  assert.equal(await readFile(skill, 'utf8'), before, '--check writes nothing');
  await rm(dir, { recursive: true, force: true });
});

test('--dry-run prints the plan and the state, writes nothing, and never asks', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await installedAs(dir, '0.0.9');
  const skill = join(dir, DESTINATION, 'SKILL.md');
  const before = await readFile(skill, 'utf8');

  const plan = await run(dir, { 'dry-run': true }, { stdin: terminal('2'), interactive: true });
  assert.equal(plan.code, 0);
  assert.ok(plan.out.includes(`Older · ${DESTINATION} (installed 0.0.9, this binary ships ${SHIPPED})`), plan.out);
  assert.match(plan.out, /Would install/);
  assert.match(plan.out, /overwrite SKILL\.md/);
  assert.doesNotMatch(plan.err, /choose 1 or 2/);
  assert.equal(await readFile(skill, 'utf8'), before, 'a plan writes nothing');

  const fresh = await project();
  const empty = await run(fresh, { 'dry-run': true });
  assert.equal(empty.code, 0);
  assert.match(empty.out, /new +SKILL\.md/);
  assert.equal(existsSync(join(fresh, '.agents/skills')), false);
  await rm(dir, { recursive: true, force: true });
  await rm(fresh, { recursive: true, force: true });
});

test('--json reports the state and both versions on stdout only', async () => {
  const dir = await project();
  const installed = await run(dir, { json: true });
  assert.equal(installed.code, 0);
  const payload = JSON.parse(installed.out);
  assert.equal(payload.ok, true);
  assert.equal(payload.state, 'absent');
  assert.deepEqual(payload.version, { installed: null, shipped: SHIPPED });
  assert.equal(payload.written, SKILL_FILES.length);
  assert.match(installed.err, /No harness marker found/);

  await installedAs(dir, '0.0.9');
  const forced = await run(dir, { json: true, force: true });
  assert.equal(forced.code, 0);
  const replaced = JSON.parse(forced.out);
  assert.equal(replaced.state, 'older');
  assert.deepEqual(replaced.version, { installed: '0.0.9', shipped: SHIPPED });
  assert.equal(replaced.written, 1);
  assert.equal(replaced.unmodified, SKILL_FILES.length - 1);
  await rm(dir, { recursive: true, force: true });
});

test('--with-pointer appends one marked block and refuses a second', async () => {
  const dir = await project();
  await writeFile(join(dir, 'AGENTS.md'), '# House rules\n', 'utf8');

  assert.equal((await run(dir, { 'with-pointer': true })).code, 0);
  const content = await readFile(join(dir, 'AGENTS.md'), 'utf8');
  assert.match(content, /<!-- funky-forge -->/);
  assert.match(content, /# House rules/);
  assert.equal(content.match(/<!-- funky-forge -->/g).length, 1);

  const again = await run(dir, { 'with-pointer': true });
  assert.equal(again.code, 1, 'a current pack still refuses a second pointer');
  assert.match(again.err, /POINTER_EXISTS/);
  assert.equal((await readFile(join(dir, 'AGENTS.md'), 'utf8')).match(/<!-- funky-forge -->/g).length, 1);
  await rm(dir, { recursive: true, force: true });
});

test('without --with-pointer no user-owned file is written', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  assert.equal(existsSync(join(dir, 'AGENTS.md')), false);
  assert.equal(existsSync(join(dir, 'CLAUDE.md')), false);
  await rm(dir, { recursive: true, force: true });
});

test('a pack directory without SKILL.md is a question, not a silent overwrite', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await rm(join(dir, DESTINATION, 'SKILL.md'));
  await writeFile(join(dir, DESTINATION, 'templates/estimate.md'), '# mine\n', 'utf8');

  const refused = await run(dir);
  assert.equal(refused.code, 2, 'a pack without a version to read cannot be ordered, so it is asked about');
  assert.match(refused.err, /declares no version line/);
  assert.equal(await readFile(join(dir, DESTINATION, 'templates/estimate.md'), 'utf8'), '# mine\n');
  await rm(dir, { recursive: true, force: true });
});

test('--json keeps stdout parseable when the answer is to keep the copy', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await editedLocally(dir);

  const kept = await run(dir, { json: true }, { stdin: terminal('1'), interactive: true });
  assert.equal(kept.code, 0);
  const payload = JSON.parse(kept.out);
  assert.equal(payload.state, 'edited');
  assert.equal(payload.written, 0);
  assert.equal(payload.pointer, null);
  await rm(dir, { recursive: true, force: true });
});

test('--dry-run refuses an existing pointer instead of promising to append it', async () => {
  const dir = await project();
  await writeFile(join(dir, 'AGENTS.md'), '# rules\n', 'utf8');
  assert.equal((await run(dir, { 'with-pointer': true })).code, 0);

  const blocked = await run(dir, { 'dry-run': true, 'with-pointer': true });
  assert.equal(blocked.code, 1);
  assert.match(blocked.err, /POINTER_EXISTS/);
  assert.doesNotMatch(blocked.out, /Would append/);
  await rm(dir, { recursive: true, force: true });
});

test('a piped answer is never consumed: without a terminal it refuses at once', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await editedLocally(dir);

  const refused = await run(dir, {}, { stdin: Readable.from(['2\n']) });
  assert.equal(refused.code, 2);
  assert.match(refused.err, /stdin is not a terminal/);
  await rm(dir, { recursive: true, force: true });
});

test('install only ever exits with the three codes this CLI documents', async () => {
  const codes = new Set([(await run(await project())).code]);
  for (const mutate of [editedLocally, (dir) => installedAs(dir, '0.0.9'), (dir) => installedAs(dir, '0.2.0'), withoutVersionLine]) {
    const dir = await project();
    await run(dir);
    await mutate(dir);
    codes.add((await run(dir)).code);
    codes.add((await run(dir, { check: true })).code);
    codes.add((await run(dir, { 'dry-run': true })).code);
    await rm(dir, { recursive: true, force: true });
  }
  assert.deepEqual([...codes].sort(), [0, 1, 2]);
});

test('--json on a Claude target reports the detected destination', async () => {
  const dir = await project();
  await mkdir(join(dir, '.claude'), { recursive: true });
  const detected = await run(dir, { json: true });
  assert.equal(detected.code, 0);
  const payload = JSON.parse(detected.out);
  assert.equal(payload.ok, true);
  assert.equal(payload.target, 'claude');
  assert.equal(payload.destination, '.claude/skills/funky-forge');
  assert.match(detected.err, /Detected: Claude Code/);
  await rm(dir, { recursive: true, force: true });
});

test('an empty destination directory is a place to install into, not a copy to interrogate', async () => {
  const dir = await project();
  await mkdir(join(dir, DESTINATION), { recursive: true });

  const installed = await run(dir);
  assert.equal(installed.code, 0);
  assert.ok(installed.out.includes(`Installed · ${DESTINATION} (${SHIPPED})`), installed.out);
  for (const file of SKILL_FILES) assert.ok(existsSync(join(dir, DESTINATION, file)), file);
  await rm(dir, { recursive: true, force: true });
});

test('an interrupted copy is completed without asking, because missing files are not divergence', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await rm(join(dir, DESTINATION, 'templates/estimate.md'));
  await rm(join(dir, DESTINATION, 'references/00-map.md'));

  const completed = await run(dir);
  assert.equal(completed.code, 0, 'a half-copied pack must heal without --force');
  assert.ok(completed.out.includes(`Completed · ${DESTINATION} (${SHIPPED}, 2 file(s) added)`), completed.out);
  assert.ok(existsSync(join(dir, DESTINATION, 'templates/estimate.md')));
  assert.ok(existsSync(join(dir, DESTINATION, 'references/00-map.md')));
  await rm(dir, { recursive: true, force: true });
});

test('a half-copied pack whose present files were edited is a question, not a heal', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await rm(join(dir, DESTINATION, 'templates/estimate.md'));
  await editedLocally(dir);

  const refused = await run(dir);
  assert.equal(refused.code, 2);
  assert.match(refused.err, /local changes on version/);
  await rm(dir, { recursive: true, force: true });
});

test('keeping the copy still honors --with-pointer, which was asked for independently', async () => {
  const dir = await project();
  await writeFile(join(dir, 'AGENTS.md'), '# rules\n', 'utf8');
  assert.equal((await run(dir)).code, 0);
  await editedLocally(dir);

  const kept = await run(dir, { 'with-pointer': true }, { confirm: () => false });
  assert.equal(kept.code, 0);
  assert.ok(kept.out.includes(`Kept · ${DESTINATION}`), kept.out);
  assert.match(await readFile(join(dir, 'AGENTS.md'), 'utf8'), /<!-- funky-forge -->/);
  assert.match(await readFile(join(dir, DESTINATION, 'SKILL.md'), 'utf8'), /my note/);

  const json = await project();
  await writeFile(join(json, 'AGENTS.md'), '# rules\n', 'utf8');
  assert.equal((await run(json)).code, 0);
  await editedLocally(json);
  const payload = JSON.parse((await run(json, { json: true, 'with-pointer': true }, { confirm: () => false })).out);
  assert.equal(payload.pointer, 'AGENTS.md');
  assert.equal(payload.written, 0);
  assert.equal(payload.state, 'edited');
  await rm(dir, { recursive: true, force: true });
  await rm(json, { recursive: true, force: true });
});

test('a terminal stdin with an unwritten stderr refuses instead of waiting for an invisible answer', async () => {
  const dir = await project();
  assert.equal((await run(dir)).code, 0);
  await editedLocally(dir);

  const refused = await run(dir, {}, { stdin: terminal('2'), interactive: false });
  assert.equal(refused.code, 2);
  assert.match(refused.err, /stderr is not a terminal, so the question could not be shown/);
  assert.doesNotMatch(refused.err, /choose 1 or 2/);
  assert.match(await readFile(join(dir, DESTINATION, 'SKILL.md'), 'utf8'), /my note/);
  await rm(dir, { recursive: true, force: true });
});
