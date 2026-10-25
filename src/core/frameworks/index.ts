import type { FeatureModel, Framework, GeneratorInput, TestLevel } from '../types';
import { renderBehave } from './behave';
import { renderCucumberJs, renderPlaywrightBdd } from './javascript';
import { renderKarate } from './karate';
import { renderReqnroll } from './reqnroll';
import { collectStepDefs, pascal, patternWords, type StepRenderer } from './shared';

export { collectStepDefs, type StepDef } from './shared';
export { behavePattern } from './behave';
export { renderKarate } from './karate';

interface FrameworkInfo {
  label: string;
  /** Language of the generated code, shown next to the framework name. */
  codeLanguage: string;
  /** Name of the generated output, used as the tab title. */
  output: string;
  /** Levels the framework can automate. */
  levels: TestLevel[];
  render: (input: GeneratorInput, model: FeatureModel) => string;
  /** File name for the generated code, from the feature slug and title. */
  filename: (slug: string, title: string) => string;
}

/** Step-definition frameworks bind the steps of the business feature, collected once per pattern. */
const glue =
  (render: StepRenderer) =>
  (input: GeneratorInput, model: FeatureModel): string =>
    render(input, collectStepDefs(model.scenarios.flatMap((s) => s.steps)));

const BOTH: TestLevel[] = ['e2e', 'api'];

export const FRAMEWORKS: Record<Framework, FrameworkInfo> = {
  'playwright-bdd': {
    label: 'playwright-bdd',
    codeLanguage: 'TypeScript',
    output: 'Step definitions',
    levels: BOTH,
    render: glue(renderPlaywrightBdd),
    filename: (slug) => `${slug}.steps.ts`,
  },
  'cucumber-js': {
    label: 'Cucumber.js',
    codeLanguage: 'TypeScript',
    output: 'Step definitions',
    levels: BOTH,
    render: glue(renderCucumberJs),
    filename: (slug) => `${slug}.steps.ts`,
  },
  behave: {
    label: 'Behave',
    codeLanguage: 'Python',
    output: 'Step definitions',
    levels: BOTH,
    render: glue(renderBehave),
    filename: (slug) => `${slug.replace(/-/g, '_')}_steps.py`,
  },
  reqnroll: {
    label: 'Reqnroll',
    codeLanguage: 'C#',
    output: 'Step definitions',
    levels: BOTH,
    render: glue(renderReqnroll),
    filename: (_, title) => `${pascal(patternWords(title)) || 'Feature'}Steps.cs`,
  },
  karate: {
    label: 'Karate',
    codeLanguage: 'Karate DSL',
    output: 'Karate feature',
    levels: ['api'],
    render: renderKarate,
    filename: (slug) => `${slug}.karate.feature`,
  },
};

/** The framework actually used: one that cannot automate the chosen level falls back to playwright-bdd. */
export function frameworkFor(input: Pick<GeneratorInput, 'framework' | 'level'>): Framework {
  return FRAMEWORKS[input.framework].levels.includes(input.level) ? input.framework : 'playwright-bdd';
}

export function renderSteps(input: GeneratorInput, model: FeatureModel): string {
  return FRAMEWORKS[frameworkFor(input)].render(input, model);
}
