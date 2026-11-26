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
 * The three keys an approval writes, in the order a draft gains them. `status` is the fourth key the
 * writer owns; it is not in this list because a document always declares it.
 */
const APPROVAL_KEYS = ['approved_by', 'approved_at', 'approved_hash'];

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
  const body = normalized.slice(consumed);
  return { frontmatterRaw, body };
}

/**
 * A value safe to write unquoted, so a plain approver name stays readable and everything YAML could
 * misread (`key: value` in a name, a `#`, a bare keyword) is written as a JSON string, which is the
 * one quoted form the parser accepts.
 * @param {string} value
 * @returns {string}
 */
function formatScalar(value) {
  const text = String(value);
  const plain =
    /^[A-Za-z0-9][A-Za-z0-9 ._@'()+&:/-]*$/.test(text) &&
    !text.includes(': ') &&
    !text.includes('#') &&
    !/^(?:null|~|true|false)$/i.test(text);
  return plain ? text : JSON.stringify(text);
}

/**
 * Rewrites the approval keys inside the raw frontmatter block and leaves every other byte alone.
 * There is no serializer, so the block is edited line by line: a key present in `values` keeps the
 * position it already had, a key the values omit keeps its line untouched, a key passed as `null`
 * loses its line, and a missing key with a value is inserted immediately after `status:` — which is
 * why a draft gains `approved_by`, `approved_at`, `approved_hash` in that order.
 * @param {string} text
 * @param {{status?: string, approved_by?: string | null, approved_at?: string | null, approved_hash?: string | null}} values
 * @returns {string}
 */
export function writeApprovalKeys(text, values) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  const lines = source.split('\n');
  const bare = (line) => line.replace(/\r$/, '');
  if (bare(lines[0] ?? '').trimEnd() !== DELIMITER) throw new FrontmatterError('there is no frontmatter block to write');
  const close = lines.findIndex((line, index) => index > 0 && bare(line).trimEnd() === DELIMITER);
  if (close === -1) throw new FrontmatterError('frontmatter block is not closed');

  const cr = source.includes('\r\n') ? '\r' : '';
  const block = lines.slice(1, close);
  const indexOf = (key) => block.findIndex((line) => bare(line).startsWith(`${key}:`));
  const wanted = [
    ['status', values.status],
    ...APPROVAL_KEYS.map((key) => [key, values[key]]),
  ];
  const insert = [];
  for (const [key, value] of wanted) {
    if (value === undefined) continue;
    const index = indexOf(key);
    if (value === null) {
      if (index !== -1) block.splice(index, 1);
      continue;
    }
    const line = `${key}: ${formatScalar(value)}${cr}`;
    if (index !== -1) block[index] = line;
    else if (key === 'status') block.unshift(line);
    else insert.push(line);
  }
  if (insert.length > 0) block.splice(indexOf('status') + 1, 0, ...insert);

  return [...lines.slice(0, 1), ...block, ...lines.slice(close)].join('\n');
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
