/**
 * `funky-forge check <phase>`: read-only validation. It never writes, never fixes, and always
 * returns the body hash so approval copies a computed value instead of a hand-made one.
 */

import { existsSync, readFileSync } from 'node:fs';

import { isPhase, issue, validateApproval, validateFrontmatter } from '../lib/artifact.js';
import { bodyHash, readDocument } from '../lib/frontmatter.js';
import { componentPricingChecks, designCrossChecks, estimateCrossChecks, proposalCrossChecks } from '../lib/crosscheck.js';
import { htmlCommentCount, placeholderTokens } from '../lib/markdown.js';
import { artifactPath, assumptionsPath, gatePath, PHASES } from '../lib/paths.js';
import { EXIT, formatHuman, formatJson } from '../lib/errors.js';

/**
 * @param {{cwd?: string, phase?: string, flags?: Record<string, string | boolean>, stdout?: (line: string) => void, stderr?: (line: string) => void}} options
 * @returns {number}
 */
export function check({ cwd = process.cwd(), phase, flags = {}, stdout, stderr } = {}) {
  const out = (line) => (stdout ? stdout(line) : process.stdout.write(`${line}\n`));
  const err = (line) => (stderr ? stderr(line) : process.stderr.write(`${line}\n`));

  if (!phase) {
    err('PHASE_REQUIRED: check needs a phase: problem, design, estimate, or proposal');
    return EXIT.ERROR;
  }
  if (!isPhase(phase)) {
    err(`UNKNOWN_PHASE: "${phase}" is not one of ${PHASES.join(', ')}`);
    return EXIT.ERROR;
  }

  const file = artifactPath(phase);
  const path = artifactPath(phase, cwd);
  const errors = [];
  const warnings = [];
  let hash = null;

  if (!existsSync(path)) {
    errors.push(issue('MISSING_ARTIFACT', `${file} does not exist; run funky-forge init or write the artifact first`, file));
    return finish({ flags, phase, hash, errors, warnings, out });
  }

  let doc;
  try {
    doc = readDocument(readFileSync(path, 'utf8'));
  } catch (error) {
    errors.push(issue('FRONTMATTER_INVALID', error instanceof Error ? error.message : String(error), file));
    return finish({ flags, phase, hash, errors, warnings, out });
  }

  hash = bodyHash(doc);
  errors.push(...validateFrontmatter(doc.data, phase, file));
  errors.push(...validateApproval(doc.data, hash, file));

  if (doc.data.status === 'stale') {
    errors.push(issue('STALE_ARTIFACT', 'the artifact is stale: a dependency changed after approval; re-review it before advancing', file));
  }

  for (const token of placeholderTokens(doc.body)) {
    errors.push(issue('PLACEHOLDER_FOUND', `placeholder ${token} is still in the body`, file));
  }

  errors.push(...dependencyErrors(cwd, phase));
  errors.push(...crossChecks({ cwd, phase, doc, errors, warnings }));

  if (!existsSync(gatePath(phase, cwd))) {
    errors.push(issue('GATE_REPORT_MISSING', `${gatePath(phase)} does not exist; record the review before advancing`, file));
  }

  const comments = htmlCommentCount(doc.body);
  if (comments > 0) {
    warnings.push(issue('TEMPLATE_COMMENT', `${comments} template comment(s) left in the body; remove them before the gate`, file));
  }

  if (flags.strict && warnings.length > 0) {
    errors.push(...warnings.splice(0, warnings.length));
  }

  return finish({ flags, phase, hash, errors, warnings, out });
}

/**
 * Cross-artifact rules for the phase being checked.
 * @param {{cwd: string, phase: string, doc: {body: string}, errors: {code: string, message: string}[], warnings: {code: string, message: string}[]}} input
 * @returns {{code: string, message: string}[]}
 */
function crossChecks({ cwd, phase, doc, warnings }) {
  if (phase === 'design') {
    const result = designCrossChecks({ designBody: doc.body });
    warnings.push(...(result.warnings ?? []));
    return result.errors;
  }
  if (phase === 'estimate') {
    const assumptions = readOptional(cwd, assumptionsPath(cwd));
    const result = estimateCrossChecks({ estimateDoc: doc, assumptionsData: assumptions?.data ?? {} });
    warnings.push(...(result.warnings ?? []));
    const designDoc = readOptional(cwd, artifactPath('design', cwd));
    if (designDoc) warnings.push(...(componentPricingChecks({ designBody: designDoc.body, estimateBody: doc.body }).warnings ?? []));
    return result.errors;
  }
  if (phase === 'proposal') {
    const assumptions = readOptional(cwd, assumptionsPath(cwd));
    const estimateDoc = readOptional(cwd, artifactPath('estimate', cwd));
    if (!estimateDoc) return [];
    const estimateResult = estimateCrossChecks({ estimateDoc, assumptionsData: assumptions?.data ?? {} });
    if (!estimateResult.estimate) return [];
    const result = proposalCrossChecks({ proposalBody: doc.body, estimate: estimateResult.estimate });
    warnings.push(...(result.warnings ?? []));
    return result.errors;
  }
  return [];
}

/**
 * @param {string} cwd
 * @param {string} path
 * @returns {{data: Record<string, unknown>, body: string} | null}
 */
function readOptional(cwd, path) {
  if (!existsSync(path)) return null;
  try {
    return readDocument(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {string} cwd
 * @param {string} phase
 * @returns {{code: string, message: string, artifact: string}[]}
 */
function dependencyErrors(cwd, phase) {
  const errors = [];
  const dependencies = { problem: [], design: ['problem'], estimate: ['problem', 'design'], proposal: ['problem', 'design', 'estimate'] }[phase] ?? [];
  for (const dependency of dependencies) {
    const file = artifactPath(dependency);
    const path = artifactPath(dependency, cwd);
    if (!existsSync(path)) {
      errors.push(issue('DEPENDENCY_NOT_APPROVED', `${file} does not exist`, file));
      continue;
    }
    let data;
    try {
      data = readDocument(readFileSync(path, 'utf8')).data;
    } catch (error) {
      errors.push(issue('FRONTMATTER_INVALID', `${file}: ${error instanceof Error ? error.message : String(error)}`, file));
      continue;
    }
    if (data.status !== 'approved') {
      errors.push(issue('DEPENDENCY_NOT_APPROVED', `${file} is ${JSON.stringify(data.status ?? null)}; approve it first`, file));
    }
  }
  return errors;
}

/**
 * @param {{flags: Record<string, string | boolean>, phase: string, hash: string | null, errors: {code: string, message: string, artifact?: string}[], warnings: {code: string, message: string, artifact?: string}[], out: (line: string) => void}} input
 * @returns {number}
 */
function finish({ flags, phase, hash, errors, warnings, out }) {
  const result = {
    phase,
    bodyHash: hash ?? undefined,
    errors: errors.map((error) => ({ ...error, toJSON: () => error })),
    warnings: warnings.map((warning) => ({ ...warning, toJSON: () => warning })),
  };
  if (flags.json) {
    const payload = {
      ok: errors.length === 0,
      phase,
      bodyHash: hash,
      errors: errors.map((error) => (error.artifact ? { code: error.code, message: error.message, artifact: error.artifact } : { code: error.code, message: error.message })),
      warnings: warnings.map((warning) => (warning.artifact ? { code: warning.code, message: warning.message, artifact: warning.artifact } : { code: warning.code, message: warning.message })),
    };
    out(JSON.stringify(payload, null, 2));
  } else {
    out(formatHuman(result));
  }
  return errors.length === 0 ? EXIT.OK : EXIT.ERROR;
}
