/**
 * Markdown helpers the method needs: headings (outside fences), sections, fenced blocks, list
 * items, table rows, and the placeholder/comment scans the gates rely on.
 */

const FENCE = /^(`{3,}|~{3,})(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const PLACEHOLDERS = ['TBD', 'TODO', 'FIXME', '[fill]'];

/**
 * Walks the document, marking which lines are inside a fenced block.
 * @param {string} body
 * @returns {{lines: string[], inFence: boolean[]}}
 */
function scanFences(body) {
  const lines = String(body ?? '').replace(/\r\n/g, '\n').split('\n');
  const inFence = new Array(lines.length).fill(false);
  let open = null;
  for (const [index, line] of lines.entries()) {
    const match = line.trimStart().match(FENCE);
    if (open) {
      inFence[index] = true;
      if (match && match[1][0] === open.char && match[1].length >= open.length && match[2].trim() === '') open = null;
      continue;
    }
    if (match) {
      open = { char: match[1][0], length: match[1].length };
      inFence[index] = true;
    }
  }
  return { lines, inFence };
}

/**
 * @param {string} body
 * @returns {{level: number, title: string, startLine: number, endLine: number, content: string}[]}
 */
export function sections(body) {
  const { lines, inFence } = scanFences(body);
  const headings = [];
  for (const [index, line] of lines.entries()) {
    if (inFence[index]) continue;
    const match = line.match(HEADING);
    if (!match) continue;
    headings.push({ level: match[1].length, title: match[2].trim(), startLine: index });
  }
  return headings.map((heading, position) => {
    const next = headings.slice(position + 1).find((candidate) => candidate.level <= heading.level);
    const endLine = next ? next.startLine : lines.length;
    const content = lines
      .slice(heading.startLine + 1, endLine)
      .join('\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '');
    return { ...heading, endLine, content };
  });
}

/**
 * @param {string} body
 * @param {string} title
 * @returns {string | null}
 */
export function section(body, title) {
  const found = sections(body).find((entry) => entry.title === title);
  return found ? found.content : null;
}

/**
 * @param {string} body
 * @returns {{lang: string, content: string, startLine: number, endLine: number}[]}
 */
export function fencedBlocks(body) {
  const { lines, inFence } = scanFences(body);
  const blocks = [];
  let current = null;
  for (const [index, line] of lines.entries()) {
    if (!inFence[index]) continue;
    if (!current) {
      const match = line.trimStart().match(FENCE);
      current = { lang: match ? match[2].trim() : '', lines: [], startLine: index };
      continue;
    }
    const match = line.trimStart().match(FENCE);
    if (match && match[2].trim() === '' && current && line.trimStart().startsWith(match[1])) {
      blocks.push({ ...current, content: current.lines.join('\n'), endLine: index });
      current = null;
      continue;
    }
    current.lines.push(line);
  }
  return blocks;
}

/**
 * Top-level `- ` items of one section, ignoring nested items and fences.
 * @param {string} body
 * @param {string} title
 * @returns {string[]}
 */
export function listItems(body, title) {
  const content = section(body, title);
  if (content === null) return [];
  const { lines, inFence } = scanFences(content);
  return lines
    .filter((line, index) => !inFence[index] && /^-\s+/.test(line))
    .map((line) => line.replace(/^-\s+/, '').trim());
}

/**
 * Markdown table rows as cell arrays, without the separator row.
 * @param {string} content
 * @returns {string[][]}
 */
export function tableRows(content) {
  const rows = [];
  for (const line of String(content ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
    if (cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    rows.push(cells);
  }
  return rows;
}

/**
 * Text with fenced blocks and HTML comments removed, for content scans.
 * @param {string} body
 * @returns {string}
 */
function scannableText(body) {
  const { lines, inFence } = scanFences(body);
  const kept = lines.filter((line, index) => !inFence[index]).join('\n');
  return kept.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Placeholder tokens present outside fences and comments.
 * @param {string} body
 * @returns {string[]}
 */
export function placeholderTokens(body) {
  const text = scannableText(body);
  return PLACEHOLDERS.filter((token) => text.includes(token));
}

/**
 * @param {string} body
 * @returns {number}
 */
export function htmlCommentCount(body) {
  const { lines, inFence } = scanFences(body);
  const text = lines.filter((line, index) => !inFence[index]).join('\n');
  return (text.match(/<!--/g) ?? []).length;
}
