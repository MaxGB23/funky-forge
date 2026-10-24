import assert from 'node:assert/strict';
import test from 'node:test';

import { REQUIRED_SECTIONS } from '../src/lib/required.js';

/** @param {string} name */
function designMatcher(name) {
  const section = REQUIRED_SECTIONS.design.find((candidate) => candidate.name === name);
  assert.ok(section, `the design contract has no section named ${name}`);
  return section.match;
}

test('the must-have coverage section accepts the plural form the brief itself uses', () => {
  const match = designMatcher('Must-have coverage');
  assert.equal(match('Must-haves coverage'), true);
  assert.equal(match('Must-haves to component map'), true);
  assert.equal(match('Must-have to component map'), true);
});
