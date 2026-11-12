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
 * served: the first is the floor read taken before anything is created, and every later one is a poll
 * of the run the creation fired.
 *
 * `runs` is either the one answer every poll gets, or one answer per poll, the last one repeating:
 * `[[], [decided]]` is a run that is not visible yet and then is.
 */
function gh({ create = 'https://github.com/MaxGB23/funky-forge/pull/42\n', snapshot = [], runs = [], floorRead = null, conclusion = 'success', jobs = null, watch = {}, views = {} } = {}) {
  const calls = [];
  const seen = [];
  // What the API has said about each run id so far, so `run view` answers what the list said about that
  // run: a run whose status is in progress is not a concluded run merely because a view was asked.
  const known = new Map();
  let lists = 0;

  const poll = (index) => {
    if (typeof runs === 'function') return runs(index);
    if (!Array.isArray(runs) || runs.length === 0) return [];
    if (!Array.isArray(runs[0])) return runs;
    return runs[Math.min(index, runs.length - 1)];
  };

  const remember = (list) => {
    if (Array.isArray(list)) for (const run of list) known.set(String(run?.databaseId), run);
    return list;
  };

  const exec = (args, options) => {
    calls.push(args.join(' '));
    seen.push(options);
    const [group, action] = args;

    if (group === 'pr' && action === 'create') return { ok: true, stdout: create, stderr: '' };
    if (group === 'run' && action === 'list') {
      lists += 1;
      // The first read is the floor, taken before a pull request exists; a non-null `floorRead` is that
      // read failing, which is a refusal and not a pull request to repair afterwards.
      if (lists === 1) {
        return floorRead === null
          ? { ok: true, stdout: JSON.stringify(remember(snapshot)), stderr: '' }
          : { ok: false, stdout: '', stderr: 'gh: not logged in' };
      }
      return { ok: true, stdout: JSON.stringify(remember(poll(lists - 2))), stderr: '' };
    }
    if (group === 'run' && action === 'watch') {
      return { ok: watch.ok ?? true, timedOut: watch.timedOut === true, stdout: '', stderr: '' };
    }
    if (group === 'run' && action === 'view') {
      // The matrix travels with the answer: the verdict is read from the jobs, so a stub without them
      // is a run nobody can judge, and that is exactly what the gate refuses to call green. A run's
      // status is the one the list reported for it, unless the case names its own answer.
      const id = String(args[2]);
      const answer = { ...(known.get(id) ?? {}), ...(views[id] ?? {}) };
      const settled = answer.status ?? 'completed';
      const jobList =
        answer.jobs ?? jobs ?? [{ name: 'test', conclusion: answer.conclusion ?? conclusion }];
      return {
        ok: true,
        stdout: JSON.stringify({
          status: settled,
          conclusion: answer.conclusion ?? (settled === 'completed' ? conclusion : null),
          jobs: jobList.map((job) => ({ ...job })),
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

test('creates the pull request ready and returns the run of this commit', async (t) => {
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
  assert.doesNotMatch(created, /--draft/, 'created ready: one event, so one run to watch');
  assert.match(created, /--base main/);
  assert.match(created, /--head feat\/open-pr/);
  assert.match(created, /--body-file /);
  assert.doesNotMatch(created, /--repo/, 'no repository is named, so gh cannot be pointed at another one');

  assert.ok(!calls.some((call) => call.startsWith('pr ready')), 'no readiness step, so no second event to attribute');

  const viewed = calls.find((call) => call.startsWith('run view'));
  assert.match(viewed, /^run view 22 /, 'the run of this commit, never the newest run of the branch');
  assert.ok(!calls.some((call) => call.startsWith('run watch')), 'a run that already concluded is not waited for');

  assert.match(out.text, /https:\/\/github\.com\/MaxGB23\/funky-forge\/pull\/42/, 'the URL is printed');
  assert.match(out.text, /open-pr: run 22 {2}·/, 'the run id is printed');
  assert.match(out.text.trimEnd().split('\n').pop(), /passed$/);
  assert.match(out.text, /^ {2}test: success$/m, 'the matrix is printed, so the verdict can be audited');
  assert.match(out.text, /pull\/42 {2}· {2}passed/, 'the verdict is printed');
});

test('the two runs the creation fires are both green, and every id is printed', async (t) => {
  // `gh pr create --label` fires `opened` and `labeled` of this commit, so two runs past the floor are
  // the ordinary answer. Neither the count nor the API names the action behind a run, so none is
  // chosen: the set is green when all of it is.
  const opened = { databaseId: 1001, headSha: SHA, status: 'completed', conclusion: 'success' };
  const labeled = { databaseId: 1002, headSha: SHA, status: 'completed', conclusion: 'success' };
  const { exec, calls } = gh({ snapshot: [], runs: [[], [labeled, opened]] });
  const { out, err, deps } = frontHalf(t, { exec });

  assert.equal(await run(deps), GREEN, err.text);
  assert.match(out.text, /open-pr: run 1002 {2}· {2}passed/, 'the first id of the set is printed');
  assert.match(out.text, /open-pr: run 1001 {2}· {2}passed/, 'and the second, so the set can be audited');
  assert.match(out.text.trimEnd().split('\n').pop(), /pull\/42 {2}· {2}passed/);
  assert.equal(calls.filter((call) => call.startsWith('run watch')).length, 0, 'both concluded: nothing to wait for');
});

test('a red run in the set wins over a run that is still going', async (t) => {
  // Any red wins: the set does not have to be finished to know the outcome, and waiting for the other
  // run would only delay a verdict that cannot change.
  const failed = { databaseId: 1002, headSha: SHA, status: 'completed', conclusion: 'failure' };
  const running = { databaseId: 1003, headSha: SHA, status: 'in_progress', conclusion: null };
  const { exec, calls } = gh({ snapshot: [], runs: [[], [running, failed]] });
  const { out, err, deps } = frontHalf(t, { exec });

  assert.equal(await run(deps), RED);
  assert.match(out.text, /open-pr: run 1002 {2}· {2}failed — 1 job\(s\) outside success/, 'the failing run is named, with its reason');
  assert.match(out.text, /open-pr: run 1003 {2}· {2}unknown/, 'and the run still going is reported, never hidden');
  assert.equal(calls.filter((call) => call.startsWith('run watch')).length, 0, 'no watch delays a red that is already known');
  assert.equal(err.text, '');
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
  const viewed = greenGh.calls.find((call) => call.startsWith('run view'));
  assert.match(String(viewed), /^run view 1002 /, 'the run past the floor, never the one at it');
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
  assert.match(String(redGh.calls.find((call) => call.startsWith('run view'))), /^run view 1002 /);
  assert.ok(!redGh.calls.some((call) => call.startsWith('run watch')), 'a concluded red is never waited for');
});

test('a set still growing when the budget runs out is unknown, and names what it saw', async (t) => {
  // The set decides once it holds still. One that is still growing has not been read whole, so no
  // verdict covers it: exit 2, naming the ids that were seen so the answer can be audited.
  const { exec, calls } = gh({
    snapshot: [],
    runs: (index) => [{ databaseId: 1002 + index, headSha: SHA, status: 'completed', conclusion: 'success' }],
  });
  const { out, deps } = frontHalf(t, { exec });

  assert.equal(await run(deps), UNKNOWN, 'a set nobody could read whole is a question, not a verdict');
  assert.match(
    out.text,
    /were still growing when the budget ran out \(1002, 1003, 1004, 1005, 1006, 1007\)/,
    'every id that was seen is named',
  );
  assert.doesNotMatch(out.text, /·  passed/, 'never green on a set that was still changing');
  assert.equal(calls.filter((call) => call.startsWith('run watch')).length, 0, 'nothing is watched on a set that is not whole');
});

test('a floor that cannot be read refuses before anything is created, so nothing was created', async (t) => {
  const out = capture();
  const err = capture();
  // Nothing exists yet when the floor is read, so a read that cannot answer is a refusal and not a pull
  // request to repair: an unreadable floor means the run of the single event this command fires cannot
  // be told from what is already there, and the command stops before `pr create`.
  const { exec, calls } = gh({ floorRead: 'gh: not logged in' });

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

  assert.equal(code, 2, 'a blind floor is exit 2, never a failure');
  assert.match(
    err.text,
    /^open-pr: refusing: the runs of this branch cannot be read, so no floor can be taken, and nothing was created$/m,
    'the refusal says what could not be read and what it means',
  );
  assert.match(err.text, /nothing was created/, 'and that the repository is untouched');
  assert.ok(!calls.some((call) => call.startsWith('pr create')), 'nothing is created on a blind floor');
  assert.equal(calls.filter((call) => call.startsWith('run list')).length, 1, 'the read that failed, and no poll');
  assert.equal(calls.filter((call) => call.startsWith('run watch')).length, 0, 'and nothing is watched');
  assert.match(out.text, /suite green/, 'the steps before it ran and said so');
  assert.doesNotMatch(out.text, /https:\/\/github\.com/, 'no pull request URL is printed, because none exists');
});

test('the floor is read before the pull request is created', async (t) => {
  const { exec, calls } = gh({
    snapshot: [{ databaseId: 9, headSha: SHA, status: 'completed', conclusion: 'success' }],
    runs: [{ databaseId: 22, headSha: SHA, status: 'completed', conclusion: 'success' }],
  });
  const { out, err, deps } = frontHalf(t, { exec });

  assert.equal(await run(deps), GREEN, err.text);

  const listed = calls.findIndex((call) => call.startsWith('run list'));
  const created = calls.findIndex((call) => call.startsWith('pr create'));
  assert.equal(listed, 0, 'the floor is the first thing asked of gh');
  assert.ok(created > listed, `the creation comes after the floor: ${calls.join(' | ')}`);
  assert.match(out.text, /open-pr: run 22 {2}·/);
});

test('a run of this commit that existed before the creation stays behind the floor', async (t) => {
  const out = capture();
  const err = capture();
  // The branch was pushed before this ritual ran, so the commit already has a run and it is visible to
  // the floor read. It is the floor: the one event this command fires cannot have fired it, and however
  // long it stays the only run of this commit it is never the decision.
  const earlier = { databaseId: 9, headSha: SHA, conclusion: 'success' };
  const { exec, calls } = gh({ snapshot: [earlier], runs: [earlier] });

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

  assert.equal(code, UNKNOWN, 'a run that was already there is not the one the creation fired');
  assert.equal(calls.filter((call) => call.startsWith('run watch')).length, 0, 'the earlier run is never watched');
  assert.match(out.text, /no run of a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 appeared within 30s that the creation could have fired; this is not a failure/);
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
  assert.equal(calls.filter((call) => call.startsWith('run view')).length, 1, 'the run answers once, as unfinished');
  assert.match(
    String(calls.find((call) => call.startsWith('run watch'))),
    /^run watch 22 --exit-status --interval 15$/,
    'the unfinished run is what is waited for, and the wait is bounded by the interval',
  );
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

test('a set that grew between two reads is read again, and decides once it holds still', async (t) => {
  // A run of this commit existed before the floor was taken but was not visible to it, so the first read
  // sees one run; the run the creation fired appears while the second read is taken. Growth is answered
  // with another read, not with a refusal.
  const earlier = { databaseId: 1001, headSha: SHA, status: 'completed', conclusion: 'success' };
  const later = { databaseId: 1002, headSha: SHA, status: 'completed', conclusion: 'failure' };
  const { exec, calls } = gh({ snapshot: [], runs: [[earlier], [earlier, later]] });
  const { out, err, deps } = frontHalf(t, { exec });
  assert.equal(await run(deps), RED, 'the set decides by its contents once it holds still');
  assert.match(out.text, /open-pr: run 1001 {2}· {2}passed/, 'the run that was already there is read too');
  assert.match(out.text, /open-pr: run 1002 {2}· {2}failed/, 'and the one the creation fired decides the set');
  assert.equal(calls.filter((call) => call.startsWith('run watch')).length, 0, 'both concluded: nothing to wait for');
  assert.equal(err.text, '');
});

test('one run that is still the only one on the second read decides on the matrix', async (t) => {
  const deciding = { databaseId: 1002, headSha: SHA, status: 'completed', conclusion: 'success' };
  const { exec, calls } = gh({ snapshot: [], runs: [deciding] });
  const { out, err, deps } = frontHalf(t, { exec });
  assert.equal(await run(deps), GREEN, err.text);
  assert.equal(calls.filter((call) => call.startsWith('run list')).length, 3, 'the floor read and the two polls');
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

test('a create that does not answer is unknown, never red', async (t) => {
  // `gh pr create` is the event the run belongs to, so a creation killed at its ceiling may or may not
  // have happened: the only honest answer names both ways out and never claims a failure.
  const { exec: answered } = gh();
  const hangCreate = (args, options) =>
    args[0] === 'pr' && args[1] === 'create' ? { ok: false, stdout: '', stderr: '', timedOut: true } : answered(args, options);
  const created = frontHalf(t, { exec: hangCreate });
  assert.equal(await run(created.deps), UNKNOWN, 'a create killed at its ceiling did not fail');
  assert.match(
    created.out.text,
    /create did not answer within its ceiling of 30s, so whether a pull request was created cannot be told/,
  );
  assert.match(created.out.text, /check gh pr list --head feat\/open-pr/, 'and the command that settles it');
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

test('the deciding run is the one the creation fired, when it appears later', async (t) => {
  // The commit already has a run of an earlier push, and the floor hides it. The run this creation
  // fired is not visible on the first poll: it surfaces one interval later, alone past the floor, and
  // that one is read, because the run behind the floor can never be the one the creation fired.
  const earlier = { databaseId: 7, headSha: SHA, status: 'completed', conclusion: 'success' };
  const decided = { databaseId: 9, headSha: SHA, status: 'completed', conclusion: 'success' };
  const { exec, calls } = gh({ snapshot: [earlier], runs: [[earlier], [earlier, decided]] });
  const half = frontHalf(t, { exec });

  const code = await run(half.deps);

  assert.equal(code, GREEN, half.err.text);
  assert.ok(calls.some((call) => /^run view 9 /.test(call)), `the run the creation fired is the one read: ${calls.join(' | ')}`);
  assert.ok(!calls.some((call) => /^run (view|watch) 7 /.test(call)), 'the run behind the floor is never read');
  assert.match(half.out.text, /open-pr: run 9 {2}· {2}passed/);
});
