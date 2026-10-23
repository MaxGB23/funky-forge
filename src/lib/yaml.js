/**
 * Strict parser for the YAML subset the method uses: flat maps, nested maps, lists of scalars,
 * and lists of maps. Nothing else is accepted, so a malformed artifact fails loudly instead of
 * being silently half-read.
 *
 * Supported: `key: value`, nested blocks by indentation, `- scalar`, `- key: value` items,
 * inline lists `[a, b]`, quoted strings, numbers, booleans, `null`/`~`, full-line comments,
 * and trailing ` # comment` on unquoted values.
 * Not supported (by design): anchors, aliases, multi-line strings, flow maps, tabs.
 */

export class YamlError extends Error {
  constructor(message) {
    super(`YAML_INVALID: ${message}`);
    this.name = 'YamlError';
    this.code = 'YAML_INVALID';
  }
}

const INDENT_UNIT = 2;
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
export function parseYaml(text) {
  const lines = tokenize(text);
  if (lines.length === 0) return {};
  const parsed = parseBlock(lines, 0, lines[0].indent);
  if (parsed.next !== lines.length) throw invalid(lines[parsed.next], 'unexpected content');
  if (Array.isArray(parsed.value)) throw invalid(lines[0], 'top level must be a map');
  return parsed.value;
}

/** @param {string} text */
function tokenize(text) {
  const out = [];
  const rawLines = String(text ?? '').split('\n');
  for (const [index, rawLine] of rawLines.entries()) {
    const line = rawLine.replace(/\r$/, '');
    if (line.trim() === '') continue;
    if (line.trimStart().startsWith('#')) continue;
    if (line.includes('\t')) throw new YamlError(`line ${index + 1}: tabs are not allowed`);
    const indent = line.length - line.trimStart().length;
    if (indent % INDENT_UNIT !== 0) throw new YamlError(`line ${index + 1}: indentation must be a multiple of ${INDENT_UNIT}`);
    out.push({ indent, text: line.slice(indent), line: index + 1 });
  }
  return out;
}

/** @param {{indent: number, text: string, line: number}} line @param {string} why */
function invalid(line, why) {
  return new YamlError(`line ${line?.line ?? '?'}: ${why}`);
}

/** @param {{indent: number, text: string, line: number}[]} lines @param {number} start @param {number} indent */
function parseBlock(lines, start, indent) {
  const first = lines[start];
  if (first.text === '-' || first.text.startsWith('- ')) return parseList(lines, start, indent);
  return parseMap(lines, start, indent);
}

/** @param {{indent: number, text: string, line: number}[]} lines @param {number} start @param {number} indent */
function parseMap(lines, start, indent) {
  /** @type {Record<string, unknown>} */
  const value = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw invalid(line, `unexpected indentation (expected ${indent})`);
    if (line.text === '-' || line.text.startsWith('- ')) throw invalid(line, 'list item where a key was expected');
    const { key, rest } = splitPair(line);
    if (Object.hasOwn(value, key)) throw invalid(line, `duplicate key "${key}"`);
    if (rest === '') {
      const next = lines[i + 1];
      if (next && next.indent > indent) {
        const child = parseBlock(lines, i + 1, next.indent);
        value[key] = child.value;
        i = child.next;
      } else {
        value[key] = null;
        i += 1;
      }
      continue;
    }
    value[key] = parseScalar(stripTrailingComment(rest), line);
    i += 1;
  }
  return { value, next: i };
}

/** @param {{indent: number, text: string, line: number}[]} lines @param {number} start @param {number} indent */
function parseList(lines, start, indent) {
  /** @type {unknown[]} */
  const value = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent !== indent || !(line.text === '-' || line.text.startsWith('- '))) break;
    const rest = line.text === '-' ? '' : line.text.slice(2).trim();
    if (rest === '') {
      const next = lines[i + 1];
      if (!next || next.indent <= indent) throw invalid(line, 'empty list item');
      const child = parseBlock(lines, i + 1, next.indent);
      value.push(child.value);
      i = child.next;
      continue;
    }
    if (looksLikePair(rest)) {
      const itemIndent = indent + INDENT_UNIT;
      const synthetic = [{ indent: itemIndent, text: rest, line: line.line }];
      let j = i + 1;
      while (j < lines.length && lines[j].indent > indent) {
        const follow = lines[j];
        if (follow.indent < itemIndent) throw invalid(follow, `expected indentation ${itemIndent}`);
        synthetic.push(follow);
        j += 1;
      }
      const parsedItem = parseMap(synthetic, 0, itemIndent);
      if (parsedItem.next !== synthetic.length) throw invalid(synthetic[parsedItem.next], 'unexpected content in list item');
      value.push(parsedItem.value);
      i = j;
      continue;
    }
    value.push(parseScalar(stripTrailingComment(rest), line));
    i += 1;
  }
  return { value, next: i };
}

/** @param {string} text */
function looksLikePair(text) {
  const colon = text.indexOf(':');
  if (colon <= 0) return false;
  return KEY_PATTERN.test(text.slice(0, colon));
}

/** @param {{indent: number, text: string, line: number}} line */
function splitPair(line) {
  const colon = line.text.indexOf(':');
  if (colon <= 0) throw invalid(line, 'expected "key: value"');
  const key = line.text.slice(0, colon);
  if (!KEY_PATTERN.test(key)) throw invalid(line, `invalid key "${key}"`);
  return { key, rest: line.text.slice(colon + 1).trim() };
}

/** @param {string} value */
function stripTrailingComment(value) {
  if (value.startsWith('"') || value.startsWith("'")) return value;
  const match = value.match(/\s#/);
  return match ? value.slice(0, match.index).trimEnd() : value;
}

/**
 * @param {string} raw
 * @param {{line: number}} line
 * @returns {unknown}
 */
function parseScalar(raw, line) {
  if (raw === '') return null;
  if (raw.startsWith('"')) {
    if (!raw.endsWith('"') || raw.length < 2) throw invalid(line, 'unterminated double-quoted string');
    try {
      return JSON.parse(raw);
    } catch {
      throw invalid(line, 'invalid double-quoted string');
    }
  }
  if (raw.startsWith("'")) {
    if (!raw.endsWith("'") || raw.length < 2) throw invalid(line, 'unterminated single-quoted string');
    return raw.slice(1, -1).replaceAll("''", "'");
  }
  if (raw.startsWith('[')) {
    if (!raw.endsWith(']')) throw invalid(line, 'unterminated inline list');
    const inner = raw.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTopLevel(inner, line).map((part) => parseScalar(part.trim(), line));
  }
  if (raw.startsWith('{')) throw invalid(line, 'flow maps are not supported');
  if (raw === 'null' || raw === '~') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

/** @param {string} inner @param {{line: number}} line */
function splitTopLevel(inner, line) {
  const parts = [];
  let current = '';
  let quote = null;
  for (const char of inner) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ',') {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (quote) throw invalid(line, 'unterminated quoted item in inline list');
  parts.push(current);
  return parts;
}
