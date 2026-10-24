import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';

import { checkPolicy, payloadFromEnv, run } from '../scripts/check-pr-policy.js';

const GOOD = {
  body: 'Closes #7\n\n## What changed\n- accept the plural must-haves heading\n',
  labels: ['type:bug', 'status:approved'],
  headRef: 'fix/must-have-plural',
};

function capture() {
  return {
    text: '',
    write(chunk) {
      this.text += chunk;
      return true;
    },
  };
}

test('accepts a pull request that links its issue, carries one type label and names its branch', () => {
  assert.deepEqual(checkPolicy(GOOD), { ok: true, problems: [] });
  assert.equal(checkPolicy({ ...GOOD, body: 'Refs #12' }).ok, true, 'a non-closing reference is allowed');
});

test('rejects a body that links no issue', () => {
  const { ok, problems } = checkPolicy({ ...GOOD, body: '## What changed\n- something' });

  assert.equal(ok, false);
  assert.match(problems[0], /does not link an issue/);
});

test('rejects zero or two type labels, never guessing which one is right', () => {
  assert.match(checkPolicy({ ...GOOD, labels: ['status:approved'] }).problems[0], /no type:\* label/);
  assert.match(
    checkPolicy({ ...GOOD, labels: ['type:bug', 'type:docs'] }).problems[0],
    /2 type:\* labels \(type:bug, type:docs\)/,
  );
});

test('rejects a branch that does not follow type/description', () => {
  for (const headRef of ['must-have-plural', 'Fix/Plural', 'fix/', 'fix/Has Spaces']) {
    assert.equal(checkPolicy({ ...GOOD, headRef }).ok, false, `expected ${headRef} to be rejected`);
  }
});

test('the command reports every problem at once and exits 1', () => {
  const stdout = capture();
  const stderr = capture();
  const code = run({ PR_BODY: 'nothing', PR_LABELS: '', PR_HEAD_REF: 'main' }, stdout, stderr);

  assert.equal(code, 1);
  assert.equal(stdout.text, '');
  assert.equal(stderr.text.match(/^pr-policy: /gm)?.length, 4, 'three problems plus the pointer to CONTRIBUTING.md');
});

test('payloadFromEnv trims labels and ignores the empty string', () => {
  assert.deepEqual(payloadFromEnv({ PR_LABELS: ' type:docs , ,status:approved ' }), {
    body: '',
    labels: ['type:docs', 'status:approved'],
    headRef: '',
  });
});

test('running the script as a command enforces the policy instead of passing silently', () => {
  const script = join(import.meta.dirname, '..', 'scripts', 'check-pr-policy.js');

  const good = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      PR_BODY: 'Closes #1',
      PR_LABELS: 'type:bug',
      PR_HEAD_REF: 'fix/v0.1',
    },
  });
  assert.equal(good.status, 0, good.stderr);

  const bad = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, PR_BODY: '', PR_LABELS: '', PR_HEAD_REF: '' },
  });
  assert.equal(bad.status, 1, 'an empty payload must fail, not pass by default');
  assert.match(bad.stderr, /see CONTRIBUTING\.md/);
});
