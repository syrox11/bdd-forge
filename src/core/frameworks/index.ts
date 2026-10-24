import type { Framework, GeneratorInput, Step } from '../types';
import { renderBehave } from './behave';
import { renderCucumberJs, renderPlaywrightBdd } from './javascript';
import { renderReqnroll } from './reqnroll';
import { collectStepDefs, pascal, patternWords, type StepRenderer } from './shared';

export { collectStepDefs, type StepDef } from './shared';
export { behavePattern } from './behave';

interface FrameworkInfo {
  label: string;
  /** Language of the generated step definitions, shown next to the framework name. */
  codeLanguage: string;
  render: StepRenderer;
  /** File name for the step definitions, from the feature slug and title. */
  filename: (slug: string, title: string) => string;
}

export const FRAMEWORKS: Record<Framework, FrameworkInfo> = {
  'playwright-bdd': {
    label: 'playwright-bdd',
    codeLanguage: 'TypeScript',
    render: renderPlaywrightBdd,
    filename: (slug) => `${slug}.steps.ts`,
  },
  'cucumber-js': {
    label: 'Cucumber.js',
    codeLanguage: 'TypeScript',
    render: renderCucumberJs,
    filename: (slug) => `${slug}.steps.ts`,
  },
  behave: {
    label: 'Behave',
    codeLanguage: 'Python',
    render: renderBehave,
    filename: (slug) => `${slug.replace(/-/g, '_')}_steps.py`,
  },
  reqnroll: {
    label: 'Reqnroll',
    codeLanguage: 'C#',
    render: renderReqnroll,
    filename: (_, title) => `${pascal(patternWords(title)) || 'Feature'}Steps.cs`,
  },
};

export function renderSteps(input: GeneratorInput, steps: Step[]): string {
  return FRAMEWORKS[input.framework].render(input, collectStepDefs(steps));
}
