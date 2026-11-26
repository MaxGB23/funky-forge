/**
 * `funky-forge check <phase>`: read-only validation. It never writes, never fixes, and always
 * returns the body hash so approval copies a computed value instead of a hand-made one.
 *
 * The rules live in `src/lib/evaluate.js`, shared with `approve`; this file renders them and
 * decides the exit code, and `--strict` — which promotes warnings for this command only — stays
 * here because it is a presentation choice, not a rule.
 */

import { evaluateArtifact } from '../lib/evaluate.js';
import { isPhase } from '../lib/artifact.js';
import { PHASES } from '../lib/paths.js';
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

  const { hash, errors, warnings } = evaluateArtifact({ cwd, phase });

  if (flags.strict && warnings.length > 0) {
    errors.push(...warnings.splice(0, warnings.length));
  }

  return finish({ flags, phase, hash, errors, warnings, out });
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
