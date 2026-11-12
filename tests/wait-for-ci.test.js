import test from 'node:test';
import assert from 'node:assert/strict';

import { decideGate, query, run, wait, PASS, FAIL, UNKNOWN } from '../scripts/wait-for-ci.js';

const COMPLETED = { databaseId: 42910167125, status: 'completed', conclusion: 'success' };
const MATRIX = [
  { name: 'pr-policy', conclusion: 'success' },
  { name: 'test (ubuntu-24.04, 22)', conclusion: 'success' },
  { name: 'test (windows-2025, 24)', conclusion: 'success' },
];

function capture() {
  return {
    text: '',
    write(chunk) {
      this.text += chunk;
      return true;
    },
  };
}

/** An exec whose answers are consumed in order, so a polling test can script attempt by attempt. */
function scripted(answers) {
  const calls = [];
  const exec = (args) => {
    calls.push(args.join(' '));
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
    return typeof answer === 'string' ? { ok: false, stdout: answer } : answer;
  };
  return { exec, calls };
}

const started = (runs) => ({ ok: true, stdout: JSON.stringify(runs) });
const viewed = (jobs) => ({ ok: true, stdout: JSON.stringify({ jobs }) });

test('passes when the run completed and every job is success, skipped or neutral', () => {
  const verdict = decideGate({ run: COMPLETED, jobs: [...MATRIX, { name: 'optional', conclusion: 'skipped' }] });

  assert.equal(verdict.code, PASS);
  assert.equal(verdict.state, 'passed');
  assert.equal(verdict.lines.length, 4, 'one line per job, so a reader sees the matrix');
  assert.match(verdict.lines[0], /pr-policy: success/);
});

test('fails when a job concluded failure', () => {
  const verdict = decideGate({ run: { ...COMPLETED, conclusion: 'failure' }, jobs: [...MATRIX, { name: 'test (windows-2025, 22)', conclusion: 'failure' }] });

  assert.equal(verdict.code, FAIL);
  assert.match(verdict.reason, /1 job\(s\) outside/);
});

test('fails when the run says success but a job did not, because the gate is the matrix', () => {
  const verdict = decideGate({ run: COMPLETED, jobs: [{ name: 'pr-policy', conclusion: 'failure' }] });

  assert.equal(verdict.code, FAIL, 'the run summary is not the gate');
  assert.match(verdict.reason, /outside success, skipped and neutral/);
});

test('does not decide while the run is still going', () => {
  const verdict = decideGate({ run: { ...COMPLETED, status: 'in_progress', conclusion: null }, jobs: [] });

  assert.equal(verdict.code, UNKNOWN);
  assert.match(verdict.reason, /in_progress/);
});

test('does not decide without a run, and says so instead of blaming the matrix', () => {
  assert.equal(decideGate({ run: null, jobs: [] }).code, UNKNOWN);
  assert.equal(decideGate({}).code, UNKNOWN);
  assert.match(decideGate({}).reason, /no run for this commit yet/);
});

test('does not pass a stale status, even when every job already concluded success', () => {
  // Measured here: `gh pr checks --json state` has reported `IN_PROGRESS` for a job whose `conclusion`
  // was `success` on a completed run. The run's own status says it has not finished, so the honest
  // answer is `2` — never `1`, which is how a green run gets escalated as a problem.
  const stale = { ...COMPLETED, status: 'IN_PROGRESS' };
  const verdict = decideGate({ run: stale, jobs: MATRIX });

  assert.equal(verdict.code, UNKNOWN, 'a stale status is undecided, and undecided is not failure');
  assert.notEqual(verdict.code, FAIL);
  assert.match(verdict.reason, /IN_PROGRESS/);
});

test('passes a push to main, where pr-policy reads skipped because it is guarded to pull requests', () => {
  const push = [
    { name: 'pr-policy', conclusion: 'skipped' },
    { name: 'test (ubuntu-24.04, 22)', conclusion: 'success' },
    { name: 'test (ubuntu-24.04, 24)', conclusion: 'success' },
    { name: 'test (windows-2025, 22)', conclusion: 'success' },
    { name: 'test (windows-2025, 24)', conclusion: 'success' },
  ];
  const verdict = decideGate({ run: COMPLETED, jobs: push });

  assert.equal(verdict.code, PASS, 'the guard working is not a failure');
  assert.match(verdict.lines[0], /pr-policy: skipped/);
});

test('reads the answer the API gives, and treats an unreadable one as no answer', () => {
  const { exec } = scripted([started([COMPLETED]), viewed(MATRIX)]);
  const answer = query(exec, '7ddd30d');
  assert.equal(answer.run.databaseId, COMPLETED.databaseId);
  assert.equal(answer.jobs.length, 3);

  const broken = scripted(['not json at all']);
  assert.deepEqual(query(broken.exec, '7ddd30d'), { run: null, jobs: [] });
});

test('returns as soon as the run appears, without waiting out the timeout', async () => {
  // The first answer is an empty list, the second is the finished run: exactly the shape of "I asked
  // too early", which is what a hand-rolled loop turns into a false alarm.
  const { exec, calls } = scripted([started([]), started([COMPLETED]), viewed(MATRIX)]);
  const out = capture();
  let slept = 0;

  const code = await wait({ sha: '7ddd30d', exec, sleep: async () => { slept += 1; }, out, timeoutSeconds: 60, intervalSeconds: 1 });

  assert.equal(code, PASS);
  assert.equal(slept, 1, 'it polls once more and then stops');
  assert.equal(calls.length, 3, 'one list, one list, one view');
  assert.match(out.text, /wait-for-ci: passed/);
});

test('gives up as unknown, never as a failure, when the run never appears', async () => {
  const { exec, calls } = scripted([started([])]);
  const out = capture();
  let slept = 0;

  const code = await wait({ sha: 'deadbee', exec, sleep: async () => { slept += 1; }, out, timeoutSeconds: 3, intervalSeconds: 1 });

  assert.equal(code, UNKNOWN, 'a timeout is not a red check');
  assert.equal(slept, 3, 'the loop is bounded by the timeout, not by hope');
  assert.equal(calls.length, 4);
  assert.match(out.text, /unknown — gave up after 3s; this is not a failure/);
});

test('the command line refuses to wait for nothing and names what it needs', async () => {
  const out = capture();
  const code = await run({ argv: [], exec: () => ({ ok: false, stdout: '' }), out });

  assert.equal(code, UNKNOWN);
  assert.match(out.text, /a commit is required/);
});

test('the command line reads its options and stops at the first decided answer', async () => {
  const { exec } = scripted([started([COMPLETED]), viewed(MATRIX)]);
  const out = capture();

  const code = await run({ argv: ['7ddd30d', '--timeout', '30', '--interval', '1'], exec, sleep: async () => {}, out });

  assert.equal(code, PASS);
  assert.match(out.text, /test \(ubuntu-24\.04, 22\): success/);
});

test('the command line asks for the full commit, because an abbreviated one answers nothing', async () => {
  // Measured against the real API: `gh run list --commit 7ddd30d` answers `[]` and the full SHA
  // answers the run. Unresolved, the command reads that empty answer as "no run yet" and waits out the
  // whole timeout, which is exactly the false alarm it exists to prevent.
  const fullSha = '7ddd30d0bae816d390572c05e4610070ccd4d26e';
  const { exec, calls } = scripted([started([COMPLETED]), viewed(MATRIX)]);
  const out = capture();

  const code = await run({
    argv: ['7ddd30d'],
    exec,
    sleep: async () => {},
    out,
    resolveSha: (argument) => (argument === '7ddd30d' ? fullSha : argument),
  });

  assert.equal(code, PASS);
  assert.match(calls[0], new RegExp(fullSha), 'the API is asked about the resolved commit');
  assert.doesNotMatch(calls[0], /--commit 7ddd30d /, 'the abbreviated form never reaches the API');
});

test('a wait that is still undecided says so once per change, so it never looks hung', async () => {
  const { exec } = scripted([
    started([{ ...COMPLETED, status: 'in_progress', conclusion: null }]),
    started([{ ...COMPLETED, status: 'in_progress', conclusion: null }]),
    started([COMPLETED]),
    viewed(MATRIX),
  ]);
  const out = capture();

  const code = await wait({ sha: 'abc1234', exec, sleep: async () => {}, out, timeoutSeconds: 10, intervalSeconds: 1 });

  assert.equal(code, PASS);
  assert.equal(out.text.match(/the run is in_progress/g).length, 1, 'one line, not one per attempt');
  assert.match(out.text, /wait-for-ci: passed/);
});
