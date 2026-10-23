/**
 * Cross-artifact rules: the deterministic half of the review. Each rule only uses structures the
 * method already requires (coverage table, components list, generated table, proposal figures), so
 * a project that follows the templates cannot fail by authoring style.
 */

import { computeEstimate, money, readEstimateData, renderTable, validateEstimate } from './estimate.js';
import { listItems, section, sections, tableRows } from './markdown.js';

const COMPONENT_MARKUP = /^(?:\*\*(.+?)\*\*|`([^`]+)`)/;
const OPTIONAL_HEADING = /optional|opcional|add-on|complemento/i;
const REJECTED_ITEM = /^[-*]\s+(.+?)\s+-\s+rejected because/i;

/** @param {string} body @param {RegExp} pattern */
function findSection(body, pattern) {
  return sections(body).find((entry) => pattern.test(entry.title)) ?? null;
}

/**
 * Names bolded or backticked at the start of a components list item; plain prose bullets are
 * cross-cutting notes, not components.
 * @param {string} designBody
 * @returns {string[]}
 */
export function componentNames(designBody) {
  const names = [];
  for (const item of listItems(designBody, 'Components and responsibilities')) {
    const match = item.match(COMPONENT_MARKUP);
    if (match) names.push((match[1] ?? match[2]).trim());
  }
  return names;
}

/**
 * @param {string} designBody
 * @returns {{components: string[], coverage: {row: string[], components: string[]}[]}}
 */
export function coverageTable(designBody) {
  const found = findSection(designBody, /must-ha(?:ve|ve)\b.*(?:map|coverage)|cobertura/i);
  if (!found) return { components: componentNames(designBody), coverage: [] };
  const rows = tableRows(found.content);
  if (rows.length < 2) return { components: componentNames(designBody), coverage: [] };
  const header = rows[0].map((cell) => cell.toLowerCase());
  const componentColumn = header.findIndex((cell) => /component/.test(cell) && !/how|satisfies/.test(cell));
  const column = componentColumn === -1 ? header.length - 1 : componentColumn;
  const coverage = rows.slice(1).map((row) => ({
    row,
    components: String(row[column] ?? '')
      .split(',')
      .map((cell) => cell.replace(/[`*]/g, '').trim())
      .filter((cell) => cell !== ''),
  }));
  return { components: componentNames(designBody), coverage };
}

/**
 * @param {{designBody: string}} input
 * @returns {{errors: {code: string, message: string}[], warnings: {code: string, message: string}[]}}
 */
export function designCrossChecks({ designBody }) {
  const errors = [];
  const warnings = [];
  const { components, coverage } = coverageTable(designBody);
  if (components.length === 0) return { errors, warnings };

  const declared = new Set(components.map((name) => name.toLowerCase()));
  const covered = new Set();

  for (const entry of coverage) {
    for (const name of entry.components) {
      covered.add(name.toLowerCase());
      if (!declared.has(name.toLowerCase())) {
        errors.push({ code: 'UNDEFINED_COMPONENT', message: `the coverage table names "${name}", which is not in "Components and responsibilities"` });
      }
    }
  }

  const rejectedSection = section(designBody, 'Rejected alternatives') ?? '';
  const rejected = new Set();
  for (const line of rejectedSection.split('\n')) {
    const match = line.match(REJECTED_ITEM);
    if (match) rejected.add(match[1].replace(/[`*]/g, '').trim().toLowerCase());
  }

  for (const name of components) {
    const key = name.toLowerCase();
    if (covered.has(key) || rejected.has(key)) continue;
    errors.push({ code: 'MISSING_MAPPING', message: `component "${name}" is not in the coverage table and has no rejected-alternative entry` });
  }

  const nfr = findSection(designBody, /^nfr/i);
  const nfrRows = nfr ? Math.max(0, tableRows(nfr.content).length - 1) : 0;
  if (nfrRows < 3) {
    warnings.push({ code: 'NFR_INCOMPLETE', message: `the NFR section needs at least three decisions in its table, found ${nfrRows}` });
  }
  return { errors, warnings };
}

/**
 * Compares the written generated table with a fresh computation.
 * @param {{estimateBody: string, estimate: ReturnType<typeof computeEstimate>}} input
 * @returns {{code: string, message: string}[]}
 */
export function arithmeticChecks({ estimateBody, estimate }) {
  const start = estimateBody.indexOf('<!-- calc:start -->');
  const end = estimateBody.indexOf('<!-- calc:end -->');
  if (start === -1 || end === -1 || end < start) {
    return [{ code: 'ARITHMETIC_MISMATCH', message: 'no generated table between the calc markers; run funky-forge calc --write' }];
  }
  const written = estimateBody.slice(start, end);
  const rows = tableRows(written).filter((row) => row.length >= 5 && !/^\*\*Total\*\*$/i.test(row[0]));
  const errors = [];
  for (const block of estimate.blocks) {
    const row = rows.find((cells) => cells[0].toLowerCase() === block.name.toLowerCase() || cells[0].toLowerCase() === block.id.toLowerCase());
    if (!row) {
      errors.push({ code: 'ARITHMETIC_MISMATCH', message: `the generated table has no row for "${block.name}"` });
      continue;
    }
    const expected = Number(row[4]);
    if (!Number.isFinite(expected) || Math.abs(expected - block.expected) > 0.05) {
      errors.push({ code: 'ARITHMETIC_MISMATCH', message: `"${block.name}" shows ${row[4]} expected hours but the blocks compute ${block.expected.toFixed(1)}` });
    }
  }
  const totalRow = tableRows(written).find((cells) => /\*\*Total\*\*/i.test(cells[0] ?? ''));
  if (!totalRow) {
    errors.push({ code: 'ARITHMETIC_MISMATCH', message: 'the generated table has no total row' });
  } else {
    const total = Number(String(totalRow[4]).replace(/\*/g, ''));
    if (!Number.isFinite(total) || Math.abs(total - estimate.totals.expected) > 0.05) {
      errors.push({ code: 'ARITHMETIC_MISMATCH', message: `the table totals ${totalRow[4]} but the blocks compute ${estimate.totals.expected.toFixed(1)}` });
    }
  }
  const region = written.replace(/\n/g, ' ');
  for (const [label, value] of [['expected price', estimate.pricing.expected], ['range low', estimate.pricing.low], ['range high', estimate.pricing.high]]) {
    if (!region.includes(money(value))) {
      errors.push({ code: 'ARITHMETIC_MISMATCH', message: `the generated table does not state the ${label} ${estimate.currency} ${money(value)}` });
    }
  }
  return errors;
}

/**
 * @param {{estimateDoc: {body: string}, assumptionsData: Record<string, unknown>}} input
 * @returns {{errors: {code: string, message: string}[], warnings: {code: string, message: string}[], estimate: ReturnType<typeof computeEstimate> | null}}
 */
export function estimateCrossChecks({ estimateDoc, assumptionsData }) {
  const errors = [];
  const warnings = [];
  const { blocks, pricing } = readEstimateData(estimateDoc);
  const rate = assumptionsData.hourly_rate;
  const errorsFromSchema = validateEstimate({ blocks, pricing, rate, currency: assumptionsData.currency });
  errors.push(...errorsFromSchema);
  if (errorsFromSchema.length > 0) return { errors, warnings, estimate: null };

  const estimate = computeEstimate({
    blocks: /** @type {{id: string, name: string, optimistic: number, likely: number, pessimistic: number}[]} */ (blocks),
    pricing: /** @type {{contingency: number, margin: number, tco_monthly?: number}} */ (pricing),
    rate: /** @type {number} */ (rate),
    currency: String(assumptionsData.currency ?? 'USD'),
  });

  errors.push(...arithmeticChecks({ estimateBody: estimateDoc.body, estimate }));

  if (typeof pricing.tco_monthly !== 'number' || pricing.tco_monthly < 0 || String(pricing.tco_components ?? '').trim() === '') {
    errors.push({ code: 'TCO_MISSING', message: 'pricing.tco_monthly and pricing.tco_components must state the monthly cost separately from the price' });
  }

  const references = Array.isArray(assumptionsData.market_references) ? assumptionsData.market_references : [];
  if (assumptionsData.hourly_rate_source === 'market-reference' && (references.length < 2 || references.length > 3)) {
    warnings.push({ code: 'MARKET_REFS_MISSING', message: `a researched rate needs two or three dated market references, found ${references.length}` });
  }
  return { errors, warnings, estimate };
}

/** @param {string} text */
function moneyFigures(text) {
  return [...text.matchAll(/\d[\d,]{2,}/g)].map((match) => Number(match[0].replace(/,/g, ''))).filter((value) => Number.isFinite(value) && value >= 100);
}

/**
 * @param {{proposalBody: string, estimate: ReturnType<typeof computeEstimate>}} input
 * @returns {{errors: {code: string, message: string}[]}}
 */
export function proposalCrossChecks({ proposalBody, estimate }) {
  const errors = [];
  const figures = moneyFigures(proposalBody);
  const targets = [estimate.pricing.expected].map((value) => Math.round(value));
  if (targets.length > 0 && !figures.some((figure) => targets.some((target) => Math.abs(figure - target) <= 1))) {
    errors.push({
      code: 'PRICE_MISMATCH',
      message: `the proposal does not state the estimate price ${estimate.currency} ${money(estimate.pricing.expected)}; a different figure is a human decision, not a rounding`,
    });
  }
  return { errors };
}

/**
 * Every design component must be named in the estimate, and a component named only under an
 * optional heading is a pricing decision the human must confirm rather than a detail.
 * @param {{designBody: string, estimateBody: string}} input
 * @returns {{warnings: {code: string, message: string}[]}}
 */
export function componentPricingChecks({ designBody, estimateBody }) {
  const warnings = [];
  const lower = estimateBody.toLowerCase();
  const optionalSections = sections(estimateBody).filter((entry) => OPTIONAL_HEADING.test(entry.title));
  for (const name of componentNames(designBody)) {
    const token = name.toLowerCase();
    const total = lower.split(token).length - 1;
    if (total === 0) {
      warnings.push({ code: 'COMPONENT_NOT_ESTIMATED', message: `design component "${name}" is not named in the estimate; price it or say why not` });
      continue;
    }
    const inOptional = optionalSections.reduce((sum, entry) => sum + (entry.content.toLowerCase().split(token).length - 1), 0);
    if (inOptional > 0 && inOptional === total) {
      warnings.push({ code: 'COMPONENT_ONLY_OPTIONAL', message: `design component "${name}" appears only under an optional heading in the estimate; confirm the base price does not depend on it` });
    }
  }
  return { warnings };
}

export { renderTable };
