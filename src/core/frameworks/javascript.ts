import type { Field, Framework, PhraseKey } from '../types';
import { isBoolean, isNumber, namedFields, type StepRenderer } from './shared';

function literal(value: string): string {
  return isNumber(value) || isBoolean(value) ? value : JSON.stringify(value);
}

function payloadObject(fields: Field[]): string {
  const lines = namedFields(fields).map((f) => `  ${JSON.stringify(f.name)}: ${literal(f.valid)},`);
  return lines.length ? `{\n${lines.join('\n')}\n}` : '{}';
}

/**
 * Implementation hints per step.
 * State lives in a module-level `ctx` for playwright-bdd and in the World (`this`) for Cucumber.js.
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

const FN = { given: 'Given', when: 'When', then: 'Then' } as const;

export const renderPlaywrightBdd: StepRenderer = (input, defs) => {
  const api = input.level === 'api';
  const out = [
    api ? "import { expect, type APIResponse } from '@playwright/test';" : "import { expect } from '@playwright/test';",
    "import { createBdd } from 'playwright-bdd';",
    '',
    'const { Given, When, Then } = createBdd();',
  ];
  if (api) {
    out.push(
      '',
      '// Shared state between the steps of one scenario. For parallel runs, move it into a custom fixture.',
      'const ctx: { headers: Record<string, string>; payload: Record<string, unknown>; response?: APIResponse } = {',
      '  headers: {},',
      '  payload: {},',
      '};',
      '',
      `const validPayload: Record<string, unknown> = ${payloadObject(input.fields)};`,
    );
  }
  for (const def of defs) {
    const typed = def.params.map((p) => `${p.name}: ${p.type}`);
    const uses = def.key === 'send' || !api;
    const fixtures = uses ? `{ ${api ? 'request' : 'page'} }` : '{}';
    out.push('', `${FN[def.kind]}(${JSON.stringify(def.pattern)}, async (${[fixtures, ...typed].join(', ')}) => {`);
    out.push(...hint(def.key, 'playwright-bdd').map((l) => `  ${l}`), '});');
  }
  return out.join('\n') + '\n';
};

export const renderCucumberJs: StepRenderer = (input, defs) => {
  const api = input.level === 'api';
  const out = [
    "import { Given, When, Then } from '@cucumber/cucumber';",
    api ? "import assert from 'node:assert/strict';" : "import { expect } from '@playwright/test';",
  ];
  if (api) out.push('', `const validPayload: Record<string, unknown> = ${payloadObject(input.fields)};`);
  else out.push('', '// Assumes a custom World that exposes a Playwright `page` (see the Cucumber.js + Playwright docs).');
  for (const def of defs) {
    const typed = def.params.map((p) => `${p.name}: ${p.type}`);
    out.push('', `${FN[def.kind]}(${JSON.stringify(def.pattern)}, async function (${typed.join(', ')}) {`);
    out.push(...hint(def.key, 'cucumber-js').map((l) => `  ${l}`), '});');
  }
  return out.join('\n') + '\n';
};
