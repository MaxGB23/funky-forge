/**
 * The pack's version, as a rule rather than an assumption. `install` has to answer "which version is
 * this copy?" about bytes it did not write, so the reading and the ordering are pure functions here
 * and every surface that needs the answer shares them.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { compareVersions, packState, readDeclaredVersion } from '../src/lib/pack-version.js';

/** A pack whose frontmatter declares one version, in the shape the real file has. */
function pack(version) {
  return ['---', 'name: funky-forge', `version: ${version}`, '---', '', '# funky-forge', ''].join('\n');
}

test('reads the version a frontmatter declares', () => {
  assert.equal(readDeclaredVersion(pack('0.1.0')), '0.1.0');
});

test('reads no version from a pack that declares none', () => {
  assert.equal(readDeclaredVersion(['---', 'name: funky-forge', '---', ''].join('\n')), null);
});

test('reads no version from a body line, only from the frontmatter', () => {
  assert.equal(readDeclaredVersion('# funky-forge\n\nversion: 9.9.9\n'), null);
});

test('compares numeric segments, not text, and treats a missing segment as zero', () => {
  assert.equal(compareVersions('0.1.0', '0.1'), 0);
  assert.equal(compareVersions('0.1.0', '0.1.1'), -1);
  assert.equal(compareVersions('0.2.0', '0.10.0'), -1);
  assert.equal(compareVersions('1.0.0', '0.99.99'), 1);
});

test('compares the release a prerelease belongs to', () => {
  assert.equal(compareVersions('0.1.0-beta.2', '0.1.0'), 0);
  assert.equal(compareVersions('0.2.0-rc.1', '0.1.9'), 1);
});

test('a pack that is not there is absent', () => {
  assert.equal(packState({ present: false, identical: false, installedVersion: null, shippedVersion: '0.1.0' }), 'absent');
});

test('identical bytes are current, whatever the versions say', () => {
  assert.equal(packState({ present: true, identical: true, installedVersion: null, shippedVersion: '0.1.0' }), 'identical');
});

test('an older copy is older and a newer one is newer', () => {
  assert.equal(packState({ present: true, identical: false, installedVersion: '0.0.9', shippedVersion: '0.1.0' }), 'older');
  assert.equal(packState({ present: true, identical: false, installedVersion: '0.2.0', shippedVersion: '0.1.0' }), 'newer');
});

test('the same version with different bytes is a local edit', () => {
  assert.equal(packState({ present: true, identical: false, installedVersion: '0.1.0', shippedVersion: '0.1.0' }), 'edited');
});

test('a copy that declares no version cannot be ordered against one that does', () => {
  assert.equal(packState({ present: true, identical: false, installedVersion: null, shippedVersion: '0.1.0' }), 'unversioned');
  assert.equal(packState({ present: true, identical: false, installedVersion: '0.1.0', shippedVersion: null }), 'unversioned');
});
