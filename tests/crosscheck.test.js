import assert from 'node:assert/strict';
import test from 'node:test';

import {
  arithmeticChecks,
  componentNames,
  componentPricingChecks,
  designCrossChecks,
  proposalCrossChecks,
} from '../src/lib/crosscheck.js';
import { computeEstimate, renderTable } from '../src/lib/estimate.js';

const ESTIMATE_INPUT = {
  blocks: [
    { id: 'discovery', name: 'Discovery', optimistic: 16, likely: 24, pessimistic: 40 },
    { id: 'backend', name: 'Backend', optimistic: 40, likely: 60, pessimistic: 90 },
  ],
  pricing: { contingency: 0.2, margin: 0.3, tco_monthly: 30 },
  rate: 40,
  currency: 'USD',
};

const DESIGN = `# Design

## Components and responsibilities

- **Catalogue** — owns the item register
- **Ledger** — owns checkout rows

## Must-have to component map

| # | Must-have | Component |
|---|---|---|
| 1 | an item register | Catalogue |
| 2 | checkout rows | Ledger |

## NFR decisions

| NFR | Decision |
|---|---|
| Performance | p95 under 300 ms |
| Security | role-based access |
| Availability | single instance |

## Rejected alternatives

- UndoStack - rejected because the brief does not ask for undo
`;

test('a complete coverage map has no findings', () => {
  const result = designCrossChecks({ designBody: DESIGN });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('a component missing from coverage and from rejected alternatives is MISSING_MAPPING', () => {
  const body = DESIGN.replace('| 2 | checkout rows | Ledger |\n', '');
  const result = designCrossChecks({ designBody: body });
  assert.deepEqual(result.errors.map((error) => error.code), ['MISSING_MAPPING']);
  assert.match(result.errors[0].message, /Ledger/);
});

test('a component that is only in rejected alternatives passes', () => {
  const body = DESIGN.replace('| 2 | checkout rows | Ledger |\n', '').replace('- UndoStack - rejected', '- Ledger - rejected');
  assert.deepEqual(designCrossChecks({ designBody: body }).errors, []);
});

test('coverage naming an undeclared component is UNDEFINED_COMPONENT', () => {
  const body = DESIGN.replace('| 1 | an item register | Catalogue |', '| 1 | an item register | Catalogue, Ghost |');
  const result = designCrossChecks({ designBody: body });
  assert.deepEqual(result.errors.map((error) => error.code), ['UNDEFINED_COMPONENT']);
  assert.match(result.errors[0].message, /Ghost/);
});

test('a short NFR table is an error, not a warning', () => {
  const body = DESIGN.replace('| Availability | single instance |\n', '');
  const result = designCrossChecks({ designBody: body });
  assert.deepEqual(result.errors.map((error) => error.code), ['NFR_INCOMPLETE']);
  assert.deepEqual(result.warnings, []);
});

test('component names come from marked-up list items only', () => {
  const body = `${DESIGN}- Plain prose rule that is not a component\n`;
  assert.deepEqual(componentNames(body), ['Catalogue', 'Ledger']);
});

test('a matching generated table passes, a stale number fails', () => {
  const estimate = computeEstimate(ESTIMATE_INPUT);
  const table = renderTable(estimate);
  const body = `<!-- calc:start -->\n${table}\n<!-- calc:end -->\n`;
  assert.deepEqual(arithmeticChecks({ estimateBody: body, estimate }), []);

  const wrong = body.replace('| Discovery | 16 | 24 | 40 | 25.3 |', '| Discovery | 16 | 24 | 40 | 31.0 |');
  const errors = arithmeticChecks({ estimateBody: wrong, estimate });
  assert.ok(errors.some((error) => error.code === 'ARITHMETIC_MISMATCH' && /Discovery/.test(error.message)));
});

test('a missing generated table fails instead of passing silently', () => {
  const estimate = computeEstimate(ESTIMATE_INPUT);
  const errors = arithmeticChecks({ estimateBody: '# no markers here\n', estimate });
  assert.deepEqual(errors.map((error) => error.code), ['ARITHMETIC_MISMATCH']);
});

test('a proposal quoting the estimate price passes, another figure fails', () => {
  const estimate = computeEstimate(ESTIMATE_INPUT);
  assert.deepEqual(proposalCrossChecks({ proposalBody: 'Total: USD 5,429 fixed.', estimate }).errors, []);
  const mismatch = proposalCrossChecks({ proposalBody: 'Total: USD 6,000 fixed.', estimate }).errors;
  assert.deepEqual(mismatch.map((error) => error.code), ['PRICE_MISMATCH']);
  assert.match(mismatch[0].message, /5,429/);
});

test('a component absent from the estimate is an error', () => {
  const result = componentPricingChecks({ designBody: DESIGN, estimateBody: 'the catalogue only\n' });
  assert.deepEqual(result.errors.map((error) => error.code), ['COMPONENT_NOT_ESTIMATED']);
  assert.match(result.errors[0].message, /Ledger/);
  assert.deepEqual(result.warnings, []);
});

test('a cell more than TOLERANCE away from the rendered hours is a mismatch', () => {
  const estimate = computeEstimate({
    blocks: [{ id: 'discovery', name: 'Discovery', optimistic: 16, likely: 24, pessimistic: 40 }],
    pricing: { contingency: 0.2, margin: 0.3, tco_monthly: 30 },
    rate: 40,
    currency: 'USD',
  });
  const body = `<!-- calc:start -->\n${renderTable(estimate)}\n<!-- calc:end -->\n`;
  assert.deepEqual(arithmeticChecks({ estimateBody: body, estimate }), []);

  // 25.333.. renders as 25.3; 25.35 is 0.05 away, which the 0.01 tolerance rejects.
  const drifted = body.replace('| Discovery | 16 | 24 | 40 | 25.3 |', '| Discovery | 16 | 24 | 40 | 25.35 |');
  const errors = arithmeticChecks({ estimateBody: drifted, estimate });
  assert.deepEqual(errors.map((error) => error.code), ['ARITHMETIC_MISMATCH']);
  assert.match(errors[0].message, /25\.35/);
});

test('a component named only under an optional heading is flagged', () => {
  const estimateBody = `## Work blocks\n\nThe catalogue is priced here.\n\n## Optional scope\n\nLedger export.\n`;
  const result = componentPricingChecks({ designBody: DESIGN, estimateBody });
  assert.deepEqual(result.warnings.map((warning) => warning.code), ['COMPONENT_ONLY_OPTIONAL']);
  assert.match(result.warnings[0].message, /Ledger/);
});
