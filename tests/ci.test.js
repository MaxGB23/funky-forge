import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseYaml } from '../src/lib/yaml.js';

/** The CI configuration is a promise, so it is asserted like one. Without these cases the workflow
 * could quietly lose a platform, float its runner label, drop `check-latest` or drift away from the
 * Node floor in `package.json`, and the suite would stay green while the promise decayed. This is
 * also what replaces Dependabot here: a pin nobody bumps rots, but a pin that disappears fails.
 */

const ROOT = join(import.meta.dirname, '..');
const WORKFLOW = readFileSync(join(ROOT, '.github', 'workflows', 'test.yml'), 'utf8');
const ATTRIBUTES = readFileSync(join(ROOT, '.gitattributes'), 'utf8');
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/** The Active LTS when this policy was written; bumped deliberately, like an action pin. */
const ACTIVE_LTS = '24';

/** The platforms this package is expected to serve. */
const PLATFORMS = ['ubuntu-24.04', 'windows-2025', 'macos-26'];

/** The binary extensions `.gitattributes` marks, kept in step with that file. */
const BINARY_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'woff', 'woff2', 'pdf', 'zip'];

test('every text file is checked out with LF on every platform', () => {
  assert.match(
    ATTRIBUTES,
    /^\* text=auto eol=lf$/m,
    'without this line a CRLF checkout changes shipped bytes for a reason that is not the code',
  );
});

test('the binary extensions the pack may carry are marked binary', () => {
  for (const extension of BINARY_EXTENSIONS) {
    assert.ok(
      ATTRIBUTES.includes(`*.${extension} binary`),
      `.${extension} is not marked binary, so git would normalise it as text`,
    );
  }
});

test('the suite runs on every platform by exact image label', () => {
  for (const label of PLATFORMS) {
    assert.ok(WORKFLOW.includes(label), `CI never runs on ${label}, so that platform is unverified`);
  }

  assert.doesNotMatch(
    WORKFLOW,
    /runs-on:\s*\S*-latest/,
    'a floating runner label lets the vendor migrate the image under us',
  );
});

test('the suite runs at the Node floor the package declares and at the Active LTS', () => {
  const floor = />=?(\d+)/.exec(PACKAGE.engines?.node ?? '')?.[1];
  assert.ok(floor, 'package.json declares no engines.node floor');

  const declared = /node:\s*\[([^\]]+)\]/.exec(WORKFLOW);
  assert.ok(declared, 'CI declares no node matrix');
  const versions = declared[1].split(',').map((version) => version.trim());

  assert.ok(versions.includes(floor), `CI never runs the declared floor ${floor}: ${versions.join(', ')}`);
  assert.ok(
    versions.includes(ACTIVE_LTS),
    `CI never runs the Active LTS ${ACTIVE_LTS}: ${versions.join(', ')}`,
  );
  assert.ok(
    !versions.includes('20'),
    'Node 20 reached end-of-life in April 2026, so it is not a promise this package can keep',
  );
});

test('Node floats to the newest patch of its line instead of a cached one', () => {
  assert.match(
    WORKFLOW,
    /check-latest:\s*true/,
    'without check-latest setup-node may reuse a months-old patch from the image',
  );
});

test('every action is pinned to a commit, with the release named beside it', () => {
  const uses = [...WORKFLOW.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
  assert.ok(uses.length >= 2, 'no pinned actions found');

  for (const action of uses) {
    assert.match(action, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${action} is not pinned to a commit SHA`);
  }

  for (const line of WORKFLOW.split('\n').filter((entry) => entry.includes('uses:'))) {
    assert.match(line, /#\s*v\d+\.\d+\.\d+\s*$/, `the pin on "${line.trim()}" names no release`);
  }
});

test('the job installs nothing, because the package has no dependencies', () => {
  assert.deepEqual(PACKAGE.dependencies ?? {}, {});
  assert.deepEqual(PACKAGE.devDependencies ?? {}, {});
  assert.doesNotMatch(
    WORKFLOW,
    /\b(?:npm ci|npm install|pnpm install)\b/,
    'a dependency install with an empty dependency set is dead weight',
  );
});

test('the workflow keeps a least-privilege token and does not stop at the first failing platform', () => {
  assert.match(WORKFLOW, /permissions:\s*\n\s*contents:\s*read/, 'the token is not scoped to contents: read');
  assert.match(WORKFLOW, /fail-fast:\s*false/, 'one failing platform would hide the other');
});

test('the contribution policy runs on the payload it reads, and only on pull requests', () => {
  assert.match(WORKFLOW, /pr-policy:/, 'the contribution policy job is gone');
  assert.match(WORKFLOW, /run:\s*node scripts\/check-pr-policy\.js/, 'the job runs no policy check');
  assert.match(WORKFLOW, /github\.event_name == 'pull_request'/, 'the policy job would fail on a push');
  assert.match(WORKFLOW, /PR_LABELS:.*labels\.\*\.name/, 'the job never passes the applied labels');
  assert.match(WORKFLOW, /labeled/, 'a label changed after the pull request opened would not re-run the job');
});

test('a draft pull request does not decide its own policy', () => {
  // `gh pr create --label` attaches the label after the pull request exists, so the `opened` run of a
  // draft reads an empty PR_LABELS and reports a failure nobody caused: one email per pull request, on
  // a job that exists to give feedback. `ready_for_review` is what fires the run that decides.
  assert.match(
    WORKFLOW,
    /ready_for_review/,
    'a draft that becomes ready for review would never re-run the policy',
  );
  assert.match(
    WORKFLOW,
    /github\.event\.pull_request\.draft == false/,
    'the policy job decides a draft, where the label it reads is not attached yet',
  );
});

/** R3-001: `npm run pack:check` on a pull request is the one thing the macOS leg does that no other
 * leg does, and nothing observed it. The assertion reads the workflow structurally, through the same
 * parser the issue forms use: a text search would also match the job's own header comment, which
 * mentions the command, and would then pass on a step that no longer exists. `runs-on` is
 * deliberately not asserted here — `PLATFORMS` owns that string, and one contract gets one case.
 */
test('the macOS job runs the packed-set check', () => {
  const jobs = parseYaml(WORKFLOW).jobs ?? {};
  const job = jobs['test-macos'];
  assert.ok(job, 'the workflow has no test-macos job, so nothing runs the suite or the packed set on macOS');
  assert.equal(
    job.if,
    undefined,
    'a conditional macOS job can stop running on pull requests without a red test',
  );

  const steps = job.steps ?? [];
  assert.ok(
    steps.every((step) => step.if === undefined),
    'a conditional step can silence the packed-set check without turning the pull request red',
  );

  const runs = steps.map((step) => step.run).filter(Boolean);
  assert.ok(runs.includes('node --test'), 'the macOS job does not run the suite');
  assert.ok(runs.includes('npm run pack:check'), 'the macOS job does not run the packed-set check');
});

/** Issue #64: a job outside the matrix that declares no `name` is rendered in the pull-request check
 * list as its bare id, so `test-macos` says nothing about the platform or the Node line it ran. The
 * matrix job keeps its id bare on purpose: it composes its own rendered name from the axes, and the
 * id is what `scripts/wait-for-ci.js` and the cases here read. This case derives the expected name
 * from the job itself rather than restating the string, so a bare `node-version` bump or a missing
 * `name` fails instead of drifting silently.
 */
test('the macOS job is named for the runner and Node line it declares', () => {
  const jobs = parseYaml(WORKFLOW).jobs ?? {};
  const job = jobs['test-macos'];
  assert.ok(job, 'the workflow has no test-macos job, so there is no name to check');

  const setup = (job.steps ?? []).find((step) => String(step.uses ?? '').startsWith('actions/setup-node'));
  assert.ok(setup, 'the macOS job sets up no Node, so its name has no Node line to come from');

  const nodeLine = setup.with?.['node-version'];
  assert.ok(nodeLine !== undefined, 'the setup-node step declares no node-version');

  const runner = String(job['runs-on']);
  const node = String(nodeLine);

  assert.equal(
    typeof job.name,
    'string',
    'the macOS job declares no name, so GitHub renders the bare id in the check list',
  );
  // Bounded, never `includes`: `macos-26` is a prefix of `macos-26-intel`, and a name that still says
  // `node 24` contains `26` the moment the runner is `macos-26` — a bare substring test passes on exactly
  // the drift it exists to catch.
  assert.match(job.name, new RegExp(`\\(${runner}(?: |\\))`), `the name '${job.name}' does not say which runner it runs on (${runner})`);
  assert.match(job.name, new RegExp(`node ${node}\\)`), `the name '${job.name}' does not say which Node line it runs (${node})`);
});

test('every issue form parses and declares the fields GitHub requires', () => {
  const forms = ['bug_report', 'feature_request'];

  for (const form of forms) {
    const path = join(ROOT, '.github', 'ISSUE_TEMPLATE', `${form}.yml`);
    const document = parseYaml(readFileSync(path, 'utf8'));

    assert.equal(typeof document.name, 'string', `${form} declares no name`);
    assert.equal(typeof document.description, 'string', `${form} declares no description`);
    assert.ok(Array.isArray(document.body) && document.body.length > 0, `${form} declares no body`);

    const ids = [];
    for (const field of document.body) {
      assert.equal(typeof field.type, 'string', `${form} has a body entry without a type`);
      if (field.type === 'markdown') continue;

      assert.equal(typeof field.id, 'string', `${form} has a ${field.type} entry without an id`);
      ids.push(field.id);

      if (field.type === 'dropdown') {
        assert.ok(Array.isArray(field.attributes?.options), `${form}.${field.id} is a dropdown with no options`);
      }
    }

    assert.equal(new Set(ids).size, ids.length, `${form} repeats an id, so GitHub would drop the form`);
  }
});

test('the issue template configuration and the pull request template exist', () => {
  const config = parseYaml(readFileSync(join(ROOT, '.github', 'ISSUE_TEMPLATE', 'config.yml'), 'utf8'));
  assert.equal(config.blank_issues_enabled, false, 'bare issues bypass every template');

  const template = readFileSync(join(ROOT, '.github', 'PULL_REQUEST_TEMPLATE.md'), 'utf8');
  assert.match(template, /Closes #/, 'the template never reminds the author to link an issue');
  assert.match(template, /type:\*/, 'the template never reminds the author about the single type label');
});
