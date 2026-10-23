/**
 * Acceptance tests for the deterministic gates: each case runs the real `check` command against a
 * project directory and asserts the exit code plus the exact error codes the CLI emits.
 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { check } from '../src/commands/check.js';
import { computeEstimate, renderTable } from '../src/lib/estimate.js';

const DEPENDS = { problem: [], design: ['problem'], estimate: ['problem', 'design'], proposal: ['problem', 'design', 'estimate'] };
const GATE_NUMBER = { problem: 1, design: 2, estimate: 3, proposal: 4 };

const BRIEF_BODY = `# Brief — Checkout tool

## One-line summary

An internal record of who holds each shared item.

## Problem today

Shared equipment goes missing because the record lives in a spreadsheet and a chat channel.

## Users and volume

Forty studio members read it; two maintainers write it.

## Core flow

A member requests an item, a maintainer records the handover, and a return frees the item.

## Must-haves

- One catalogue with a unique identifier per item.
- Only the two maintainers approve a handover.

## Out of scope

- Tracking hardware.
- Procurement integration.

## Success metric

Zero items whose real holder differs from the record, 90 days after launch.

## Deadline and constraints

Three weeks of one in-house developer at USD 35 per hour, currency USD.

## Current cost of the problem

unknown: no time log and no loss figure exist.
`;

const DESIGN_BODY = `# Design — Checkout tool

## Architecture at a glance

One server-rendered application over one relational database.

## Components and responsibilities

- **Catalogue** — owns the item register.
- **Ledger** — owns checkout rows.

## Must-have coverage

| # | Must-have | Component |
|---|---|---|
| 1 | a unique identifier per item | Catalogue |
| 2 | only maintainers approve | Ledger |

## Data model and retention

Three tables; nothing is deleted.

## Auth and permissions

Two roles behind one server-side guard.

## Integrations

None; no third-party service is used.

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

PostgreSQL is fixed; the language is deferred to the estimate.

## Open decisions

- D1 — the host provider. Owner: the client.
`;

const ESTIMATE_INPUT = {
  blocks: [{ id: 'ui', name: 'Catalogue', optimistic: 16, likely: 24, pessimistic: 40 }],
  pricing: { contingency: 0.2, margin: 0.3, tco_monthly: 30 },
  rate: 40,
  currency: 'USD',
};

const ASSUMPTIONS = `---
schema: 1
language: en
proposal_language: en
currency: USD
hourly_rate: 40
hourly_rate_source: user-provided
market_references: []
---

# Assumptions
`;

function artifact(phase, body, { status = 'draft' } = {}) {
  const approved = status === 'approved';
  return `---
schema: 1
phase: ${phase}
status: ${status}
depends_on: [${DEPENDS[phase].join(', ')}]
language: en
approved_by: ${approved ? '"the client"' : 'null'}
approved_at: ${approved ? '2026-10-01' : 'null'}
approved_hash: ${approved ? `sha256:${'0'.repeat(64)}` : 'null'}
method_version: 1
---

${body}`;
}

function gateReport(phase, { depth = 'deep', verdict = 'PASS', findings = 0, headings = '', accepted = '[]', escalation = 'null' } = {}) {
  const acceptedBlock = accepted === '[]' ? 'accepted_risks: []' : `accepted_risks:\n${accepted}`;
  return `---
phase: ${phase}
verdict: ${verdict}
depth: ${depth}
escalation_reason: ${escalation}
reviewer: design
date: 2026-10-02
findings: ${findings}
not_verified: []
${acceptedBlock}
---

${headings}`;
}

/**
 * A complete estimate whose generated table renders 25.3 expected hours for the Catalogue block.
 * @param {{notes?: string, cell?: string}} [options]
 * @returns {string}
 */
function estimateBody({ notes = 'Catalogue and Ledger are priced in this block.', cell = '25.3' } = {}) {
  const table = renderTable(computeEstimate(ESTIMATE_INPUT)).replace('| Catalogue | 16 | 24 | 40 | 25.3 |', `| Catalogue | 16 | 24 | 40 | ${cell} |`);
  return `# Estimate — Checkout tool

## Work blocks

\`\`\`yaml
blocks:
  - id: ui
    name: Catalogue
    optimistic: 16
    likely: 24
    pessimistic: 40
\`\`\`

## Pricing

\`\`\`yaml
pricing:
  currency: USD
  contingency: 0.2
  margin: 0.3
  margin_reason: "the studio fixed the margin at 30%"
  tco_monthly: 30
  tco_components: "one small host and its backup storage"
\`\`\`

## Computed range

<!-- calc:start -->
${table}
<!-- calc:end -->

## Notes

${notes}
`;
}

async function project({ files = {}, gates = {} } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ff-acceptance-'));
  await mkdir(join(dir, '.funky-forge/gates'), { recursive: true });
  await writeFile(join(dir, '.funky-forge/assumptions.md'), ASSUMPTIONS, 'utf8');
  for (const [file, text] of Object.entries(files)) {
    await writeFile(join(dir, '.funky-forge', file), text, 'utf8');
  }
  for (const [phase, text] of Object.entries(gates)) {
    await writeFile(join(dir, '.funky-forge/gates', `${GATE_NUMBER[phase]}-${phase}.md`), text, 'utf8');
  }
  return dir;
}

function run(dir, phase) {
  const out = [];
  const err = [];
  const code = check({ cwd: dir, phase, flags: { json: true }, stdout: (line) => out.push(`${line}\n`), stderr: (line) => err.push(`${line}\n`) });
  return { code, out: out.join(''), err: err.join('') };
}

/**
 * Removes every line of one level-two section's content, leaving the heading in place.
 * @param {string} body
 * @param {string} title
 * @returns {string}
 */
function emptySection(body, title) {
  const lines = body.split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  assert.notEqual(start, -1, `section ${title} not found`);
  let end = start + 1;
  while (end < lines.length && !/^#{1,2}\s+/.test(lines[end])) end += 1;
  return [...lines.slice(0, start + 1), ...lines.slice(end)].join('\n');
}

test('a brief with emptied required sections fails with MISSING_FIELD naming each section', async () => {
  const dir = await project({
    files: { 'brief.md': artifact('problem', BRIEF_BODY) },
    gates: { problem: gateReport('problem') },
  });
  const baseline = run(dir, 'problem');
  assert.equal(baseline.code, 0, baseline.out);

  let body = BRIEF_BODY;
  for (const title of ['Must-haves', 'Success metric', 'Out of scope']) body = emptySection(body, title);
  await writeFile(join(dir, '.funky-forge/brief.md'), artifact('problem', body), 'utf8');

  const result = run(dir, 'problem');
  assert.equal(result.code, 1);
  const payload = JSON.parse(result.out);
  assert.deepEqual(
    payload.errors.map((error) => error.code),
    ['MISSING_FIELD', 'MISSING_FIELD', 'MISSING_FIELD'],
  );
  const named = payload.errors.map((error) => /the required section "([^"]+)"/.exec(error.message)?.[1]).sort();
  assert.deepEqual(named, ['Must-haves', 'Out of scope', 'Success metric']);
  await rm(dir, { recursive: true, force: true });
});

test('a design whose NFR table has fewer than three rows fails with NFR_INCOMPLETE', async () => {
  const dir = await project({
    files: {
      'brief.md': artifact('problem', BRIEF_BODY, { status: 'approved' }),
      'design.md': artifact('design', DESIGN_BODY),
    },
    gates: { design: gateReport('design') },
  });
  const baseline = run(dir, 'design');
  assert.equal(baseline.code, 0, baseline.out);

  const body = DESIGN_BODY.replace('| Availability | yes | nightly backup |\n', '');
  await writeFile(join(dir, '.funky-forge/design.md'), artifact('design', body), 'utf8');

  const result = run(dir, 'design');
  assert.equal(result.code, 1);
  const payload = JSON.parse(result.out);
  assert.deepEqual(
    payload.errors.map((error) => error.code),
    ['NFR_INCOMPLETE'],
  );
  await rm(dir, { recursive: true, force: true });
});

test('a design component absent from the estimate fails with COMPONENT_NOT_ESTIMATED as an error', async () => {
  const dir = await project({
    files: {
      'brief.md': artifact('problem', BRIEF_BODY, { status: 'approved' }),
      'design.md': artifact('design', DESIGN_BODY, { status: 'approved' }),
      'estimate.md': artifact('estimate', estimateBody({ notes: 'Catalogue is priced in this block.' })),
    },
    gates: { estimate: gateReport('estimate') },
  });

  const result = run(dir, 'estimate');
  assert.equal(result.code, 1);
  const payload = JSON.parse(result.out);
  assert.deepEqual(
    payload.errors.map((error) => error.code),
    ['COMPONENT_NOT_ESTIMATED'],
  );
  assert.match(payload.errors[0].message, /Ledger/);
  await rm(dir, { recursive: true, force: true });
});

test('a generated cell of 25.35 against a computed 25.333 fails with ARITHMETIC_MISMATCH', async () => {
  const dir = await project({
    files: {
      'brief.md': artifact('problem', BRIEF_BODY, { status: 'approved' }),
      'design.md': artifact('design', DESIGN_BODY, { status: 'approved' }),
      'estimate.md': artifact('estimate', estimateBody()),
    },
    gates: { estimate: gateReport('estimate') },
  });
  const baseline = run(dir, 'estimate');
  assert.equal(baseline.code, 0, baseline.out);

  await writeFile(join(dir, '.funky-forge/estimate.md'), artifact('estimate', estimateBody({ cell: '25.35' })), 'utf8');
  const result = run(dir, 'estimate');
  assert.equal(result.code, 1);
  const payload = JSON.parse(result.out);
  assert.deepEqual(
    payload.errors.map((error) => error.code),
    ['ARITHMETIC_MISMATCH'],
  );
  assert.match(payload.errors[0].message, /25\.35/);
  await rm(dir, { recursive: true, force: true });
});

test('a gate report without the escalation_reason key fails with GATE_REPORT_MALFORMED', async () => {
  const report = gateReport('problem').replace('escalation_reason: null\n', '');
  const dir = await project({
    files: { 'brief.md': artifact('problem', BRIEF_BODY) },
    gates: { problem: report },
  });

  const result = run(dir, 'problem');
  assert.equal(result.code, 1);
  const payload = JSON.parse(result.out);
  assert.deepEqual(
    payload.errors.map((error) => error.code),
    ['GATE_REPORT_MALFORMED'],
  );
  assert.match(payload.errors[0].message, /escalation_reason/);
  await rm(dir, { recursive: true, force: true });
});

test('a light gate with an accepted high finding and no escalation_reason fails', async () => {
  const accepted = '  - finding: R1-F1\n    severity: high\n    reason: accepted for launch\n    accepted_by: the client\n    date: 2026-10-02\n';
  const dir = await project({
    files: { 'brief.md': artifact('problem', BRIEF_BODY) },
    gates: {
      problem: gateReport('problem', {
        depth: 'light',
        verdict: 'PASS_WITH_RISKS',
        findings: 1,
        headings: '### F1 - Severity: high - The return path\n',
        accepted,
      }),
    },
  });

  const result = run(dir, 'problem');
  assert.equal(result.code, 1);
  const payload = JSON.parse(result.out);
  assert.deepEqual(
    payload.errors.map((error) => error.code),
    ['GATE_REPORT_MALFORMED'],
  );
  assert.match(payload.errors[0].message, /R1-F1/);
  await rm(dir, { recursive: true, force: true });
});
