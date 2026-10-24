import { pathToFileURL } from 'node:url';

/** The pull request policy this repository documents in `CONTRIBUTING.md`, enforced instead of hoped
 * for. Three facts decide it, all of them visible in the pull request payload: the body links an
 * issue, exactly one `type:*` label is applied, and the head branch follows `type/description`.
 *
 * The fourth requirement — the issue carries `status:approved` — is a maintainer judgement, so it is
 * not asserted here; `CONTRIBUTING.md` says who checks it.
 */

const BRANCH = /^(feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+$/;
const ISSUE_REFERENCE = /\b(?:closes|fixes|resolves|refs)\s+#\d+\b/i;
const TYPE_LABEL = /^type:/;

/**
 * @param {{ body?: string|null, labels?: Array<string>, headRef?: string|null }} input
 * @returns {{ ok: boolean, problems: Array<string> }}
 */
export function checkPolicy({ body = null, labels = [], headRef = null } = {}) {
  const problems = [];

  if (typeof body !== 'string' || !ISSUE_REFERENCE.test(body)) {
    problems.push('the body does not link an issue: write Closes #N, Fixes #N or Refs #N');
  }

  const typeLabels = labels.filter((label) => TYPE_LABEL.test(label));
  if (typeLabels.length !== 1) {
    problems.push(
      typeLabels.length === 0
        ? 'no type:* label: apply exactly one'
        : `${typeLabels.length} type:* labels (${typeLabels.join(', ')}): apply exactly one`,
    );
  }

  if (typeof headRef !== 'string' || !BRANCH.test(headRef)) {
    problems.push(
      `the branch "${headRef ?? ''}" does not match type/description, for example feat/must-have-plural`,
    );
  }

  return { ok: problems.length === 0, problems };
}

/** The payload the workflow hands over, as plain strings. */
export function payloadFromEnv(env = {}) {
  return {
    body: env.PR_BODY ?? '',
    labels: (env.PR_LABELS ?? '')
      .split(',')
      .map((label) => label.trim())
      .filter((label) => label !== ''),
    headRef: env.PR_HEAD_REF ?? '',
  };
}

/**
 * @param {object} [env]
 * @param {{ write: (chunk: string) => boolean }} [stdout]
 * @param {{ write: (chunk: string) => boolean }} [stderr]
 * @returns {number} exit code
 */
export function run(env = {}, stdout = process.stdout, stderr = process.stderr) {
  const { ok, problems } = checkPolicy(payloadFromEnv(env));

  if (ok) {
    stdout.write('pr-policy: issue link, one type label and a conventional branch name\n');
    return 0;
  }

  for (const problem of problems) stderr.write(`pr-policy: ${problem}\n`);
  stderr.write('pr-policy: see CONTRIBUTING.md\n');
  return 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run(process.env);
}
