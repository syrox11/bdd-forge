import { MANUAL_HEADERS, PHRASES, PRIORITY_LABEL } from './i18n';
import { stepText } from './gherkin';
import type { CsvFormat, FeatureModel, Priority, Scenario, Step } from './types';

export interface ManualCase {
  id: string;
  title: string;
  /** Translated label, e.g. "Alta". */
  priority: string;
  priorityLevel: Priority;
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
      priorityLevel: sc.priority,
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
const csv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
const plainTags = (tags: string[]) => tags.map((t) => t.replace(/^@/, ''));

/** Generic CSV, one row per case with multi-line cells; headers in the feature's language. */
export function toCsv(cases: ManualCase[], language: FeatureModel['language']): string {
  const rows = cases.map((c) => [c.id, c.title, c.priority, numbered(c.preconditions), numbered(c.steps), numbered(c.expected), c.tags.join(' ')]);
  return csv([MANUAL_HEADERS[language], ...rows]);
}

/**
 * One row per step, the shape test-management importers expect: the case's own columns on its first row,
 * the remaining steps on the rows below. Expected results go on the last action row.
 */
function perStep(cases: ManualCase[], caseColumns: (c: ManualCase) => string[], stepColumns: (action: string, expected: string, n: number) => string[]): string[][] {
  return cases.flatMap((c) => {
    const actions = c.steps.length ? c.steps : [''];
    return actions.map((action, i) => {
      const expected = i === actions.length - 1 ? numbered(c.expected) : '';
      const own = i === 0 ? caseColumns(c) : caseColumns(c).map(() => '');
      return [...own, ...stepColumns(action, expected, i + 1)];
    });
  });
}

/** Jira Xray "Test Case Importer" CSV; Test ID groups the step rows of one test. */
function xray(cases: ManualCase[]): string {
  const header = ['Test ID', 'Summary', 'Priority', 'Labels', 'Precondition', 'Action', 'Data', 'Expected Result'];
  const rows = cases.flatMap((c) =>
    perStep([c], (x) => [x.title, x.priorityLevel, plainTags(x.tags).join(' '), numbered(x.preconditions)], (action, expected) => [action, '', expected]).map((r) => [c.id, ...r]),
  );
  return csv([header, ...rows]);
}

/** TestRail CSV import for the "Test Case (Steps)" template. */
function testrail(cases: ManualCase[], section: string): string {
  const header = ['Title', 'Section', 'Priority', 'Preconditions', 'References', 'Steps (Step)', 'Steps (Expected Result)'];
  const rows = perStep(
    cases,
    (c) => [c.title, section, c.priorityLevel, numbered(c.preconditions), c.id],
    (action, expected) => [action, expected],
  );
  return csv([header, ...rows]);
}

const AZURE_PRIORITY: Record<Priority, string> = { High: '1', Medium: '2', Low: '3' };

/** Azure DevOps Test Plans CSV import: a Test Case row, then its numbered steps. */
function azure(cases: ManualCase[]): string {
  const header = ['ID', 'Work Item Type', 'Title', 'Priority', 'Tags', 'Test Step', 'Step Action', 'Step Expected'];
  const rows = cases.flatMap((c) => {
    const pre = c.preconditions.length ? [`Preconditions: ${c.preconditions.join('; ')}`] : [];
    const actions = [...pre, ...c.steps];
    return [
      ['', 'Test Case', c.title, AZURE_PRIORITY[c.priorityLevel], plainTags(c.tags).join('; '), '', '', ''],
      ...actions.map((a, i) => ['', '', '', '', '', String(i + 1), a, i === actions.length - 1 ? numbered(c.expected) : '']),
    ];
  });
  return csv([header, ...rows]);
}

export const CSV_FORMATS: Record<CsvFormat, { label: string; suffix: string }> = {
  generic: { label: 'Generic', suffix: 'test-cases' },
  xray: { label: 'Xray (Jira)', suffix: 'xray' },
  testrail: { label: 'TestRail', suffix: 'testrail' },
  azure: { label: 'Azure DevOps', suffix: 'azure-devops' },
};

export function toCsvFor(format: CsvFormat, cases: ManualCase[], model: Pick<FeatureModel, 'language' | 'title'>): string {
  switch (format) {
    case 'generic':
      return toCsv(cases, model.language);
    case 'xray':
      return xray(cases);
    case 'testrail':
      return testrail(cases, model.title);
    case 'azure':
      return azure(cases);
  }
}
