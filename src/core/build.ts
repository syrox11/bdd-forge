import { PHRASES } from './i18n';
import type { FeatureModel, Field, GeneratorInput, PhraseKey, Priority, Scenario, Step, StepKind } from './types';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
/** Status the generated negative API scenarios expect for rejected input. */
export const BAD_REQUEST = 400;
export const UNAUTHORIZED = 401;

/** Turns the user's parameters into the scenario model every renderer works from. */
export function buildFeature(input: GeneratorInput): FeatureModel {
  const p = PHRASES[input.language];
  const fields = input.fields.filter((f) => f.name.trim() !== '');

  const step = (key: PhraseKey, kind: StepKind, args: (string | number)[], names: string[]): Step => ({
    key,
    kind,
    pattern: p[key],
    args,
    names,
  });

  const typeTag = `@${input.testType}`;
  const scenario = (title: string, priority: Priority, steps: Step[], extra: Partial<Scenario> = {}): Scenario => ({
    title,
    priority,
    steps,
    // Smoke runs only the critical path, so only the happy path carries the smoke tag
    tags: priority === 'High' ? [typeTag, '@happy-path'] : [input.testType === 'smoke' ? '@regression' : typeTag, '@negative'],
    ...extra,
  });

  const scenarios: Scenario[] = [];
  const includeNegatives = input.testType !== 'smoke';
  const required = fields.filter((f) => f.required);
  const invalid = fields.filter((f) => f.invalid.trim() !== '');

  if (input.level === 'api') {
    const { method, path, successStatus, requiresAuth } = input.api;
    const hasBody = BODY_METHODS.has(method) && fields.length > 0;
    const pre = (auth: boolean): Step[] => [
      step('apiAvailable', 'given', [], []),
      ...(auth ? [step('authenticated', 'given', [], [])] : []),
    ];
    const send = step('send', 'when', [method, path], ['method', 'path']);
    const status = (code: number) => step('status', 'then', [code], ['status']);
    const mentions = (field: string) => step('errorMentions', 'then', [field], ['field']);

    scenarios.push(
      scenario(p.tHappy, 'High', [
        ...pre(requiresAuth),
        ...(hasBody ? [step('validPayload', 'given', [], [])] : []),
        send,
        status(successStatus),
      ]),
    );

    if (requiresAuth) {
      scenarios.push(
        scenario(p.tUnauth, 'High', [
          step('apiAvailable', 'given', [], []),
          step('notAuthenticated', 'given', [], []),
          ...(hasBody ? [step('validPayload', 'given', [], [])] : []),
          send,
          status(UNAUTHORIZED),
        ]),
      );
      // The unauthenticated case is security-critical but not part of the happy path
      scenarios[scenarios.length - 1].tags = [typeTag, '@security'];
    }

    if (includeNegatives && hasBody) {
      if (input.style === 'outline') {
        if (required.length > 0) {
          scenarios.push(
            scenario(
              p.tOutlineMissing,
              'Medium',
              [...pre(requiresAuth), step('payloadWithout', 'given', ['<field>'], ['field']), send, status(BAD_REQUEST), mentions('<field>')],
              { examples: { headers: ['field'], rows: required.map((f) => [f.name]) } },
            ),
          );
        }
        if (invalid.length > 0) {
          scenarios.push(
            scenario(
              p.tOutlineInvalid,
              'Medium',
              [
                ...pre(requiresAuth),
                step('payloadWithValue', 'given', ['<field>', '<value>'], ['field', 'value']),
                send,
                status(BAD_REQUEST),
                mentions('<field>'),
              ],
              { examples: { headers: ['field', 'value'], rows: invalid.map((f) => [f.name, f.invalid]) } },
            ),
          );
        }
      } else {
        for (const f of required) {
          scenarios.push(
            scenario(p.tMissing(f.name), 'Medium', [
              ...pre(requiresAuth),
              step('payloadWithout', 'given', [f.name], ['field']),
              send,
              status(BAD_REQUEST),
              mentions(f.name),
            ]),
          );
        }
        for (const f of invalid) {
          scenarios.push(
            scenario(p.tInvalid(f.name), 'Medium', [
              ...pre(requiresAuth),
              step('payloadWithValue', 'given', [f.name, f.invalid], ['field', 'value']),
              send,
              status(BAD_REQUEST),
              mentions(f.name),
            ]),
          );
        }
      }
    }
  } else {
    const { page, button, successMessage } = input.e2e;
    const onPage = step('onPage', 'given', [page], ['pageName']);
    const fill = (f: Field | string, value: string) =>
      step('fill', 'when', [typeof f === 'string' ? f : f.name, value], ['field', 'value']);
    const click = step('act', 'when', [button], ['label']);
    const fillAllExcept = (skip?: Field) => fields.filter((f) => f !== skip).map((f) => fill(f, f.valid));

    scenarios.push(scenario(p.tHappyE2e, 'High', [onPage, ...fillAllExcept(), click, step('see', 'then', [successMessage], ['text'])]));

    if (includeNegatives) {
      const rejected = (field: string) => [
        step('fieldError', 'then', [field], ['field']),
        step('notSee', 'then', [successMessage], ['text']),
      ];
      if (input.style === 'outline') {
        // Fill every field with valid data first, then break the one under test
        if (required.length > 0) {
          scenarios.push(
            scenario(
              p.tOutlineMissing,
              'Medium',
              [onPage, ...fillAllExcept(), step('leaveEmpty', 'when', ['<field>'], ['field']), click, ...rejected('<field>')],
              { examples: { headers: ['field'], rows: required.map((f) => [f.name]) } },
            ),
          );
        }
        if (invalid.length > 0) {
          scenarios.push(
            scenario(p.tOutlineInvalid, 'Medium', [onPage, ...fillAllExcept(), fill('<field>', '<value>'), click, ...rejected('<field>')], {
              examples: { headers: ['field', 'value'], rows: invalid.map((f) => [f.name, f.invalid]) },
            }),
          );
        }
      } else {
        for (const f of required) {
          scenarios.push(
            scenario(p.tMissing(f.name), 'Medium', [
              onPage,
              ...fillAllExcept(f),
              step('leaveEmpty', 'when', [f.name], ['field']),
              click,
              ...rejected(f.name),
            ]),
          );
        }
        for (const f of invalid) {
          scenarios.push(
            scenario(p.tInvalid(f.name), 'Medium', [onPage, ...fillAllExcept(f), fill(f, f.invalid), click, ...rejected(f.name)]),
          );
        }
      }
    }
  }

  const story = input.storyId.trim();
  return {
    language: input.language,
    title: input.feature.trim() || (input.language === 'es' ? 'Sin título' : 'Untitled'),
    tags: [`@${input.level}`, `@${input.execution}`, ...(story ? [`@${story.replace(/\s+/g, '-')}`] : [])],
    narrative: [
      input.role.trim() && p.narrativeRole(input.role.trim()),
      input.goal.trim() && p.narrativeGoal(input.goal.trim()),
      input.benefit.trim() && p.narrativeBenefit(input.benefit.trim()),
    ].filter((line): line is string => Boolean(line)),
    scenarios,
  };
}
