import { describe, expect, it } from 'vitest';
import { AstBuilder, compile, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import { buildFeature, emptyField, frameworkFor, generate, renderFeature, sampleInput } from '../../src/core';
import type { Field, GeneratorInput, Language, Style, TestType } from '../../src/core';

const field = (overrides: Partial<Field>): Field => ({ ...emptyField(), ...overrides });
const api = (requiresAuth: boolean) => ({ method: 'POST' as const, path: '/api/users', successStatus: 201, requiresAuth });
const fields = [
  field({ name: 'email', valid: 'ana@example.com', invalid: 'not-an-email' }),
  field({ name: 'age', valid: '30', kind: 'number', min: '18', max: '99', required: false }),
  // Quotes, apostrophes and backslashes must survive both the scenario and the outline style
  field({ name: 'nick "the" O\'Brien', valid: 'a\\b', invalid: "it's" }),
];
const input = (overrides: Partial<GeneratorInput> = {}): GeneratorInput => ({
  ...sampleInput(),
  level: 'api',
  framework: 'karate',
  api: api(true),
  fields,
  ...overrides,
});
const karate = (params: GeneratorInput) => generate(params).steps ?? '';

function parse(feature: string) {
  const newId = IdGenerator.incrementing();
  const document = new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher()).parse(feature);
  return { document, pickles: compile(document, 'generated.feature', newId) };
}

const LANGUAGES: Language[] = ['en', 'es'];
const STYLES: Style[] = ['scenario', 'outline'];
const TYPES: TestType[] = ['regression', 'smoke'];
const combos = LANGUAGES.flatMap((language) =>
  STYLES.flatMap((style) => TYPES.flatMap((testType) => [true, false].map((auth) => ({ language, style, testType, auth })))),
);

/** The JavaScript a Karate step evaluates, or undefined for steps with no expression. */
function expression(step: string): string | undefined {
  const m =
    /^(?:def \w+ =|header \w+ =|url|path|request|eval) (.+)$/.exec(step) ??
    /^match responseText contains (.+)$/.exec(step);
  return m?.[1];
}

describe('Karate output', () => {
  it.each(combos)('is valid Gherkin that mirrors the business feature ($style / $language / $testType / auth $auth)', (combo) => {
    const params = input({ language: combo.language, style: combo.style, testType: combo.testType, api: api(combo.auth) });
    const business = parse(renderFeature(buildFeature(params)));
    const own = parse(karate(params));

    const scenarios = (doc: typeof own.document) =>
      doc.feature!.children.filter((c) => c.scenario).map((c) => ({
        name: c.scenario!.name,
        tags: c.scenario!.tags.map((t) => t.name),
        rows: c.scenario!.examples.flatMap((e) => e.tableBody).length,
      }));
    expect(scenarios(own.document)).toEqual(scenarios(business.document));
    expect(own.pickles).toHaveLength(business.pickles.length);
  });

  it.each(combos)('evaluates valid JavaScript once outlines are expanded ($style / $language / $testType / auth $auth)', (combo) => {
    const params = input({ language: combo.language, style: combo.style, testType: combo.testType, api: api(combo.auth) });
    for (const pickle of parse(karate(params)).pickles) {
      for (const step of pickle.steps) {
        expect(step.text, pickle.name).not.toMatch(/<\w+>/);
        const js = expression(step.text);
        if (js !== undefined) expect(() => new Function(`return (${js});`), step.text).not.toThrow();
      }
    }
  });

  it('keeps English keywords for a Spanish feature', () => {
    const code = karate(input({ language: 'es' }));
    expect(code).not.toContain('# language');
    expect(code).toContain('Feature: User login');
    expect(code).toContain('Scenario: Petición correcta con datos válidos');
  });

  it('sets up the base URL, token and valid payload in the Background', () => {
    const code = karate(input());
    expect(code).toContain("  Background:\n    * url karate.properties['baseUrl'] || 'http://localhost:3000'");
    expect(code).toContain("    * def apiToken = java.lang.System.getenv('API_TOKEN')");
    expect(code).toContain('    * def validPayload = { "email": "ana@example.com", "age": 30, "nick \\"the\\" O\'Brien": "a\\\\b" }');
  });

  it('writes the happy path as a request against the endpoint', () => {
    const code = karate(input());
    expect(code).toContain(
      [
        '  Scenario: Successful request with valid data',
        "    Given header Authorization = 'Bearer ' + apiToken",
        "    And path '/api/users'",
        '    And request validPayload',
        '    When method post',
        '    Then status 201',
      ].join('\n'),
    );
  });

  it('sends no token in the unauthenticated case', () => {
    const code = karate(input());
    const unauth = code.slice(code.indexOf('Scenario: Request without authentication'));
    expect(unauth.slice(0, unauth.indexOf('Then'))).toContain('# No Authorization header is sent');
    expect(unauth).toContain('Then status 401');
  });

  it('inlines the changed payload in one scenario per case', () => {
    const code = karate(input());
    expect(code).toContain('    And request { "age": 30, "nick \\"the\\" O\'Brien": "a\\\\b" }');
    expect(code).toContain('    And request { "email": "ana@example.com", "age": 17, "nick \\"the\\" O\'Brien": "a\\\\b" }');
    expect(code).toContain('    And match responseText contains "email"');
  });

  it('turns outline Examples into JavaScript literals', () => {
    const { pickles } = parse(karate(input({ style: 'outline' })));
    const texts = pickles.flatMap((p) => p.steps.map((s) => s.text));
    expect(texts).toContain('def payload = karate.merge(validPayload, { "age": 17 })');
    expect(texts).toContain('def payload = karate.merge(validPayload, { "email": "not-an-email" })');
    expect(texts).toContain("eval karate.remove('payload', \"$['email']\")");
  });

  it('leaves out the payload for a request without a body', () => {
    const code = karate(input({ api: { ...api(false), method: 'GET' } }));
    expect(code).not.toContain('validPayload');
    expect(code).not.toMatch(/^ *And request /m);
    expect(code).toContain('When method get');
  });

  it('is offered for API only: E2E falls back to playwright-bdd', () => {
    expect(frameworkFor({ framework: 'karate', level: 'api' })).toBe('karate');
    expect(frameworkFor({ framework: 'karate', level: 'e2e' })).toBe('playwright-bdd');
    expect(karate(input({ level: 'e2e' }))).toContain("import { createBdd } from 'playwright-bdd';");
  });
});
