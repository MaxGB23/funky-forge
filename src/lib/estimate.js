/**
 * The estimate arithmetic: one implementation shared by `calc` and `check`, so the table the
 * command writes and the table the check recomputes can never disagree by construction.
 */

import { fencedBlocks, section } from './markdown.js';
import { parseYaml } from './yaml.js';

export const BLOCK_IDS = ['discovery', 'backend', 'ui', 'integrations', 'qa', 'management'];
export const CONTINGENCY_BAND = { min: 0.15, max: 0.25 };
export const TOLERANCE = 0.01;

/** @param {string} code @param {string} message */
function problem(code, message) {
  return { code, message };
}

/**
 * @param {{body: string}} doc
 * @param {string} title
 * @returns {Record<string, unknown> | null}
 */
function yamlBlockOf(doc, title) {
  const content = section(String(doc.body ?? ''), title);
  if (content === null) return null;
  const block = fencedBlocks(content)[0];
  return block ? parseYaml(block.content) : null;
}

/**
 * Extracts the two fenced YAML blocks of `estimate.md`.
 * @param {{body: string}} doc
 * @returns {{blocks: null | unknown[], pricing: null | Record<string, unknown>}}
 */
export function readEstimateData(doc) {
  const blocksData = yamlBlockOf(doc, 'Work blocks');
  const pricingData = yamlBlockOf(doc, 'Pricing');
  return { blocks: blocksData?.blocks ?? null, pricing: pricingData?.pricing ?? null };
}

/**
 * Validates the estimate for computation, returning error objects instead of throwing.
 * @param {{blocks: unknown, pricing: unknown, rate: unknown, currency: unknown}} input
 * @returns {{code: string, message: string}[]}
 */
export function validateEstimate({ blocks, pricing, rate, currency }) {
  const errors = [];
  if (typeof rate !== 'number' || !(rate > 0)) {
    errors.push(problem('RATE_MISSING', 'hourly_rate in assumptions.md must be a number greater than zero'));
  }
  if (!Array.isArray(blocks) || blocks.length === 0) {
    errors.push(problem('PRICING_MISSING', 'estimate.md has no work blocks in the "Work blocks" fenced YAML block'));
    return errors;
  }
  const seen = new Set();
  for (const block of blocks) {
    const id = typeof block?.id === 'string' ? block.id : '(missing id)';
    if (seen.has(id)) errors.push(problem('BLOCK_DUPLICATE', `block id "${id}" appears more than once`));
    seen.add(id);
    const numbers = [block?.optimistic, block?.likely, block?.pessimistic];
    if (!numbers.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      errors.push(problem('BLOCK_INVALID', `block "${id}" needs numeric optimistic, likely, and pessimistic hours`));
      continue;
    }
    const [optimistic, likely, pessimistic] = numbers;
    if (!(optimistic <= likely && likely <= pessimistic)) {
      errors.push(problem('BLOCK_ORDER_INVALID', `block "${id}" must satisfy optimistic <= likely <= pessimistic`));
    }
    if (optimistic <= 0) errors.push(problem('BLOCK_INVALID', `block "${id}" must have optimistic hours greater than zero`));
  }
  if (!pricing || typeof pricing !== 'object') {
    errors.push(problem('PRICING_MISSING', 'estimate.md has no pricing block in the "Pricing" fenced YAML block'));
    return errors;
  }
  const { contingency, margin } = /** @type {{contingency?: unknown, margin?: unknown}} */ (pricing);
  if (typeof contingency !== 'number') {
    errors.push(problem('PRICING_MISSING', 'pricing.contingency must be a number (0.15-0.25)'));
  } else {
    const outside = contingency < CONTINGENCY_BAND.min || contingency > CONTINGENCY_BAND.max;
    const reason = typeof pricing.contingency_reason === 'string' ? pricing.contingency_reason.trim() : '';
    if (outside && reason === '') {
      errors.push(problem('CONTINGENCY_OUT_OF_BAND', `pricing.contingency ${contingency} is outside 0.15-0.25 and has no contingency_reason`));
    }
  }
  if (typeof margin !== 'number' || !(margin > 0) || !(margin < 1)) {
    errors.push(problem('MARGIN_MISSING', 'pricing.margin must be a fraction greater than zero and less than one'));
  } else {
    const reason = typeof pricing.margin_reason === 'string' ? pricing.margin_reason.trim() : '';
    if (reason === '') errors.push(problem('MARGIN_MISSING', 'pricing.margin_reason must explain the margin'));
  }
  if (pricing.currency !== undefined && currency !== undefined && pricing.currency !== currency) {
    errors.push(problem('CURRENCY_MISMATCH', `pricing.currency "${pricing.currency}" differs from assumptions.currency "${currency}"`));
  }
  return errors;
}

/**
 * @param {{blocks: {id: string, name: string, optimistic: number, likely: number, pessimistic: number}[], pricing: {contingency: number, margin: number, tco_monthly?: number}, rate: number, currency: string}} input
 */
export function computeEstimate({ blocks, pricing, rate, currency }) {
  const computed = blocks.map((block) => ({
    id: block.id,
    name: block.name ?? block.id,
    optimistic: block.optimistic,
    likely: block.likely,
    pessimistic: block.pessimistic,
    expected: (block.optimistic + 4 * block.likely + block.pessimistic) / 6,
  }));
  const totals = computed.reduce(
    (sum, block) => ({
      optimistic: sum.optimistic + block.optimistic,
      likely: sum.likely + block.likely,
      pessimistic: sum.pessimistic + block.pessimistic,
      expected: sum.expected + block.expected,
    }),
    { optimistic: 0, likely: 0, pessimistic: 0, expected: 0 },
  );
  const factor = (1 + pricing.contingency) * (1 + pricing.margin);
  return {
    currency,
    blocks: computed,
    totals,
    pricing: {
      rate,
      contingency: pricing.contingency,
      margin: pricing.margin,
      tcoMonthly: typeof pricing.tco_monthly === 'number' ? pricing.tco_monthly : null,
      expected: totals.expected * rate * factor,
      low: totals.optimistic * rate * factor,
      high: totals.pessimistic * rate * factor,
    },
  };
}

/** @param {number} value */
function hours1(value) {
  return value.toFixed(1);
}

/** @param {number} value */
export function money(value) {
  return Math.round(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** @param {number} value */
function rate(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/** @param {number} value */
function percent(value) {
  return `${Number((value * 100).toFixed(2))}%`;
}

/**
 * The exact region `calc --write` puts between the markers.
 * @param {ReturnType<typeof computeEstimate>} estimate
 * @returns {string}
 */
export function renderTable(estimate) {
  const lines = ['| Block | O | M | P | Expected |', '|---|---:|---:|---:|---:|'];
  for (const block of estimate.blocks) {
    lines.push(`| ${block.name} | ${block.optimistic} | ${block.likely} | ${block.pessimistic} | ${hours1(block.expected)} |`);
  }
  lines.push(
    `| **Total** | **${estimate.totals.optimistic}** | **${estimate.totals.likely}** | **${estimate.totals.pessimistic}** | **${hours1(estimate.totals.expected)}** |`,
  );
  lines.push('');
  lines.push(
    `Rate: ${estimate.currency} ${rate(estimate.pricing.rate)}/h. Contingency: ${percent(estimate.pricing.contingency)}. Margin: ${percent(estimate.pricing.margin)}.`,
  );
  lines.push(
    `Expected price: ${estimate.currency} ${money(estimate.pricing.expected)}. Range: ${estimate.currency} ${money(estimate.pricing.low)} - ${estimate.currency} ${money(estimate.pricing.high)}.`,
  );
  return lines.join('\n');
}
