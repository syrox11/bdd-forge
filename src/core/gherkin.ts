import { KEYWORDS } from './i18n';
import type { FeatureModel, Step } from './types';

/** Quotes a {string} argument; outline placeholders stay inside quotes so the step text still matches. */
export function quote(value: string): string {
  return value.includes('"') ? `'${value}'` : `"${value}"`;
}

/** Fills a step pattern with its arguments, the way it appears in a .feature file. */
export function stepText(step: Step): string {
  let i = 0;
  return step.pattern.replace(/\{(string|int)\}/g, (_, type: string) => {
    const arg = step.args[i++];
    return type === 'int' ? String(arg) : quote(String(arg));
  });
}

function cell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function table(headers: string[], rows: string[][], indent: string): string[] {
  const all = [headers, ...rows].map((r) => r.map(cell));
  const widths = headers.map((_, c) => Math.max(...all.map((r) => r[c].length)));
  return all.map((r) => `${indent}| ${r.map((v, c) => v.padEnd(widths[c])).join(' | ')} |`);
}

export function renderFeature(model: FeatureModel): string {
  const kw = KEYWORDS[model.language];
  const out: string[] = [];
  if (model.language !== 'en') out.push(`# language: ${model.language}`);
  if (model.tags.length) out.push(model.tags.join(' '));
  out.push(`${kw.feature}: ${model.title}`);
  for (const line of model.narrative) out.push(`  ${line}`);

  for (const sc of model.scenarios) {
    out.push('');
    if (sc.tags.length) out.push(`  ${sc.tags.join(' ')}`);
    out.push(`  ${sc.examples ? kw.outline : kw.scenario}: ${sc.title}`);
    let previous: Step['kind'] | undefined;
    for (const st of sc.steps) {
      const keyword = st.kind === previous ? kw.and : kw[st.kind];
      out.push(`    ${keyword} ${stepText(st)}`);
      previous = st.kind;
    }
    if (sc.examples) {
      out.push('');
      out.push(`    ${kw.examples}:`);
      out.push(...table(sc.examples.headers, sc.examples.rows, '      '));
    }
  }
  return out.join('\n') + '\n';
}
