import { table } from '../gherkin';
import type { FeatureModel, GeneratorInput, Scenario, StepKind } from '../types';
import { isBoolean, isNumber, namedFields } from './shared';

/**
 * Karate has no step definitions: its own DSL is the test. So instead of glue code it gets a
 * runnable Karate feature that mirrors the business feature scenario by scenario, with the same
 * titles, tags and Examples. Every expression is JavaScript, which is what Karate evaluates.
 */

function literal(value: string): string {
  return isNumber(value) || isBoolean(value) ? value : JSON.stringify(value);
}

/** A JavaScript single-quoted string, the usual Karate style. */
function js(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Outline placeholders keep Karate's own <name> substitution, so they stay unresolved here. */
const isPlaceholder = (arg: string | number) => /^<\w+>$/.test(String(arg));

/** A field name inside a JavaScript double-quoted string; placeholders get the same escaping in the Examples cells. */
const inString = (value: string) => JSON.stringify(value).slice(1, -1);

function payload(input: GeneratorInput, change: { without?: string; set?: [string, string] }): string {
  const entries = namedFields(input.fields)
    .filter((f) => f.name !== change.without)
    .map((f) => `${JSON.stringify(f.name)}: ${literal(change.set?.[0] === f.name ? change.set[1] : f.valid)}`);
  return entries.length ? `{ ${entries.join(', ')} }` : '{}';
}

type Line = { kind: StepKind; text: string } | { comment: string };

function scenarioLines(input: GeneratorInput, sc: Scenario): Line[] {
  const lines: Line[] = [];
  const given = (text: string) => lines.push({ kind: 'given', text });
  let body: string | undefined;

  for (const st of sc.steps) {
    const [a, b] = st.args.map(String);
    switch (st.key) {
      case 'apiAvailable':
        break;
      case 'authenticated':
        given("header Authorization = 'Bearer ' + apiToken");
        break;
      case 'notAuthenticated':
        lines.push({ comment: 'No Authorization header is sent' });
        break;
      case 'validPayload':
        body = 'validPayload';
        break;
      case 'payloadWithout':
        if (isPlaceholder(a)) {
          given('def payload = karate.copy(validPayload)');
          given(`eval karate.remove('payload', "$['${a}']")`);
          body = 'payload';
        } else body = payload(input, { without: a });
        break;
      case 'payloadWithValue':
        if (isPlaceholder(a)) {
          given(`def payload = karate.merge(validPayload, { "${a}": ${b} })`);
          body = 'payload';
        } else body = payload(input, { set: [a, b] });
        break;
      case 'send':
        given(`path ${js(b)}`);
        if (body) given(`request ${body}`);
        lines.push({ kind: 'when', text: `method ${a.toLowerCase()}` });
        break;
      case 'status':
        lines.push({ kind: 'then', text: `status ${a}` });
        break;
      case 'errorMentions':
        lines.push({ kind: 'then', text: 'string responseText = response' });
        lines.push({ kind: 'then', text: `match responseText contains "${isPlaceholder(a) ? a : inString(a)}"` });
        break;
      default:
        // E2E steps never reach Karate: the framework is offered for API only
        break;
    }
  }
  return lines;
}

const KEYWORD = { given: 'Given', when: 'When', then: 'Then' } as const;

export function renderKarate(input: GeneratorInput, model: FeatureModel): string {
  const usesPayload = model.scenarios.some((sc) => sc.steps.some((st) => st.key.startsWith('payload') || st.key === 'validPayload'));
  // Karate only understands English keywords; titles and narrative keep the chosen language
  const out: string[] = [];
  if (model.tags.length) out.push(model.tags.join(' '));
  out.push(`Feature: ${model.title}`);
  for (const line of model.narrative) out.push(`  ${line}`);

  out.push('', '  Background:', "    * url karate.properties['baseUrl'] || 'http://localhost:3000'");
  if (input.api.requiresAuth) out.push("    * def apiToken = java.lang.System.getenv('API_TOKEN')");
  if (usesPayload) out.push(`    * def validPayload = ${payload(input, {})}`);

  for (const sc of model.scenarios) {
    out.push('');
    if (sc.tags.length) out.push(`  ${sc.tags.join(' ')}`);
    out.push(`  ${sc.examples ? 'Scenario Outline' : 'Scenario'}: ${sc.title}`);
    let previous: StepKind | undefined;
    for (const line of scenarioLines(input, sc)) {
      if ('comment' in line) {
        out.push(`    # ${line.comment}`);
        continue;
      }
      out.push(`    ${line.kind === previous ? 'And' : KEYWORD[line.kind]} ${line.text}`);
      previous = line.kind;
    }
    if (sc.examples) {
      // Cells become JavaScript once substituted: field names land inside strings, values are literals
      const rows = sc.examples.rows.map((row) =>
        row.map((cell, c) => (sc.examples!.headers[c] === 'value' ? literal(cell) : inString(cell))),
      );
      out.push('', '    Examples:', ...table(sc.examples.headers, rows, '      '));
    }
  }
  return out.join('\n') + '\n';
}
