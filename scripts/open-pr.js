/**
 * Opens a pull request through the whole ritual, in one command, because the ritual has more steps
 * than the mistake and gets skipped.
 *
 * Five round trips were lost in one day to the same class of mistake: a pull request opened without its
 * label, so the `opened` run reads `PR_LABELS` empty; a `gh run rerun --failed` that replays the frozen
 * event payload and fails identically; a wait loop keyed on the branch, so it answers with an earlier
 * commit's run; and a branch pushed with a suite that does not parse. Every one of those is cheap to
 * prevent and easy to forget, so the order lives here instead: the suite, the packed set, the policy, a
 * labelled ready pull request, and then the run of *this* commit.
 *
 * The creation is not a draft followed by a readiness: a draft fires a run and the readiness fires another
 * of the same commit, and GitHub carries no field naming the action that fired one. It is not one event
 * either — the workflow triggers on `labeled` and the label travels in the creation, so
 * `gh pr create --label` fires `opened` and `labeled` of this commit, two runs. Neither the count nor the
 * API says which run belongs to which action, so no run is chosen: every run past the floor is a
 * candidate, the set is polled until it stops growing, and the set decides — any red wins, an all-green
 * set is green, and a set with a run still going is unknown. The trigger list is not narrowed for it:
 * `labeled` is a real guard for a hand-made pull request.
 *
 * The decisions are pure functions and every `gh` invocation goes through one injected `exec`, so the
 * tests read a verdict without a network, a repository or a pull request.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { run as runPolicy } from './check-pr-policy.js';
import { decideGate } from './wait-for-ci.js';

/** The three exits: the run passed, it failed, and nobody can say yet. `2` is never a failure. */
export const GREEN = 0;
export const RED = 1;
export const UNKNOWN = 2;

export const USAGE =
  'node scripts/open-pr.js --base main --title "<title>" --body-file <path> --label <type:...> ' +
  '[--head <branch>] [--repo <owner/name>] [--timeout <seconds>]';

const DEFAULT_TIMEOUT_SECONDS = 600;
const DEFAULT_INTERVAL_SECONDS = 15;
const RUN_FIELDS = 'databaseId,headSha,status,conclusion';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
/**
 * The gate `npm run pack:check` runs, named as a path from the root rather than as a script name, and
 * run through `process.execPath`: `npm` is not an executable on Windows without a shell, and a shell
 * here buys quoting bugs for a command with no arguments.
 */
const PACK_SCRIPT = 'scripts/pack-guard.js';

/**
 * The command line as options and the reasons it cannot run, so a missing `--label` is one line
 * instead of a pull request created without it.
 *
 * @param {string[]} [argv]
 * @returns {{ options: { base: string, title: string|null, bodyFile: string|null, label: string|null, head: string|null, repo: string|null, timeout: number }, problems: string[] }}
 */
export function parseArgs(argv = []) {
  const options = {
    base: 'main',
    title: null,
    bodyFile: null,
    label: null,
    head: null,
    repo: null,
    timeout: DEFAULT_TIMEOUT_SECONDS,
  };
  const problems = [];

  // Asking how it works is not a malformed command line: it answers 0 and creates nothing.
  if (argv.includes('--help') || argv.includes('-h')) return { options, problems, help: true };

  const known = new Set(['base', 'title', 'body-file', 'label', 'head', 'repo', 'timeout']);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index]);
    if (!argument.startsWith('--')) {
      problems.push(`unexpected argument "${argument}"`);
      continue;
    }

    const name = argument.slice(2);
    if (!known.has(name)) {
      problems.push(`unknown option "--${name}"`);
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || String(value).startsWith('--')) {
      problems.push(`--${name} needs a value`);
      continue;
    }
    index += 1;

    if (name === 'timeout') {
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        problems.push(`--timeout takes a positive number of seconds, not "${value}"`);
        continue;
      }
      options.timeout = seconds;
      continue;
    }

    if (name === 'body-file') options.bodyFile = String(value);
    else options[name] = String(value);
  }

  if (options.title === null) problems.push('--title is required');
  if (options.bodyFile === null) problems.push('--body-file is required');
  if (options.label === null) problems.push('--label is required: it travels in the creation');

  return { options, problems };
}

/**
 * What one conclusion means, in the only three answers worth printing. A run that was cancelled, timed
 * out or skipped is not a verdict on the code, so it is unknown rather than failed: collapsing the two
 * is what makes a green run look broken.
 *
 * @param {{ conclusion?: string|null } | null} run
 * @returns {{ code: number, state: 'passed'|'failed'|'unknown', reason: string }}
 */
export function decideVerdict(answer) {
  // The gate is the matrix, not the run's summary, and it is the same function `wait-for-ci` uses: a
  // run that says success while a job failed is exactly the reading that makes a red check look green,
  // and two copies of that rule is how two answers drift (I-64). This module keeps no rule of its own.
  return decideGate({ run: answer, jobs: answer?.jobs ?? [] });
}

/**
 * The floor of one commit's run ids: the greatest `databaseId` among the runs of that commit, or `0` when
 * the branch has none.
 *
 * `databaseId` is global and monotone by creation, so the run of an event fired after this floor was
 * taken has a greater id, whether or not the API has made it visible when the floor is read. That is
 * exactly what a set of ids cannot say: a set that already existed can grow after it is read, and the
 * `opened` event of `gh pr create --draft` carries this same commit, so a set would have to decide the
 * race it cannot see. One number cannot.
 *
 * @param {Array<{ databaseId?: number|string, headSha?: string }>} runs
 * @param {string} sha
 * @returns {number}
 */
export function floorOf(runs, sha) {
  if (!Array.isArray(runs)) return 0;

  let floor = 0;
  for (const run of runs) {
    if (run?.headSha !== sha) continue;
    const id = Number(run.databaseId);
    if (Number.isFinite(id) && id > floor) floor = id;
  }

  return floor;
}

/**
 * The runs of one commit whose id is past the floor: the only ones that can belong to an event fired
 * after it was taken. Never the newest run of the branch: `gh run list --branch` answers the newest run
 * first, and while the run for the new commit is still queued that answer belongs to the previous one.
 *
 * Zero, one, or several of them. Several is the ordinary answer rather than a choice to make: the API
 * says nothing about which event fired which run, so none is picked and the set decides by its contents.
 *
 * @param {Array<{ databaseId?: number|string, headSha?: string }>} runs
 * @param {string} sha
 * @param {number} [floor]
 * @returns {Array<{ databaseId?: number|string, headSha?: string }>}
 */
export function runsPastFloor(runs, sha, floor = 0) {
  if (!Array.isArray(runs)) return [];

  const base = Number.isFinite(Number(floor)) ? Number(floor) : 0;
  return runs.filter((run) => {
    if (run?.headSha !== sha) return false;
    const id = Number(run.databaseId);
    return Number.isFinite(id) && id > base;
  });
}

/**
 * The URL `gh pr create` prints and the number at its end. Both come from the creation itself, so the
 * steps that follow cannot act on a different pull request.
 *
 * @param {string} stdout
 * @returns {{ url: string, number: number } | null}
 */
export function pullRequestFrom(stdout) {
  const match = /https?:\/\/\S+\/pull\/(\d+)/.exec(typeof stdout === 'string' ? stdout : '');
  return match === null ? null : { url: match[0], number: Number(match[1]) };
}

/**
 * The pull request of one head, from `gh pr list --head <head> --json number,url,headRefOid`. `--head` is
 * exact, so several rows are one head in several states, and it matches a branch name alone: a fork pull
 * request carrying the same name answers here too. What makes a row the pull request an interrupted
 * ritual left behind is that it sits at the commit under test, so a row at another commit — or at a
 * commit that cannot be read — is reported apart instead of being adopted.
 *
 * @param {string} stdout
 * @param {string} sha the commit the pull request must be at
 * @returns {{ pullRequest: { url: string, number: number } | null, elsewhere: { url: string, headRefOid: string|null } | null }}
 */
export function openPullRequestFrom(stdout, sha) {
  const rows = parseJson(stdout);
  if (!Array.isArray(rows)) return { pullRequest: null, elsewhere: null };

  const usable = rows.filter(
    (entry) => Number.isFinite(Number(entry?.number)) && typeof entry?.url === 'string',
  );
  const mine = usable.find((entry) => entry?.headRefOid === sha);
  if (mine !== undefined) {
    return { pullRequest: { url: mine.url, number: Number(mine.number) }, elsewhere: null };
  }
  if (usable.length === 0) return { pullRequest: null, elsewhere: null };

  const at = usable.find((entry) => typeof entry?.headRefOid === 'string' && entry.headRefOid !== '');
  return { pullRequest: null, elsewhere: { url: usable[0].url, headRefOid: at?.headRefOid ?? null } };
}

/**
 * Asks `gh` which pull request this head already has, keeping "there is none" apart from "nobody could
 * tell": collapsing the two turns a pull request that exists into a duplicate one.
 *
 * @param {(args: string[]) => { ok: boolean, stdout: string, stderr?: string }} gh
 * @param {{ head: string, repo?: string|null, sha: string }} options
 * @returns {{ pullRequest: { url: string, number: number } | null, elsewhere: { url: string, headRefOid: string|null } | null, problem: string | null }}
 */
function listOpenPullRequest(gh, { head, repo = null, sha }) {
  const listed = gh(withRepo(repo, ['pr', 'list', '--head', head, '--json', 'number,url,headRefOid']));
  if (listed?.ok !== true) {
    const detail = String(listed?.stderr ?? '').trim().split('\n')[0];
    return {
      pullRequest: null,
      elsewhere: null,
      problem:
        detail === ''
          ? 'the pull request of this head cannot be read'
          : `the pull request of this head cannot be read: ${detail}`,
    };
  }

  return { ...openPullRequestFrom(listed?.stdout, sha), problem: null };
}

/**
 * How many tests failed, from the reporter's own summary. Both reporters this suite can emit are read:
 * the spec reporter writes `ℹ fail 2` and TAP writes `# fail 2`. A suite that died before it could
 * summarize answers `null`, which still refuses.
 *
 * @param {string} output
 * @returns {number | null}
 */
export function failingCount(output) {
  const match = /^(?:ℹ|#) fail (\d+)$/m.exec(typeof output === 'string' ? output : '');
  return match === null ? null : Number(match[1]);
}

/**
 * Polls for the runs of this commit past the floor until the set of them stops growing or the attempts run
 * out. The bound is a count of attempts rather than a clock, so a test drives it without waiting.
 *
 * A set is not a choice. The floor was read before the creation, so a run of this commit from an earlier
 * push is behind it; but a run that existed and was not visible at that moment can surface afterwards,
 * and `gh pr create --label` fires two events of the same commit, so more than one run past the floor is
 * the ordinary answer. Neither the count nor the API names the action behind a run, so the question
 * "which one" has no answer and does not have to be answered: the set decides by its contents. It is
 * read only once a second read agrees with the first, because a set that grew between two reads is not
 * the whole set yet.
 *
 * @param {{ exec: Function, head: string, repo?: string|null, sha: string, floor?: number, sleep: (ms: number) => Promise<void>, timeoutSeconds?: number, intervalSeconds?: number }} options
 * @returns {Promise<{ candidates: Array<object>, sha: string, spentSeconds: number, timedOut: boolean, unstable: string[] }>}
 */
export async function findRun({
  exec,
  head,
  repo = null,
  sha,
  floor = 0,
  sleep,
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  intervalSeconds = DEFAULT_INTERVAL_SECONDS,
  remainingMs = null,
}) {
  const interval = Math.max(1, intervalSeconds);
  const attempts = Math.max(0, Math.ceil(Math.max(1, timeoutSeconds) / interval));

  // What the wait has spent, so a poll is bounded by what is left of the budget, not by the whole of it.
  const started = Date.now();
  const spent = () => Math.min(timeoutSeconds, (Date.now() - started) / 1000);
  // One deadline belongs to the whole ritual, so a poll that stalls cannot spend again what an earlier
  // child already spent: when the caller owns that deadline, its remaining milliseconds bound the poll.
  const pollBudgetMs = () =>
    typeof remainingMs === 'function'
      ? remainingMs()
      : Math.max(1, Math.ceil(timeoutSeconds - spent())) * 1000;
  const poll = () => {
    const { runs, timedOut } = listRuns(exec, { head, repo, timeoutMs: pollBudgetMs() });
    return { candidates: runs === null ? [] : runsPastFloor(runs, sha, floor), timedOut };
  };
  const done = (fields) =>
    ({ candidates: [], sha, spentSeconds: spent(), timedOut: false, unstable: [], ...fields });
  const idsOf = (runs) => runs.map((run) => String(run.databaseId));
  let grown = [];

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    const first = poll();
    // A poll nobody answered ends the wait: it is evidence of nothing, and a retry spends the budget of
    // the poll that did answer.
    if (first.timedOut === true) return done({ timedOut: true });
    if (first.candidates.length > 0) {
      await sleep(interval * 1000);
      const second = poll();
      if (second.timedOut === true) return done({ timedOut: true });
      // The set held still, so it is the whole set. How many runs it holds is not the question: what
      // they concluded is, and that is read over all of them.
      if (idsOf(first.candidates).join(',') === idsOf(second.candidates).join(',')) {
        return done({ candidates: second.candidates });
      }
      // It grew while it was read, so a third read is owed, not a refusal.
      grown = [...new Set([...grown, ...idsOf(first.candidates), ...idsOf(second.candidates)])];
    }

    if (attempt < attempts) await sleep(interval * 1000);
  }

  // Still growing when the budget ran out: the ids that were seen are named, because a set nobody could
  // read whole is a question and not a verdict.
  return done({ unstable: grown });
}

/**
 * A child that reached its ceiling did not fail: it did not answer, so the state it left behind is named
 * and the answer is unknown rather than red.
 */
function unanswered(stream, step, ceiling, left) {
  stream.write(`open-pr: unknown — ${step} did not answer within ${ceiling}, so ${left}; this is not a failure\n`);
  return UNKNOWN;
}

/**
 * The command line, and the ritual it refuses to skip.
 *
 * @param {{ argv?: string[], exec?: Function, suite?: () => { ok: boolean, stdout: string }, pack?: () => { ok: boolean, stdout: string } | null, resolveHead?: () => string, resolveSha?: () => string, remoteSha?: (head: string, options?: { timeoutMs?: number }) => { ok: boolean, sha: string }, now?: () => number, sleep?: (ms: number) => Promise<void>, out?: { write: Function }, err?: { write: Function } }} [deps]
 * @returns {Promise<number>}
 */
export async function run(deps = {}) {
  const argv = deps.argv ?? process.argv.slice(2);
  const out = deps.out ?? process.stdout;
  const err = deps.err ?? process.stderr;
  const exec = deps.exec ?? defaultExec;
  const suite = deps.suite ?? defaultSuite;
  const pack = deps.pack ?? defaultPack;
  const resolveHead = deps.resolveHead ?? defaultResolveHead;
  const resolveSha = deps.resolveSha ?? defaultResolveSha;
  const remoteSha = deps.remoteSha ?? defaultRemoteSha;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  const { options, problems, help } = parseArgs(argv);
  if (help === true) {
    out.write(`open-pr: ${USAGE}\n`);
    return 0;
  }

  if (problems.length > 0) {
    for (const problem of problems) err.write(`open-pr: ${problem}\n`);
    err.write(`open-pr: ${USAGE}\n`);
    err.write('open-pr: nothing was created\n');
    return UNKNOWN;
  }

  // The head branch is resolved once and passed everywhere else, so the policy check, the creation and
  // the run lookup cannot disagree about which branch this is.
  const head = options.head ?? resolveHead();
  if (typeof head !== 'string' || head === '') {
    err.write('open-pr: the head branch is unknown (detached HEAD): pass --head <branch>\n');
    return UNKNOWN;
  }

  // One deadline, taken before the first child of all — the suite included, because a step outside the
  // budget makes `--timeout` a promise about one phase instead of about the turn. Before this the floor
  // read, the creation and the wait each took the full number and every `run view` inside the wait took
  // it again, so a declared ten minutes could hold the ritual open for forty. A child that stalls holds
  // the ritual open exactly as a watch does, and a stalled child does not fail: it hangs.
  let deadline = null;
  const budget = () => (deadline ??= now() + options.timeout * 1000);
  const remainingMs = () => Math.max(1000, budget() - now());
  const remainingSeconds = () => Math.max(1, Math.round((budget() - now()) / 1000));
  // A step keeps its own ceiling while there is room for it and is cut to what is left when there is
  // not: the ceiling says what the step may take, the budget says what the turn may.
  const ceiling = (own) => Math.min(own, remainingMs());
  // What the last child was actually handed, so a ceiling that was reached is named as it was given and
  // not as the declared number.
  let lastCeilingMs = 1000;
  const gh = (args) => {
    lastCeilingMs = remainingMs();
    return exec(args, { timeoutMs: lastCeilingMs });
  };

  // 1. The suite. A branch that does not parse is cheaper to fix here than in a run nobody watches. A
  // child killed at its ceiling did not fail; it did not answer.
  const suiteCeilingMs = ceiling(SUITE_TIMEOUT_MS);
  const tested = suite({ timeoutMs: suiteCeilingMs });
  if (tested?.timedOut === true) return unanswered(out, 'the suite', `its ceiling of ${Math.round(suiteCeilingMs / 1000)}s`, 'nothing was created and its verdict is unknown');
  if (!tested.ok) {
    const count = failingCount(tested.stdout);
    const named = count === null ? '' : ` (${count} failing test${count === 1 ? '' : 's'})`;
    err.write(`open-pr: refusing: the suite is red${named}, so nothing was created\n`);
    err.write('open-pr: run node --test and fix it first\n');
    return RED;
  }
  out.write('open-pr: suite green\n');

  // 2. The packed set, through the gate `npm run pack:check` runs. A branch can be green and still
  // publish a tarball that leaks a file or misses one the `files` contract promised, and that one is
  // found after publication if it is found at all. The gate names itself and its own command: a
  // refusal that reuses another step's words cannot be told apart from that step's.
  const packCeilingMs = ceiling(PACK_TIMEOUT_MS);
  const packed = pack({ timeoutMs: packCeilingMs });
  if (packed?.timedOut === true) return unanswered(out, `the packed-set gate (${PACK_SCRIPT})`, `its ceiling of ${Math.round(packCeilingMs / 1000)}s`, 'nothing was created and its verdict is unknown');
  if (packed !== null && packed.ok !== true) {
    err.write(`open-pr: refusing: the packed-set gate (${PACK_SCRIPT}) is red, so nothing was created\n`);
    // The gate's own words, because "the packed set is not the files contract" means nothing without
    // the path that broke it, and the gate is the one place that knows which.
    if (typeof packed.stdout === 'string' && packed.stdout.trim() !== '') {
      err.write(`${packed.stdout.trim()}\n`);
    }
    err.write(`open-pr: run node ${PACK_SCRIPT} and fix it first\n`);
    return RED;
  }
  // A repository with no guard to run is not refused for it: the step is skipped silently.
  if (packed !== null) out.write('open-pr: packed set green\n');

  // 3. The policy, through the same function CI runs: its message is the failure message, and a
  // reminder here would be a second description of the rule that can drift from the first.
  let body;
  try {
    body = readFileSync(options.bodyFile, 'utf8');
  } catch (error) {
    err.write(`open-pr: cannot read --body-file ${options.bodyFile}: ${error.message}\n`);
    return UNKNOWN;
  }

  const refused = runPolicy({ PR_BODY: body, PR_LABELS: options.label, PR_HEAD_REF: head }, out, err);
  if (refused !== 0) {
    err.write('open-pr: refusing: the policy refuses this pull request, so nothing was created\n');
    return RED;
  }

  // The commit is resolved from the head branch, not from this checkout. `--head other` used to be
  // created for `other` and then waited on the commit of the working tree, so the run it looked for
  // belonged to a branch nobody had asked about: the wait spent its whole budget and answered unknown.
  const sha = resolveSha(head);
  if (typeof sha !== 'string' || sha === '') {
    err.write(
      `open-pr: refusing: the commit of ${head} cannot be resolved, so no run could be matched to it, and nothing was created\n`,
    );
    return UNKNOWN;
  }

  // The commit of the branch on origin, before anything is created. The wait looks for a run of the
  // commit in front of you, and a run belongs to the commit origin has: when the branch was pushed from
  // elsewhere, or the remote cannot be read, the run this command wants can never be matched, and the
  // measured cost of finding out through the wait was 10m 50s and a `2` whose reason was true and
  // useless. Both commits are named, because the reading is the action.
  const remote = remoteSha(head, { timeoutMs: remainingMs() });
  if (remote?.ok !== true) {
    err.write(
      `open-pr: refusing: the commit of origin/${head} cannot be read, so whether this branch is the commit in front of you is unknown; nothing was created\n`,
    );
    return UNKNOWN;
  }
  if (typeof remote.sha !== 'string' || remote.sha === '') {
    err.write(
      `open-pr: refusing: origin has no branch ${head}, so there is no commit to wait on; nothing was created\n`,
    );
    return UNKNOWN;
  }
  if (remote.sha !== sha) {
    err.write(
      `open-pr: refusing: origin/${head} is at ${remote.sha}, not at ${sha}, so the run of this commit could never appear here; nothing was created\n`,
    );
    return UNKNOWN;
  }

  // The floor, read before anything is created. This is the read that makes the run identifiable:
  // `databaseId` is global and monotone by creation, so the run of the single event this command fires
  // has a greater id than anything that existed when the floor was taken, whether or not the API has
  // made it visible yet. A read that cannot answer refuses here, before a pull request exists to clean
  // up. A branch pushed earlier may already have a run of this commit, and it belongs behind the floor:
  // that is what the floor is for.
  const floorRead = listRuns(gh, { head, repo: options.repo });
  if (floorRead.runs === null) {
    err.write(
      'open-pr: refusing: the runs of this branch cannot be read, so no floor can be taken, and nothing was created\n',
    );
    return UNKNOWN;
  }
  const floor = floorOf(floorRead.runs, sha);

  // 4. The label travels in the creation itself, so the pull request is never born without its type and
  // a label attached afterwards cannot leave a run that read nothing. That is where it ends: the payload
  // of the `opened` run is a snapshot taken before the label is queryable, so it can still read
  // `PR_LABELS` empty — measured on funky-secure #233, where the same command passed minutes earlier —
  // which is why the gate has to read the labels live (SEC-X2) instead of trusting that payload. The
  // pull request is created ready because a draft would fire a run and then a second event would fire
  // another of the same commit, and the API carries nothing that tells the two runs apart afterwards.
  const created = gh(
    withRepo(options.repo, [
      'pr',
      'create',
      '--label',
      options.label,
      '--base',
      options.base,
      '--head',
      head,
      '--title',
      options.title,
      '--body-file',
      options.bodyFile,
    ]),
  );

  // The creation may have happened and nobody answered whether it did: a guess either duplicates the
  // pull request or claims a failure that may not exist.
  if (created?.timedOut === true) return unanswered(out, 'gh pr create', `its ceiling of ${Math.round(lastCeilingMs / 1000)}s`, `whether a pull request was created cannot be told: check gh pr list --head ${head} before rerunning`);

  let pullRequest = pullRequestFrom(created?.stdout);
  let adopted = false;

  if (created?.ok !== true) {
    // A creation that failed may have failed because the pull request already exists: an interrupted
    // ritual leaves a real one behind, which is the cost `AGENTS.md` names, and rerunning the command is
    // the recovery the ready creation was designed for. Adoption changes what identifies the run: the
    // creation identifies it by the floor, taken before it fires, while the adopted pull request
    // identifies it by head, because its runs are older than any floor a rerun can take.
    //
    // What the row has to prove is the commit, not the wording of the refusal: `--head` matches a branch
    // name alone, so a fork pull request carrying the same name answers here, and a row at another commit
    // is not the pull request this rerun is about.
    const open = listOpenPullRequest(gh, { head, repo: options.repo, sha });
    if (open.pullRequest !== null) {
      pullRequest = open.pullRequest;
      adopted = true;
    } else if (open.problem !== null) {
      err.write(`open-pr: unknown — the creation failed and ${open.problem}, so whether a pull request exists is unknown; check gh pr list --head ${head}\n`);
      return UNKNOWN;
    } else if (open.elsewhere !== null) {
      const where = open.elsewhere.headRefOid === null ? 'a commit that cannot be read' : open.elsewhere.headRefOid;
      err.write(
        `open-pr: unknown — the pull request of ${head} is at ${where}, not at ${sha}, so its runs are not a verdict on this commit; nothing was created\n`,
      );
      return UNKNOWN;
    } else {
      err.write('open-pr: gh pr create failed\n');
      for (const chunk of [created?.stdout, created?.stderr]) {
        if (typeof chunk === 'string' && chunk.trim() !== '') err.write(`${chunk.trim()}\n`);
      }
      return RED;
    }
  } else if (pullRequest === null) {
    // A creation that reported success is evidence that a pull request exists, and that its URL cannot be
    // read is the red it always was. Looking one up by head here would adopt a pull request this
    // invocation may not have made, and report its runs as the verdict of this commit.
    err.write('open-pr: gh pr create reported success, but its output carries no pull request\n');
    for (const chunk of [created?.stdout, created?.stderr]) {
      if (typeof chunk === 'string' && chunk.trim() !== '') err.write(`${chunk.trim()}\n`);
    }
    return RED;
  }

  // The adoption is printed because a green that came from an adopted run is only auditable when the
  // output says the pull request was not created by this run of the command.
  out.write(
    adopted
      ? `open-pr: adopted ${pullRequest.url} — a pull request for ${head} already existed, so none was created\n`
      : `open-pr: ${pullRequest.url}\n`,
  );

  // 5. The runs of this commit past the floor, polled until the set of them holds still. A wait that
  // prints nothing is indistinguishable from a hang, so the line is written before the first poll and not
  // after the last — and it prints the seconds the wait was handed, not the declared number.
  const waitSeconds = remainingSeconds();
  out.write(`open-pr: waiting for the runs of ${sha} (up to ${waitSeconds}s)\n`);

  const found = await findRun({
    exec,
    head,
    repo: options.repo,
    sha,
    // An adopted pull request is identified by head, not by a floor: its runs existed before this run of
    // the command took its floor, so a floor would hide exactly the runs it is here to report.
    floor: adopted ? 0 : floor,
    sleep,
    timeoutSeconds: waitSeconds,
    remainingMs,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
  });

  if (found.timedOut === true) return unanswered(out, 'a run list poll', 'its remaining budget', `no run of ${sha} could be read past the floor of ${floor}, and ${pullRequest.url} was created`);

  // A set that was still growing when the budget ran out was never read whole, so it is a question and
  // not a verdict: the ids that were seen are named, because a set nobody can audit is not an answer.
  if (found.unstable.length > 0) {
    out.write(`open-pr: unknown — the runs of ${sha} past the floor of ${floor} were still growing when the budget ran out (${found.unstable.join(', ')}), so no verdict covers the set; this is not a failure\n`);
    return UNKNOWN;
  }

  const ids = found.candidates.map((candidate) => String(candidate.databaseId));

  if (ids.length === 0) {
    out.write(
      adopted
        ? `open-pr: unknown — no run of ${sha} appeared within ${waitSeconds}s for the adopted ${pullRequest.url}, so it has no verdict; this is not a failure\n`
        : `open-pr: unknown — no run of ${sha} appeared within ${waitSeconds}s that the creation could have fired; this is not a failure\n`,
    );
    return UNKNOWN;
  }

  // 6. The gate is read over the whole set the creation fired, never over one chosen run. `gh pr create
  // --label` fires `opened` and `labeled` of this commit, so two runs past the floor are the ordinary
  // answer, and the API does not say which action fired which: "which one" has no answer and does not
  // need one. Any red wins, an all-green set is green, and a set with a run still going is unknown —
  // never a failure.
  const answers = new Map();
  const readSet = () => {
    for (const id of ids) {
      const viewed = gh(
        withRepo(options.repo, ['run', 'view', id, '--json', 'status,conclusion,jobs']),
      );
      answers.set(id, parseJson(viewed?.stdout));
    }
    // A cancelled run is not a failed one and a summary is not a gate: each run's verdict is the matrix
    // inside its own answer, read by the same function `wait-for-ci` uses.
    return ids.map((id) => ({
      id,
      verdict: decideVerdict({ ...(answers.get(id) ?? {}), databaseId: id }),
    }));
  };
  const isRed = (set) => set.some(({ verdict }) => verdict.code === RED);
  const undecided = (set) => set.filter(({ verdict }) => verdict.code === UNKNOWN);

  let decided = readSet();

  if (!isRed(decided) && undecided(decided).length > 0) {
    // Only a run that has not answered is waited for: waiting on a set that already holds a red would
    // delay a verdict that cannot change. Each call is bounded by what is left of the budget, because a
    // command that never returns is how the wait this replaces got skipped.
    const remaining = remainingSeconds();
    for (const { id } of undecided(decided)) {
      const watched = exec(
        withRepo(options.repo, [
          'run',
          'watch',
          id,
          '--exit-status',
          '--interval',
          String(DEFAULT_INTERVAL_SECONDS),
        ]),
        { timeoutMs: remaining * 1000 },
      );
      // A watch that ends without answering bounds the wait; it is not a fact about the set, and it does
      // not discard what the set already answered. A run that failed during an earlier watch must not be
      // reported unknown because a later one hit its ceiling — "any red wins" is a rule about the set,
      // not about the wait — so the set is read again either way, and that read is what decides.
      if (watched?.timedOut === true) break;
    }
    decided = readSet();
  }

  // The matrix travels with the verdict, because a verdict nobody can audit is the reading this script
  // exists to replace. The id travels too, so a failure names the run it is about.
  for (const { verdict } of decided) for (const line of verdict.lines ?? []) out.write(`${line}\n`);
  for (const { id, verdict } of decided) {
    const reason = verdict.code === RED ? ` — ${verdict.reason}` : '';
    out.write(`open-pr: run ${id}  ·  ${verdict.state}${reason}\n`);
  }

  const code = isRed(decided) ? RED : undecided(decided).length === 0 ? GREEN : UNKNOWN;
  if (code === UNKNOWN) {
    const waiting = decided.length === 1 ? 'the run' : `${undecided(decided).length} of ${decided.length} runs`;
    out.write(`open-pr: unknown — ${waiting} did not conclude within ${waitSeconds}s; this is not a failure\n`);
  }
  out.write(
    `open-pr: ${pullRequest.url}  ·  ${code === RED ? 'failed' : code === GREEN ? 'passed' : 'unknown'}\n`,
  );
  return code;
}

/**
 * Runs `gh` and reports what it answered, including whether it ran out of time instead of answering.
 *
 * @param {string[]} args
 * @param {{ timeoutMs?: number }} [options]
 * @returns {{ ok: boolean, stdout: string, stderr: string, timedOut: boolean }}
 */
function defaultExec(args, { timeoutMs } = {}) {
  const result = spawnSync('gh', args, { encoding: 'utf8', timeout: timeoutMs });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    // A kill leaves no status, which is the only evidence that the bound was reached rather than the
    // command finishing with an answer.
    timedOut: result.status === null,
  };
}

/**
 * The suite, in the repository root, with both streams kept because the failing count is read from the
 * reporter's summary.
 *
 * @returns {{ ok: boolean, stdout: string }}
 */
/** A suite that runs longer than this is not slow: a test is holding the event loop open. */
const SUITE_TIMEOUT_MS = 900_000;

/**
 * How the suite child is started. The timeout is the point: `node --test` on a test that opens a
 * server and never closes it does not fail, it hangs, and this script exists so no turn is lost to a
 * wait that cannot end — including the wait for its own suite.
 *
 * @returns {{ cwd: string, encoding: 'utf8', maxBuffer: number, timeout: number }}
 */
export function suiteOptions(timeoutMs = SUITE_TIMEOUT_MS) {
  return { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs };
}

function defaultSuite({ timeoutMs = SUITE_TIMEOUT_MS } = {}) {
  const result = spawnSync(process.execPath, ['--test'], suiteOptions(timeoutMs));
  // A kill leaves no status: the ceiling was reached, which is not a failing test.
  const timedOut = result.status === null;
  return { ok: result.status === 0, timedOut, stdout: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** A packed-set gate that runs longer than this is not slow: `npm pack` is stuck on a cache or a lock. */
const PACK_TIMEOUT_MS = 120_000;

/**
 * How the packed-set child is started. Its ceiling is its own, next to the suite's and for the same
 * reason: `npm pack` on a cold cache can wait, and a step that can wait forever is the step that gets
 * skipped. Measured at under a second in this repository, so two minutes is headroom rather than a
 * budget — enough for a cold Windows cache, short enough that it cannot hold a turn open.
 *
 * @returns {{ cwd: string, encoding: 'utf8', maxBuffer: number, timeout: number }}
 */
export function packOptions(timeoutMs = PACK_TIMEOUT_MS) {
  return { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs };
}

/**
 * The packed-set gate, or `null` when this repository has no guard to run. Both streams are kept,
 * because a red gate's output is forwarded as the reason and its exit is what the refusal reads.
 *
 * @returns {{ ok: boolean, stdout: string } | null}
 */
function defaultPack({ timeoutMs = PACK_TIMEOUT_MS } = {}) {
  if (!existsSync(join(ROOT, PACK_SCRIPT))) return null;

  const result = spawnSync(process.execPath, [PACK_SCRIPT], packOptions(timeoutMs));
  const timedOut = result.status === null;
  return { ok: result.status === 0, timedOut, stdout: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** A local git call that takes longer than this is not slow: it is stuck on a lock. */
const LOCAL_GIT_TIMEOUT_MS = 30_000;

/** @returns {string} the branch this checkout is on, or the empty string on a detached HEAD */
function defaultResolveHead() {
  const result = spawnSync('git', ['branch', '--show-current'], {
    encoding: 'utf8',
    timeout: LOCAL_GIT_TIMEOUT_MS,
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

/**
 * @param {string} head the branch the run must belong to
 * @returns {string} the commit that branch points at, or the empty string when it cannot be resolved
 */
/**
 * The commit `refs/heads/<head>` is at on origin, from `git ls-remote`. Three answers, kept apart because
 * they lead to three different sentences: the commit, no such branch, and a remote that did not answer.
 *
 * @param {string} head
 * @param {{ timeoutMs?: number }} [options]
 * @returns {{ ok: boolean, sha: string }}
 */
function defaultRemoteSha(head, { timeoutMs } = {}) {
  const result = spawnSync('git', ['ls-remote', 'origin', `refs/heads/${head}`], {
    encoding: 'utf8',
    timeout: timeoutMs ?? LOCAL_GIT_TIMEOUT_MS,
  });
  if (result.status !== 0) return { ok: false, sha: '' };

  const line = String(result.stdout ?? '').trim().split('\n')[0];
  const sha = line.split('\t')[0].trim();
  return { ok: true, sha: /^[0-9a-f]{40}$/.test(sha) ? sha : '' };
}

function defaultResolveSha(head) {
  // The local branch, then its remote-tracking copy: a branch pushed from another worktree has only
  // the second one here.
  for (const candidate of [head, `origin/${head}`]) {
    const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`], {
      encoding: 'utf8',
      timeout: LOCAL_GIT_TIMEOUT_MS,
    });
    if (result.status === 0 && result.stdout.trim() !== '') return result.stdout.trim();
  }

  // The working tree is the last resort and only when it is on that branch. Falling back to it
  // unconditionally is the defect the refusal above exists to prevent.
  if (head === defaultResolveHead()) {
    const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
      encoding: 'utf8',
      timeout: LOCAL_GIT_TIMEOUT_MS,
    });
    if (result.status === 0) return result.stdout.trim();
  }

  return '';
}

/**
 * @param {string|null} repo
 * @param {string[]} args
 * @returns {string[]} the same arguments, addressed to `--repo` when one was named
 */
function withRepo(repo, args) {
  return repo === null ? args : [...args, '--repo', repo];
}

/**
 * @param {(args: string[], options?: object) => { ok: boolean, stdout?: string, timedOut?: boolean }} exec
 * @param {{ head: string, repo?: string|null, timeoutMs?: number }} target
 * @returns {{ runs: Array<object>|null, timedOut: boolean }} the runs of that branch, newest first, or
 *   `null` when the API cannot answer — an empty list is a measurement, a failed call is not, and the
 *   two cannot share an answer. A call killed at its ceiling is reported apart from a refusal.
 */
function listRuns(exec, { head, repo = null, timeoutMs }) {
  const answer = exec(withRepo(repo, ['run', 'list', '--branch', head, '--json', RUN_FIELDS]), {
    timeoutMs,
  });
  if (answer?.ok !== true) return { runs: null, timedOut: answer?.timedOut === true };

  const runs = parseJson(answer.stdout);
  return { runs: Array.isArray(runs) ? runs : [], timedOut: false };
}

/**
 * @param {string} text
 * @returns {any | null}
 */
function parseJson(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await run();
  process.exitCode = code;
}
