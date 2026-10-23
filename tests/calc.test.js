import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { calc } from '../src/commands/calc.js';

const ESTIMATE = `---
schema: 1
phase: estimate
status: draft
depends_on: [problem, design]
language: en
approved_by: null
approved_at: null
approved_hash: null
method_version: 1
---

# Estimate - Test

## Work blocks

\`\`\`yaml
blocks:
  - id: discovery
    name: Discovery
    optimistic: 16
    likely: 24
    pessimistic: 40
    rationale: interviews and scope
  - id: backend
    name: Backend
    optimistic: 40
    likely: 60
    pessimistic: 90
    rationale: catalogue and ledger
\`\`\`

## Pricing

\`\`\`yaml
pricing:
  currency: USD
  contingency: 0.2
  contingency_reason: ""
  margin: 0.3
  margin_reason: platform product
  tco_monthly: 30
  tco_components: hosting
\`\`\`

## Generated table

<!-- calc:start -->
<!-- calc:end -->

Trailing prose stays.
`;

const ASSUMPTIONS = `---
schema: 1
language: en
proposal_language: en
currency: USD
hourly_rate: 40
hourly_rate_source: user-provided
contingency_default: 20
margin_default: 30
client_size: smb
team: []
market_references: []
---

# Assumptions
`;

async function project({ estimate = ESTIMATE, assumptions = ASSUMPTIONS, status } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ff-calc-'));
  await mkdir(join(dir, '.funky-forge'), { recursive: true });
  const body = status ? estimate.replace('status: draft', `status: ${status}`) : estimate;
  await writeFile(join(dir, '.funky-forge/estimate.md'), body, 'utf8');
  await writeFile(join(dir, '.funky-forge/assumptions.md'), assumptions, 'utf8');
  return dir;
}

function run(dir, flags = {}) {
  const out = [];
  const err = [];
  return {
    code: calc({ cwd: dir, flags, stdout: (line) => out.push(`${line}\n`), stderr: (line) => err.push(`${line}\n`) }),
    out: out.join(''),
    err: err.join(''),
  };
}

test('computes the table with the documented formula and formatting', async () => {
  const dir = await project();
  const { code, out } = run(dir);
  assert.equal(code, 0);
  assert.match(out, /\| Discovery \| 16 \| 24 \| 40 \| 25\.3 \|/);
  assert.match(out, /\| Backend \| 40 \| 60 \| 90 \| 61\.7 \|/);
  assert.match(out, /\| \*\*Total\*\* \| \*\*56\*\* \| \*\*84\*\* \| \*\*130\*\* \| \*\*87\.0\*\* \|/);
  assert.match(out, /Rate: USD 40\/h\. Contingency: 20%\. Margin: 30%\./);
  assert.match(out, /Expected price: USD 5,429\. Range: USD 3,494 - USD 8,112\./);
  await rm(dir, { recursive: true, force: true });
});

test('--json keeps two decimals in hours and leaves money unrounded', async () => {
  const dir = await project();
  const { code, out } = run(dir, { json: true });
  assert.equal(code, 0);
  const payload = JSON.parse(out);
  assert.equal(payload.ok, true);
  assert.equal(payload.blocks[0].expected, 25.33);
  assert.equal(payload.blocks[1].expected, 61.67);
  assert.equal(payload.totals.expected, 87);
  assert.equal(payload.pricing.rate, 40);
  assert.equal(payload.pricing.expected, 5428.8);
  assert.equal(payload.pricing.low, 3494.4);
  assert.equal(payload.pricing.high, 8112);
  await rm(dir, { recursive: true, force: true });
});

test('--write replaces only the region between the markers', async () => {
  const dir = await project();
  const result = run(dir, { write: true });
  assert.equal(result.code, 0);
  const text = await readFile(join(dir, '.funky-forge/estimate.md'), 'utf8');
  assert.match(text, /^---\nschema: 1/m);
  assert.equal(text.match(/<!-- calc:start -->/g).length, 1);
  assert.equal(text.match(/<!-- calc:end -->/g).length, 1);
  assert.match(text, /\| \*\*Total\*\* \|/);
  assert.match(text, /Trailing prose stays\./);
  assert.doesNotMatch(text, /approved_hash: sha256/);
  await rm(dir, { recursive: true, force: true });
});

test('--write is idempotent', async () => {
  const dir = await project();
  assert.equal(run(dir, { write: true }).code, 0);
  const first = await readFile(join(dir, '.funky-forge/estimate.md'), 'utf8');
  assert.equal(run(dir, { write: true }).code, 0);
  const second = await readFile(join(dir, '.funky-forge/estimate.md'), 'utf8');
  assert.equal(second, first);
  await rm(dir, { recursive: true, force: true });
});

test('missing markers refuse to write and leave the file unchanged', async () => {
  const broken = ESTIMATE.replace('<!-- calc:start -->\n<!-- calc:end -->\n\n', '');
  const dir = await project({ estimate: broken });
  const result = run(dir, { write: true });
  assert.equal(result.code, 1);
  assert.match(result.err, /CALC_MARKERS_MISSING/);
  assert.equal(await readFile(join(dir, '.funky-forge/estimate.md'), 'utf8'), broken);
  await rm(dir, { recursive: true, force: true });
});

test('an inverted block order is invalid input', async () => {
  const broken = ESTIMATE.replace('optimistic: 40\n    likely: 60', 'optimistic: 40\n    likely: 30');
  const dir = await project({ estimate: broken });
  const result = run(dir);
  assert.equal(result.code, 1);
  assert.match(result.err, /BLOCK_ORDER_INVALID/);
  assert.match(result.err, /backend/);
  await rm(dir, { recursive: true, force: true });
});

test('a missing rate fails with RATE_MISSING', async () => {
  const dir = await project({ assumptions: ASSUMPTIONS.replace('hourly_rate: 40', 'hourly_rate: unknown') });
  const result = run(dir);
  assert.equal(result.code, 1);
  assert.match(result.err, /RATE_MISSING/);
  await rm(dir, { recursive: true, force: true });
});

test('a margin without a reason fails with MARGIN_MISSING', async () => {
  const dir = await project({ estimate: ESTIMATE.replace('margin_reason: platform product', 'margin_reason: ""') });
  const result = run(dir);
  assert.equal(result.code, 1);
  assert.match(result.err, /MARGIN_MISSING/);
  await rm(dir, { recursive: true, force: true });
});

test('writing on an approved estimate reports the revoked approval', async () => {
  const dir = await project({ status: 'approved' });
  const result = run(dir, { write: true });
  assert.equal(result.code, 0);
  assert.match(result.err, /APPROVED_CONTENT_CHANGED/);
  await rm(dir, { recursive: true, force: true });
});
