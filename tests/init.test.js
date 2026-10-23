import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { init } from '../src/commands/init.js';
import { readDocument } from '../src/lib/frontmatter.js';

async function project() {
  return mkdtemp(join(tmpdir(), 'ff-init-'));
}

function run(dir, flags = {}) {
  const out = [];
  const err = [];
  const code = init({
    cwd: dir,
    flags,
    stdout: (line) => out.push(`${line}\n`),
    stderr: (line) => err.push(`${line}\n`),
  });
  return { code, out: out.join(''), err: err.join('') };
}

const ARTIFACTS = ['brief.md', 'design.md', 'estimate.md', 'proposal.md', 'assumptions.md', 'decisions.md'];

test('creates the six skeletons and the gates directory as drafts', async () => {
  const dir = await project();
  const result = run(dir);
  assert.equal(result.code, 0);
  for (const file of ARTIFACTS) {
    assert.ok(existsSync(join(dir, '.funky-forge', file)), file);
    assert.match(result.out, new RegExp(`created \\.funky-forge/${file.replace('.', '\\.')}`));
  }
  assert.ok(existsSync(join(dir, '.funky-forge/gates')));
  const brief = readDocument(await readFile(join(dir, '.funky-forge/brief.md'), 'utf8'));
  assert.equal(brief.data.phase, 'problem');
  assert.equal(brief.data.status, 'draft');
  assert.equal(brief.data.schema, 1);
  assert.equal(brief.data.method_version, 1);
  await rm(dir, { recursive: true, force: true });
});

test('declares the artifact dependency chain', async () => {
  const dir = await project();
  assert.equal(run(dir).code, 0);
  const design = readDocument(await readFile(join(dir, '.funky-forge/design.md'), 'utf8'));
  const estimate = readDocument(await readFile(join(dir, '.funky-forge/estimate.md'), 'utf8'));
  const proposal = readDocument(await readFile(join(dir, '.funky-forge/proposal.md'), 'utf8'));
  assert.deepEqual(design.data.depends_on, ['problem']);
  assert.deepEqual(estimate.data.depends_on, ['problem', 'design']);
  assert.deepEqual(proposal.data.depends_on, ['problem', 'design', 'estimate']);
  await rm(dir, { recursive: true, force: true });
});

test('--language also sets the proposal language unless it is overridden', async () => {
  const dir = await project();
  assert.equal(run(dir, { language: 'es' }).code, 0);
  for (const file of ['brief.md', 'design.md', 'estimate.md', 'assumptions.md']) {
    const doc = readDocument(await readFile(join(dir, '.funky-forge', file), 'utf8'));
    assert.equal(doc.data.language, 'es', file);
  }
  const proposal = readDocument(await readFile(join(dir, '.funky-forge/proposal.md'), 'utf8'));
  assert.equal(proposal.data.language, 'es');
  assert.equal(proposal.data.proposal_language, 'es');
  await rm(dir, { recursive: true, force: true });
});

test('--proposal-language sets only the client-facing language', async () => {
  const dir = await project();
  assert.equal(run(dir, { 'proposal-language': 'es' }).code, 0);
  const proposal = readDocument(await readFile(join(dir, '.funky-forge/proposal.md'), 'utf8'));
  assert.equal(proposal.data.language, 'en');
  assert.equal(proposal.data.proposal_language, 'es');
  await rm(dir, { recursive: true, force: true });
});

test('an unsupported language is refused', async () => {
  const dir = await project();
  const result = run(dir, { language: 'fr' });
  assert.equal(result.code, 1);
  assert.match(result.err, /UNKNOWN_LANGUAGE/);
  assert.equal(existsSync(join(dir, '.funky-forge')), false);
  await rm(dir, { recursive: true, force: true });
});

test('an existing directory without --force is refused and left untouched', async () => {
  const dir = await project();
  assert.equal(run(dir).code, 0);
  const briefPath = join(dir, '.funky-forge/brief.md');
  await writeFile(briefPath, 'hand written\n', 'utf8');

  const result = run(dir);
  assert.equal(result.code, 1);
  assert.match(result.err, /DIR_EXISTS/);
  assert.equal(await readFile(briefPath, 'utf8'), 'hand written\n');
  await rm(dir, { recursive: true, force: true });
});

test('--force recreates missing skeletons and overwrites existing ones', async () => {
  const dir = await project();
  assert.equal(run(dir).code, 0);
  await writeFile(join(dir, '.funky-forge/brief.md'), 'hand written\n', 'utf8');
  await rm(join(dir, '.funky-forge/design.md'));

  const result = run(dir, { force: true });
  assert.equal(result.code, 0);
  assert.match(await readFile(join(dir, '.funky-forge/brief.md'), 'utf8'), /^---/);
  assert.ok(existsSync(join(dir, '.funky-forge/design.md')));
  await rm(dir, { recursive: true, force: true });
});

test('existing gate reports survive --force', async () => {
  const dir = await project();
  await mkdir(join(dir, '.funky-forge/gates'), { recursive: true });
  await writeFile(join(dir, '.funky-forge/gates/1-problem.md'), '# gate\n', 'utf8');
  assert.equal(run(dir, { force: true }).code, 0);
  assert.equal(await readFile(join(dir, '.funky-forge/gates/1-problem.md'), 'utf8'), '# gate\n');
  await rm(dir, { recursive: true, force: true });
});

test('--json reports the created files', async () => {
  const dir = await project();
  const result = run(dir, { json: true });
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.out);
  assert.equal(payload.ok, true);
  assert.equal(payload.directory, '.funky-forge');
  assert.equal(payload.created.length, 6);
  await rm(dir, { recursive: true, force: true });
});
