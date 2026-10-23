/**
 * `funky-forge calc`: recomputes the estimate from blocks and the rate, and optionally writes the
 * generated table between the `calc` markers. The command never edits frontmatter, so writing on
 * an approved estimate changes the body and revokes approval by the hash rule, not by opinion.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { computeEstimate, readEstimateData, renderTable, validateEstimate } from '../lib/estimate.js';
import { readDocument } from '../lib/frontmatter.js';
import { artifactPath, assumptionsPath } from '../lib/paths.js';

export const CALC_START = '<!-- calc:start -->';
export const CALC_END = '<!-- calc:end -->';

/**
 * @param {string} text
 * @param {string} table
 * @returns {string | null} null when the markers are missing or duplicated
 */
export function replaceCalcRegion(text, table) {
  const starts = text.split(CALC_START).length - 1;
  const ends = text.split(CALC_END).length - 1;
  if (starts !== 1 || ends !== 1) return null;
  const startIndex = text.indexOf(CALC_START);
  const endIndex = text.indexOf(CALC_END);
  if (endIndex < startIndex) return null;
  return `${text.slice(0, startIndex + CALC_START.length)}\n${table}\n${text.slice(endIndex)}`;
}

/**
 * @param {{cwd?: string, flags?: Record<string, string | boolean>, stdout?: (line: string) => void, stderr?: (line: string) => void}} options
 * @returns {number}
 */
export function calc({ cwd = process.cwd(), flags = {}, stdout, stderr } = {}) {
  const out = (line) => (stdout ? stdout(line) : process.stdout.write(`${line}\n`));
  const err = (line) => (stderr ? stderr(line) : process.stderr.write(`${line}\n`));
  const estimateFile = artifactPath('estimate', cwd);
  const assumptionsFile = assumptionsPath(cwd);

  if (!existsSync(estimateFile)) {
    const errors = [{ code: 'MISSING_ARTIFACT', message: `${artifactPath('estimate')} does not exist; run funky-forge init first` }];
    return report({ flags, out, err, errors, ok: false });
  }

  const estimateDoc = readDocument(readFileSync(estimateFile, 'utf8'));
  const assumptionsDoc = existsSync(assumptionsFile) ? readDocument(readFileSync(assumptionsFile, 'utf8')) : { data: {} };
  const { blocks, pricing } = readEstimateData(estimateDoc);
  const rate = assumptionsDoc.data.hourly_rate;
  const currency = typeof pricing?.currency === 'string' ? pricing.currency : assumptionsDoc.data.currency ?? 'USD';

  const errors = validateEstimate({ blocks, pricing, rate, currency: assumptionsDoc.data.currency });
  if (errors.length > 0) return report({ flags, out, err, errors, ok: false });

  const estimate = computeEstimate({
    blocks: /** @type {{id: string, name: string, optimistic: number, likely: number, pessimistic: number}[]} */ (blocks),
    pricing: /** @type {{contingency: number, margin: number, tco_monthly?: number}} */ (pricing),
    rate: /** @type {number} */ (rate),
    currency,
  });
  const table = renderTable(estimate);

  if (flags.write) {
    const replaced = replaceCalcRegion(readFileSync(estimateFile, 'utf8'), table);
    if (replaced === null) {
      const markerErrors = [
        { code: 'CALC_MARKERS_MISSING', message: `${artifactPath('estimate')} needs exactly one ${CALC_START} and one ${CALC_END} pair` },
      ];
      return report({ flags, out, err, errors: markerErrors, ok: false });
    }
    writeFileSync(estimateFile, replaced, 'utf8');
    if (estimateDoc.data.status === 'approved') {
      err('APPROVED_CONTENT_CHANGED: the estimate was approved; the body changed, so approval is revoked until it is re-gated');
    }
    if (!flags.json) {
      out(`Updated ${artifactPath('estimate')}:`);
      out(table);
      return 0;
    }
  }

  if (flags.json) {
    out(
      JSON.stringify(
        {
          ok: true,
          currency: estimate.currency,
          blocks: estimate.blocks.map((block) => ({
            id: block.id,
            optimistic: block.optimistic,
            likely: block.likely,
            pessimistic: block.pessimistic,
            expected: Number(block.expected.toFixed(2)),
          })),
          totals: {
            optimistic: estimate.totals.optimistic,
            likely: estimate.totals.likely,
            pessimistic: estimate.totals.pessimistic,
            expected: Number(estimate.totals.expected.toFixed(2)),
          },
          pricing: {
            rate: estimate.pricing.rate,
            contingency: estimate.pricing.contingency,
            margin: estimate.pricing.margin,
            expected: estimate.pricing.expected,
            low: estimate.pricing.low,
            high: estimate.pricing.high,
          },
        },
        null,
        2,
      ),
    );
    return 0;
  }

  out(table);
  return 0;
}

/**
 * @param {{flags: Record<string, string | boolean>, out: (line: string) => void, err: (line: string) => void, errors: {code: string, message: string}[], ok: boolean}} input
 * @returns {number}
 */
function report({ flags, out, err, errors, ok }) {
  if (flags.json) {
    out(JSON.stringify({ ok, errors }, null, 2));
    return 1;
  }
  for (const error of errors) err(`${error.code}: ${error.message}`);
  return 1;
}
