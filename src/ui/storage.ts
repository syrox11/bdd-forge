import { sampleInput, type GeneratorInput } from '../core';

const KEY = 'bdd-forge:input:v1';

/** Restores the last form; storage can be unavailable (private mode, blocked site data), so every access is guarded. */
export function loadInput(): GeneratorInput {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...sampleInput(), ...(JSON.parse(raw) as Partial<GeneratorInput>) };
  } catch {
    // fall through to the sample
  }
  return sampleInput();
}

export function saveInput(input: GeneratorInput): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(input));
  } catch {
    // not persisting is fine
  }
}
