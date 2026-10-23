/**
 * Gate report parsing and validation. Findings are addressed by round-scoped ids (`R3-F1`), so a
 * citation from a later round cannot silently resolve to an earlier round's finding with the same
 * number.
 */

import { readDocument } from './frontmatter.js';

export const VERDICTS = ['PASS', 'PASS_WITH_RISKS', 'BLOCK'];
export const DEPTHS = ['light', 'deep'];
export const SEVERITIES = ['blocker', 'high', 'medium', 'low'];
export const FINDING_HEADING = /^#{3}\s+(?:R(\d+)-)?F(\d+)\s+[-–]\s+Severity:\s*(blocker|high|medium|low)\b\s*(.*)$/i;

/**
 * A bare `F1` means round 1; the round prefix is the only thing that keeps rounds apart.
 * @param {string} id
 * @returns {string}
 */
function normalizeFindingId(id) {
  const trimmed = id.trim();
  return /^F\d+$/.test(trimmed) ? `R1-${trimmed}` : trimmed;
}

/** @param {string} code @param {string} message @param {string} [artifact] */
function issue(code, message, artifact) {
  return artifact ? { code, message, artifact } : { code, message };
}

/**
 * @param {string} text
 * @returns {{data: Record<string, unknown>, findings: {id: string, number: number, round: number, severity: string, title: string}[], malformed: string[]}}
 */
export function parseGateReport(text) {
  const doc = readDocument(text);
  const findings = [];
  const malformed = [];
  for (const line of doc.body.split('\n')) {
    const heading = line.trim().match(/^(#{1,6})\s/);
    if (!heading || heading[1].length !== 3) continue;
    const match = line.trim().match(FINDING_HEADING);
    if (!match) {
      malformed.push(line.trim());
      continue;
    }
    const round = match[1] ? Number(match[1]) : 1;
    findings.push({ id: `R${round}-F${Number(match[2])}`, number: Number(match[2]), round, severity: match[3].toLowerCase(), title: match[4].trim() });
  }
  return { data: doc.data, findings, malformed };
}

/**
 * @param {{text: string, phase: string, file: string}} input
 * @returns {{errors: {code: string, message: string}[], warnings: {code: string, message: string}[], findings: number}}
 */
export function validateGateReport({ text, phase, file }) {
  const errors = [];
  const warnings = [];
  let parsed;
  try {
    parsed = parseGateReport(text);
  } catch (error) {
    return { errors: [issue('GATE_REPORT_MALFORMED', `${file}: ${error instanceof Error ? error.message : String(error)}`, file)], warnings, findings: 0 };
  }
  const { data, findings, malformed } = parsed;

  if (data.phase !== phase) errors.push(issue('GATE_REPORT_MALFORMED', `${file}: phase is ${JSON.stringify(data.phase ?? null)} but the artifact is ${phase}`, file));
  if (!VERDICTS.includes(String(data.verdict))) errors.push(issue('GATE_REPORT_MALFORMED', `${file}: verdict must be one of ${VERDICTS.join(', ')}`, file));
  if (!DEPTHS.includes(String(data.depth))) errors.push(issue('GATE_REPORT_MALFORMED', `${file}: depth must be light or deep`, file));
  if (!Object.hasOwn(data, 'escalation_reason')) {
    errors.push(issue('GATE_REPORT_MALFORMED', `${file}: escalation_reason must be present, even when it is null`, file));
  } else if (data.depth === 'light') {
    const trigger = findings.find((finding) => finding.severity === 'blocker' || finding.severity === 'high');
    const reason = typeof data.escalation_reason === 'string' ? data.escalation_reason.trim() : '';
    if (trigger && reason === '') {
      errors.push(
        issue(
          'GATE_REPORT_MALFORMED',
          `${file}: light review contains ${trigger.id} (${trigger.severity}); an escalated light review must say why in escalation_reason`,
          file,
        ),
      );
    }
  }
  if (typeof data.reviewer !== 'string' || data.reviewer.trim() === '') errors.push(issue('GATE_REPORT_MALFORMED', `${file}: reviewer is required`, file));
  if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) errors.push(issue('GATE_REPORT_MALFORMED', `${file}: date must be YYYY-MM-DD`, file));
  if (!Array.isArray(data.not_verified)) errors.push(issue('GATE_REPORT_MALFORMED', `${file}: not_verified must be a list, even when empty`, file));

  if (malformed.length > 0) {
    for (const line of malformed) {
      errors.push(issue('GATE_REPORT_MALFORMED', `${file}: finding heading is not "### F<id> - Severity: <level>": ${line.slice(0, 80)}`, file));
    }
  }
  if (typeof data.findings !== 'number') {
    errors.push(issue('GATE_REPORT_MALFORMED', `${file}: findings must be the number of finding headings`, file));
  } else if (data.findings !== findings.length) {
    errors.push(issue('GATE_REPORT_MALFORMED', `${file}: findings says ${data.findings} but the report has ${findings.length} finding headings`, file));
  }
  if (data.verdict === 'BLOCK') {
    errors.push(issue('BLOCK_VERDICT', `${file}: the reviewer returned BLOCK; the phase cannot advance`, file));
  }

  const accepted = Array.isArray(data.accepted_risks) ? data.accepted_risks : [];
  const known = new Set(findings.map((finding) => finding.id));
  for (const entry of accepted) {
    const id = normalizeFindingId(typeof entry?.finding === 'string' ? entry.finding : '');
    if (!known.has(id)) {
      errors.push(issue('GATE_REPORT_MALFORMED', `${file}: accepted_risks cites ${JSON.stringify(entry?.finding ?? null)}, which is not a finding in this report`, file));
    }
    if (typeof entry?.reason !== 'string' || entry.reason.trim() === '') {
      warnings.push(issue('RISK_REASON_MISSING', `${file}: accepted risk ${id || '(unknown)'} has no reason`, file));
    }
    if (typeof entry?.accepted_by !== 'string' || entry.accepted_by.trim() === '') {
      warnings.push(issue('RISK_REASON_MISSING', `${file}: accepted risk ${id || '(unknown)'} has no accepted_by`, file));
    }
  }

  if (data.verdict === 'PASS_WITH_RISKS') {
    const acceptedIds = new Set(accepted.map((entry) => normalizeFindingId(typeof entry?.finding === 'string' ? entry.finding : '')));
    for (const finding of findings) {
      if (finding.severity !== 'blocker' && finding.severity !== 'high') continue;
      if (!acceptedIds.has(finding.id)) {
        errors.push(issue('RISK_NOT_ACCEPTED', `${file}: ${finding.id} is ${finding.severity} and has no accepted_risks entry`, file));
      }
    }
  }
  return { errors, warnings, findings: findings.length };
}
