#!/usr/bin/env node
/**
 * The stage id, read out of what npm actually writes, and put where it outlives the job that made it.
 *
 * Approval needs 2FA and happens after the release job ends, so the id is the only handle a maintainer
 * has on the candidate. Two measured facts decide this file's shape, both learned the hard way while
 * shipping `funky-secure@0.10.2`:
 *
 * 1. `npm stage publish --json` writes the tarball **keyed under the package name** —
 *    `{ "funky-secure": { "stageId": "…" } }` — never as a flat object.
 * 2. `npm stage publish` runs `prepublishOnly` with stdio inherited, so the gate writes to the same
 *    stdout as that JSON and lands in this file first.
 *
 * A read that assumed either one fails *after* the package is already staged: the tag is spent and the
 * candidate is orphaned. So the shape is read here, where a test can reach it, instead of inside a
 * heredoc no test can run.
 *
 * Plain Node ESM, zero dependencies, no network.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ENVELOPE_PROBLEM = 'npm reported no stageId';

/**
 * The stage id and the version it names, from the JSON npm wrote.
 * @param {string} text the contents of the report file
 * @returns {{ ok: boolean, id: string|null, name: string|null, version: string|null, problems: Array<string> }}
 */
export function readStage(text) {
  const payload = report(text);
  if (payload === undefined) {
    return { ok: false, id: null, name: null, version: null, problems: ['the report is not JSON'] };
  }

  const candidate = entry(payload);
  if (candidate === null) {
    return { ok: false, id: null, name: null, version: null, problems: [ENVELOPE_PROBLEM] };
  }

  const id = candidate.stageId;
  if (typeof id !== 'string' || id === '') {
    return { ok: false, id: null, name: null, version: null, problems: [ENVELOPE_PROBLEM] };
  }

  return {
    ok: true,
    id,
    name: typeof candidate.name === 'string' ? candidate.name : null,
    version: typeof candidate.version === 'string' ? candidate.version : null,
    problems: [],
  };
}

/**
 * The document npm wrote, out of a file that also carries the gate: the last document that starts a
 * line wins, because npm writes its own output after the scripts it ran.
 * @param {string} text
 * @returns {unknown}
 */
function report(text) {
  if (typeof text !== 'string') return undefined;
  const clean = text.trim();

  const starts = [];
  for (let at = 0; at < clean.length; at += 1) {
    if (clean[at] === '{' && (at === 0 || clean[at - 1] === '\n')) starts.push(at);
  }

  for (const at of starts.reverse()) {
    try {
      return JSON.parse(clean.slice(at));
    } catch {
      // an earlier export of a script that printed its own object; keep looking
    }
  }

  return undefined;
}

/**
 * The report npm wrote, flattened: a flat report is read as itself, and the keyed envelope npm writes
 * as its single entry. Anything else is refused rather than guessed.
 * @param {unknown} payload
 * @returns {{ stageId?: unknown, name?: unknown, version?: unknown } | null}
 */
function entry(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if ('stageId' in payload) return payload;

  const values = Object.values(payload).filter((value) => value !== null && typeof value === 'object');
  return values.length === 1 ? values[0] : null;
}

/**
 * The block a maintainer reads in the run summary: what was staged, the id, and the command that
 * approves it, copied so it is not retyped from prose.
 * @param {{ name: string|null, version: string|null, id: string }} staged
 * @returns {string}
 */
export function stageSummary({ name, version, id }) {
  const what = `${name ?? 'the package'}@${version ?? 'unknown'}`;
  return [
    `## ${what} is staged`,
    '',
    `Stage id: \`${id}\``,
    '',
    `Review it with \`npm stage list\`, then approve it with 2FA: \`npm stage approve ${id}\``,
    '',
  ].join('\n');
}

/**
 * Read the report, write the summary where the run keeps it, and say so on stdout.
 * @param {{ report?: string|null, summaryPath?: string|null }} options
 * @returns {number} 0 when the id was reported, 2 when it could not be
 */
export function run({ report = null, summaryPath = process.env.GITHUB_STEP_SUMMARY ?? null } = {}) {
  if (typeof report !== 'string' || report === '') {
    console.error('stage-report: no --report to read');
    return 2;
  }

  const read = readStage(readFileSync(report, 'utf8'));
  if (!read.ok) {
    console.error(`stage-report: ${read.problems[0]}`);
    return 2;
  }

  const summary = stageSummary(read);
  if (typeof summaryPath === 'string' && summaryPath !== '') appendFileSync(summaryPath, summary);
  console.log(`staged ${read.name ?? 'the package'}@${read.version ?? 'unknown'} with id ${read.id}`);
  return 0;
}

/** The `--report <path>` argument. */
function flag(argv, name) {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? null : argv[at + 1] ?? null;
}

function main(argv) {
  return run({ report: flag(argv, 'report'), summaryPath: flag(argv, 'summary') });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
