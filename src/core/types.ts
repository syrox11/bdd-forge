/** What the user asks for: the parameters a QA engineer would set before writing scenarios. */

export type TestLevel = 'api' | 'e2e';
export type TestType = 'smoke' | 'regression' | 'functional';
export type Execution = 'manual' | 'automated';
export type Language = 'en' | 'es';
/** `scenario`: one scenario per case. `outline`: negative cases grouped in a Scenario Outline with Examples. */
export type Style = 'scenario' | 'outline';
export type Framework = 'playwright-bdd' | 'cucumber-js' | 'behave' | 'reqnroll' | 'karate';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Field {
  name: string;
  /** A value that should be accepted. */
  valid: string;
  /** A value that should be rejected; empty means "no invalid case for this field". */
  invalid: string;
  required: boolean;
  /** `number`: min/max bound the value. `text`: min/max bound the length. */
  kind: 'text' | 'number';
  /** Optional bounds; empty means unbounded. Bounds add boundary-value cases. */
  min: string;
  max: string;
}

export interface ApiTarget {
  method: HttpMethod;
  path: string;
  successStatus: number;
  requiresAuth: boolean;
}

export interface E2eTarget {
  page: string;
  /** Label of the button that submits the form, e.g. "Sign in". */
  button: string;
  /** What the user sees on success, e.g. "Welcome back". */
  successMessage: string;
}

export interface GeneratorInput {
  feature: string;
  storyId: string;
  /** User story parts: As a <role>, I want <goal>, so that <benefit>. All optional. */
  role: string;
  goal: string;
  benefit: string;
  level: TestLevel;
  testType: TestType;
  execution: Execution;
  language: Language;
  style: Style;
  framework: Framework;
  api: ApiTarget;
  e2e: E2eTarget;
  fields: Field[];
}

/** Semantic step kind; rendering decides between the kind's keyword and "And". */
export type StepKind = 'given' | 'when' | 'then';

export type PhraseKey =
  | 'apiAvailable' | 'authenticated' | 'notAuthenticated' | 'validPayload' | 'payloadWithout' | 'payloadWithValue'
  | 'send' | 'status' | 'errorMentions'
  | 'onPage' | 'fill' | 'leaveEmpty' | 'act' | 'see' | 'fieldError' | 'notSee';

/**
 * A step whose text is a Cucumber expression plus the values that fill it.
 * `pattern` uses {string} and {int}; `args` holds one value per placeholder, in order.
 * An arg like `<field>` is an outline placeholder and is rendered unchanged inside quotes.
 */
export interface Step {
  /** Phrase key in i18n PHRASES; generators use it to pick an implementation hint. */
  key: PhraseKey;
  kind: StepKind;
  pattern: string;
  args: (string | number)[];
  /** Parameter names for step definitions, one per placeholder. */
  names: string[];
}

export interface Examples {
  headers: string[];
  rows: string[][];
}

export type Priority = 'High' | 'Medium' | 'Low';

export type CsvFormat = 'generic' | 'xray' | 'testrail' | 'azure';

export interface Scenario {
  title: string;
  tags: string[];
  priority: Priority;
  steps: Step[];
  examples?: Examples;
}

export interface FeatureModel {
  language: Language;
  title: string;
  tags: string[];
  narrative: string[];
  scenarios: Scenario[];
}
