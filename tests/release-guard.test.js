import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkTag } from '../scripts/release-guard.js';

/** The release workflow is reachable only from a `vX.Y.Z` tag, so the tag is the whole identity of a
 * release: if it does not name the version in `package.json`, the job would stage bytes that describe
 * themselves as something else, and `name@version` can never be republished. These cases are the
 * reason the check runs before the stage rather than after it.
 */

const ROOT = join(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'release-guard.js');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

test('a tag that names the version is accepted, prerelease included', () => {
  assert.deepEqual(checkTag('v0.1.0', '0.1.0'), { ok: true, problems: [] });
  assert.deepEqual(checkTag('v0.2.0-rc.1', '0.2.0-rc.1'), { ok: true, problems: [] });
});

test('a tag that does not name the version is refused, and the problem names both', () => {
  const result = checkTag('v0.2.0', '0.1.0');

  assert.equal(result.ok, false);
  assert.match(result.problems[0], /v0\.2\.0/);
  assert.match(result.problems[0], /0\.1\.0/);
});

test('a tag that is not vX.Y.Z is refused as a shape, not compared', () => {
  for (const tag of ['0.1.0', 'release-0.1.0', 'v0.1', 'v0.1.0.0', '']) {
    const result = checkTag(tag, '0.1.0');
    assert.equal(result.ok, false, `${tag} was accepted`);
    assert.match(result.problems[0], /not vX\.Y\.Z/, `${tag} was refused for the wrong reason`);
  }
});

test('the script refuses a mismatched tag with exit 2, naming the version it found', () => {
  const good = spawnSync(process.execPath, [SCRIPT, '--tag', `v${VERSION}`], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, new RegExp(`v${VERSION.replace(/\./g, '\\.')}`));

  const bad = spawnSync(process.execPath, [SCRIPT, '--tag', 'v99.99.99'], { encoding: 'utf8' });
  assert.equal(bad.status, 2, 'a mismatch must refuse to release, not warn');
  assert.match(bad.stderr, /v99\.99\.99/);
  assert.match(bad.stderr, new RegExp(VERSION.replace(/\./g, '\\.')));
});

test('the script refuses to guess when no tag is given', () => {
  const silent = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(silent.status, 1, 'a run with no tag cannot decide anything');
  assert.match(silent.stderr, /--tag/);
});
