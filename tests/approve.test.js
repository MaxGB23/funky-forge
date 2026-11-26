import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { approve } from '../src/commands/approve.js';
import { check } from '../src/commands/check.js';
import { bodyHash, readDocument, writeApprovalKeys } from '../src/lib/frontmatter.js';

const HASH = `sha256:${'a'.repeat(64)}`;
const ZERO_HASH = `sha256:${'0'.repeat(64)}`;

/** A draft that declares none of the three approval keys, so the insertion point is observable. */
const DRAFT = ['---', 'schema: 1', 'phase: problem', 'status: draft', 'depends_on: []', 'language: en', 'method_version: 1', '---', '', '# problem', '', 'A shared-equipment checkout record.', ''].join('\n');

const DEPENDS = { problem: [], design: ['problem'], estimate: ['problem', 'design'], proposal: ['problem', 'design', 'estimate'] };

const BODY = {
  problem: `## One-line summary

A shared-equipment checkout record.

## Problem today

The record lives in a spreadsheet and a chat channel.

## Users and volume

Forty members read it and two maintainers write it.

## Core flow

A member requests an item and a maintainer records the handover.

## Must-haves

- One catalogue with a unique identifier per item.

## Out of scope

- Tracking hardware.

## Success metric

Zero mismatches at the 90-day audit.

## Deadline and constraints

Three weeks at USD 35 per hour.

## Current cost of the problem

unknown.
`,
  design: `## Architecture at a glance

One server-rendered application over one database.

## Components and responsibilities

- **Catalogue** — owns the register.
- **Ledger** — owns the checkouts.

## Must-have coverage

| # | Must-have | Component |
|---|---|---|
| 1 | one identifier per item | Catalogue |
| 2 | one open holder per item | Ledger |

## Data model and retention

Two tables; nothing is deleted.

## Auth and permissions

Two roles behind one guard.

## Integrations

None.

## NFR decisions

| NFR | Applies | How it is met |
|---|---|---|
| Performance | yes | indexed queries |
| Availability | yes | nightly backup |
| Security | yes | one role guard |

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A stale record | the return docket |

## Rejected alternatives

- NotificationService - rejected because notifications are out of scope.

## Stack decision

PostgreSQL; the language is deferred.

## Open decisions

- D1 — the host provider. Owner: the client.
`,
};

/**
 * The instant every deterministic case pins: mid-day UTC, so only the pinned-TZ test can tell a UTC
 * date from a local one.
 */
const FIXED_INSTANT = Date.parse('2026-03-01T12:00:00Z');

function fixed() {
  return new Date(FIXED_INSTANT);
}

/** @param {{phase?: string, status?: string, approved?: {by: string, at: string, hash: string}}} input */
function frontmatter({ phase = 'problem', status = 'draft', approved } = {}) {
  const lines = ['---', 'schema: 1', `phase: ${phase}`, `status: ${status}`, `depends_on: [${DEPENDS[phase].join(', ')}]`, 'language: en'];
  if (approved) lines.push(`approved_by: ${approved.by}`, `approved_at: ${approved.at}`, `approved_hash: ${approved.hash}`);
  lines.push('method_version: 1', '---');
  return lines.join('\n');
}

/** @param {string} phase @param {{status?: string, body?: string, approved?: {by: string, at: string, hash: string}}} [options] */
function documentOf(phase, { status = 'draft', body = BODY[phase], approved } = {}) {
  return `${frontmatter({ phase, status, approved })}\n\n# ${phase}\n\n${body}`;
}

function gateReport(phase = 'problem', verdict = 'PASS') {
  return `---\nphase: ${phase}\nverdict: ${verdict}\ndepth: light\nescalation_reason: null\nreviewer: product\ndate: 2026-10-01\nfindings: 0\nnot_verified: []\naccepted_risks: []\n---\n`;
}

const FILE = { problem: 'brief.md', design: 'design.md', estimate: 'estimate.md', proposal: 'proposal.md' };
const GATE = { problem: '1-problem', design: '2-design', estimate: '3-estimate', proposal: '4-proposal' };

/**
 * A project whose problem phase passes every rule: a valid draft brief and a PASS gate report.
 * @param {{files?: Record<string, string | null>, gates?: string[]}} [input]
 */
async function project({ files = {}, gates = ['1-problem'] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ff-approve-'));
  await mkdir(join(dir, '.funky-forge/gates'), { recursive: true });
  await writeFile(join(dir, '.funky-forge/brief.md'), files.brief ?? documentOf('problem'), 'utf8');
  for (const gate of gates) {
    await writeFile(join(dir, '.funky-forge/gates', `${gate}.md`), gateReport(gate.split('-').slice(1).join('-')), 'utf8');
  }
  for (const [name, text] of Object.entries(files)) {
    if (name === 'brief' || text === null) continue;
    await writeFile(join(dir, '.funky-forge', `${name}.md`), text, 'utf8');
  }
  for (const [name, text] of Object.entries(files)) {
    if (text !== null) continue;
    await rm(join(dir, '.funky-forge', `${name}.md`), { force: true });
  }
  return dir;
}

/** @param {string} dir @param {string} [phase] */
function artifactText(dir, phase = 'problem') {
  return readFile(join(dir, '.funky-forge', FILE[phase]), 'utf8');
}

/**
 * @param {string} dir
 * @param {{phase?: string, flags?: Record<string, string | boolean>, now?: () => Date}} [input]
 */
function run(dir, { phase = 'problem', flags = {}, now = fixed } = {}) {
  const out = [];
  const err = [];
  const code = approve({ cwd: dir, phase, flags, now, stdout: (line) => out.push(`${line}\n`), stderr: (line) => err.push(`${line}\n`) });
  return { code, out: out.join(''), err: err.join('') };
}

// ---------------------------------------------------------------------------------------------
// T2/S4 — the surgical writer: no serializer, the raw block is edited in place.
// ---------------------------------------------------------------------------------------------

test('the writer inserts the approval keys immediately after status, in order, and leaves every other line alone', () => {
  const written = writeApprovalKeys(DRAFT, {
    status: 'approved',
    approved_by: 'the client',
    approved_at: '2026-03-01',
    approved_hash: HASH,
  });
  assert.equal(
    written,
    [
      '---',
      'schema: 1',
      'phase: problem',
      'status: approved',
      'approved_by: the client',
      'approved_at: 2026-03-01',
      `approved_hash: ${HASH}`,
      'depends_on: []',
      'language: en',
      'method_version: 1',
      '---',
      '',
      '# problem',
      '',
      'A shared-equipment checkout record.',
      '',
    ].join('\n'),
  );
  assert.equal(readDocument(written).data.approved_hash, HASH);
});

test('the writer keeps a declared key where it is instead of moving it next to status', () => {
  const declared = ['---', 'schema: 1', 'phase: problem', 'status: draft', 'approved_hash: null', 'language: en', '---', '', '# problem', ''].join('\n');
  const written = writeApprovalKeys(declared, { status: 'approved', approved_hash: HASH });
  assert.equal(written, ['---', 'schema: 1', 'phase: problem', 'status: approved', `approved_hash: ${HASH}`, 'language: en', '---', '', '# problem', ''].join('\n'));
});

test('the writer removes the keys it is told to clear, restoring the draft it started from', () => {
  const approved = writeApprovalKeys(DRAFT, { status: 'approved', approved_by: 'the client', approved_at: '2026-03-01', approved_hash: HASH });
  const revoked = writeApprovalKeys(approved, { status: 'draft', approved_by: null, approved_at: null, approved_hash: null });
  assert.equal(revoked, DRAFT);
  const data = readDocument(revoked).data;
  assert.equal(data.status, 'draft');
  assert.equal(Object.hasOwn(data, 'approved_by'), false);
  assert.equal(Object.hasOwn(data, 'approved_at'), false);
  assert.equal(Object.hasOwn(data, 'approved_hash'), false);
});

test('the writer leaves a key it was not given untouched, so a dependent can be marked stale without losing its approval record', () => {
  const approved = writeApprovalKeys(DRAFT, { status: 'approved', approved_by: 'the client', approved_at: '2026-03-01', approved_hash: HASH });
  const stale = writeApprovalKeys(approved, { status: 'stale' });
  assert.equal(stale, approved.replace('status: approved', 'status: stale'));
  assert.equal(readDocument(stale).data.approved_by, 'the client');
});

test('the writer preserves CRLF endings and touches nothing but the keys it writes', () => {
  const crlf = DRAFT.replace(/\n/g, '\r\n');
  const written = writeApprovalKeys(crlf, { status: 'approved', approved_by: 'the client' });
  assert.equal(written, crlf.replace('status: draft\r\n', 'status: approved\r\napproved_by: the client\r\n'));
  assert.equal(written.includes('\n\n'), false);
  assert.equal(readDocument(written).data.approved_by, 'the client');
});

test('the writer quotes a value YAML would otherwise read as something else', () => {
  const written = writeApprovalKeys(DRAFT, { status: 'approved', approved_by: 'Redis: the client' });
  assert.match(written, /\napproved_by: "Redis: the client"\n/);
  assert.equal(readDocument(written).data.approved_by, 'Redis: the client');
});

test('a CRLF body and its LF twin hash the same, so approval never depends on line endings', () => {
  assert.equal(bodyHash(readDocument(DRAFT.replace(/\n/g, '\r\n'))), bodyHash(readDocument(DRAFT)));
});

// ---------------------------------------------------------------------------------------------
// S1, S4, S7 — the write, the re-verification, the dry run, the JSON contract.
// ---------------------------------------------------------------------------------------------

test('approve writes the four approval keys over a passing draft, verifies the hash it wrote, and check accepts the result', async () => {
  const dir = await project();
  const before = await artifactText(dir);
  const hash = bodyHash(readDocument(before));

  const result = run(dir, { flags: { by: 'the client' } });

  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    [
      'funky-forge approve - problem',
      '  approved_by: the client',
      '  approved_at: 2026-03-01',
      `  approved_hash: ${hash}`,
      'ok',
      'wrote: .funky-forge/brief.md',
      `body hash: ${hash}`,
      '',
    ].join('\n'),
  );
  assert.equal(result.err, '');

  const after = await artifactText(dir);
  assert.equal(after, writeApprovalKeys(before, { status: 'approved', approved_by: 'the client', approved_at: '2026-03-01', approved_hash: hash }));
  const written = readDocument(after);
  assert.equal(written.data.status, 'approved');
  assert.equal(written.data.approved_by, 'the client');
  assert.equal(written.data.approved_at, '2026-03-01');
  assert.equal(written.data.approved_hash, bodyHash(written));

  const verified = check({ cwd: dir, phase: 'problem', flags: {}, stdout: () => {}, stderr: () => {} });
  assert.equal(verified, 0);

  await rm(dir, { recursive: true, force: true });
});

test('a dry run prints the frontmatter it would write, including approved_at, and writes nothing', async () => {
  const dir = await project();
  const before = await artifactText(dir);
  const hash = bodyHash(readDocument(before));

  const result = run(dir, { flags: { by: 'the client', 'dry-run': true } });

  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    [
      'funky-forge approve - problem',
      '  approved_by: the client',
      '  approved_at: 2026-03-01',
      `  approved_hash: ${hash}`,
      'dry-run',
      `body hash: ${hash}`,
      '---',
      'schema: 1',
      'phase: problem',
      'status: approved',
      'approved_by: the client',
      'approved_at: 2026-03-01',
      `approved_hash: ${hash}`,
      'depends_on: []',
      'language: en',
      'method_version: 1',
      '---',
      '',
    ].join('\n'),
  );
  assert.equal(result.err, '');
  assert.equal(await artifactText(dir), before);

  await rm(dir, { recursive: true, force: true });
});

test('--json prints one object on stdout and the notices on stderr', async () => {
  const dir = await project();
  const hash = bodyHash(readDocument(await artifactText(dir)));

  const result = run(dir, { flags: { by: 'the client', json: true } });

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.out), {
    ok: true,
    phase: 'problem',
    artifact: '.funky-forge/brief.md',
    dryRun: false,
    status: 'approved',
    approvedBy: 'the client',
    approvedAt: '2026-03-01',
    approvedHash: hash,
    bodyHash: hash,
    errors: [],
    warnings: [],
  });
  assert.equal(
    result.err,
    ['funky-forge approve - problem', '  approved_by: the client', '  approved_at: 2026-03-01', `  approved_hash: ${hash}`, 'ok', 'wrote: .funky-forge/brief.md', `body hash: ${hash}`, ''].join('\n'),
  );

  await rm(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// S1, S2 — the blocking set: everything the evaluation reports except the two states approve clears.
// ---------------------------------------------------------------------------------------------

test('a missing artifact is refused as APPROVAL_GATE_FAILED carrying MISSING_ARTIFACT, and nothing is created', async () => {
  const dir = await project({ files: { brief: null } });

  const result = run(dir, { flags: { by: 'the client', json: true } });

  assert.equal(result.code, 1);
  assert.deepEqual(JSON.parse(result.out), {
    ok: false,
    phase: 'problem',
    artifact: '.funky-forge/brief.md',
    dryRun: false,
    errors: [
      {
        code: 'APPROVAL_GATE_FAILED',
        message: 'the artifact did not pass the gate: MISSING_ARTIFACT',
        artifact: '.funky-forge/brief.md',
        codes: ['MISSING_ARTIFACT'],
      },
    ],
    warnings: [],
  });
  assert.equal(result.err, ['funky-forge approve - problem', '  error: APPROVAL_GATE_FAILED: the artifact did not pass the gate: MISSING_ARTIFACT', '1 error(s)', '  MISSING_ARTIFACT: .funky-forge/brief.md does not exist; run funky-forge init or write the artifact first', ''].join('\n'));
  await assert.rejects(readFile(join(dir, '.funky-forge/brief.md')));

  await rm(dir, { recursive: true, force: true });
});

test('invalid frontmatter is refused and the file is left byte-identical', async () => {
  const broken = documentOf('problem').replace('schema: 1', 'schema: [1');
  const dir = await project({ files: { brief: broken } });

  const result = run(dir, { flags: { by: 'the client' } });

  assert.equal(result.code, 1);
  assert.equal(result.out, ['funky-forge approve - problem', '  error: APPROVAL_GATE_FAILED: the artifact did not pass the gate: FRONTMATTER_INVALID', '1 error(s)', ''].join('\n'));
  assert.match(result.err, /^  FRONTMATTER_INVALID: /);
  assert.equal(await artifactText(dir), broken);

  await rm(dir, { recursive: true, force: true });
});

test('a surviving placeholder is refused and the file is left byte-identical', async () => {
  const text = documentOf('problem', { body: `TBD\n\n${BODY.problem}` });
  const dir = await project({ files: { brief: text } });

  const result = run(dir, { flags: { by: 'the client' } });

  assert.equal(result.code, 1);
  assert.equal(result.out, ['funky-forge approve - problem', '  error: APPROVAL_GATE_FAILED: the artifact did not pass the gate: PLACEHOLDER_FOUND', '1 error(s)', ''].join('\n'));
  assert.equal(result.err, '  PLACEHOLDER_FOUND: placeholder TBD is still in the body\n');
  assert.equal(await artifactText(dir), text);

  await rm(dir, { recursive: true, force: true });
});

test('a missing gate report is refused and the file is left byte-identical', async () => {
  const dir = await project({ gates: [] });
  const before = await artifactText(dir);

  const result = run(dir, { flags: { by: 'the client' } });

  assert.equal(result.code, 1);
  assert.equal(result.out, ['funky-forge approve - problem', '  error: APPROVAL_GATE_FAILED: the artifact did not pass the gate: GATE_REPORT_MISSING', '1 error(s)', ''].join('\n'));
  assert.equal(await artifactText(dir), before);

  await rm(dir, { recursive: true, force: true });
});

test('a malformed gate report is refused and the file is left byte-identical', async () => {
  const dir = await project({ gates: [] });
  await writeFile(join(dir, '.funky-forge/gates/1-problem.md'), gateReport('problem', 'NOPE'), 'utf8');
  const before = await artifactText(dir);

  const result = run(dir, { flags: { by: 'the client' } });

  assert.equal(result.code, 1);
  assert.match(result.out, /error: APPROVAL_GATE_FAILED: the artifact did not pass the gate: GATE_REPORT_MALFORMED/);
  assert.match(result.err, /^ {2}GATE_REPORT_MALFORMED: \.funky-forge\/gates\/1-problem\.md: verdict must be one of PASS, PASS_WITH_RISKS, BLOCK$/m);
  assert.equal(await artifactText(dir), before);

  await rm(dir, { recursive: true, force: true });
});

test('DEPENDENCY_NOT_APPROVED is reported unchanged, and an absent dependency and an unapproved one are different facts on one code', async () => {
  const absent = await project({ files: { design: documentOf('design', { status: 'draft' }), brief: null }, gates: ['2-design'] });
  const absentResult = run(absent, { phase: 'design', flags: { by: 'the client' } });
  assert.equal(absentResult.code, 1);
  assert.equal(absentResult.out, ['funky-forge approve - design', '  error: APPROVAL_GATE_FAILED: the artifact did not pass the gate: DEPENDENCY_NOT_APPROVED', '1 error(s)', ''].join('\n'));
  assert.equal(absentResult.err, '  DEPENDENCY_NOT_APPROVED: .funky-forge/brief.md does not exist\n');

  const draft = await project({ files: { design: documentOf('design', { status: 'draft' }) }, gates: ['2-design'] });
  const draftResult = run(draft, { phase: 'design', flags: { by: 'the client' } });
  assert.equal(draftResult.code, 1);
  assert.equal(draftResult.out, absentResult.out);
  assert.equal(draftResult.err, '  DEPENDENCY_NOT_APPROVED: .funky-forge/brief.md is "draft"; approve it first\n');

  await rm(absent, { recursive: true, force: true });
  await rm(draft, { recursive: true, force: true });
});

test('a warning is not blocking: a template comment is printed and the approval is written', async () => {
  const dir = await project({ files: { brief: documentOf('problem', { body: `<!-- hint -->\n${BODY.problem}` }) } });
  const hash = bodyHash(readDocument(await artifactText(dir)));

  const result = run(dir, { flags: { by: 'the client' } });

  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    [
      'funky-forge approve - problem',
      '  warning: TEMPLATE_COMMENT: 1 template comment(s) left in the body; remove them before the gate',
      '  approved_by: the client',
      '  approved_at: 2026-03-01',
      `  approved_hash: ${hash}`,
      'ok',
      'wrote: .funky-forge/brief.md',
      `body hash: ${hash}`,
      '',
    ].join('\n'),
  );
  assert.equal(readDocument(await artifactText(dir)).data.status, 'approved');

  await rm(dir, { recursive: true, force: true });
});

test('a write needs --by, is refused with the parser code, and writes nothing', async () => {
  const dir = await project();
  const before = await artifactText(dir);

  const result = run(dir);

  assert.equal(result.code, 1);
  assert.equal(
    result.out,
    ['funky-forge approve - problem', '  error: FLAG_VALUE_MISSING: approve writes approved_by, so it needs --by <name>: the human who approved this phase', '1 error(s)', ''].join('\n'),
  );
  assert.equal(result.err, '');
  assert.equal(await artifactText(dir), before);

  await rm(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// S3 — the five states branch explicitly.
// ---------------------------------------------------------------------------------------------

test('a stale artifact is approvable: it kept its content and lost only its approval', async () => {
  const staleDocument = documentOf('problem', { status: 'stale' });
  const dir = await project({ files: { brief: staleDocument } });
  const hash = bodyHash(readDocument(staleDocument));

  const result = run(dir, { flags: { by: 'the client' } });

  assert.equal(result.code, 0);
  const written = readDocument(await artifactText(dir));
  assert.equal(written.data.status, 'approved');
  assert.equal(written.data.approved_hash, hash);
  assert.equal(written.body, readDocument(staleDocument).body);

  await rm(dir, { recursive: true, force: true });
});

test('an approved artifact with the same body hash is refused as ALREADY_APPROVED and left byte-identical', async () => {
  const approvedDocument = documentOf('problem', { status: 'approved', approved: { by: 'the client', at: '2026-02-01', hash: bodyHash(readDocument(documentOf('problem'))) } });
  const dir = await project({ files: { brief: approvedDocument } });

  const result = run(dir, { flags: { by: 'someone else' } });

  assert.equal(result.code, 1);
  assert.equal(
    result.out,
    ['funky-forge approve - problem', '  error: ALREADY_APPROVED: .funky-forge/brief.md is already approved by "the client" on "2026-02-01" for the same body hash; re-run with --force to re-date it', '1 error(s)', ''].join('\n'),
  );
  assert.equal(result.err, '');
  assert.equal(await artifactText(dir), approvedDocument);

  await rm(dir, { recursive: true, force: true });
});

test('--force re-dates the ALREADY_APPROVED case and changes nothing else', async () => {
  const hash = bodyHash(readDocument(documentOf('problem')));
  const approvedDocument = documentOf('problem', { status: 'approved', approved: { by: 'the client', at: '2026-02-01', hash } });
  const dir = await project({ files: { brief: approvedDocument } });

  const result = run(dir, { flags: { force: true } });

  assert.equal(result.code, 0);
  assert.equal(
    result.out,
    ['funky-forge approve - problem', '  approved_by: the client', '  approved_at: 2026-03-01', `  approved_hash: ${hash}`, 'ok', 're-dated: .funky-forge/brief.md', `body hash: ${hash}`, ''].join('\n'),
  );
  assert.equal(await artifactText(dir), approvedDocument.replace('approved_at: 2026-02-01', 'approved_at: 2026-03-01'));

  await rm(dir, { recursive: true, force: true });
});

test('an approved artifact whose hash no longer matches is approvable: re-approving is the cure for APPROVED_CONTENT_CHANGED', async () => {
  const document = documentOf('problem', { status: 'approved', approved: { by: 'the client', at: '2026-02-01', hash: ZERO_HASH } });
  const dir = await project({ files: { brief: document } });
  const hash = bodyHash(readDocument(document));

  const result = run(dir, { flags: { by: 'the client' } });

  assert.equal(result.code, 0);
  assert.equal(result.out, ['funky-forge approve - problem', '  approved_by: the client', '  approved_at: 2026-03-01', `  approved_hash: ${hash}`, 'ok', 'wrote: .funky-forge/brief.md', `body hash: ${hash}`, ''].join('\n'));
  const written = readDocument(await artifactText(dir));
  assert.equal(written.data.approved_hash, hash);
  assert.equal(written.data.approved_at, '2026-03-01');

  await rm(dir, { recursive: true, force: true });
});

test('a rejected artifact is refused as STATUS_NOT_APPROVABLE, and --force does not change it', async () => {
  const document = documentOf('problem', { status: 'rejected' });
  const dir = await project({ files: { brief: document } });

  for (const flags of [{ by: 'the client' }, { by: 'the client', force: true }]) {
    const result = run(dir, { flags });
    assert.equal(result.code, 1);
    assert.equal(
      result.out,
      ['funky-forge approve - problem', '  error: STATUS_NOT_APPROVABLE: .funky-forge/brief.md is "rejected"; only a rewritten artifact can be approved', '1 error(s)', ''].join('\n'),
    );
    assert.equal(result.err, '');
    assert.equal(await artifactText(dir), document);
  }

  await rm(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// S8 — approved_at is the UTC date, pinned where a local date would differ.
// ---------------------------------------------------------------------------------------------

test('approved_at is the UTC date even where the local calendar has already rolled over', async () => {
  const dir = await project();
  const command = new URL('../src/commands/approve.js', import.meta.url).href;
  const script = [
    `import { approve } from ${JSON.stringify(command)};`,
    `import { readFileSync } from 'node:fs';`,
    `const instant = Date.parse('2026-03-01T23:30:00Z');`,
    `const silence = { stdout: () => {}, stderr: () => {} };`,
    `approve({ cwd: ${JSON.stringify(dir)}, phase: 'problem', flags: { by: 'the client' }, now: () => new Date(instant), ...silence });`,
    `const text = readFileSync(${JSON.stringify(join(dir, '.funky-forge/brief.md'))}, 'utf8');`,
    `const local = new Date(instant);`,
    `process.stdout.write(JSON.stringify({ local: [local.getFullYear(), local.getMonth() + 1, local.getDate()].join('-'), approvedAt: /approved_at: (.*)/.exec(text)[1] }));`,
  ].join('\n');

  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: 'Pacific/Kiritimati' },
    encoding: 'utf8',
  });

  assert.equal(child.status, 0, child.stderr);
  // The local clock at UTC+14 is already 2026-03-02; anything but a UTC date writes the wrong day.
  assert.deepEqual(JSON.parse(child.stdout), { local: '2026-3-2', approvedAt: '2026-03-01' });

  await rm(dir, { recursive: true, force: true });
});
