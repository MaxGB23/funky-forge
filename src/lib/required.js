/**
 * Required body sections per phase. A section is only present when its content is non-empty after
 * trimming and no placeholder token survives inside it, so a heading alone never passes the gate.
 * The proposal has no fixed list: its headings follow proposal_language.
 */

import { placeholderTokens, sections } from './markdown.js';

/** @param {string} name */
function exactTitle(name) {
  return (title) => title.trim().toLowerCase() === name.toLowerCase();
}

const MUST_HAVE_COVERAGE = /must[- ]haves?\b.*(map|coverage)/i;
const OPEN_DECISIONS = /^open\b.*\bdecisions?\b/i;

/**
 * @typedef {{name: string, match: (title: string) => boolean}} RequiredSection
 */

/** @type {Record<string, RequiredSection[]>} */
export const REQUIRED_SECTIONS = {
  problem: [
    'One-line summary',
    'Problem today',
    'Users and volume',
    'Core flow',
    'Must-haves',
    'Out of scope',
    'Success metric',
    'Deadline and constraints',
    'Current cost of the problem',
  ].map((name) => ({ name, match: exactTitle(name) })),
  design: [
    ...['Architecture at a glance', 'Components and responsibilities', 'Data model and retention', 'Auth and permissions', 'Integrations', 'NFR decisions', 'Risks and mitigations', 'Rejected alternatives', 'Stack decision'].map(
      (name) => ({ name, match: exactTitle(name) }),
    ),
    // The mapping heading is authored freely, so it is matched by shape, not by exact title.
    { name: 'Must-have coverage', match: (title) => MUST_HAVE_COVERAGE.test(title) },
    // "Open decisions" and "Open client decisions" are the same section.
    { name: 'Open decisions', match: (title) => OPEN_DECISIONS.test(title) },
  ],
  estimate: ['Work blocks', 'Pricing'].map((name) => ({ name, match: exactTitle(name) })),
  proposal: [],
};

/**
 * @param {{phase: string, body: string, file: string}} input
 * @returns {{code: string, message: string, artifact: string}[]}
 */
export function requiredSectionChecks({ phase, body, file }) {
  const errors = [];
  const headings = sections(body);
  for (const requirement of REQUIRED_SECTIONS[phase] ?? []) {
    const found = headings.find((entry) => requirement.match(entry.title));
    if (!found) {
      errors.push({ code: 'MISSING_FIELD', message: `${file}: the required section "${requirement.name}" is missing`, artifact: file });
      continue;
    }
    if (found.content.trim() === '') {
      errors.push({ code: 'MISSING_FIELD', message: `${file}: the required section "${requirement.name}" is empty`, artifact: file });
      continue;
    }
    const placeholders = placeholderTokens(found.content);
    if (placeholders.length > 0) {
      errors.push({
        code: 'MISSING_FIELD',
        message: `${file}: the required section "${requirement.name}" still contains ${placeholders.join(', ')}`,
        artifact: file,
      });
    }
  }
  return errors;
}
