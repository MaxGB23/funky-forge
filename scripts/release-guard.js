#!/usr/bin/env node
/**
 * The release gate: the tag that fired the workflow must name the version in `package.json`.
 *
 * A release is reachable only from a `vX.Y.Z` tag, so the tag is the whole identity of the artifact:
 * `npm stage publish` packs `package.json`'s version, and `name@version` can never be republished once
 * it exists. A tag that says `v0.2.0` over a `0.1.0` manifest would stage bytes describing themselves
 * as something else, or spend the `0.1.0` slot from a tag nobody asked for.
 *
 * It runs before the stage in `release.yml`, and by hand as `node scripts/release-guard.js --tag
 * vX.Y.Z`. It decides whether the tag may produce a release; it never decides that a release ships,
 * which is the human with two factors.
 *
 * The packed set is a different question and belongs to `pack-guard.js`, which `prepublishOnly` runs.
 *
 * Plain Node ESM, zero dependencies, no network.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A release tag: `v` and a semver, prerelease allowed, never a build suffix. */
const TAG = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * @param {string} tag the tag that fired the workflow
 * @param {string} version `package.json` `version`
 * @returns {{ ok: boolean, problems: Array<string> }}
 */
export function checkTag(tag, version) {
  const problems = [];

  if (typeof tag !== 'string' || !TAG.test(tag)) {
    problems.push(`"${tag ?? ''}" is not vX.Y.Z`);
  } else if (tag.slice(1) !== version) {
    problems.push(`${tag} does not name version ${version}`);
  }

  return { ok: problems.length === 0, problems };
}

/**
 * @param {{ tag?: string|null, version?: string }} options
 * @returns {number} 0 when the tag names the version, 2 when it does not, 1 when it cannot decide
 */
export function run({ tag = null, version = currentVersion() } = {}) {
  if (typeof tag !== 'string' || tag === '') {
    process.stderr.write('release-guard: --tag <vX.Y.Z> is required\n');
    return 1;
  }

  const result = checkTag(tag, version);
  for (const line of result.problems) process.stderr.write(`release-guard: ${line}\n`);
  if (!result.ok) return 2;

  process.stdout.write(`release-guard: ${tag} names version ${version}\n`);
  return 0;
}

/** `package.json`'s version: the only place a release version comes from. */
function currentVersion() {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
}

/** The `--tag <value>` argument. */
function flag(argv, name) {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? null : argv[at + 1] ?? null;
}

function main(argv) {
  return run({ tag: flag(argv, 'tag') });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
