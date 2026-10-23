import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { check } from '../src/commands/check.js';
import { bodyHash, readDocument } from '../src/lib/frontmatter.js';

const DEPENDS = { problem: [], design: ['problem'], estimate: ['problem', 'design'], proposal: ['problem', 'design', 'estimate'] };

const PHASE_BODY = {
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
  estimate: `## Work blocks

The blocks are listed in the generated table below.

## Pricing

Pricing follows the assumptions file.
`,
  proposal: `## Price and payment milestones

Real content, no placeholders.\n`,
};

function artifact(phase, { status = 'draft', extra = '', approvedHash = 'null', approvedBy = 'null', approvedAt = 'null', body = PHASE_BODY[phase] } = {}) {
  return `---
schema: 1
phase: ${phase}
status: ${status}
depends_on: [${DEPENDS[phase].join(', ')}]
language: en
approved_by: ${approvedBy}
approved_at: ${approvedAt}
approved_hash: ${approvedHash}
method_version: 1
${extra}---

# ${phase}

${body}`;
}

function gateReport(phase, { verdict = 'PASS', findings = 0, accepted = '[]', headings = '' } = {}) {
  return `---
phase: ${phase}
verdict: ${verdict}
depth: light
escalation_reason: null
reviewer: product
date: 2026-10-01
findings: ${findings}
not_verified: []
accepted_risks: ${accepted}
---

${headings}`;
}

async function project({ phase = 'problem', files = {}, gates = ['1-problem'] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ff-check-'));
  await mkdir(join(dir, '.funky-forge/gates'), { recursive: true });
  await writeFile(join(dir, '.funky-forge/brief.md'), files.brief ?? artifact('problem'), 'utf8');
  for (const gate of gates) {
    const name = gate.split('-').slice(1).join('-');
    await writeFile(join(dir, '.funky-forge/gates', `${gate}.md`), gateReport(name), 'utf8');
  }
  for (const [name, content] of Object.entries(files)) {
    if (name === 'brief') continue;
    await writeFile(join(dir, '.funky-forge', `${name}.md`), content, 'utf8');
  }
  return { dir, phase };
}

function run(dir, phase, flags = {}) {
  const out = [];
  const err = [];
  const code = check({ cwd: dir, phase, flags, stdout: (line) => out.push(`${line}\n`), stderr: (line) => err.push(`${line}\n`) });
  return { code, out: out.join(''), err: err.join('') };
}

test('a missing artifact fails with MISSING_ARTIFACT', async () => {
  const { dir } = await project({ gates: [] });
  await rm(join(dir, '.funky-forge/brief.md'));
  const result = run(dir, 'problem', { json: true });
  assert.equal(result.code, 1);
  const payload = JSON.parse(result.out);
  assert.equal(payload.ok, false);
  assert.equal(payload.bodyHash, null);
  assert.equal(payload.errors[0].code, 'MISSING_ARTIFACT');
  await rm(dir, { recursive: true, force: true });
});

test('a valid draft brief passes and reports the real body hash', async () => {
  const { dir } = await project();
  const result = run(dir, 'problem', { json: true });
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.out);
  const expected = bodyHash(readDocument(await readFile(join(dir, '.funky-forge/brief.md'), 'utf8')));
  assert.equal(payload.ok, true);
  assert.equal(payload.bodyHash, expected);
  assert.deepEqual(payload.errors, []);
  await rm(dir, { recursive: true, force: true });
});

test('an unsupported schema is refused', async () => {
  const { dir } = await project();
  await writeFile(join(dir, '.funky-forge/brief.md'), artifact('problem').replace('schema: 1', 'schema: 2'), 'utf8');
  const result = run(dir, 'problem');
  assert.equal(result.code, 1);
  assert.match(result.out, /SCHEMA_UNSUPPORTED/);
  await rm(dir, { recursive: true, force: true });
});

test('a phase that does not match the file is refused', async () => {
  const { dir } = await project();
  await writeFile(join(dir, '.funky-forge/brief.md'), artifact('problem').replace('phase: problem', 'phase: design'), 'utf8');
  const result = run(dir, 'problem');
  assert.equal(result.code, 1);
  assert.match(result.out, /PHASE_MISMATCH/);
  await rm(dir, { recursive: true, force: true });
});

test('an approved artifact whose body changed fails with APPROVED_CONTENT_CHANGED', async () => {
  const { dir } = await project();
  const text = artifact('problem', {
    status: 'approved',
    approvedBy: 'the client',
    approvedAt: '2026-10-01',
    approvedHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  });
  await writeFile(join(dir, '.funky-forge/brief.md'), text, 'utf8');
  const result = run(dir, 'problem');
  assert.equal(result.code, 1);
  assert.match(result.out, /APPROVED_CONTENT_CHANGED/);
  await rm(dir, { recursive: true, force: true });
});

test('an approved artifact with a matching hash passes', async () => {
  const { dir } = await project();
  const draft = artifact('problem');
  const hash = bodyHash(readDocument(draft));
  await writeFile(
    join(dir, '.funky-forge/brief.md'),
    artifact('problem', { status: 'approved', approvedBy: 'the client', approvedAt: '2026-10-01', approvedHash: hash }),
    'utf8',
  );
  const result = run(dir, 'problem');
  assert.equal(result.code, 0, result.out);
  await rm(dir, { recursive: true, force: true });
});

test('a design whose brief is still draft fails with DEPENDENCY_NOT_APPROVED', async () => {
  const { dir } = await project({ files: { design: artifact('design') }, gates: ['2-design'] });
  const result = run(dir, 'design');
  assert.equal(result.code, 1);
  assert.match(result.out, /DEPENDENCY_NOT_APPROVED/);
  assert.match(result.out, /brief\.md is "draft"/);
  await rm(dir, { recursive: true, force: true });
});

test('a stale artifact fails with STALE_ARTIFACT', async () => {
  const { dir } = await project();
  await writeFile(join(dir, '.funky-forge/brief.md'), artifact('problem', { status: 'stale' }), 'utf8');
  const result = run(dir, 'problem');
  assert.equal(result.code, 1);
  assert.match(result.out, /STALE_ARTIFACT/);
  await rm(dir, { recursive: true, force: true });
});

test('a placeholder token fails with PLACEHOLDER_FOUND', async () => {
  const { dir } = await project();
  await writeFile(join(dir, '.funky-forge/brief.md'), artifact('problem', { body: 'Scope: TBD.\n' }), 'utf8');
  const result = run(dir, 'problem');
  assert.equal(result.code, 1);
  assert.match(result.out, /PLACEHOLDER_FOUND/);
  await rm(dir, { recursive: true, force: true });
});

test('a missing gate report fails with GATE_REPORT_MISSING', async () => {
  const { dir } = await project({ gates: [] });
  const result = run(dir, 'problem');
  assert.equal(result.code, 1);
  assert.match(result.out, /GATE_REPORT_MISSING/);
  await rm(dir, { recursive: true, force: true });
});

test('leftover template comments warn, and --strict turns them into a failure', async () => {
  const { dir } = await project();
  await writeFile(join(dir, '.funky-forge/brief.md'), artifact('problem', { body: `<!-- hint -->\n${PHASE_BODY.problem}` }), 'utf8');
  const lenient = run(dir, 'problem');
  assert.equal(lenient.code, 0);
  assert.match(lenient.out, /TEMPLATE_COMMENT/);
  const strict = run(dir, 'problem', { strict: true });
  assert.equal(strict.code, 1);
  assert.match(strict.out, /TEMPLATE_COMMENT/);
  await rm(dir, { recursive: true, force: true });
});

test('an unknown phase is refused before touching the filesystem', async () => {
  const { dir } = await project();
  const result = run(dir, 'bogus');
  assert.equal(result.code, 1);
  assert.match(result.err, /UNKNOWN_PHASE/);
  await rm(dir, { recursive: true, force: true });
});

test('check never writes: the artifact bytes are identical afterwards', async () => {
  const { dir } = await project();
  const before = await readFile(join(dir, '.funky-forge/brief.md'), 'utf8');
  run(dir, 'problem');
  run(dir, 'problem', { strict: true });
  assert.equal(await readFile(join(dir, '.funky-forge/brief.md'), 'utf8'), before);
  await rm(dir, { recursive: true, force: true });
});
