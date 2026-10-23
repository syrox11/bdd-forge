import type { Field, Framework, GeneratorInput, PhraseKey, Step, StepKind, TestLevel } from './types';

/** One step definition, collected once per pattern across every scenario. */
interface StepDef {
  kind: StepKind;
  key: PhraseKey;
  pattern: string;
  params: { name: string; type: 'string' | 'number' }[];
}

export function collectStepDefs(steps: Step[]): StepDef[] {
  const seen = new Map<string, StepDef>();
  for (const st of steps) {
    if (seen.has(st.pattern)) continue;
    const types = [...st.pattern.matchAll(/\{(string|int)\}/g)].map((m) => (m[1] === 'int' ? 'number' : 'string') as 'string' | 'number');
    seen.set(st.pattern, { kind: st.kind, key: st.key, pattern: st.pattern, params: types.map((type, i) => ({ name: st.names[i], type })) });
  }
  const order: StepKind[] = ['given', 'when', 'then'];
  return [...seen.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** Sample values typed by intent: numbers stay numbers in the generated payload. */
function literal(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  if (value === 'true' || value === 'false') return value;
  return JSON.stringify(value);
}

function payloadObject(fields: Field[], indent: string): string {
  const lines = fields.filter((f) => f.name.trim()).map((f) => `${indent}  ${JSON.stringify(f.name)}: ${literal(f.valid)},`);
  return lines.length ? `{\n${lines.join('\n')}\n${indent}}` : '{}';
}

/**
 * Implementation hints per step, written against the chosen framework.
 * `s` is the state holder: a module-level object for playwright-bdd, the World (`this`) for Cucumber.js.
 */
function hint(key: PhraseKey, fw: Framework): string[] {
  const s = fw === 'playwright-bdd' ? 'ctx' : 'this';
  const page = fw === 'playwright-bdd' ? 'page' : 'this.page';
  switch (key) {
    case 'apiAvailable':
      return ['// Optional: check a health endpoint before the scenario starts'];
    case 'authenticated':
      return [`${s}.headers = { Authorization: \`Bearer \${process.env.API_TOKEN}\` };`];
    case 'notAuthenticated':
      return [`${s}.headers = {};`];
    case 'validPayload':
      return [`${s}.payload = { ...validPayload };`];
    case 'payloadWithout':
      return [`${s}.payload = { ...validPayload };`, `delete ${s}.payload[field];`];
    case 'payloadWithValue':
      return [`${s}.payload = { ...validPayload, [field]: value };`];
    case 'send':
      return fw === 'playwright-bdd'
        ? ['ctx.response = await request.fetch(path, { method, headers: ctx.headers, data: ctx.payload });']
        : [
            'this.response = await fetch(`${process.env.BASE_URL}${path}`, {',
            '  method,',
            "  headers: { 'Content-Type': 'application/json', ...this.headers },",
            "  body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(this.payload),",
            '});',
          ];
    case 'status':
      return fw === 'playwright-bdd' ? ['expect(ctx.response?.status()).toBe(status);'] : ['assert.equal(this.response.status, status);'];
    case 'errorMentions':
      return fw === 'playwright-bdd'
        ? ['expect(await ctx.response?.text()).toContain(field);']
        : ['assert.ok((await this.response.text()).includes(field));'];
    case 'onPage':
      return ['// TODO: map the page name to its URL', `await ${page}.goto('/');`];
    case 'fill':
      return [`await ${page}.getByLabel(field).fill(value);`];
    case 'leaveEmpty':
      return [`await ${page}.getByLabel(field).clear();`];
    case 'act':
      return [`await ${page}.getByRole('button', { name: label }).click();`];
    case 'see':
      return [`await expect(${page}.getByText(text)).toBeVisible();`];
    case 'fieldError':
      return ['// TODO: adapt to how the app flags invalid fields', `await expect(${page}.getByLabel(field)).toHaveAttribute('aria-invalid', 'true');`];
    case 'notSee':
      return [`await expect(${page}.getByText(text)).toBeHidden();`];
  }
}

function header(level: TestLevel, fw: Framework, fields: Field[]): string[] {
  const lines: string[] = [];
  if (fw === 'playwright-bdd') {
    lines.push(
      level === 'api' ? "import { expect, type APIResponse } from '@playwright/test';" : "import { expect } from '@playwright/test';",
      "import { createBdd } from 'playwright-bdd';",
      '',
      'const { Given, When, Then } = createBdd();',
    );
    if (level === 'api') {
      lines.push(
        '',
        '// Shared state between the steps of one scenario. For parallel runs, move it into a custom fixture.',
        'const ctx: { headers: Record<string, string>; payload: Record<string, unknown>; response?: APIResponse } = {',
        '  headers: {},',
        '  payload: {},',
        '};',
      );
    }
  } else {
    lines.push("import { Given, When, Then } from '@cucumber/cucumber';");
    lines.push(level === 'api' ? "import assert from 'node:assert/strict';" : "import { expect } from '@playwright/test';");
    if (level === 'e2e') lines.push('', '// Assumes a custom World that exposes a Playwright `page` (see the Cucumber.js + Playwright docs).');
  }
  if (level === 'api') lines.push('', `const validPayload: Record<string, unknown> = ${payloadObject(fields, '')};`);
  return lines;
}

export function renderSteps(input: GeneratorInput, steps: Step[]): string {
  const fw = input.framework;
  const out = header(input.level, fw, input.fields);
  const fn = { given: 'Given', when: 'When', then: 'Then' } as const;
  const fixture = input.level === 'api' ? 'request' : 'page';

  for (const def of collectStepDefs(steps)) {
    const typed = def.params.map((p) => `${p.name}: ${p.type}`);
    let signature: string;
    if (fw === 'playwright-bdd') {
      const uses = def.key === 'send' || input.level === 'e2e';
      signature = `async (${uses ? `{ ${fixture} }` : '{}'}${typed.length ? ', ' + typed.join(', ') : ''})`;
    } else {
      signature = `async function (${typed.join(', ')})`;
    }
    out.push('', `${fn[def.kind]}(${JSON.stringify(def.pattern)}, ${signature} => {`);
    if (fw === 'cucumber-js') out[out.length - 1] = `${fn[def.kind]}(${JSON.stringify(def.pattern)}, ${signature} {`;
    for (const line of hint(def.key, fw)) out.push(`  ${line}`);
    out.push('});');
  }
  return out.join('\n') + '\n';
}
