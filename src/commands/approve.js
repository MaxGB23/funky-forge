/**
 * `funky-forge approve <phase>`: the write half of the gate. It runs the evaluation `check` renders
 * and refuses on everything it reports, except the two states this command exists to clear — an
 * approval whose hash no longer matches, and a staleness that kept its content. On success it
 * writes `status: approved`, `approved_by`, `approved_at` and `approved_hash`, then re-reads the
 * file and re-verifies the hash instead of assuming the write landed.
 *
 * Strictness stays in `check`: `--strict` is a presentation choice, so a warning never blocks here.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { isPhase } from '../lib/artifact.js';
import { EXIT } from '../lib/errors.js';
import { evaluateArtifact } from '../lib/evaluate.js';
import { bodyHash, frontmatterBlock, readDocument, writeApprovalKeys } from '../lib/frontmatter.js';
import { artifactPath, PHASES } from '../lib/paths.js';

/** The two states an approval clears: re-approving is their cure, so they cannot block it. */
const CLEARED_BY_APPROVAL = new Set(['APPROVED_CONTENT_CHANGED', 'STALE_ARTIFACT']);

/**
 * @param {{cwd?: string, phase?: string, flags?: Record<string, string | boolean>, stdout?: (line: string) => void, stderr?: (line: string) => void, now?: () => Date}} options
 * @returns {number}
 */
export function approve({ cwd = process.cwd(), phase, flags = {}, stdout, stderr, now = () => new Date() } = {}) {
  const out = (line) => (stdout ? stdout(line) : process.stdout.write(`${line}\n`));
  const err = (line) => (stderr ? stderr(line) : process.stderr.write(`${line}\n`));

  if (!phase) {
    err('PHASE_REQUIRED: approve needs a phase: problem, design, estimate, or proposal');
    return EXIT.ERROR;
  }
  if (!isPhase(phase)) {
    err(`UNKNOWN_PHASE: "${phase}" is not one of ${PHASES.join(', ')}`);
    return EXIT.ERROR;
  }

  const artifact = artifactPath(phase);
  const path = artifactPath(phase, cwd);
  const { hash, errors, warnings } = evaluateArtifact({ cwd, phase });

  const blocking = errors.filter((error) => !CLEARED_BY_APPROVAL.has(error.code));
  if (blocking.length > 0) {
    const codes = [...new Set(blocking.map((error) => error.code))];
    return report({
      flags,
      out,
      err,
      phase,
      artifact,
      dryRun: Boolean(flags['dry-run']),
      warnings,
      errors: [{ code: 'APPROVAL_GATE_FAILED', message: `the artifact did not pass the gate: ${codes.join(', ')}`, artifact, codes }],
      notices: blocking.map((error) => `  ${error.code}: ${error.message}`),
      count: blocking.length,
    });
  }

  const text = readFileSync(path, 'utf8');
  const doc = readDocument(text);
  const status = String(doc.data.status);
  const approvedAt = new Date(now()).toISOString().slice(0, 10);
  const dryRun = Boolean(flags['dry-run']);

  if (status === 'rejected') {
    return report({
      flags,
      out,
      err,
      phase,
      artifact,
      dryRun,
      errors: [{ code: 'STATUS_NOT_APPROVABLE', message: `${artifact} is "rejected"; only a rewritten artifact can be approved`, artifact }],
    });
  }

  /** The stored approval already covers the live body, so the only thing left to write is a date. */
  const reDate = status === 'approved' && doc.data.approved_hash === hash;
  if (reDate && !flags.force) {
    return report({
      flags,
      out,
      err,
      phase,
      artifact,
      dryRun,
      errors: [
        {
          code: 'ALREADY_APPROVED',
          message: `${artifact} is already approved by ${JSON.stringify(doc.data.approved_by ?? null)} on ${JSON.stringify(doc.data.approved_at ?? null)} for the same body hash; re-run with --force to re-date it`,
          artifact,
        },
      ],
    });
  }

  const by = typeof flags.by === 'string' ? flags.by.trim() : '';
  if (!reDate && by === '') {
    return report({
      flags,
      out,
      err,
      phase,
      artifact,
      dryRun,
      errors: [{ code: 'FLAG_VALUE_MISSING', message: 'approve writes approved_by, so it needs --by <name>: the human who approved this phase' }],
    });
  }

  const next = reDate ? writeApprovalKeys(text, { approved_at: approvedAt }) : writeApprovalKeys(text, { status: 'approved', approved_by: by, approved_at: approvedAt, approved_hash: hash });
  const values = { approvedBy: reDate ? doc.data.approved_by : by, approvedAt, approvedHash: hash };

  if (dryRun) {
    return report({ flags, out, err, phase, artifact, dryRun, warnings, hash, values, block: frontmatterBlock(next) });
  }

  writeFileSync(path, next, 'utf8');
  const unverified = verifyWrite({ path, artifact, hash });
  if (unverified) return report({ flags, out, err, phase, artifact, dryRun, errors: [unverified] });

  return report({ flags, out, err, phase, artifact, dryRun, warnings, hash, values, action: reDate ? 're-dated' : 'wrote' });
}

/**
 * Reads back what was written and confirms the body still hashes to the value just stored. A write
 * that does not verify fails the command instead of reporting an approval that `check` would reject.
 * @param {{path: string, artifact: string, hash: string}} input
 * @returns {{code: string, message: string, artifact: string} | null}
 */
function verifyWrite({ path, artifact, hash }) {
  let written;
  try {
    written = readDocument(readFileSync(path, 'utf8'));
  } catch (error) {
    return {
      code: 'FRONTMATTER_INVALID',
      message: `${artifact}: the file could not be re-read after the write: ${error instanceof Error ? error.message : String(error)}`,
      artifact,
    };
  }
  const actual = bodyHash(written);
  if (actual !== hash || written.data.approved_hash !== hash || written.data.status !== 'approved') {
    return {
      code: 'APPROVED_CONTENT_CHANGED',
      message: `${artifact}: the write did not verify: approved_hash must be ${hash}, the body read back hashes to ${actual}`,
      artifact,
    };
  }
  return null;
}

/**
 * The verdict on stdout and the details on stderr when `--json` owns stdout, so one object is the
 * machine contract and a human still sees what happened.
 * @param {{flags: Record<string, string | boolean>, out: (line: string) => void, err: (line: string) => void, phase: string, artifact: string, dryRun: boolean, errors?: {code: string, message: string, artifact?: string, codes?: string[]}[], warnings?: {code: string, message: string, artifact?: string}[], notices?: string[], count?: number, hash?: string, values?: {approvedBy: string, approvedAt: string, approvedHash: string}, action?: string, block?: string | null}} input
 * @returns {number}
 */
function report({ flags, out, err, phase, artifact, dryRun, errors = [], warnings = [], notices = [], count, hash, values, action, block }) {
  const lines = [`funky-forge approve - ${phase}`];
  for (const warning of warnings) lines.push(`  warning: ${warning.code}: ${warning.message}`);
  for (const error of errors) lines.push(`  error: ${error.code}: ${error.message}`);
  if (errors.length > 0) {
    lines.push(`${count ?? errors.length} error(s)`);
  } else {
    lines.push(`  approved_by: ${values?.approvedBy}`, `  approved_at: ${values?.approvedAt}`, `  approved_hash: ${values?.approvedHash}`);
    lines.push(dryRun ? 'dry-run' : 'ok');
    if (!dryRun && action) lines.push(`${action}: ${artifact}`);
    if (hash) lines.push(`body hash: ${hash}`);
    if (dryRun && block) lines.push('---', ...block.split('\n').map((line) => line.replace(/\r$/, '')), '---');
  }

  const payload =
    errors.length > 0
      ? { ok: false, phase, artifact, dryRun, errors: errors.map(serialize), warnings: warnings.map(serialize) }
      : {
          ok: true,
          phase,
          artifact,
          dryRun,
          status: 'approved',
          approvedBy: values?.approvedBy,
          approvedAt: values?.approvedAt,
          approvedHash: values?.approvedHash,
          bodyHash: hash,
          errors: [],
          warnings: warnings.map(serialize),
        };

  if (flags.json) {
    out(JSON.stringify(payload, null, 2));
    for (const line of [...lines, ...notices]) err(line);
  } else {
    for (const line of lines) out(line);
    for (const notice of notices) err(notice);
  }
  return errors.length === 0 ? EXIT.OK : EXIT.ERROR;
}

/** @param {{code: string, message: string, artifact?: string, codes?: string[]}} error */
function serialize(error) {
  const payload = { code: error.code, message: error.message };
  if (error.artifact) payload.artifact = error.artifact;
  if (error.codes) payload.codes = error.codes;
  return payload;
}
