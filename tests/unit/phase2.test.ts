import { describe, expect, it } from 'vitest';
import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import {
  behavePattern,
  boundaryValues,
  buildFeature,
  collectStepDefs,
  emptyField,
  generate,
  renderFeature,
  sampleInput,
  toCsvFor,
  toManualCases,
} from '../../src/core';
import type { Field, Framework, GeneratorInput, Language, Style, TestLevel } from '../../src/core';

const input = (overrides: Partial<GeneratorInput> = {}): GeneratorInput => ({ ...sampleInput(), ...overrides });
const field = (overrides: Partial<Field>): Field => ({ ...emptyField(), ...overrides });
const unbounded = () => sampleInput().fields.map((f) => ({ ...f, min: '', max: '' }));
const authApi = { method: 'POST' as const, path: '/api/users', successStatus: 201, requiresAuth: true };

function pickles(feature: string) {
  const newId = IdGenerator.incrementing();
  return compile(new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher()).parse(feature), 'generated.feature', newId);
}

const FRAMEWORKS: Framework[] = ['playwright-bdd', 'cucumber-js', 'behave', 'reqnroll'];
const LEVELS: TestLevel[] = ['api', 'e2e'];
const LANGUAGES: Language[] = ['en', 'es'];
const STYLES: Style[] = ['scenario', 'outline'];

describe('step definitions for every framework', () => {
  const combos = FRAMEWORKS.flatMap((framework) => LEVELS.flatMap((level) => LANGUAGES.map((language) => ({ framework, level, language }))));

  it.each(combos)('$framework / $level / $language declares every step pattern', (combo) => {
    const params = input({ ...combo, api: authApi });
    const code = generate(params).steps ?? '';
    for (const d of collectStepDefs(buildFeature(params).scenarios.flatMap((s) => s.steps))) {
      const declared =
        combo.framework === 'behave' ? `'${behavePattern(d.pattern, d.params.map((p) => p.name))}'` : JSON.stringify(d.pattern);
      expect(code).toContain(declared);
    }
  });

  /** Behave uses `parse` patterns: "{name}" matches a quoted value, {name:d} an integer. */
  function parseRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped.replace(/"\{\w+\}"/g, '"([^"]*)"').replace(/\{\w+:d\}/g, '(-?\\d+)')}$`);
  }

  const behaveCombos = LANGUAGES.flatMap((language) => STYLES.flatMap((style) => LEVELS.map((level) => ({ language, style, level }))));
  it.each(behaveCombos)('Behave patterns bind every step of the feature ($level / $style / $language)', (combo) => {
    const model = buildFeature(input({ ...combo, framework: 'behave', api: authApi }));
    const regexes = collectStepDefs(model.scenarios.flatMap((s) => s.steps)).map((d) =>
      parseRegex(behavePattern(d.pattern, d.params.map((p) => p.name))),
    );
    for (const pickle of pickles(renderFeature(model))) {
      for (const step of pickle.steps) {
        expect(
          regexes.filter((r) => r.test(step.text)),
          step.text,
        ).toHaveLength(1);
      }
    }
  });

  it('Behave writes Python with a payload dict and Python booleans', () => {
    const fields = [field({ name: 'email', valid: 'a@b.c' }), field({ name: 'active', valid: 'true', required: false })];
    const code = generate(input({ framework: 'behave', level: 'api', fields })).steps ?? '';
    expect(code).toContain('from behave import given, when, then');
    expect(code).toContain('VALID_PAYLOAD = {\n    "email": "a@b.c",\n    "active": True,\n}');
    expect(code).toContain("@then('the response status should be {status:d}')\ndef step_the_response_status_should_be(context, status):");
  });

  it('Reqnroll writes a binding class with typed methods, async only where needed', () => {
    const code = generate(input({ framework: 'reqnroll', level: 'api' })).steps ?? '';
    expect(code).toContain('[Binding]\npublic class UserLoginSteps');
    expect(code).toContain('    [Then("the response status should be {int}")]\n    public void TheResponseStatusShouldBe(int status)');
    expect(code).toContain('    public async Task ISendARequestTo(string method, string path)');
  });

  it('Reqnroll injects the Playwright page for E2E', () => {
    const code = generate(input({ framework: 'reqnroll' })).steps ?? '';
    expect(code).toContain('public UserLoginSteps(IPage page) => _page = page;');
    expect(code).toContain('await _page.GetByLabel(field).FillAsync(value);');
  });
});

describe('boundary values', () => {
  it('accept each integer bound and reject one step past it', () => {
    expect(boundaryValues(field({ kind: 'number', min: '18', max: '99' }))).toEqual({
      accepted: [
        { value: '18', which: 'min' },
        { value: '99', which: 'max' },
      ],
      rejected: [
        { value: '17', which: 'min' },
        { value: '100', which: 'max' },
      ],
    });
  });

  it('step by 0.01 for decimal bounds', () => {
    expect(boundaryValues(field({ kind: 'number', min: '0.5' })).rejected).toEqual([{ value: '0.49', which: 'min' }]);
  });

  it('treat text bounds as lengths', () => {
    const { accepted, rejected } = boundaryValues(field({ kind: 'text', min: '3', max: '5' }));
    expect(accepted.map((b) => b.value)).toEqual(['aaa', 'aaaaa']);
    expect(rejected.map((b) => b.value)).toEqual(['aa', 'aaaaaa']);
  });

  it('leave the empty value to the missing-field case', () => {
    expect(boundaryValues(field({ kind: 'text', min: '1' })).rejected).toEqual([]);
  });

  it('do not repeat a value when min equals max', () => {
    expect(boundaryValues(field({ kind: 'number', min: '5', max: '5' })).accepted).toEqual([{ value: '5', which: 'min' }]);
  });

  it('ignore bounds that are not numbers', () => {
    expect(boundaryValues(field({ kind: 'number', min: 'abc' }))).toEqual({ accepted: [], rejected: [] });
  });

  it('add rejected and accepted boundary scenarios', () => {
    // The sample Password has a minimum length of 8
    const scenarios = buildFeature(input()).scenarios;
    const titles = scenarios.map((s) => s.title);
    expect(titles).toContain('Value below the minimum for "Password"');
    const accepted = scenarios.find((s) => s.title === 'Boundary value accepted for "Password" (minimum)');
    expect(accepted?.tags).toEqual(['@regression', '@boundary']);
    expect(accepted?.steps.at(-1)?.key).toBe('see');
  });

  it('group accepted boundaries into their own outline', () => {
    const outline = buildFeature(input({ style: 'outline' })).scenarios.find((s) => s.title === 'Boundary values are accepted');
    expect(outline?.examples?.rows).toEqual([['Password', 'aaaaaaaa']]);
  });
});

describe('CSV exports for test-management tools', () => {
  /** Minimal RFC 4180 reader, enough to check the shape of the generated files. */
  function readCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\r' && text[i + 1] === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i++;
      } else cell += ch;
    }
    return rows;
  }

  const model = buildFeature(input({ fields: unbounded() }));
  const cases = toManualCases(model, 'AUTH-12');

  it.each(['generic', 'xray', 'testrail', 'azure'] as const)('%s has the same number of columns on every row', (format) => {
    const rows = readCsv(toCsvFor(format, cases, model));
    expect(rows.length).toBeGreaterThan(cases.length);
    expect(new Set(rows.map((r) => r.length)).size).toBe(1);
  });

  it('Xray: one row per action, grouped by Test ID, expected result on the last action', () => {
    const rows = readCsv(toCsvFor('xray', cases, model));
    expect(rows[0]).toEqual(['Test ID', 'Summary', 'Priority', 'Labels', 'Precondition', 'Action', 'Data', 'Expected Result']);
    const happy = rows.filter((r) => r[0] === 'AUTH-12-TC-01');
    expect(happy.map((r) => r[5])).toEqual(['I fill in "Email" with "ana@example.com"', 'I fill in "Password" with "S3cure!pass"', 'I click "Sign in"']);
    expect(happy.map((r) => r[1])).toEqual(['Successful submission with valid data', '', '']);
    expect(happy.map((r) => r[7])).toEqual(['', '', '1. I should see "Welcome back"']);
  });

  it('TestRail: the feature title becomes the section and the case ID a reference', () => {
    const rows = readCsv(toCsvFor('testrail', cases, model));
    expect(rows[1].slice(0, 5)).toEqual(['Successful submission with valid data', 'User login', 'High', '1. I am on the "Login" page', 'AUTH-12-TC-01']);
  });

  it('Azure DevOps: a Test Case row with numeric priority, then numbered steps', () => {
    const rows = readCsv(toCsvFor('azure', cases, model));
    expect(rows[1]).toEqual(['', 'Test Case', 'Successful submission with valid data', '1', 'e2e; automated; AUTH-12; regression; happy-path', '', '', '']);
    expect(rows[2].slice(5, 7)).toEqual(['1', 'Preconditions: I am on the "Login" page']);
    expect(rows[5].slice(5)).toEqual(['4', 'I click "Sign in"', '1. I should see "Welcome back"']);
  });
});
