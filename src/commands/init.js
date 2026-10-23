/**
 * `funky-forge init`: creates the project artifact directory from the shipped templates.
 * Skeletons start as `draft`; nothing outside `.funky-forge/` is written.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SKILL_SOURCE } from './install.js';

export const ARTIFACTS_DIR = '.funky-forge';
export const LANGUAGES = ['en', 'es'];

const TEMPLATES = [
  { file: 'brief.md', keepLanguage: true },
  { file: 'design.md', keepLanguage: true },
  { file: 'estimate.md', keepLanguage: true },
  { file: 'proposal.md', keepLanguage: true },
  { file: 'assumptions.md', keepLanguage: true },
  { file: 'decisions.md', keepLanguage: false },
];

/**
 * @param {string} text
 * @param {{language: string, proposalLanguage: string}} settings
 * @returns {string}
 */
export function applyLanguages(text, { language, proposalLanguage }) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return text;
  const frontmatter = match[1]
    .replace(/^language:.*$/m, `language: ${language}`)
    .replace(/^proposal_language:.*$/m, `proposal_language: ${proposalLanguage}`);
  return `${text.slice(0, match.index)}---\n${frontmatter}\n---\n${text.slice(match.index + match[0].length)}`;
}

/**
 * @param {{cwd?: string, flags?: Record<string, string | boolean>, stdout?: (line: string) => void, stderr?: (line: string) => void}} options
 * @returns {number}
 */
export function init({ cwd = process.cwd(), flags = {}, stdout, stderr } = {}) {
  const out = (line) => (stdout ? stdout(line) : process.stdout.write(`${line}\n`));
  const err = (line) => (stderr ? stderr(line) : process.stderr.write(`${line}\n`));
  const language = typeof flags.language === 'string' ? flags.language : 'en';
  const proposalLanguage = typeof flags['proposal-language'] === 'string' ? flags['proposal-language'] : 'en';

  for (const [flag, value] of [['--language', language], ['--proposal-language', proposalLanguage]]) {
    if (!LANGUAGES.includes(value)) {
      err(`UNKNOWN_LANGUAGE: ${flag} must be one of ${LANGUAGES.join(', ')}, got "${value}"`);
      return 1;
    }
  }

  const directory = join(cwd, ARTIFACTS_DIR);
  if (existsSync(directory) && !flags.force) {
    err(`DIR_EXISTS: ${ARTIFACTS_DIR}/ already exists; re-run with --force to recreate the skeletons`);
    err('Existing artifacts and gate reports were left untouched.');
    return 1;
  }

  mkdirSync(join(directory, 'gates'), { recursive: true });
  const created = [];
  for (const template of TEMPLATES) {
    const destination = join(directory, template.file);
    if (existsSync(destination) && !flags.force) {
      created.push({ file: `${ARTIFACTS_DIR}/${template.file}`, status: 'kept' });
      continue;
    }
    const source = readFileSync(join(SKILL_SOURCE, 'templates', template.file), 'utf8');
    const text = template.keepLanguage ? applyLanguages(source, { language, proposalLanguage }) : source;
    writeFileSync(destination, text, 'utf8');
    created.push({ file: `${ARTIFACTS_DIR}/${template.file}`, status: 'created' });
  }

  if (flags.json) {
    out(JSON.stringify({ ok: true, directory: ARTIFACTS_DIR, language, proposalLanguage, created }, null, 2));
    return 0;
  }

  out(`Initialized ${ARTIFACTS_DIR}/ (language: ${language}, proposal: ${proposalLanguage}):`);
  for (const entry of created) out(`  ${entry.status} ${entry.file}`);
  out('Next: funky-forge check problem, once the brief is written.');
  return 0;
}
