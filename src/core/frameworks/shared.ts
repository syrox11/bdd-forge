import type { Field, GeneratorInput, PhraseKey, Step, StepKind } from '../types';

/** One step definition, collected once per pattern across every scenario. */
export interface StepDef {
  kind: StepKind;
  key: PhraseKey;
  /** Cucumber expression, e.g. `I fill in {string} with {string}`. */
  pattern: string;
  params: { name: string; type: 'string' | 'number' }[];
}

/** A framework's step-definition generator. */
export interface StepRenderer {
  (input: GeneratorInput, defs: StepDef[]): string;
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

export const namedFields = (fields: Field[]) => fields.filter((f) => f.name.trim() !== '');

export const isNumber = (value: string) => /^-?\d+(\.\d+)?$/.test(value);
export const isBoolean = (value: string) => value === 'true' || value === 'false';

/** Words of a pattern without its placeholders, accents stripped: the raw material for function names. */
export function patternWords(pattern: string): string[] {
  return pattern
    .replace(/\{(string|int)\}/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

/** Makes names unique by appending 2, 3... to repeats. */
export function uniqueNames(names: string[]): string[] {
  const count = new Map<string, number>();
  return names.map((n) => {
    const c = (count.get(n) ?? 0) + 1;
    count.set(n, c);
    return c === 1 ? n : `${n}${c}`;
  });
}

export const pascal = (words: string[]) => words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
