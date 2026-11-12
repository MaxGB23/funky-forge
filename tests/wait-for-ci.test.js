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

test('reads the answer the API gives, and treats an unreadable one as no answer', () => {
  const { exec } = scripted([started([COMPLETED]), viewed(MATRIX)]);
  const answer = query(exec, '7ddd30d');
  assert.equal(answer.run.databaseId, COMPLETED.databaseId);
  assert.equal(answer.jobs.length, 3);
  assert.equal(answer.problem, null, 'a readable answer has nothing to report');

  const broken = scripted(['boom']);
  // The shape keeps the failure: the same `run: null, jobs: []` used to mean "no run", "no login"
  // and "not JSON" at once, and the reader was told the first.
  const unreadable = query(broken.exec, '7ddd30d');
  assert.equal(unreadable.run, null);
  assert.deepEqual(unreadable.jobs, []);
  assert.match(unreadable.problem, /gh run list failed/);

  const garbled = scripted([{ ok: true, stdout: 'not json at all' }]);
  assert.match(query(garbled.exec, '7ddd30d').problem, /not JSON/);
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

test('a green matrix is not vetoed by a summary that disagrees with it', () => {
  // The matrix is the gate; the summary is the field this command exists to survive. A summary that
  // says cancelled while every job succeeded is a run nobody can decide yet, never a red check: the
  // answer used to be 1, which says "it broke" about something that did not.
  const verdict = decideGate({
    run: { databaseId: 9, status: 'completed', conclusion: 'cancelled' },
    jobs: [{ name: 'test (ubuntu-24.04, 22)', conclusion: 'success' }],
  });

  assert.equal(verdict.code, UNKNOWN);
  assert.equal(verdict.state, 'unknown');
  assert.match(verdict.reason, /every job is accepted/);
});

test('does not decide a run whose status is still IN_PROGRESS while every job has concluded', () => {
  // The status field lags the jobs: a run reports `IN_PROGRESS` after its matrix is already green.
  // `2` is the honest answer for a stale field; `1` would say the push broke something that passed.
  const verdict = decideGate({
    run: { databaseId: 11, status: 'IN_PROGRESS', conclusion: null },
    jobs: [...MATRIX, { name: 'test (windows-2025, 22)', conclusion: 'success' }],
  });

  assert.equal(verdict.code, UNKNOWN, 'a stale status is undecided, never a red check');
  assert.equal(verdict.state, 'unknown');
  assert.match(verdict.reason, /IN_PROGRESS/);
});

test('passes a push to main where the guarded pr-policy job reads skipped', () => {
  // `pr-policy` is guarded to pull request events, so on a push to `main` it is `skipped` while all
  // four `test (...)` jobs pass. The guard working is not a failure to investigate.
  const verdict = decideGate({
    run: { databaseId: 12, status: 'completed', conclusion: 'success' },
    jobs: [
      { name: 'pr-policy', conclusion: 'skipped' },
      { name: 'test (ubuntu-24.04, 22)', conclusion: 'success' },
      { name: 'test (ubuntu-24.04, 24)', conclusion: 'success' },
      { name: 'test (windows-2025, 22)', conclusion: 'success' },
      { name: 'test (windows-2025, 24)', conclusion: 'success' },
    ],
  });

  assert.equal(verdict.code, PASS, 'skipped is an accepted conclusion, not a rejection');
  assert.equal(verdict.state, 'passed');
  assert.equal(verdict.lines.length, 5, 'the reader still sees the whole matrix');
});

test('every child process is bounded by the wait budget', async () => {
  const { childOptions } = await import('../scripts/wait-for-ci.js');
  const options = childOptions(30_000);

  assert.equal(options.timeout, 30_000, 'an unbounded gh on a network stall never fails, it hangs');
  assert.equal(options.encoding, 'utf8');
});

/** An exec that answers every call with the same result. */
const always = (result) => () => result;

/** A `gh` that fails, the way an unauthenticated one does. */
const failing = always({ ok: false, stdout: '', stderr: 'HTTP 401: Bad credentials' });

test('a query that failed says so instead of claiming no run exists', () => {
  const answer = query(failing, 'a'.repeat(40));

  // The difference between "there is no run yet" and "I could not ask" is the whole value of the
  // message: the first tells the reader to wait, the second tells them to log in.
  assert.equal(answer.run, null);
  assert.match(answer.problem, /401/, 'the failure travels with the answer');
});

test('a commit with no run yet has no problem to report', () => {
  const answer = query(always({ ok: true, stdout: '[]', stderr: '' }), 'a'.repeat(40));

  assert.equal(answer.run, null);
  assert.equal(answer.problem, null, 'waiting is not a failure');
});

test('a run whose jobs cannot be read reports that, not "no job"', () => {
  const exec = (args) => {
    if (args[0] === 'run' && args[1] === 'list') {
      return { ok: true, stdout: JSON.stringify([{ databaseId: 7, status: 'completed', conclusion: 'success' }]), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'gh: Not Found (HTTP 404)' };
  };

  const answer = query(exec, 'a'.repeat(40));

  assert.equal(answer.run.databaseId, 7);
  assert.match(answer.problem, /404/);
});

test('the timeout names the last real failure instead of guessing', async () => {
  const out = capture();

  const code = await wait({
    sha: 'a'.repeat(40),
    exec: failing,
    sleep: async () => {},
    out,
    timeoutSeconds: 1,
    intervalSeconds: 1,
  });

  // Exit 2 is right either way; the reason is what a reader acts on. "No run for this commit yet"
  // sends them to wait for something that will never arrive.
  assert.equal(code, 2);
  assert.match(out.text, /401/, 'the reason names what actually failed');
  assert.doesNotMatch(out.text, /no run for this commit yet/, 'it must not claim a measurement it did not take');
});

test('a failure on an early attempt is not reported as every attempt', async () => {
  // The finding the refuter confirmed: `lastProblem` was assigned but never cleared, so one transient
  // failure at the start of a long wait was printed as `(every attempt)` — a false claim about the
  // window, in the change whose whole point was to stop making false claims. The last attempt is the
  // one the answer is about.
  const answers = [{ ok: false, stdout: '', stderr: 'HTTP 401: Bad credentials' }];
  const exec = () => {
    const answer = answers.length > 0 ? answers.shift() : { ok: true, stdout: '[]', stderr: '' };
    return answer;
  };
  const out = capture();

  const code = await wait({ sha: 'a'.repeat(40), exec, sleep: async () => {}, out, timeoutSeconds: 2, intervalSeconds: 1 });

  assert.equal(code, UNKNOWN);
  // Two halves matter. The attempt that failed said so at the time, because it did fail; the reason
  // the command ends on must describe the last attempt, not the window.
  const reasons = out.text.split('\n').filter((line) => line.startsWith('wait-for-ci  '));
  assert.match(reasons[0], /401/, 'the failing attempt reported itself');
  assert.doesNotMatch(reasons.at(-1), /401/, 'the last attempt did not fail, so the reason must not say it did');
  assert.match(reasons.at(-1), /no run for this commit yet/);
});
