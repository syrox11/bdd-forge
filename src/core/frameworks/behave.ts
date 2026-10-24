import type { Field, PhraseKey } from '../types';
import { isBoolean, isNumber, namedFields, patternWords, uniqueNames, type StepRenderer } from './shared';

/**
 * Behave matches steps with `parse` patterns, not Cucumber expressions:
 * a quoted {string} becomes "{name}" and an {int} becomes {name:d}.
 */
export function behavePattern(pattern: string, names: string[]): string {
  let i = 0;
  return pattern.replace(/\{(string|int)\}/g, (_, type: string) => {
    const name = names[i++];
    return type === 'int' ? `{${name}:d}` : `"{${name}}"`;
  });
}

function literal(value: string): string {
  if (isNumber(value)) return value;
  if (isBoolean(value)) return value === 'true' ? 'True' : 'False';
  return JSON.stringify(value);
}

function payloadDict(fields: Field[]): string {
  const lines = namedFields(fields).map((f) => `    ${JSON.stringify(f.name)}: ${literal(f.valid)},`);
  return lines.length ? `{\n${lines.join('\n')}\n}` : '{}';
}

function hint(key: PhraseKey): string[] {
  switch (key) {
    case 'apiAvailable':
      return ['pass  # Optional: check a health endpoint before the scenario starts'];
    case 'authenticated':
      return ['context.headers = {"Authorization": f"Bearer {os.environ[\'API_TOKEN\']}"}'];
    case 'notAuthenticated':
      return ['context.headers = {}'];
    case 'validPayload':
      return ['context.payload = dict(VALID_PAYLOAD)'];
    case 'payloadWithout':
      return ['context.payload = {k: v for k, v in VALID_PAYLOAD.items() if k != field}'];
    case 'payloadWithValue':
      return ['context.payload = {**VALID_PAYLOAD, field: value}'];
    case 'send':
      return [
        'context.response = requests.request(',
        '    method,',
        '    BASE_URL + path,',
        '    headers=getattr(context, "headers", {}),',
        '    json=None if method in ("GET", "DELETE") else getattr(context, "payload", None),',
        ')',
      ];
    case 'status':
      return ['assert context.response.status_code == status, context.response.text'];
    case 'errorMentions':
      return ['assert field in context.response.text'];
    case 'onPage':
      return ['# TODO: map the page name to its URL', 'context.page.goto(BASE_URL)'];
    case 'fill':
      return ['context.page.get_by_label(field).fill(value)'];
    case 'leaveEmpty':
      return ['context.page.get_by_label(field).clear()'];
    case 'act':
      return ['context.page.get_by_role("button", name=label).click()'];
    case 'see':
      return ['expect(context.page.get_by_text(text)).to_be_visible()'];
    case 'fieldError':
      return ['# TODO: adapt to how the app flags invalid fields', 'expect(context.page.get_by_label(field)).to_have_attribute("aria-invalid", "true")'];
    case 'notSee':
      return ['expect(context.page.get_by_text(text)).to_be_hidden()'];
  }
}

export const renderBehave: StepRenderer = (input, defs) => {
  const api = input.level === 'api';
  const out = ['import os', ''];
  if (api) out.push('import requests');
  else out.push('from playwright.sync_api import expect');
  out.push('from behave import given, when, then', '', 'BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")');
  if (api) out.push('', `VALID_PAYLOAD = ${payloadDict(input.fields)}`);
  else out.push('', '# Assumes environment.py opens a Playwright browser and sets context.page before each scenario.');

  const names = uniqueNames(defs.map((d) => `step_${patternWords(d.pattern).join('_').toLowerCase() || 'impl'}`));
  defs.forEach((def, i) => {
    const params = ['context', ...def.params.map((p) => p.name)];
    out.push('', '', `@${def.kind}('${behavePattern(def.pattern, def.params.map((p) => p.name)).replace(/'/g, "\\'")}')`);
    out.push(`def ${names[i]}(${params.join(', ')}):`, ...hint(def.key).map((l) => `    ${l}`));
  });
  return out.join('\n') + '\n';
};
