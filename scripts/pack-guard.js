#!/usr/bin/env node
/**
 * The publish gate: what npm would pack must be the `files` contract, and nothing else.
 *
 * `npm pack --dry-run` is what a human reads before publishing, and reading it is a habit rather than
 * a gate: it is skipped under time pressure and leaves no trace when it is. This runs from
 * `prepublishOnly`, where a failure publishes nothing.
 *
 * Two assertions, because they catch different mistakes. A path that is not in `files` is a leak — a
 * fixture, a `.env`, a scratch note. A `files` entry that packed nothing is a typo or a deleted
 * directory, and it ships a package missing something it promised.
 *
 * `--json` is requested explicitly and the human output is never parsed: a lifecycle script inherits
 * the configuration of the command that invoked it, so `npm stage publish --json` makes `npm_config_json`
 * true for everything it spawns, and `npm pack` then answers with an array instead of a filename.
 *
 * Plain Node ESM, zero dependencies, no network.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** npm always packs these three, whatever `files` says. */
const ALWAYS_PACKED = new Set(['package.json', 'README.md', 'LICENSE']);

/** @param {string} p */
function normalize(p) {
  const slashed = String(p).split('\\').join('/');
  return slashed.startsWith('./') ? slashed.slice(2) : slashed;
}

/**
 * Whether one packed path is covered by the contract, either exactly or by a directory entry.
 *
 * A directory may be written `bin` or `bin/`: the manifest in this repository uses the bare form, and a
 * contract that only understood one of the two would reject every packed file while looking correct.
 * @param {string} path
 * @param {Array<string>} allowed
 */
export function isPermitted(path, allowed) {
  const candidate = normalize(path);
  if (ALWAYS_PACKED.has(candidate)) return true;

  return allowed.some((entry) => {
    const permitted = normalize(entry);
    const bare = permitted.endsWith('/') ? permitted.slice(0, -1) : permitted;
    return candidate === bare || candidate.startsWith(`${bare}/`);
  });
}

/**
 * The leak check: every packed path must be covered by the contract.
 * @param {Array<string>} files the paths npm reported
 * @param {Array<string>} allowed `files` from `package.json`
 * @returns {{ ok: boolean, problems: Array<string> }}
 */
export function checkPackList(files, allowed) {
  const problems = [];
  for (const file of files) {
    if (!isPermitted(file, allowed)) {
      problems.push(`${normalize(file)} must not ship: it is not in the files contract`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * The missing-entry check: an entry that is not a directory must appear, and a directory entry must
 * have packed at least one path. `package.json`, `README.md` and `LICENSE` are exempt because npm adds
 * them whether or not they are listed.
 * @param {Array<string>} files
 * @param {Array<string>} allowed
 * @returns {{ ok: boolean, problems: Array<string> }}
 */
export function checkEntriesPresent(files, allowed) {
  const packed = files.map(normalize);
  const problems = [];

  for (const entry of allowed) {
    const wanted = normalize(entry);
    if (ALWAYS_PACKED.has(wanted)) continue;

    const bare = wanted.endsWith('/') ? wanted.slice(0, -1) : wanted;
    const found = packed.some((path) => path === bare || path.startsWith(`${bare}/`));
    if (!found) problems.push(`${entry} is in the files contract and packed nothing`);
  }

  return { ok: problems.length === 0, problems };
}

/** npm's own CLI entry point, run by this interpreter: a `.cmd` shim is not spawnable without a shell. */
function npmCli() {
  const candidates = [
    process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter((value) => typeof value === 'string' && existsSync(value));

  if (candidates.length === 0) throw new Error('cannot find npm: neither npm_execpath nor the bundled CLI exists');
  return candidates[0];
}

/** @param {string} root @returns {Array<string>} the paths npm would pack */
export function packedFiles(root = ROOT) {
  const stdout = execFileSync(process.execPath, [npmCli(), 'pack', '--dry-run', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('npm pack did not answer with JSON, so the packed set cannot be checked');
  }

  const entry = Array.isArray(parsed) ? parsed[0] : null;
  if (!entry || !Array.isArray(entry.files)) {
    throw new Error('npm pack reported no file list, so the packed set cannot be checked');
  }

  return entry.files.map((file) => normalize(file.path));
}

/**
 * @param {{ root?: string, pack?: () => Array<string> }} [options]
 * @returns {{ ok: boolean, problems: Array<string>, checked: Array<string> }}
 */
export function run({ root = ROOT, pack = () => packedFiles(root) } = {}) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const allowed = manifest.files ?? [];
  if (allowed.length === 0) {
    return { ok: false, problems: ['package.json declares no files contract, so nothing bounds the package'], checked: [] };
  }

  const files = pack();
  const leak = checkPackList(files, allowed);
  const missing = checkEntriesPresent(files, allowed);

  return {
    ok: leak.ok && missing.ok,
    problems: [...leak.problems, ...missing.problems],
    checked: [`${files.length} packed files against ${allowed.length} entries of the files contract`],
  };
}

function main() {
  let result;
  try {
    result = run();
  } catch (error) {
    process.stderr.write(`pack-guard: ${error.message}\n`);
    return 2;
  }

  for (const line of result.checked) process.stdout.write(`pack-guard: ${line}\n`);
  if (!result.ok) {
    for (const problem of result.problems) process.stderr.write(`pack-guard: ${problem}\n`);
    return 1;
  }

  process.stdout.write('pack-guard: the packed set is the files contract\n');
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
