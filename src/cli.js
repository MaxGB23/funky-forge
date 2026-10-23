/**
 * Command dispatch. Every command is routed here; the ones whose implementation lands in a later
 * step fail with NOT_IMPLEMENTED instead of pretending to work.
 */

import { install } from './commands/install.js';
import { CliError, EXIT, fail } from './lib/errors.js';

export const USAGE = `funky-forge - plan and quote software projects in four gated phases

Usage:
  funky-forge install [--target <agents|claude>] [--dry-run] [--with-pointer] [--force] [--check] [--json]
  funky-forge init [--language <en|es>] [--proposal-language <en|es>] [--force] [--json]
  funky-forge check <phase> [--json] [--strict]
  funky-forge calc [--write] [--json]

Phases: problem, design, estimate, proposal
Exit codes: 0 ok, 1 failure, 2 a decision that needs the human

Install the method once per project, then follow the funky-forge skill.`;

const COMMANDS = {
  install: {
    flags: { target: 'value', 'dry-run': 'boolean', 'with-pointer': 'boolean', force: 'boolean', check: 'boolean', json: 'boolean', help: 'boolean' },
  },
  init: {
    flags: { language: 'value', 'proposal-language': 'value', force: 'boolean', json: 'boolean', help: 'boolean' },
  },
  check: {
    flags: { json: 'boolean', strict: 'boolean', help: 'boolean' },
  },
  calc: {
    flags: { write: 'boolean', json: 'boolean', help: 'boolean' },
  },
};

/**
 * @param {string[]} argv
 * @returns {{command: string, positionals: string[], flags: Record<string, string | boolean>, spec: {flags: Record<string, string>}}}
 */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const spec = COMMANDS[command];
  if (!spec) throw fail('UNKNOWN_COMMAND', `unknown command: ${command}`);
  const flags = {};
  const positionals = [];
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const [rawName, inlineValue] = token.slice(2).split('=');
    const kind = spec.flags[rawName];
    if (!kind) throw fail('UNKNOWN_FLAG', `unknown flag for ${command}: --${rawName}`);
    if (kind === 'boolean') {
      if (inlineValue !== undefined) throw fail('FLAG_VALUE_UNEXPECTED', `--${rawName} does not take a value`);
      flags[rawName] = true;
      continue;
    }
    const value = inlineValue ?? rest[index + 1];
    if (value === undefined || value.startsWith('--')) throw fail('FLAG_VALUE_MISSING', `--${rawName} needs a value`);
    if (inlineValue === undefined) index += 1;
    flags[rawName] = value;
  }
  return { command, positionals, flags, spec };
}

/**
 * @param {Record<string, string | boolean>} flags
 * @param {string} name
 * @returns {string | undefined}
 */
export function flagValue(flags, name) {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}

/**
 * @param {string} command
 * @param {string[]} positionals
 * @param {Record<string, string | boolean>} flags
 * @param {{stdout: (line: string) => void, stderr: (line: string) => void, cwd: string}} io
 * @returns {number}
 */
function dispatch(command, positionals, flags, io) {
  if (command === 'install') return install({ cwd: io.cwd, flags, stdout: io.stdout, stderr: io.stderr });
  if (command === 'check' && positionals.length === 0) {
    throw fail('PHASE_REQUIRED', 'check needs a phase: problem, design, estimate, or proposal');
  }
  throw fail('NOT_IMPLEMENTED', `${command} is implemented in a later step; the method pack is usable by hand until then`);
}

/**
 * Runs the CLI.
 * @param {string[]} argv
 * @param {{stdout?: (line: string) => void, stderr?: (line: string) => void, cwd?: string}} [io]
 * @returns {number}
 */
export function main(argv, io = {}) {
  const stdout = io.stdout ?? ((line) => process.stdout.write(`${line}\n`));
  const stderr = io.stderr ?? ((line) => process.stderr.write(`${line}\n`));

  if (argv.length === 0) {
    stdout(USAGE);
    return EXIT.OK;
  }
  if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    stdout(USAGE);
    return EXIT.OK;
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    stdout('funky-forge 0.1.0');
    return EXIT.OK;
  }

  try {
    const { command, positionals, flags } = parseArgs(argv);
    if (flags.help) {
      stdout(USAGE);
      return EXIT.OK;
    }
    return dispatch(command, positionals, flags, { stdout, stderr, cwd: io.cwd ?? process.cwd() });
  } catch (error) {
    if (error instanceof CliError) {
      stderr(`${error.code}: ${error.message}`);
      if (error.code === 'UNKNOWN_COMMAND') {
        stderr('');
        stderr(USAGE);
      }
      return error.code === 'TARGET_AMBIGUOUS' ? EXIT.NEEDS_DECISION : EXIT.ERROR;
    }
    stderr(`INTERNAL_ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.ERROR;
  }
}
