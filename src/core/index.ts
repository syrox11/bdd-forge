import { buildFeature } from './build';
import { renderFeature } from './gherkin';
import { toCsv, toManualCases } from './manual';
import { renderSteps } from './steps';
import type { GeneratorInput } from './types';

export * from './types';
export { buildFeature } from './build';
export { renderFeature, stepText } from './gherkin';
export { toCsv, toManualCases } from './manual';
export { renderSteps, collectStepDefs } from './steps';

export interface GeneratedOutput {
  feature: string;
  /** Step definitions; null for manual execution, where nothing gets automated. */
  steps: string | null;
  manual: ReturnType<typeof toManualCases>;
  csv: string;
}

export function generate(input: GeneratorInput): GeneratedOutput {
  const model = buildFeature(input);
  const manual = toManualCases(model, input.storyId);
  return {
    feature: renderFeature(model),
    steps: input.execution === 'automated' ? renderSteps(input, model.scenarios.flatMap((s) => s.steps)) : null,
    manual,
    csv: toCsv(manual, input.language),
  };
}

/** A ready-to-run example so the app never opens empty. */
export function sampleInput(): GeneratorInput {
  return {
    feature: 'User login',
    storyId: 'AUTH-12',
    role: 'registered user',
    goal: 'to sign in with my email and password',
    benefit: 'I can access my account',
    level: 'e2e',
    testType: 'regression',
    execution: 'automated',
    language: 'en',
    style: 'scenario',
    framework: 'playwright-bdd',
    api: { method: 'POST', path: '/api/login', successStatus: 200, requiresAuth: false },
    e2e: { page: 'Login', button: 'Sign in', successMessage: 'Welcome back' },
    fields: [
      { name: 'Email', valid: 'ana@example.com', invalid: 'not-an-email', required: true },
      { name: 'Password', valid: 'S3cure!pass', invalid: '', required: true },
    ],
  };
}
