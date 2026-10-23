import { MANUAL_HEADERS, PHRASES, PRIORITY_LABEL } from './i18n';
import { stepText } from './gherkin';
import type { FeatureModel, Scenario, Step } from './types';

export interface ManualCase {
  id: string;
  title: string;
  priority: string;
  preconditions: string[];
  steps: string[];
  expected: string[];
  tags: string[];
}

/** Replaces <placeholders> in a step's text with one Examples row. */
function expand(step: Step, headers: string[], row: string[]): Step {
  return {
    ...step,
    args: step.args.map((a) => (typeof a === 'string' ? a.replace(/<([^>]+)>/g, (m, h: string) => (headers.includes(h) ? row[headers.indexOf(h)] : m)) : a)),
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Converts every scenario (and every Examples row of an outline) into a manual test case. */
export function toManualCases(model: FeatureModel, storyId: string): ManualCase[] {
  const prefix = storyId.trim() ? `${storyId.trim().replace(/\s+/g, '-')}-TC` : 'TC';
  const cases: ManualCase[] = [];

  const add = (sc: Scenario, steps: Step[], suffix: string) => {
    const by = (kind: Step['kind']) => steps.filter((s) => s.kind === kind).map((s) => capitalize(stepText(s)));
    const pre = by('given');
    cases.push({
      id: `${prefix}-${String(cases.length + 1).padStart(2, '0')}`,
      title: sc.title + suffix,
      priority: PRIORITY_LABEL[model.language][sc.priority],
      preconditions: pre.length ? pre : [PHRASES[model.language].preconditionNone],
      steps: by('when'),
      expected: by('then'),
      tags: [...model.tags, ...sc.tags],
    });
  };

  for (const sc of model.scenarios) {
    if (!sc.examples) {
      add(sc, sc.steps, '');
      continue;
    }
    const { headers, rows } = sc.examples;
    for (const row of rows) add(sc, sc.steps.map((s) => expand(s, headers, row)), ` (${row.join(', ')})`);
  }
  return cases;
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const numbered = (lines: string[]) => lines.map((l, i) => `${i + 1}. ${l}`).join('\n');

/** RFC 4180 CSV, one row per case, multi-line cells for steps; imports into Xray, TestRail or Azure DevOps after column mapping. */
export function toCsv(cases: ManualCase[], language: FeatureModel['language']): string {
  const rows = cases.map((c) => [c.id, c.title, c.priority, numbered(c.preconditions), numbered(c.steps), numbered(c.expected), c.tags.join(' ')]);
  return [MANUAL_HEADERS[language], ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
