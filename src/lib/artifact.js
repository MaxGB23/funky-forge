/**
 * Frontmatter and approval rules for one artifact. Shared by `check` so the shape is validated in
 * exactly one place, and reported with stable codes.
 */

import { PHASES } from './paths.js';

export const STATUSES = ['draft', 'in_review', 'approved', 'stale', 'rejected'];
export const METHOD_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const APPROVED_HASH = /^sha256:[0-9a-f]{64}$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DEPENDENCIES = {
  problem: [],
  design: ['problem'],
  estimate: ['problem', 'design'],
  proposal: ['problem', 'design', 'estimate'],
};

/** @param {string} code @param {string} message @param {string} [artifact] */
export function issue(code, message, artifact) {
  return artifact ? { code, message, artifact } : { code, message };
}

/**
 * @param {Record<string, unknown>} data
 * @param {string} phase
 * @param {string} file
 * @returns {{code: string, message: string, artifact: string}[]}
 */
export function validateFrontmatter(data, phase, file) {
  const errors = [];
  const add = (code, message) => errors.push(issue(code, message, file));

  if (data.schema !== SCHEMA_VERSION) add('SCHEMA_UNSUPPORTED', `schema must be ${SCHEMA_VERSION}, found ${JSON.stringify(data.schema ?? null)}`);
  if (data.method_version !== METHOD_VERSION) add('METHOD_VERSION_UNSUPPORTED', `method_version must be ${METHOD_VERSION}`);
  if (data.phase !== phase) add('PHASE_MISMATCH', `phase is ${JSON.stringify(data.phase ?? null)} but the file is ${artifactName(phase)}`);
  if (!STATUSES.includes(String(data.status))) add('STATUS_INVALID', `status must be one of ${STATUSES.join(', ')}`);

  const expected = DEPENDENCIES[phase];
  const declared = Array.isArray(data.depends_on) ? data.depends_on : null;
  if (declared === null || declared.length !== expected.length || declared.some((value, index) => value !== expected[index])) {
    add('DEPENDS_ON_INVALID', `depends_on must be [${expected.join(', ')}]`);
  }

  if (data.status === 'approved') {
    if (typeof data.approved_by !== 'string' || data.approved_by.trim() === '') add('MISSING_FIELD', 'approved_by is required when status is approved');
    if (typeof data.approved_at !== 'string' || !DATE.test(data.approved_at)) add('MISSING_FIELD', 'approved_at must be a YYYY-MM-DD date when status is approved');
    if (typeof data.approved_hash !== 'string' || !APPROVED_HASH.test(data.approved_hash)) {
      add('MISSING_FIELD', 'approved_hash must be sha256:<64 lowercase hex> when status is approved');
    }
  }
  return errors;
}

/** @param {string} phase */
function artifactName(phase) {
  return { problem: 'brief.md', design: 'design.md', estimate: 'estimate.md', proposal: 'proposal.md' }[phase];
}

/**
 * @param {Record<string, unknown>} data
 * @param {string} bodyHash
 * @param {string} file
 * @returns {{code: string, message: string, artifact: string}[]}
 */
export function validateApproval(data, bodyHash, file) {
  if (data.status !== 'approved') return [];
  if (data.approved_hash === bodyHash) return [];
  return [
    issue(
      'APPROVED_CONTENT_CHANGED',
      `the body no longer matches approved_hash (now ${bodyHash}); re-gate and approve again`,
      file,
    ),
  ];
}

/**
 * @param {string} phase
 * @returns {boolean}
 */
export function isPhase(phase) {
  return PHASES.includes(phase);
}
