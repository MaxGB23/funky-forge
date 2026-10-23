import assert from 'node:assert/strict';
import test from 'node:test';

import { parseGateReport, validateGateReport } from '../src/lib/gate.js';

function report({ phase = 'design', verdict = 'PASS', depth = 'deep', reviewer = 'design', findings = 1, notVerified = '[]', accepted = '[]', headings = '### F1 - Severity: medium - Something\n' } = {}) {
  const acceptedBlock = accepted === '[]' ? 'accepted_risks: []' : `accepted_risks:\n${accepted}`;
  return `---
phase: ${phase}
verdict: ${verdict}
depth: ${depth}
escalation_reason: null
reviewer: ${reviewer}
date: 2026-10-02
findings: ${findings}
not_verified: ${notVerified}
${acceptedBlock}
---

${headings}`;
}

function validate(text, phase = 'design') {
  return validateGateReport({ text, phase, file: `gates/2-${phase}.md` });
}

test('a well formed report passes', () => {
  const result = validate(report());
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.findings, 1);
});

test('BLOCK cannot advance', () => {
  const result = validate(report({ verdict: 'BLOCK' }));
  assert.deepEqual(result.errors.map((error) => error.code), ['BLOCK_VERDICT']);
});

test('the declared finding count must match the headings', () => {
  const result = validate(report({ findings: 2 }));
  assert.deepEqual(result.errors.map((error) => error.code), ['GATE_REPORT_MALFORMED']);
  assert.match(result.errors[0].message, /findings says 2 but the report has 1/);
});

test('a malformed finding heading is reported with its line', () => {
  const result = validate(report({ headings: '### F1 Severity high\n' }));
  assert.ok(result.errors.some((error) => error.code === 'GATE_REPORT_MALFORMED' && /finding heading/.test(error.message)));
});

test('a phase that does not match the artifact is malformed', () => {
  const result = validate(report({ phase: 'estimate' }));
  assert.ok(result.errors.some((error) => /phase is "estimate"/.test(error.message)));
});

test('PASS_WITH_RISKS requires an accepted entry per blocker and high finding', () => {
  const headings = '### F1 - Severity: high - Money\n### F2 - Severity: medium - Words\n';
  const missing = validate(report({ verdict: 'PASS_WITH_RISKS', findings: 2, headings }));
  assert.deepEqual(missing.errors.map((error) => error.code), ['RISK_NOT_ACCEPTED']);
  assert.match(missing.errors[0].message, /R1-F1/);

  const accepted = `  - finding: R1-F1\n    severity: high\n    reason: accepted for launch\n    accepted_by: the client\n    date: 2026-10-02\n`;
  const passed = validate(report({ verdict: 'PASS_WITH_RISKS', findings: 2, headings, accepted }));
  assert.deepEqual(passed.errors, []);
});

test('an accepted risk citing an unknown finding is malformed', () => {
  const accepted = `  - finding: F9\n    severity: high\n    reason: x\n    accepted_by: y\n    date: 2026-10-02\n`;
  const result = validate(report({ verdict: 'PASS_WITH_RISKS', accepted }));
  assert.ok(result.errors.some((error) => error.code === 'GATE_REPORT_MALFORMED' && /not a finding/.test(error.message)));
});

test('round-scoped ids keep two rounds apart', () => {
  const headings = '### F1 - Severity: low - Old round\n### R3-F1 - Severity: high - New round\n';
  const parsed = parseGateReport(report({ findings: 2, headings }));
  assert.deepEqual(parsed.findings.map((finding) => finding.id), ['R1-F1', 'R3-F1']);
  const accepted = `  - finding: R3-F1\n    severity: high\n    reason: fixed differently\n    accepted_by: the client\n    date: 2026-10-02\n`;
  const result = validate(report({ verdict: 'PASS_WITH_RISKS', findings: 2, headings, accepted }));
  assert.deepEqual(result.errors, []);
});

test('not_verified must be present even when empty', () => {
  const text = report().replace('not_verified: []\n', '');
  const result = validate(text);
  assert.ok(result.errors.some((error) => /not_verified/.test(error.message)));
});

test('an accepted risk without a reason or an owner warns', () => {
  const accepted = `  - finding: F1\n    severity: medium\n    reason: ""\n    accepted_by: ""\n    date: 2026-10-02\n`;
  const result = validate(report({ accepted }));
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.filter((warning) => warning.code === 'RISK_REASON_MISSING').length, 2);
});

test('only level-three headings are findings; deeper headings are ignored', () => {
  const headings = '### F1 - Severity: medium - Real\n\n#### F2 decision notes\n\n##### F3 detail\n';
  const parsed = parseGateReport(report({ findings: 1, headings }));
  assert.deepEqual(parsed.findings.map((finding) => finding.id), ['R1-F1']);
  assert.deepEqual(parsed.malformed, []);
});

test('a level-three heading that is not a finding is malformed', () => {
  const result = validate(report({ headings: '### Notes\n' }));
  assert.ok(result.errors.some((error) => /finding heading/.test(error.message)));
});

test('escalation_reason must be present even when it is null', () => {
  const text = report().replace('escalation_reason: null\n', '');
  const result = validate(text);
  assert.deepEqual(result.errors.map((error) => error.code), ['GATE_REPORT_MALFORMED']);
  assert.match(result.errors[0].message, /escalation_reason/);
});

test('a light review with a high finding must state why it escalated', () => {
  const headings = '### F1 - Severity: high - Money\n';
  const accepted = `  - finding: R1-F1\n    severity: high\n    reason: accepted for launch\n    accepted_by: the client\n    date: 2026-10-02\n`;
  const silent = validate(report({ depth: 'light', verdict: 'PASS_WITH_RISKS', findings: 1, headings, accepted }));
  assert.deepEqual(silent.errors.map((error) => error.code), ['GATE_REPORT_MALFORMED']);
  assert.match(silent.errors[0].message, /R1-F1/);

  const escalated = validate(
    report({ depth: 'light', verdict: 'PASS_WITH_RISKS', findings: 1, headings, accepted }).replace(
      'escalation_reason: null',
      'escalation_reason: "the light pass returned a high finding"',
    ),
  );
  assert.deepEqual(escalated.errors, []);
});
