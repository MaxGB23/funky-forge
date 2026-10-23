/**
 * Command dispatch. The help text is derived from the same table that parses arguments, so a new
 * flag cannot appear in the parser and stay missing from `--help`.
 */

import { calc } from './commands/calc.js';
import { check } from './commands/check.js';
import { init } from './commands/init.js';
import { install } from './commands/install.js';
import { CliError, EXIT, fail } from './lib/errors.js';

const COMMANDS = {
  install: {
    summary: 'copy the method pack into a harness skill directory',
    positionals: '',
    flags: { target: 'value', 'dry-run': 'boolean', 'with-pointer': 'boolean', force: 'boolean', check: 'boolean', json: 'boolean', help: 'boolean' },
  },
  init: {
    summary: 'create .funky-forge/ from the shipped templates',
    positionals: '',
    flags: { language: 'value', 'proposal-language': 'value', force: 'boolean', json: 'boolean', help: 'boolean' },
  },
  check: {
    summary: 'validate one phase: schema, dependencies, hashes, arithmetic, gates; read-only',
    positionals: '<phase>',
    flags: { json: 'boolean', strict: 'boolean', help: 'boolean' },
  },
  calc: {
    summary: 'recompute hours and price from the blocks in estimate.md',
    positionals: '',
    flags: { write: 'boolean', json: 'boolean', help: 'boolean' },
  },
};

/** Value placeholders and one-line descriptions, keyed by the flag name used in COMMANDS. */
const FLAG_SPECS = {
  target: { value: '<agents|claude>', summary: 'the harness target; detected when omitted' },
  'dry-run': { summary: 'print the plan and write nothing' },
  'with-pointer': { summary: 'append one marked line to AGENTS.md or CLAUDE.md' },
  force: { summary: 'overwrite files that differ from the shipped pack' },
  check: { summary: 'report divergence and write nothing' },
  json: { summary: 'one JSON object on stdout' },
  language: { value: '<en|es>', summary: 'language for internal artifacts' },
  'proposal-language': { value: '<en|es>', summary: 'language for the client proposal only; defaults to the artifact language' },
  strict: { summary: 'treat warnings as errors' },
  write: { summary: 'rewrite the table between the calc markers' },
  help: { summary: 'show this help' },
};

/**
 * The one true synopsis for a command, generated from its declared flags.
 * @param {string} command
 * @returns {string}
 */
export function synopsis(command) {
  const spec = COMMANDS[command];
  const parts = [`funky-forge ${command}`];
  if (spec.positionals) parts.push(spec.positionals);
  for (const [name, kind] of Object.entries(spec.flags)) {
    if (name === 'help') continue;
    if (kind === 'value') {
      const placeholder = FLAG_SPECS[name]?.value ?? '<value>';
      parts.push(`[--${name} ${placeholder}]`);
    } else {
      parts.push(`[--${name}]`);
    }
  }
  return parts.join(' ');
}

const EXIT_LINE = 'Exit codes: 0 ok, 1 failure, 2 a decision that needs the human';

export const USAGE = [
  'funky-forge - plan and quote software projects in four gated phases',
  '',
  'Usage:',
  ...Object.keys(COMMANDS).map((command) => `  ${synopsis(command)}`),
  '',
  'Phases: problem, design, estimate, proposal',
  EXIT_LINE,
  '',
  'Install the method once per project, then follow the funky-forge skill.',
].join('\n');

/**
 * @param {string} command
 * @returns {string}
 */
export function commandHelp(command) {
  const spec = COMMANDS[command];
  const lines = [`funky-forge ${command} - ${spec.summary}`, '', 'Usage:', `  ${synopsis(command)}`, '', 'Flags:'];
  for (const [name, kind] of Object.entries(spec.flags)) {
    const flagSpec = FLAG_SPECS[name];
    const label = kind === 'value' ? `--${name} ${flagSpec?.value ?? '<value>'}` : `--${name}`;
    lines.push(`  ${label.padEnd(28)} ${flagSpec?.summary ?? ''}`.trimEnd());
  }
  lines.push('', EXIT_LINE);
  return lines.join('\n');
}

/**
 * Structural problems that would let the help text drift from the parser. Empty means consistent.
 * @returns {string[]}
 */
export function helpProblems() {
  const problems = [];
  const usedFlags = new Set();
  for (const [command, spec] of Object.entries(COMMANDS)) {
    if (typeof spec.summary !== 'string' || spec.summary.trim() === '') problems.push(`command ${command} has no summary`);
    if (!Object.hasOwn(spec.flags, 'help')) problems.push(`command ${command} does not declare --help`);
    for (const [name, kind] of Object.entries(spec.flags)) {
      usedFlags.add(name);
      const flagSpec = FLAG_SPECS[name];
      if (!flagSpec) problems.push(`flag --${name} of ${command} has no FLAG_SPECS entry`);
      else if (typeof flagSpec.summary !== 'string' || flagSpec.summary.trim() === '') problems.push(`flag --${name} has no summary`);
      else if (kind === 'value' && typeof flagSpec.value !== 'string') problems.push(`value flag --${name} has no placeholder`);
    }
  }
  for (const name of Object.keys(FLAG_SPECS)) {
    if (!usedFlags.has(name)) problems.push(`FLAG_SPECS documents --${name}, which no command declares`);
  }
  for (const [command, spec] of Object.entries(COMMANDS)) {
    if (!USAGE.includes(synopsis(command))) problems.push(`USAGE is missing the synopsis of ${command}`);
    if (!synopsis(command).includes(`funky-forge ${command}`)) problems.push(`synopsis of ${command} is malformed`);
    if (spec.positionals && !synopsis(command).includes(spec.positionals)) problems.push(`synopsis of ${command} omits its positional`);
  }
  return problems;
}

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
    if (token === '-h') {
      flags.help = true;
      continue;
    }
    if (token.startsWith('-') && !token.startsWith('--')) throw fail('UNKNOWN_FLAG', `unknown flag for ${command}: ${token}`);
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
  if (command === 'init') return init({ cwd: io.cwd, flags, stdout: io.stdout, stderr: io.stderr });
  if (command === 'calc') return calc({ cwd: io.cwd, flags, stdout: io.stdout, stderr: io.stderr });
  if (command === 'check') return check({ cwd: io.cwd, phase: positionals[0], flags, stdout: io.stdout, stderr: io.stderr });
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
      stdout(commandHelp(command));
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
