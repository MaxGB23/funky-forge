import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GREEN,
  RED,
  UNKNOWN,
  decideVerdict,
  failingCount,
  floorOf,
  packOptions,
  parseArgs,
  pullRequestFrom,
  readyEventTime,
  run,
  runsPastFloor,
  suiteOptions,
} from '../scripts/open-pr.js';

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

function capture() {
  return {
    text: '',
    write(chunk) {
      this.text += chunk;
      return true;
    },
  };
}

/**
 * A `gh` whose answers are written here and nowhere else. Call order decides which `run list` answer is
 * served: the first is the fail-closed read taken before anything is created, the second is the floor
 * read taken immediately before `gh pr ready`, and every later one is a poll after the deciding event.
 *
 * `runs` is either the one answer every poll gets, or one answer per poll, the last one repeating:
 * `[[], [opened, ready]]` is a run that is not visible yet and then is, which is the shape of the race.
 */
function gh({ create = 'https://github.com/MaxGB23/funky-forge/pull/42\n', snapshot = [], floor = [], floorOk = true, runs = [], ready = {}, readyAt = '2026-01-01T00:00:00Z\n', conclusion = 'success', jobs = null, watch = {} } = {}) {
  const calls = [];
  const seen = [];
  let lists = 0;

  const poll = (index) => {
    if (!Array.isArray(runs) || runs.length === 0) return [];
    if (!Array.isArray(runs[0])) return runs;
    return runs[Math.min(index, runs.length - 1)];
  };

  // Every run the API lists carries the time it was created: the run that decides is the one the
  // readiness event created, so a fixture without a `createdAt` would be a run nobody could attribute.
  const stamped = (list) =>
    Array.isArray(list) ? list.map((entry) => ({ createdAt: '2026-01-01T00:10:00Z', ...entry })) : list;

  const exec = (args, options) => {
    calls.push(args.join(' '));
    seen.push(options);
    const [group, action] = args;

    if (group === 'api') {
      // The timeline says when the readiness event happened, which is the only thing that tells the
      // deciding run from the draft's.
      return readyAt === null
        ? { ok: false, stdout: '', stderr: 'gh: the timeline cannot be read' }
        : { ok: true, stdout: readyAt, stderr: '' };
    }
    if (group === 'pr' && action === 'create') return { ok: true, stdout: create, stderr: '' };
    if (group === 'pr' && action === 'ready') {
      return { ok: ready.ok ?? true, stdout: ready.stdout ?? '', stderr: ready.stderr ?? '' };
    }
    if (group === 'run' && action === 'list') {
      lists += 1;
      if (lists === 1) return { ok: true, stdout: JSON.stringify(stamped(snapshot)), stderr: '' };
      if (lists === 2) {
        return floorOk
          ? { ok: true, stdout: JSON.stringify(stamped(floor)), stderr: '' }
          : { ok: false, stdout: '', stderr: 'gh: not logged in' };
      }
      return { ok: true, stdout: JSON.stringify(stamped(poll(lists - 3))), stderr: '' };
    }
    if (group === 'run' && action === 'watch') {
      return { ok: watch.ok ?? true, timedOut: watch.timedOut === true, stdout: '', stderr: '' };
    }
    if (group === 'run' && action === 'view') {
      // The matrix travels with the answer: the verdict is read from the jobs, so a stub without them
      // is a run nobody can judge, and that is exactly what the gate refuses to call green.
      return {
        ok: true,
        stdout: JSON.stringify({
          status: 'completed',
          conclusion,
          jobs: (jobs ?? [{ name: 'test', conclusion }]).map((job) => ({ ...job })),
        }),
        stderr: '',
      };
    }

    return { ok: false, stdout: '', stderr: `unexpected gh ${args.join(' ')}` };
  };

  return { exec, calls, seen };
}

/**
 * The packed-set gate's child, answered here and nowhere else, in the style of `gh()`: the real step is
 * `node scripts/pack-guard.js`, and a test that spawned it would read the filesystem, run `npm pack`
 * and take a second per case. `null` is the guard that is not in the repository, which is skipped.
 */
function packGuard(answer) {
  return () => answer;
}

const PACK_GREEN = { ok: true, stdout: 'pack-guard: the packed set is the files contract\n' };

/** A body file in a fresh temporary directory, removed when the test ends. */
function bodyFile(t, text) {
  const directory = mkdtempSync(join(tmpdir(), 'open-pr-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const path = join(directory, 'body.md');
  writeFileSync(path, text);
  return path;
}

const BODY = 'Closes #7\n\n## Summary\n- the ritual in one command\n';

function argvFor(path) {
  return [
    '--base', 'main',
    '--head', 'feat/open-pr',
    '--title', 'the ritual in one command',
    '--body-file', path,
    '--label', 'type:docs',
    '--timeout', '30',
  ];
}

test('reads the whole ritual from the command line and names every part that is missing', () => {
  const { options, problems } = parseArgs([
    '--base', 'develop',
    '--head', 'docs/open-pr',
    '--title', 'the ritual in one command',
    '--body-file', 'body.md',
    '--label', 'type:docs',
    '--repo', 'MaxGB23/funky-forge',
    '--timeout', '90',
  ]);

  assert.deepEqual(problems, []);
  assert.deepEqual(options, {
    base: 'develop',
    head: 'docs/open-pr',
    title: 'the ritual in one command',
    bodyFile: 'body.md',
    label: 'type:docs',
    repo: 'MaxGB23/funky-forge',
    timeout: 90,
  });

  assert.equal(parseArgs([]).options.base, 'main', 'the base is a default, not a required option');
  // The hazard a copied script carries: a default repository opens the pull request somewhere else,
  // and no fixture notices when it inherits that default. There is none here, so `gh` infers the one
  // the checkout belongs to.
  assert.equal(parseArgs([]).options.repo, null, 'no default repository: gh infers it from the checkout');
  assert.equal(parseArgs(['--base', 'main', '--label', 'type:docs']).problems.length, 2, 'title and body file');
  assert.match(parseArgs(['--head']).problems[0], /--head needs a value/);
  assert.match(parseArgs(['--lisence', 'MIT']).problems[0], /unknown option "--lisence"/);
  assert.match(parseArgs(['--timeout', 'soon']).problems[0], /--timeout takes a positive number of seconds/);
  assert.match(parseArgs(['main']).problems[0], /unexpected argument "main"/);
});

test('the gate is the matrix, and the summary is not', () => {
  const completed = (conclusion, jobs) => ({ status: 'completed', conclusion, jobs });

  assert.equal(decideVerdict(completed('success', [{ name: 'test', conclusion: 'success' }])).code, GREEN);
  // A skipped job is the guard working: `pr-policy` reads skipped on a push to main.
  assert.equal(decideVerdict(completed('success', [{ name: 'pr-policy', conclusion: 'skipped' }])).code, GREEN);
  // The reading that makes a red check look green, and the reason this module keeps no rule of its own.
  assert.equal(decideVerdict(completed('success', [{ name: 'test', conclusion: 'failure' }])).code, RED);
  assert.equal(decideVerdict(completed('failure', [{ name: 'test', conclusion: 'failure' }])).code, RED);
  // A run still going, and one that answers no job, are unknown rather than failures.
  assert.equal(decideVerdict({ status: 'in_progress', conclusion: null, jobs: [] }).code, UNKNOWN);
  assert.equal(decideVerdict(completed('success', [])).code, UNKNOWN);
  assert.equal(decideVerdict(null).code, UNKNOWN);
});

test('counts the failures the reporter summarized, in either reporter', () => {
  assert.equal(failingCount('ℹ tests 8\nℹ pass 6\nℹ fail 2\n'), 2, 'the spec reporter');
  assert.equal(failingCount('# pass 0\n# fail 3\n'), 3, 'TAP');
  assert.equal(failingCount('a suite that died before it summarized'), null);
  assert.equal(failingCount(undefined), null);
});

test('the run is chosen by its commit and by being past the floor, not by being the newest', () => {
  const runs = [
    { databaseId: 11, headSha: 'ffffffffffffffffffffffffffffffffffffffff', conclusion: 'success' },
    { databaseId: 22, headSha: SHA, conclusion: 'success' },
    { databaseId: 7, headSha: SHA, conclusion: 'failure' },
  ];

  // The runs of this commit, never another commit's: the branch also carries runs of a previous head.
  assert.deepEqual(runsPastFloor(runs, SHA, 0).map((run) => run.databaseId), [22, 7]);
  // A run past the floor of its own greatest id belongs to an event that fired before that id, and
  // there is no exclusion set to name it back in: a run older than the floor is not a candidate at all.
  assert.deepEqual(runsPastFloor(runs, SHA, 22), []);
  assert.deepEqual(runsPastFloor(runs, SHA, floorOf(runs, SHA)), []);
  assert.equal(floorOf(runs, SHA), 22, 'the greatest id of this commit, not of the branch');
  assert.equal(floorOf(runs, 'not-a-sha'), 0, 'a commit with no run has a floor of zero');
  assert.equal(floorOf(undefined, SHA), 0, 'an unreadable answer is no floor, not a crash');
  assert.deepEqual(runsPastFloor(undefined, SHA), [], 'and no candidates either');
});

test('the pull request number comes from the URL the creation printed', () => {
  assert.deepEqual(pullRequestFrom('https://github.com/MaxGB23/funky-forge/pull/42\n'), {
    url: 'https://github.com/MaxGB23/funky-forge/pull/42',
    number: 42,
  });
  assert.equal(pullRequestFrom('warning: something\n'), null);
});

test('a red suite refuses before anything is created and names the failing count', async () => {
  const out = capture();
  const err = capture();
  const { exec, calls } = gh();

  const code = await run({
    argv: argvFor('body.md'),
    suite: () => ({ ok: false, stdout: 'ℹ tests 8\nℹ pass 6\nℹ fail 2\n' }),
    // A red packed-set gate too, so the message proves which step refused: the suite runs first.
    pack: packGuard({ ok: false, stdout: 'pack-guard: the packed set leaks a file\n' }),
    exec,
    out,
    err,
  });

  assert.equal(code, RED);
  assert.match(err.text, /the suite is red \(2 failing tests\), so nothing was created/);
  assert.doesNotMatch(err.text, /packed-set gate/, 'the suite refused, not the packed set behind it');
  assert.equal(calls.length, 0, 'no gh call, so no pull request');
  assert.equal(out.text, '');
});

test('a red packed-set gate refuses before anything is created and names the gate', async (t) => {
  const out = capture();
  const err = capture();
  const { exec, calls } = gh();

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard({ ok: false, stdout: 'pack-guard: bin/funky-forge.js is not covered by files\n' }),
    exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
  });

  assert.equal(code, RED);
  assert.match(
    err.text,
    /the packed-set gate \(scripts\/pack-guard\.js\) is red, so nothing was created/,
    'the refusal names the gate it came from',
  );
  assert.match(err.text, /run node scripts\/pack-guard\.js and fix it first/, 'and the command that fixes it');
  assert.match(err.text, /bin\/funky-forge\.js is not covered by files/, "the gate's own reason travels");
  assert.doesNotMatch(err.text, /the suite is red/, "the gate's message is its own, never the suite's");
  assert.equal(calls.length, 0, 'no gh call, so no pull request');
  assert.match(out.text, /suite green/, 'the suite ran first and said so');
});

test('the packed-set gate is skipped when the repository has no guard to run', async (t) => {
  const out = capture();
  const err = capture();
  const { exec, calls } = gh({
    snapshot: [],
    runs: [{ databaseId: 22, headSha: SHA, conclusion: 'success' }],
  });
  const asked = [];

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    // `null` is the guard that is not there, which is the answer the default reads off the repository.
    pack: () => {
      asked.push('pack-guard');
      return null;
    },
    exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
  });

  assert.equal(code, GREEN, err.text);
  assert.equal(asked.length, 1, 'the step is asked about once and then skipped, never assumed');
  assert.doesNotMatch(out.text, /packed set/, 'a skipped gate is silent: it is not a green gate');
  assert.ok(calls.some((call) => call.startsWith('pr create')), 'the ritual goes on');
});

test('a policy refusal refuses before anything is created and prints the policy message', async (t) => {
  const out = capture();
  const err = capture();
  const { exec, calls } = gh();
  const path = bodyFile(t, '## Summary\n- a body that links no issue\n');

  const code = await run({
    argv: argvFor(path),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec,
    out,
    err,
  });

  assert.equal(code, RED);
  assert.match(err.text, /^pr-policy: the body does not link an issue/m, 'the policy prints its own message');
  assert.match(err.text, /the policy refuses this pull request, so nothing was created/);
  assert.equal(calls.length, 0, 'a refused pull request is never created');
});

test('creates a labelled draft, marks it ready and returns the run of this commit', async (t) => {
  const out = capture();
  const err = capture();
  const { exec, calls } = gh({
    snapshot: [],
    runs: [
      { databaseId: 11, headSha: 'ffffffffffffffffffffffffffffffffffffffff', conclusion: 'success' },
      { databaseId: 22, headSha: SHA, conclusion: 'success' },
    ],
  });

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
  });

  assert.equal(code, GREEN, err.text);
  assert.equal(err.text, '');

  const created = calls.find((call) => call.startsWith('pr create'));
  assert.ok(created, 'the pull request is created');
  assert.match(created, /--label type:docs/, 'the label travels in the creation, not after it');
  assert.match(created, /--draft/, 'a draft matches the workflow guard');
  assert.match(created, /--base main/);
  assert.match(created, /--head feat\/open-pr/);
  assert.match(created, /--body-file /);
  assert.doesNotMatch(created, /--repo/, 'no repository is named, so gh cannot be pointed at another one');

  assert.ok(calls.includes('pr ready 42'), `ready runs against the created pull request: ${calls.join(' | ')}`);

  const watched = calls.find((call) => call.startsWith('run watch'));
  assert.match(watched, /^run watch 22 /, 'the run of this commit, never the newest run of the branch');
  assert.match(watched, /--exit-status/);
  assert.match(watched, /--interval 15/);

  assert.match(out.text, /https:\/\/github\.com\/MaxGB23\/funky-forge\/pull\/42/, 'the URL is printed');
  assert.match(out.text, /open-pr: run 22 {2}·/, 'the run id is printed');
  assert.match(out.text.trimEnd().split('\n').pop(), /passed$/);
  assert.match(out.text, /^ {2}test: success$/m, 'the matrix is printed, so the verdict can be audited');
  assert.match(out.text, /pull\/42 {2}· {2}passed/, 'the verdict is printed');
});

test('a run of the draft that appears after ready can never decide, because its id is older', async (t) => {
  const out = capture();
  const err = capture();
  // The `opened` event `gh pr create --draft` fires carries this same commit and is green, and it is not
  // visible when the floor is taken. It appears during the wait, behind the `ready_for_review` run that
  // has the greater id: nothing in the answer says which of the two the ready fired, so neither decides.
  const draft = { databaseId: 1001, headSha: SHA, status: 'completed', conclusion: 'success' };
  const deciding = { databaseId: 1002, headSha: SHA, status: 'in_progress', conclusion: null };
  const { exec, calls } = gh({ snapshot: [], runs: [[], [deciding, draft]] });

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
  });

  assert.equal(code, UNKNOWN, 'a green run of the draft is not the verdict of the ready event');
  assert.doesNotMatch(out.text, /·  passed/, 'never green, however green the draft run was');
  assert.match(out.text, /unknown/, 'the answer says it cannot tell, which is not a failure');
  assert.equal(calls.filter((call) => call.startsWith('run watch')).length, 0, 'no run is watched');
});

test('the run of this event decides once its id is past the floor', async (t) => {
  // The `opened` run is already visible when the floor is taken, so it is the floor; the run the ready
  // fires is the only one past it, and the matrix inside that run is the verdict.
  const opened = { databaseId: 1001, headSha: SHA, status: 'completed', conclusion: 'success' };
  const deciding = { databaseId: 1002, headSha: SHA, status: 'completed', conclusion: 'success' };
  const path = bodyFile(t, BODY);

  const greenOut = capture();
  const greenErr = capture();
  const greenGh = gh({ floor: [opened], runs: [deciding] });
  const greenCode = await run({
    argv: argvFor(path),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec: greenGh.exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out: greenOut,
    err: greenErr,
  });

  assert.equal(greenCode, GREEN, greenErr.text);
  const watched = greenGh.calls.find((call) => call.startsWith('run watch'));
  assert.match(String(watched), /^run watch 1002 /, 'the run past the floor, never the one at it');
  assert.match(greenOut.text, /·  passed/);

  const redOut = capture();
  const redErr = capture();
  const redGh = gh({
    floor: [opened],
    runs: [deciding],
    conclusion: 'failure',
    jobs: [{ name: 'test', conclusion: 'failure' }],
    watch: { ok: false },
  });
  const redCode = await run({
    argv: argvFor(path),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec: redGh.exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out: redOut,
    err: redErr,
  });

  assert.equal(redCode, RED, 'a failed job in the deciding run is a failed pull request');
  assert.match(String(redGh.calls.find((call) => call.startsWith('run watch'))), /^run watch 1002 /);
});

test('two runs past the floor are ambiguous, not a choice', async (t) => {
  const out = capture();
  const err = capture();
  const first = { databaseId: 1002, headSha: SHA, status: 'in_progress', conclusion: null };
  const second = { databaseId: 1003, headSha: SHA, status: 'in_progress', conclusion: null };
  const { exec, calls } = gh({ snapshot: [], runs: [first, second] });

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
  });

  assert.equal(code, UNKNOWN, 'two candidates are a question, not a verdict');
  assert.match(out.text, /1002/, 'the message names the first id');
  assert.match(out.text, /1003/, 'and the second');
  assert.match(out.text, /unknown/);
  assert.equal(calls.filter((call) => call.startsWith('run watch')).length, 0, 'neither is picked and watched');
});

test('a ready that changed nothing is unknown, never a verdict', async (t) => {
  const out = capture();
  const err = capture();
  // `gh pr ready` on an already-ready pull request fires no event, so no run belongs to it and a verdict
  // read from whatever the branch has would be a verdict on an event nobody caused.
  const { exec, calls } = gh({
    snapshot: [],
    runs: [{ databaseId: 1002, headSha: SHA, status: 'completed', conclusion: 'success' }],
    ready: { ok: true, stdout: '', stderr: '✓ Pull request #42 is already ready for review\n' },
  });

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
  });

  assert.equal(code, UNKNOWN, 'no event fired is not a red check');
  assert.match(out.text, /already ready/);
  assert.equal(calls.filter((call) => call.startsWith('run watch')).length, 0, 'nothing is watched');
  assert.equal(calls.filter((call) => call.startsWith('run view')).length, 0, 'and nothing is judged');
  assert.equal(
    calls.filter((call) => call.startsWith('run list')).length,
    2,
    'the fail-closed read and the floor read, and no poll after a ready that fired nothing',
  );
});

test('a floor that cannot be read once the draft exists refuses, and never marks it ready', async (t) => {
  const out = capture();
  const err = capture();
  // The fail-closed read succeeded, so a draft exists; the read that would bound the deciding event
  // failed. A draft never marked ready fires that event never, which is harmless: guessing is not.
  const { exec, calls } = gh({
    snapshot: [],
    floorOk: false,
    runs: [{ databaseId: 22, headSha: SHA, conclusion: 'success' }],
  });

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
  });

  assert.equal(code, UNKNOWN, 'a blind floor is unknown, never a failure');
  assert.ok(calls.some((call) => call.startsWith('pr create')), 'the draft exists by then');
  assert.ok(!calls.some((call) => call.startsWith('pr ready')), 'and it is deliberately not marked ready');
  assert.equal(calls.filter((call) => call.startsWith('run watch')).length, 0, 'and nothing is watched');
  assert.match(out.text, /was created and deliberately not marked ready/, 'the message says what happened');
  assert.doesNotMatch(err.text, /nothing was created/, 'this is not the pre-creation refusal');
});

test('a run that finished before the pull request was ready cannot decide it', async (t) => {
  const out = capture();
  const err = capture();
  const stale = { databaseId: 9, headSha: SHA, conclusion: 'success' };
  const { exec, calls } = gh({ floor: [stale], runs: [stale] });

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
  });

  assert.equal(code, UNKNOWN, 'the draft runs are not the deciding run');
  assert.equal(calls.filter((call) => call.startsWith('run watch')).length, 0, 'the stale run is never watched');
  assert.match(out.text, /no run of a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 appeared within 30s that the readiness event could have created; this is not a failure/);
});

test('a watch that runs out of time is unknown, never a failure', async (t) => {
  const out = capture();
  const err = capture();
  const { exec, calls } = gh({
    snapshot: [],
    runs: [{ databaseId: 22, headSha: SHA, status: 'in_progress', conclusion: null }],
    watch: { ok: false, timedOut: true },
  });

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
  });

  assert.equal(code, UNKNOWN, 'a timeout is not a red check');
  assert.equal(calls.filter((call) => call.startsWith('run view')).length, 0, 'an unfinished run has no conclusion to read');
  assert.match(out.text, /unknown — the run did not conclude within 30s; this is not a failure/);
});

test('a run that concluded failure exits 1 and still names the pull request', async (t) => {
  const out = capture();
  const err = capture();
  const { exec } = gh({
    snapshot: [],
    runs: [{ databaseId: 22, headSha: SHA, conclusion: 'failure' }],
    watch: { ok: false },
    conclusion: 'failure',
  });

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
  });

  assert.equal(code, RED);
  assert.match(out.text, /open-pr: run 22 {2}·/, 'the run id is printed');
  assert.match(out.text.trimEnd().split('\n').pop(), /failed$/);
  assert.match(out.text, /pull\/42 {2}· {2}failed/);
});

test('a cancelled run with a green matrix is unknown, never a failure', async (t) => {
  const out = capture();
  const err = capture();
  const { exec } = gh({
    snapshot: [],
    runs: [{ databaseId: 22, headSha: SHA, conclusion: 'cancelled' }],
    // The matrix is green and the summary is not: that disagreement is the whole point of the case.
    jobs: [{ name: 'test (ubuntu-24.04, 22)', conclusion: 'success' }],
    watch: { ok: false },
    conclusion: 'cancelled',
  });

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
  });

  // The matrix is the gate and its jobs are green; the summary disagreeing with it is the stale field
  // this tool exists to survive. Answering 1 here would say "it broke" about something that did not.
  assert.equal(code, UNKNOWN);
});

test('an incomplete command line says what is missing instead of creating anything', async () => {
  const out = capture();
  const err = capture();
  const { exec, calls } = gh();

  const code = await run({ argv: ['--title', 'no label'], exec, out, err });

  assert.equal(code, UNKNOWN);
  assert.match(err.text, /--body-file is required/);
  assert.match(err.text, /--label is required/);
  assert.match(err.text, /open-pr: node scripts\/open-pr\.js --base main/);
  assert.equal(calls.length, 0);
});

test('the suite is bounded, so a hung test cannot hold the ritual open', () => {
  const options = suiteOptions();

  // `node --test` on a test that opens a server and never closes it does not fail: it hangs. This
  // script exists so a turn is never lost to a wait that cannot end, and its own suite is a child.
  assert.equal(typeof options.timeout, 'number');
  assert.ok(options.timeout > 0, 'an unbounded suite is the eight-minute turn again');
  assert.equal(options.encoding, 'utf8');
});

test('the packed-set gate is bounded by a ceiling of its own', () => {
  const options = packOptions();

  // `npm pack` is the other child that can wait forever, on a cold cache or a held lock, and a ceiling
  // borrowed from the suite would either be wrong for it or shared with a step that is not it.
  assert.equal(typeof options.timeout, 'number');
  assert.ok(options.timeout > 0, 'an unbounded npm pack is the same hang one step later');
  assert.ok(options.timeout < suiteOptions().timeout, 'its own ceiling, not the suite\'s');
  assert.equal(options.encoding, 'utf8');
  assert.equal(options.cwd, suiteOptions().cwd, 'in the repository root, where the guard resolves `files`');
});

test('--help says how to use it and touches nothing', async () => {  const out = capture();
  const err = capture();
  const { exec, calls } = gh();

  const code = await run({ argv: ['--help'], exec, out, err, sleep: async () => {} });

  assert.equal(code, 0, 'asking how it works is not a failure');
  assert.match(out.text, /--body-file/, 'the options are named');
  assert.match(out.text, /--label/, 'including the one that travels in the creation');
  assert.equal(calls.length, 0, 'a question must not create anything');
  assert.equal(err.text, '');
});

test('every gh call is bounded, not only the watch', async (t) => {
  const out = capture();
  const err = capture();
  const { exec, seen } = gh({ snapshot: [], runs: [{ databaseId: 22, headSha: SHA, conclusion: 'success' }] });

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
  });

  assert.equal(code, GREEN, err.text);
  assert.ok(seen.length >= 4, `create, list, ready, watch and view all go through one child: ${seen.length}`);
  for (const options of seen) {
    // `argvFor` asks for `--timeout 30`, so the ceiling of every child is 30 s, not only the watch's.
    assert.equal(options?.timeoutMs, 30_000, 'the wait budget is the ceiling of every child');
  }
});

test('a run snapshot that cannot be read refuses before anything is created', async (t) => {
  const out = capture();
  const err = capture();
  const calls = [];
  const exec = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'run' && args[1] === 'list') return { ok: false, stdout: '', stderr: 'gh: not logged in' };
    return { ok: true, stdout: '', stderr: '' };
  };

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec,
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
  });

  // A list nobody could read cannot set the floor, so proceeding would let the `opened` run of this
  // same commit — which the creation itself fires — stand in for the run of the ready event.
  assert.equal(code, UNKNOWN, 'a blind floor is unknown, never a failure');
  assert.match(err.text, /the runs of this branch cannot be read/);
  assert.ok(!calls.some((call) => call.startsWith('pr create')), 'nothing is created on a blind snapshot');
});

test('a commit that cannot be resolved refuses and creates nothing', async (t) => {
  const out = capture();
  const err = capture();
  const { exec, calls } = gh();

  const code = await run({
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    exec,
    resolveSha: () => '',
    sleep: async () => {},
    out,
    err,
  });

  assert.equal(code, UNKNOWN);
  assert.match(err.text, /cannot be resolved/);
  assert.equal(calls.length, 0, 'the refusal comes before the first gh call');
});

/** The half of the ritual a case is not about, answered green: each case states only the step it is. */
function frontHalf(t, overrides) {
  const out = capture();
  const err = capture();
  const deps = {
    argv: argvFor(bodyFile(t, BODY)),
    suite: () => ({ ok: true, stdout: 'ℹ fail 0\n' }),
    pack: packGuard(PACK_GREEN),
    resolveSha: () => SHA,
    sleep: async () => {},
    out,
    err,
    ...overrides,
  };
  return { out, err, deps };
}

test('a poll that sees the draft run alone is not a decision, because the set grew', async (t) => {
  // The floor was read before the `opened` run was visible, so the first poll sees it alone and green;
  // the run the ready event fired appears while the second read is taken.
  const draft = { databaseId: 1001, headSha: SHA, status: 'completed', conclusion: 'success' };
  const deciding = { databaseId: 1002, headSha: SHA, status: 'in_progress', conclusion: null };
  const { exec, calls } = gh({ snapshot: [], runs: [[draft], [draft, deciding]] });
  const { out, deps } = frontHalf(t, { exec });
  assert.equal(await run(deps), UNKNOWN, 'the draft run alone is not what the ready event fired');
  assert.doesNotMatch(out.text, /passed/, 'never green, however green the draft run was');
  assert.match(out.text, /1001, 1002/, 'both ids are named, so the answer can be audited');
  assert.ok(!calls.some((call) => call.startsWith('run watch')), 'no run is watched on a set that did not hold still');
});

test('one run that is still the only one on the second read decides on the matrix', async (t) => {
  const deciding = { databaseId: 1002, headSha: SHA, status: 'completed', conclusion: 'success' };
  const { exec, calls } = gh({ snapshot: [], runs: [deciding] });
  const { out, err, deps } = frontHalf(t, { exec });
  assert.equal(await run(deps), GREEN, err.text);
  assert.equal(calls.filter((call) => call.startsWith('run list')).length, 4, 'the snapshot, the floor, two polls');
  assert.match(out.text, /·  passed/, 'the verdict comes from the matrix of that run');
});

test('a poll that does not answer ends the wait as unknown, and is not retried', async (t) => {
  const { exec: answered, calls } = gh({ snapshot: [] });
  let lists = 0;
  const exec = (args, options) => {
    if (args[0] === 'run' && args[1] === 'list') lists += 1;
    return lists > 2 ? { ok: false, stdout: '', stderr: '', timedOut: true } : answered(args, options);
  };
  const { out, deps } = frontHalf(t, { exec });
  assert.equal(await run(deps), UNKNOWN, 'a poll nobody answered is not a failed check');
  assert.match(out.text, /did not answer within its remaining budget/);
  assert.equal(lists, 3, 'not retried: a retry spends the budget of a poll that did answer');
});

test('a create or a ready that does not answer is unknown, never red', async (t) => {
  const { exec: answered } = gh();
  const hangCreate = (args, options) =>
    args[0] === 'pr' && args[1] === 'create' ? { ok: false, stdout: '', stderr: '', timedOut: true } : answered(args, options);
  const created = frontHalf(t, { exec: hangCreate });
  assert.equal(await run(created.deps), UNKNOWN, 'a create killed at its ceiling did not fail');
  assert.match(created.out.text, /create did not answer within its ceiling of 30s, so whether a draft was created cannot be told/);

  const { exec: readyAnswered } = gh({ snapshot: [] });
  const hangReady = (args, options) =>
    args[0] === 'pr' && args[1] === 'ready' ? { ok: false, stdout: '', stderr: '', timedOut: true } : readyAnswered(args, options);
  const readied = frontHalf(t, { exec: hangReady });
  assert.equal(await run(readied.deps), UNKNOWN, 'a ready killed at its ceiling did not fail');
  assert.match(readied.out.text, /ready 42 did not answer within its ceiling of 30s, so the draft .* was created and may or may not be ready/);
});

test('a suite or a packed set that does not answer is unknown, never red', async (t) => {
  const { exec, calls } = gh();
  const untested = frontHalf(t, { exec, suite: () => ({ ok: false, timedOut: true, stdout: 'ℹ fail 1\n' }) });
  assert.equal(await run(untested.deps), UNKNOWN, 'a suite killed at its ceiling did not fail');
  assert.match(untested.out.text, /the suite did not answer within its ceiling of 900s/);
  assert.equal(calls.length, 0, 'nothing is created on an answer nobody gave');

  const unpacked = frontHalf(t, { exec, pack: () => ({ ok: false, timedOut: true, stdout: 'pack-guard: still packing\n' }) });
  assert.equal(await run(unpacked.deps), UNKNOWN, 'a packed set killed at its ceiling did not fail');
  assert.match(unpacked.out.text, /did not answer within its ceiling of 120s/);
  assert.equal(calls.length, 0, 'still nothing is created');
});

test('the time of the readiness event is the last stamp the API printed', () => {
  // `gh api --paginate` runs its --jq over each page, so the newest event is the last line printed.
  assert.equal(readyEventTime('2026-01-01T00:00:00Z\n2026-01-01T00:05:00Z\n'), Date.parse('2026-01-01T00:05:00Z'));
  assert.equal(readyEventTime(''), null, 'a timeline with no readiness event says nothing');
  assert.equal(readyEventTime(null), null, 'and neither does a call that never answered');
  assert.equal(readyEventTime('not a time\n'), null);
});

test('the draft run is never the decision, however long it is alone', async (t) => {
  // The `opened` run carries this commit, has a smaller id and can be the only one visible for as long
  // as it likes; the stamp on the event is what says it did not decide.
  const draft = { databaseId: 7, headSha: SHA, createdAt: '2025-12-31T23:00:00Z' };
  const { exec, calls } = gh({ runs: [[draft]] });
  const half = frontHalf(t, { exec });

  const code = await run(half.deps);

  assert.equal(code, UNKNOWN, 'a run the event did not create decides nothing');
  assert.match(half.out.text, /no run of .* appeared within 30s that the readiness event could have created/);
  assert.ok(!calls.some((call) => call.startsWith('run watch')), 'and it is never watched');
});

test('the deciding run is the one the event created, when it appears later', async (t) => {
  const draft = { databaseId: 7, headSha: SHA, createdAt: '2025-12-31T23:00:00Z' };
  const decided = { databaseId: 9, headSha: SHA, createdAt: '2026-01-01T00:10:00Z' };
  const { exec, calls } = gh({ runs: [[draft], [draft], [decided]] });
  const half = frontHalf(t, { exec });

  const code = await run(half.deps);

  assert.equal(code, GREEN, half.err.text);
  assert.ok(calls.some((call) => /^run watch 9 /.test(call)), `the deciding run is watched: ${calls.join(' | ')}`);
  assert.ok(!calls.some((call) => /^run watch 7 /.test(call)), 'the draft run is not');
});

test('a readiness event whose time cannot be read leaves the run unwatched', async (t) => {
  const { exec, calls } = gh({ readyAt: null });
  const half = frontHalf(t, { exec });

  const code = await run(half.deps);

  assert.equal(code, UNKNOWN, 'a run nobody can attribute is not a verdict');
  assert.match(half.out.text, /the time of that event cannot be read/);
  assert.ok(calls.some((call) => call.startsWith('pr ready')), 'the pull request was marked ready');
  assert.ok(!calls.some((call) => call.startsWith('run watch')), 'and deliberately not watched');
});
