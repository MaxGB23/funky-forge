import assert from 'node:assert/strict';
import test from 'node:test';

import { PHASES, artifactPath, gatePath, phaseOfArtifact, gateRelativePath } from '../src/lib/paths.js';

test('the four phases are fixed and ordered', () => {
  assert.deepEqual(PHASES, ['problem', 'design', 'estimate', 'proposal']);
});

test('maps a phase to its artifact and gate report', () => {
  assert.equal(artifactPath('design'), '.funky-forge/design.md');
  assert.equal(artifactPath('problem'), '.funky-forge/brief.md');
  assert.equal(gatePath('problem'), '.funky-forge/gates/1-problem.md');
  assert.equal(gatePath('proposal'), '.funky-forge/gates/4-proposal.md');
});

test('paths resolve against a project root', () => {
  const root = '/tmp/project';
  assert.equal(artifactPath('estimate', root), '/tmp/project/.funky-forge/estimate.md');
});

test('maps an artifact back to its phase', () => {
  assert.equal(phaseOfArtifact('brief.md'), 'problem');
  assert.equal(phaseOfArtifact('proposal.md'), 'proposal');
  assert.equal(phaseOfArtifact('.funky-forge/design.md'), 'design');
  assert.equal(phaseOfArtifact('notes.md'), null);
});

test('gate relative path is stable for messages', () => {
  assert.equal(gateRelativePath('estimate'), 'gates/3-estimate.md');
});

test('an unknown phase throws instead of guessing', () => {
  assert.throws(() => artifactPath('bogus'), /UNKNOWN_PHASE/);
});
