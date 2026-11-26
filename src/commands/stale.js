/**
 * `funky-forge stale <phase>`: the command `check` refuses to be. It revokes an approval — `draft`
 * with the three `approved_*` keys cleared — and marks every **approved** dependent `stale`,
 * transitively over the inverted `DEPENDENCIES` map. A dependent that was never approved is left
 * alone: it holds no approval to lose, and marking it `stale` would make `check` refuse a state the
 * artifact never entered.
 *
 * Every target that will be written is read and parsed before the first write, so a malformed
 * dependent aborts with nothing changed. An absent dependent is skipped (there is nothing to mark)
 * and a dependent already `stale` is left alone and not counted as changed. The recovery for a
 * mistaken run is the repository's own history, not an invented rollback.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { DEPENDENCIES, isPhase } from '../lib/artifact.js';
import { EXIT } from '../lib/errors.js';
import { frontmatterBlock, readDocument, writeApprovalKeys } from '../lib/frontmatter.js';
import { artifactPath, PHASES } from '../lib/paths.js';

/** The three keys a revocation clears; the body is never touched. */
const REVOKED = { status: 'draft', approved_by: null, approved_at: null, approved_hash: null };

/**
 * The phases that depend on `phase`, directly or through another phase, in declaration order.
 * @param {string} phase
 * @returns {string[]}
 */
function dependentsOf(phase) {
  const found = [];
  const queue = [phase];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const [candidate, dependencies] of Object.entries(DEPENDENCIES)) {
      if (!dependencies.includes(current) || found.includes(candidate)) continue;
      found.push(candidate);
      queue.push(candidate);
    }
  }
  return found;
}

/**
 * @param {{cwd?: string, phase?: string, flags?: Record<string, string | boolean>, stdout?: (line: string) => void, stderr?: (line: string) => void}} options
 * @returns {number}
 */
export function stale({ cwd = process.cwd(), phase, flags = {}, stdout, stderr } = {}) {
  const out = (line) => (stdout ? stdout(line) : process.stdout.write(`${line}\n`));
  const err = (line) => (stderr ? stderr(line) : process.stderr.write(`${line}\n`));
  const dryRun = Boolean(flags['dry-run']);

  if (!phase) {
    err('PHASE_REQUIRED: stale needs a phase: problem, design, estimate, or proposal');
    return EXIT.ERROR;
  }
  if (!isPhase(phase)) {
    err(`UNKNOWN_PHASE: "${phase}" is not one of ${PHASES.join(', ')}`);
    return EXIT.ERROR;
  }

  const artifact = artifactPath(phase);
  const targets = [phase, ...dependentsOf(phase)];

  // Read and parse every target first: a malformed dependent must abort before the first write.
  const documents = new Map();
  for (const target of targets) {
    const relative = artifactPath(target);
    const path = artifactPath(target, cwd);
    if (!existsSync(path)) {
      if (target === phase) {
        return report({
          flags,
          out,
          err,
          phase,
          artifact,
          dryRun,
          errors: [{ code: 'MISSING_ARTIFACT', message: `${relative} does not exist; there is no approval to revoke`, artifact: relative }],
        });
      }
      continue;
    }
    try {
      const text = readFileSync(path, 'utf8');
      documents.set(target, { text, doc: readDocument(text) });
    } catch (error) {
      const detail = error instanceof Error ? error.message.replace(/^FRONTMATTER_INVALID: /, '') : String(error);
      return report({ flags, out, err, phase, artifact, dryRun, errors: [{ code: 'FRONTMATTER_INVALID', message: `${relative}: ${detail}`, artifact: relative }] });
    }
  }

  const steps = [];
  for (const target of targets) {
    const entry = documents.get(target);
    if (!entry) {
      steps.push({ target, disposition: 'skipped' });
      continue;
    }
    if (target !== phase && entry.doc.data.status !== 'approved') {
      const status = String(entry.doc.data.status ?? 'draft');
      steps.push({ target, disposition: 'unchanged', note: status === 'stale' ? 'already stale' : `not approved: ${status}` });
      continue;
    }
    const next = target === phase ? writeApprovalKeys(entry.text, REVOKED) : writeApprovalKeys(entry.text, { status: 'stale' });
    steps.push({ target, disposition: 'write', status: target === phase ? 'draft' : 'stale', next });
  }

  if (!dryRun) {
    for (const step of steps) {
      if (step.disposition === 'write') writeFileSync(artifactPath(step.target, cwd), step.next, 'utf8');
    }
  }

  return report({ flags, out, err, phase, artifact, dryRun, steps });
}

/**
 * @param {{flags: Record<string, string | boolean>, out: (line: string) => void, err: (line: string) => void, phase: string, artifact: string, dryRun: boolean, steps?: {target: string, disposition: string, status?: string, note?: string, next?: string}[], errors?: {code: string, message: string, artifact?: string}[]}} input
 * @returns {number}
 */
function report({ flags, out, err, phase, artifact, dryRun, steps = [], errors = [] }) {
  const lines = [`funky-forge stale - ${phase}`];
  for (const error of errors) lines.push(`  error: ${error.code}: ${error.message}`);
  if (errors.length > 0) {
    lines.push(`${errors.length} error(s)`);
  } else {
    const verb = { write: dryRun ? 'would write' : 'wrote', skipped: dryRun ? 'would skip' : 'skipped', unchanged: 'unchanged' };
    for (const step of steps) {
    const note = step.disposition === 'write' ? ` (${step.status})` : step.disposition === 'skipped' ? ' (absent)' : ` (${step.note})`;
      lines.push(`  ${verb[step.disposition]}: ${artifactPath(step.target)}${note}`);
    }
    lines.push(dryRun ? 'dry-run' : 'ok');
    const revoked = steps.find((step) => step.disposition === 'write');
    if (dryRun && revoked?.next) lines.push('---', ...frontmatterBlock(revoked.next).split('\n'), '---');
  }

  const collected = (disposition) => steps.filter((step) => step.disposition === disposition).map((step) => artifactPath(step.target));
  const payload =
    errors.length > 0
      ? { ok: false, phase, artifact, dryRun, errors: errors.map(serialize) }
      : {
          ok: true,
          phase,
          artifact,
          dryRun,
          written: collected('write'),
          skipped: collected('skipped'),
          unchanged: collected('unchanged'),
          errors: [],
        };

  if (flags.json) {
    out(JSON.stringify(payload, null, 2));
    for (const line of lines) err(line);
  } else {
    for (const line of lines) out(line);
  }
  return errors.length === 0 ? EXIT.OK : EXIT.ERROR;
}

/** @param {{code: string, message: string, artifact?: string}} error */
function serialize(error) {
  return error.artifact ? { code: error.code, message: error.message, artifact: error.artifact } : { code: error.code, message: error.message };
}
