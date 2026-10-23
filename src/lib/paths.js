/**
 * The one place that knows where artifacts live. Paths are always POSIX-style so messages,
 * snapshots, and tests read the same on every platform; Node accepts them on Windows too.
 */

export const PHASES = ['problem', 'design', 'estimate', 'proposal'];
export const ARTIFACTS_DIR = '.funky-forge';

const ARTIFACT_FILE = {
  problem: 'brief.md',
  design: 'design.md',
  estimate: 'estimate.md',
  proposal: 'proposal.md',
};

const GATE_NUMBER = { problem: 1, design: 2, estimate: 3, proposal: 4 };

/** @param {string} phase */
function assertPhase(phase) {
  if (!PHASES.includes(phase)) throw new Error(`UNKNOWN_PHASE: "${phase}" is not one of ${PHASES.join(', ')}`);
}

/** @param {...string} parts */
function joinPosix(...parts) {
  return parts
    .filter((part) => part !== '' && part !== undefined && part !== null)
    .map((part, index) => (index === 0 ? String(part).replace(/\/+$/, '') : String(part).replace(/^\/+|\/+$/g, '')))
    .filter((part) => part !== '')
    .join('/');
}

/**
 * @param {string} phase
 * @param {string} [root]
 * @returns {string}
 */
export function artifactPath(phase, root = '') {
  assertPhase(phase);
  return joinPosix(root, ARTIFACTS_DIR, ARTIFACT_FILE[phase]);
}

/**
 * @param {string} phase
 * @returns {string}
 */
export function gateRelativePath(phase) {
  assertPhase(phase);
  return `gates/${GATE_NUMBER[phase]}-${phase}.md`;
}

/**
 * @param {string} phase
 * @param {string} [root]
 * @returns {string}
 */
export function gatePath(phase, root = '') {
  assertPhase(phase);
  return joinPosix(root, ARTIFACTS_DIR, gateRelativePath(phase));
}

/**
 * @param {string} file
 * @returns {string | null}
 */
export function phaseOfArtifact(file) {
  const name = String(file ?? '').split(/[\\/]/).pop();
  const entry = Object.entries(ARTIFACT_FILE).find(([, candidate]) => candidate === name);
  return entry ? entry[0] : null;
}

/**
 * @param {string} phase
 * @returns {number}
 */
export function phaseNumber(phase) {
  assertPhase(phase);
  return GATE_NUMBER[phase];
}
