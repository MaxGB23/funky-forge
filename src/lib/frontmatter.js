import { createHash } from 'node:crypto';

import { parseYaml } from './yaml.js';

export class FrontmatterError extends Error {
  constructor(message) {
    super(`FRONTMATTER_INVALID: ${message}`);
    this.name = 'FrontmatterError';
    this.code = 'FRONTMATTER_INVALID';
  }
}

const DELIMITER = '---';

/**
 * Splits an artifact into parsed frontmatter and body.
 * @param {string} text
 * @returns {{data: Record<string, unknown>, body: string, frontmatterRaw: string | null}}
 */
export function readDocument(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  const split = splitFrontmatter(source);
  if (!split) return { data: {}, body: source, frontmatterRaw: null };
  let data;
  try {
    data = parseYaml(split.frontmatterRaw);
  } catch (error) {
    throw new FrontmatterError(error.message);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new FrontmatterError('frontmatter must be a map');
  }
  return { data, body: split.body, frontmatterRaw: split.frontmatterRaw };
}

/**
 * Raw frontmatter block without delimiters, for diagnostics.
 * @param {string} text
 * @returns {string | null}
 */
export function frontmatterBlock(text) {
  const split = splitFrontmatter(String(text ?? '').replace(/^\uFEFF/, ''));
  return split ? split.frontmatterRaw : null;
}

/** @param {string} source */
function splitFrontmatter(source) {
  const normalized = source.replace(/\r\n/g, '\n');
  if (!normalized.startsWith(`${DELIMITER}\n`)) return null;
  const lines = normalized.split('\n');
  const closeIndex = lines.findIndex((line, index) => index > 0 && line.trimEnd() === DELIMITER);
  if (closeIndex === -1) throw new FrontmatterError('frontmatter block is not closed');
  const frontmatterRaw = lines.slice(1, closeIndex).join('\n');
  const consumed = lines.slice(0, closeIndex + 1).join('\n').length + 1;
  const body = source.replace(/\r\n/g, '\n').slice(consumed);
  return { frontmatterRaw, body };
}

/**
 * The normalization defined in the method: LF endings, no trailing whitespace, no outer blank
 * lines, exactly one trailing LF, frontmatter excluded.
 * @param {string} text
 * @returns {string}
 */
export function normalizeBody(text) {
  const split = splitFrontmatter(String(text ?? '').replace(/^\uFEFF/, ''));
  const body = split ? split.body : String(text ?? '');
  const lines = body
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''));
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 0) return '';
  return `${lines.join('\n')}\n`;
}

/**
 * `sha256:<hex>` of the normalized body, the value stored in `approved_hash`.
 * @param {{body: string}} doc
 * @returns {string}
 */
export function bodyHash(doc) {
  const digest = createHash('sha256').update(normalizeBody(doc.body), 'utf8').digest('hex');
  return `sha256:${digest}`;
}
