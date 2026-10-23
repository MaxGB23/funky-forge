/**
 * Error shape and exit codes. The CLI never prompts and never exits 0 on a failed gate:
 * `0` success, `1` failure, `2` a decision the agent must resolve with the human.
 */

export const EXIT = Object.freeze({ OK: 0, ERROR: 1, NEEDS_DECISION: 2 });

export class CliError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{artifact?: string, phase?: string}} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.artifact = extra.artifact;
    this.phase = extra.phase;
  }

  /** @returns {{code: string, message: string, artifact?: string}} */
  toJSON() {
    return this.artifact ? { code: this.code, message: this.message, artifact: this.artifact } : { code: this.code, message: this.message };
  }
}

/**
 * @param {string} code
 * @param {string} message
 * @param {{artifact?: string, phase?: string}} [extra]
 * @returns {CliError}
 */
export function fail(code, message, extra) {
  return new CliError(code, message, extra);
}

/**
 * @param {{phase: string, bodyHash?: string, errors: CliError[], warnings: CliError[]}} result
 * @returns {string}
 */
export function formatJson(result) {
  return JSON.stringify(
    {
      ok: result.errors.length === 0,
      phase: result.phase,
      bodyHash: result.bodyHash ?? null,
      errors: result.errors.map((error) => error.toJSON()),
      warnings: result.warnings.map((warning) => warning.toJSON()),
    },
    null,
    2,
  );
}

/**
 * @param {{phase: string, bodyHash?: string, errors: CliError[], warnings: CliError[]}} result
 * @returns {string}
 */
export function formatHuman(result) {
  const lines = [`funky-forge check - ${result.phase}`];
  for (const warning of result.warnings) lines.push(`  warning: ${warning.code}: ${warning.message}`);
  for (const error of result.errors) lines.push(`  error: ${error.code}: ${error.message}`);
  lines.push(result.errors.length === 0 ? 'ok' : `${result.errors.length} error(s)`);
  if (result.bodyHash) lines.push(`body hash: ${result.bodyHash}`);
  return lines.join('\n');
}
