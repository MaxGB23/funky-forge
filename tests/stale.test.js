import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { stale } from '../src/commands/stale.js';
import { bodyHash, readDocument } from '../src/lib/frontmatter.js';

const HASH = `sha256:${'a'.repeat(64)}`;
const DEPENDS = { problem: [], design: ['problem'], estimate: ['problem', 'design'], proposal: ['problem', 'design', 'estimate'] };
const FILE = { problem: 'brief.md', design: 'design.md', estimate: 'estimate.md', proposal: 'proposal.md' };

/**
 * A document whose body is unique per phase, so "the content was kept" is observable.
 * @param {string} phase
 * @param {string} [status]
 */
function documentOf(phase, status = 'approved') {
  return [
    '---',
    'schema: 1',
    `phase: ${phase}`,
    `status: ${status}`,
    `depends_on: [${DEPENDS[phase].join(', ')}]`,
    'language: en',
    'approved_by: the client',
    'approved_at: 2026-02-01',
    `approved_hash: ${HASH}`,
    'method_version: 1',
    '---',
    '',
    `# ${phase}`,
    '',
    `The ${phase} body, kept verbatim through a revocation.`,
    '',
  ].join('\n');
}

/**
 * A project with the phases named in `files`, plus a gate report per phase.
 * @param {Record<string, string>} files
 */
async function project(files) {
  const dir = await mkdtemp(join(tmpdir(), 'ff-stale-'));
  await mkdir(join(dir, '.funky-forge/gates'), { recursive: true });
  for (const [phase, text] of Object.entries(files)) {
    await writeFile(join(dir, '.funky-forge', FILE[phase]), text, 'utf8');
  }
  for (const [index, phase] of Object.keys(files).entries()) {
    await writeFile(join(dir, '.funky-forge/gates', `${index + 1}-${phase}.md`), `---\nphase: ${phase}\n---\n`, 'utf8');
  }
  return dir;
}

/** @param {string} dir @param {string} phase */
function text(dir, phase) {
  return readFile(join(dir, '.funky-forge', FILE[phase]), 'utf8');
}

/**
 * @param {string} dir
 * @param {{phase?: string, flags?: Record<string, string | boolean>}} [input]
 */
function run(dir, { phase = 'problem', flags = {} } = {}) {
  const out = [];
  const err = [];
  const code = stale({ cwd: dir, phase, flags, stdout: (line) => out.push(`${line}\n`), stderr: (line) => err.push(`${line}\n`) });
  return { code, out: out.join(''), err: err.join('') };
}

test('stale revokes the phase, marks every existing dependent, and reports a path that is absent as skipped', async () => {
  const dir = await project({ problem: documentOf('problem'), design: documentOf('design') });
  const briefBefore = readDocument(await text(dir, 'problem'));

  const result = run(dir);

  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    [
      'funky-forge stale - problem',
      '  wrote: .funky-forge/brief.md (draft)',
      '  wrote: .funky-forge/design.md (stale)',
      '  skipped: .funky-forge/estimate.md (absent)',
      '  skipped: .funky-forge/proposal.md (absent)',
      'ok',
      '',
    ].join('\n'),
  );
  assert.equal(result.err, '');

  const brief = readDocument(await text(dir, 'problem'));
  assert.equal(brief.data.status, 'draft');
  assert.equal(brief.data.approved_by, undefined);
  assert.equal(brief.data.approved_at, undefined);
  assert.equal(brief.data.approved_hash, undefined);
  assert.equal(brief.body, briefBefore.body);
  assert.equal(bodyHash(brief), bodyHash(briefBefore));

  const design = readDocument(await text(dir, 'design'));
  assert.equal(design.data.status, 'stale');
  assert.equal(design.data.approved_by, 'the client');
  assert.equal(design.body, readDocument(documentOf('design')).body);

  await rm(dir, { recursive: true, force: true });
});

test('a dependent that is already stale is left untouched and is not counted as changed', async () => {
  const staleDesign = documentOf('design', 'stale');
  const dir = await project({ problem: documentOf('problem'), design: staleDesign });

  const result = run(dir);

  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    ['funky-forge stale - problem', '  wrote: .funky-forge/brief.md (draft)', '  unchanged: .funky-forge/design.md (already stale)', '  skipped: .funky-forge/estimate.md (absent)', '  skipped: .funky-forge/proposal.md (absent)', 'ok', ''].join('\n'),
  );
  assert.equal(await text(dir, 'design'), staleDesign);

  await rm(dir, { recursive: true, force: true });
});

test('staleness propagates transitively: every existing dependent is reached through the chain', async () => {
  const dir = await project({
    problem: documentOf('problem'),
    design: documentOf('design'),
    estimate: documentOf('estimate'),
    proposal: documentOf('proposal'),
  });

  const result = run(dir);

  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    [
      'funky-forge stale - problem',
      '  wrote: .funky-forge/brief.md (draft)',
      '  wrote: .funky-forge/design.md (stale)',
      '  wrote: .funky-forge/estimate.md (stale)',
      '  wrote: .funky-forge/proposal.md (stale)',
      'ok',
      '',
    ].join('\n'),
  );
  for (const phase of ['design', 'estimate', 'proposal']) {
    assert.equal(readDocument(await text(dir, phase)).data.status, 'stale', phase);
  }

  await rm(dir, { recursive: true, force: true });
});

test('a malformed dependent aborts before the first write, so no file changes', async () => {
  const unclosed = '---\nphase: design\nstatus: approved\n# never closed\n';
  const dir = await project({ problem: documentOf('problem'), design: unclosed });
  const briefBefore = await text(dir, 'problem');

  const result = run(dir);

  assert.equal(result.code, 1);
  assert.equal(
    result.out,
    ['funky-forge stale - problem', '  error: FRONTMATTER_INVALID: .funky-forge/design.md: frontmatter block is not closed', '1 error(s)', ''].join('\n'),
  );
  assert.equal(result.err, '');
  assert.equal(await text(dir, 'problem'), briefBefore);
  assert.equal(await text(dir, 'design'), unclosed);

  await rm(dir, { recursive: true, force: true });
});

test('stale never touches a gate report', async () => {
  const dir = await project({ problem: documentOf('problem'), design: documentOf('design') });
  const gate = join(dir, '.funky-forge/gates/1-problem.md');
  const before = await readFile(gate, 'utf8');

  run(dir);

  assert.equal(await readFile(gate, 'utf8'), before);

  await rm(dir, { recursive: true, force: true });
});

test('--json prints one object on stdout and the notices on stderr', async () => {
  const dir = await project({ problem: documentOf('problem'), design: documentOf('design', 'stale') });

  const result = run(dir, { flags: { json: true } });

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.out), {
    ok: true,
    phase: 'problem',
    artifact: '.funky-forge/brief.md',
    dryRun: false,
    written: ['.funky-forge/brief.md'],
    skipped: ['.funky-forge/estimate.md', '.funky-forge/proposal.md'],
    unchanged: ['.funky-forge/design.md'],
    errors: [],
  });
  assert.equal(
    result.err,
    ['funky-forge stale - problem', '  wrote: .funky-forge/brief.md (draft)', '  unchanged: .funky-forge/design.md (already stale)', '  skipped: .funky-forge/estimate.md (absent)', '  skipped: .funky-forge/proposal.md (absent)', 'ok', ''].join('\n'),
  );

  await rm(dir, { recursive: true, force: true });
});

test('--dry-run prints the frontmatter it would write and writes nothing', async () => {
  const approved = documentOf('problem');
  const dir = await project({ problem: approved, design: documentOf('design') });
  const designBefore = await text(dir, 'design');

  const result = run(dir, { flags: { 'dry-run': true } });

  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    [
      'funky-forge stale - problem',
      '  would write: .funky-forge/brief.md (draft)',
      '  would write: .funky-forge/design.md (stale)',
      '  would skip: .funky-forge/estimate.md (absent)',
      '  would skip: .funky-forge/proposal.md (absent)',
      'dry-run',
      '---',
      'schema: 1',
      'phase: problem',
      'status: draft',
      'depends_on: []',
      'language: en',
      'method_version: 1',
      '---',
      '',
    ].join('\n'),
  );
  assert.equal(await text(dir, 'problem'), approved);
  assert.equal(await text(dir, 'design'), designBefore);

  await rm(dir, { recursive: true, force: true });
});

test('a phase with no artifact is refused and nothing else is touched', async () => {
  const dir = await project({ design: documentOf('design') });
  const designBefore = await text(dir, 'design');

  const result = run(dir);

  assert.equal(result.code, 1);
  assert.equal(
    result.out,
    ['funky-forge stale - problem', '  error: MISSING_ARTIFACT: .funky-forge/brief.md does not exist; there is no approval to revoke', '1 error(s)', ''].join('\n'),
  );
  assert.equal(await text(dir, 'design'), designBefore);

  await rm(dir, { recursive: true, force: true });
});

test('a dependent that was never approved is left alone, because it has no approval to lose', async () => {
  const dir = await project({ problem: documentOf('problem'), design: documentOf('design', 'draft') });
  const designBefore = await text(dir, 'design');

  const result = run(dir);

  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    [
      'funky-forge stale - problem',
      '  wrote: .funky-forge/brief.md (draft)',
      '  unchanged: .funky-forge/design.md (not approved: draft)',
      '  skipped: .funky-forge/estimate.md (absent)',
      '  skipped: .funky-forge/proposal.md (absent)',
      'ok',
      '',
    ].join('\n'),
  );

  // A draft never held an approval, so revoking one must leave it byte-identical: `stale` on a
  // never-approved artifact would report STALE_ARTIFACT for a state it never entered.
  assert.equal(await text(dir, 'design'), designBefore);
  assert.equal(readDocument(await text(dir, 'design')).data.status, 'draft');
});
