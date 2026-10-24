import { describe, expect, it } from 'vitest';
import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import { CucumberExpression, ParameterTypeRegistry } from '@cucumber/cucumber-expressions';
import {
  buildFeature,
  collectStepDefs,
  emptyField,
  generate,
  renderFeature,
  sampleInput,
  toCsv,
  toManualCases,
} from '../../src/core';
import type { Field, GeneratorInput, Language, Style, TestLevel, TestType } from '../../src/core';

function input(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return { ...sampleInput(), ...overrides };
}

const field = (overrides: Partial<Field>): Field => ({ ...emptyField(), ...overrides });

/** Sample fields without bounds, for tests about missing and invalid cases only. */
const unbounded = () => sampleInput().fields.map((f) => ({ ...f, min: '', max: '' }));

function parse(feature: string) {
  const newId = IdGenerator.incrementing();
  const doc = new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher()).parse(feature);
  return { doc, pickles: compile(doc, 'generated.feature', newId) };
}

const LEVELS: TestLevel[] = ['api', 'e2e'];
const STYLES: Style[] = ['scenario', 'outline'];
const LANGUAGES: Language[] = ['en', 'es'];
const TYPES: TestType[] = ['smoke', 'regression', 'functional'];
const matrix = LEVELS.flatMap((level) =>
  STYLES.flatMap((style) => LANGUAGES.flatMap((language) => TYPES.map((testType) => ({ level, style, language, testType })))),
);

describe('every combination produces runnable Gherkin', () => {
  it.each(matrix)('$level / $style / $language / $testType', (combo) => {
    const params = input({
      ...combo,
      api: { method: 'POST', path: '/api/users', successStatus: 201, requiresAuth: true },
      fields: [...sampleInput().fields, field({ name: 'age', valid: '30', kind: 'number', min: '18', max: '99', required: false })],
    });
    const model = buildFeature(params);
    const feature = renderFeature(model);

    // 1. The official Gherkin parser accepts it, in the chosen language
    const { doc, pickles } = parse(feature);
    expect(doc.feature?.language).toBe(combo.language);
    expect(pickles.length).toBeGreaterThan(0);

    // 2. Every concrete step (outlines expanded) matches exactly one generated step definition,
    //    the way Cucumber would bind them at run time
    const registry = new ParameterTypeRegistry();
    const defs = collectStepDefs(model.scenarios.flatMap((s) => s.steps)).map((d) => new CucumberExpression(d.pattern, registry));
    for (const pickle of pickles) {
      for (const step of pickle.steps) {
        const matches = defs.filter((d) => d.match(step.text) !== null);
        expect(matches, `"${step.text}" should match exactly one step definition`).toHaveLength(1);
      }
    }
  });
});

describe('scenario selection', () => {
  it('smoke keeps only the critical scenarios', () => {
    const model = buildFeature(input({ testType: 'smoke' }));
    expect(model.scenarios.map((s) => s.tags)).toEqual([['@smoke', '@happy-path']]);
  });

  it('adds one negative scenario per required field and per invalid value', () => {
    // Email (required, invalid value) + Password (required, no invalid value)
    const titles = buildFeature(input({ fields: unbounded() })).scenarios.map((s) => s.title);
    expect(titles).toEqual([
      'Successful submission with valid data',
      'Missing required field "Email"',
      'Missing required field "Password"',
      'Invalid value for "Email"',
    ]);
  });

  it('groups negatives into outlines with one Examples row per field', () => {
    const outlines = buildFeature(input({ style: 'outline', fields: unbounded() })).scenarios.filter((s) => s.examples);
    expect(outlines.map((s) => s.examples?.rows)).toEqual([[['Email'], ['Password']], [['Email', 'not-an-email']]]);
  });

  it('adds a 401 scenario when the API requires authentication', () => {
    const model = buildFeature(input({ level: 'api', api: { method: 'POST', path: '/x', successStatus: 200, requiresAuth: true } }));
    const unauth = model.scenarios.find((s) => s.tags.includes('@security'));
    expect(unauth?.steps.at(-1)?.args).toEqual([401]);
  });

  it('skips payload scenarios for methods without a body', () => {
    const model = buildFeature(input({ level: 'api', api: { method: 'GET', path: '/x', successStatus: 200, requiresAuth: false } }));
    expect(model.scenarios).toHaveLength(1);
    expect(model.scenarios[0].steps.map((s) => s.key)).toEqual(['apiAvailable', 'send', 'status']);
  });

  it('ignores fields without a name', () => {
    const model = buildFeature(input({ testType: 'regression', fields: [field({ name: '  ', valid: 'x', invalid: 'y', min: '1', max: '5' })] }));
    expect(model.scenarios).toHaveLength(1);
  });
});

describe('feature rendering', () => {
  it('declares the language for non-English features and uses its keywords', () => {
    const feature = generate(input({ language: 'es' })).feature;
    expect(feature.startsWith('# language: es\n')).toBe(true);
    expect(feature).toContain('Característica: User login');
    expect(feature).toMatch(/^ {4}Dado que estoy en la página "Login"$/m);
  });

  it('uses And for consecutive steps of the same kind', () => {
    const lines = generate(input()).feature.split('\n');
    expect(lines).toContain('    And I click "Sign in"');
  });

  it('switches to single quotes when a value contains double quotes', () => {
    const fields = [field({ name: 'Name', valid: 'Ana "the tester"', required: false })];
    expect(generate(input({ fields })).feature).toContain(`When I fill in "Name" with 'Ana "the tester"'`);
  });

  it('tags the feature with level, execution and story', () => {
    expect(generate(input()).feature.split('\n')[0]).toBe('@e2e @automated @AUTH-12');
  });
});

describe('step definitions', () => {
  it('are omitted for manual execution', () => {
    expect(generate(input({ execution: 'manual' })).steps).toBeNull();
  });

  it('declare each pattern once', () => {
    const steps = generate(input()).steps ?? '';
    expect(steps.match(/When\("I fill in \{string\} with \{string\}"/g)).toHaveLength(1);
  });

  it('use playwright-bdd fixtures', () => {
    const steps = generate(input()).steps ?? '';
    expect(steps).toContain("import { createBdd } from 'playwright-bdd';");
    expect(steps).toContain('async ({ page }, field: string, value: string) => {');
  });

  it('use the Cucumber.js World for API state', () => {
    const steps = generate(input({ level: 'api', framework: 'cucumber-js' })).steps ?? '';
    expect(steps).toContain("import { Given, When, Then } from '@cucumber/cucumber';");
    expect(steps).toContain('Then("the response status should be {int}", async function (status: number) {');
    expect(steps).toContain('assert.equal(this.response.status, status);');
  });

  it('build the valid payload from the fields, keeping numbers as numbers', () => {
    const fields = [field({ name: 'email', valid: 'ana@example.com' }), field({ name: 'age', valid: '30', required: false })];
    const steps = generate(input({ level: 'api', fields })).steps ?? '';
    expect(steps).toContain('  "email": "ana@example.com",\n  "age": 30,');
  });
});

describe('manual test cases', () => {
  it('expand every Examples row into its own case', () => {
    const model = buildFeature(input({ style: 'outline', fields: unbounded() }));
    const cases = toManualCases(model, 'AUTH-12');
    // happy path + 2 missing rows + 1 invalid row
    expect(cases.map((c) => c.id)).toEqual(['AUTH-12-TC-01', 'AUTH-12-TC-02', 'AUTH-12-TC-03', 'AUTH-12-TC-04']);
    expect(cases[1].title).toBe('A missing required field is rejected (Email)');
    expect(cases[1].steps).toContain('I leave "Email" empty');
  });

  it('split Given/When/Then into preconditions, steps and expected results', () => {
    const [happy] = toManualCases(buildFeature(input()), '');
    expect(happy).toMatchObject({
      id: 'TC-01',
      priority: 'High',
      preconditions: ['I am on the "Login" page'],
      expected: ['I should see "Welcome back"'],
    });
    expect(happy.steps).toHaveLength(3);
  });

  it('export valid CSV with quoted multi-line cells', () => {
    const csv = toCsv(toManualCases(buildFeature(input()), ''), 'en');
    const [headerRow] = csv.split('\r\n');
    expect(headerRow).toBe('ID,Title,Priority,Preconditions,Steps,Expected result,Tags');
    expect(csv).toContain('"1. I fill in ""Email"" with ""ana@example.com""\n2. ');
  });

  it('translate headers and priorities', () => {
    const csv = generate(input({ language: 'es' })).csv.generic;
    expect(csv.startsWith('ID,Título,Prioridad,')).toBe(true);
    expect(csv).toContain(',Alta,');
  });
});
