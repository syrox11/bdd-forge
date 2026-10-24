import { PHRASES } from './i18n';
import type { FeatureModel, Field, GeneratorInput, PhraseKey, Priority, Scenario, Step, StepKind } from './types';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
/** Status the generated negative API scenarios expect for rejected input. */
export const BAD_REQUEST = 400;
export const UNAUTHORIZED = 401;

export interface BoundaryValue {
  value: string;
  which: 'min' | 'max';
}

/**
 * Classic boundary-value analysis on a field's bounds: each bound itself is accepted,
 * one step past it is rejected. For text fields the bounds are lengths.
 */
export function boundaryValues(field: Field): { accepted: BoundaryValue[]; rejected: BoundaryValue[] } {
  const accepted: BoundaryValue[] = [];
  const rejected: BoundaryValue[] = [];
  const min = field.min.trim() === '' ? undefined : Number(field.min);
  const max = field.max.trim() === '' ? undefined : Number(field.max);
  const ok = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n);

  if (field.kind === 'number') {
    const integer = [min, max].every((n) => n === undefined || Number.isInteger(n));
    const step = integer ? 1 : 0.01;
    const fmt = (n: number) => (integer ? String(n) : n.toFixed(2));
    if (ok(min)) {
      accepted.push({ value: fmt(min), which: 'min' });
      rejected.push({ value: fmt(min - step), which: 'min' });
    }
    if (ok(max)) {
      accepted.push({ value: fmt(max), which: 'max' });
      rejected.push({ value: fmt(max + step), which: 'max' });
    }
  } else {
    const text = (length: number) => 'a'.repeat(length);
    if (ok(min) && min >= 1) {
      accepted.push({ value: text(min), which: 'min' });
      // A length of 0 is the empty value, already covered by the "missing required field" case
      if (min - 1 >= 1) rejected.push({ value: text(min - 1), which: 'min' });
    }
    if (ok(max) && max >= 1) {
      accepted.push({ value: text(max), which: 'max' });
      rejected.push({ value: text(max + 1), which: 'max' });
    }
  }
  // min == max yields the same accepted value twice
  const unique = (list: BoundaryValue[]) => list.filter((b, i) => list.findIndex((o) => o.value === b.value) === i);
  return { accepted: unique(accepted), rejected: unique(rejected) };
}

interface ValueCase {
  field: Field;
  value: string;
  title: string;
}

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
  const negativeTag = input.testType === 'smoke' ? '@regression' : typeTag;
  const scenario = (title: string, priority: Priority, steps: Step[], extra: Partial<Scenario> = {}): Scenario => ({
    title,
    priority,
    steps,
    // Smoke runs only the critical path, so only the happy path carries the smoke tag
    tags: priority === 'High' ? [typeTag, '@happy-path'] : [negativeTag, '@negative'],
    ...extra,
  });

  const scenarios: Scenario[] = [];
  const includeNegatives = input.testType !== 'smoke';
  const required = fields.filter((f) => f.required);

  // Values that must be rejected: explicit invalid values, then values just outside the bounds
  const invalidCases: ValueCase[] = [
    ...fields.filter((f) => f.invalid.trim() !== '').map((f) => ({ field: f, value: f.invalid, title: p.tInvalid(f.name) })),
    ...fields.flatMap((f) =>
      boundaryValues(f).rejected.map((b) => ({ field: f, value: b.value, title: b.which === 'min' ? p.tBelowMin(f.name) : p.tAboveMax(f.name) })),
    ),
  ];
  // Values on the bounds, which must be accepted
  const boundaryCases: ValueCase[] = fields.flatMap((f) =>
    boundaryValues(f).accepted.map((b) => ({ field: f, value: b.value, title: p.tBoundaryOk(f.name, b.which) })),
  );
  const boundaryTags = [negativeTag, '@boundary'];
  const examplesOf = (cases: ValueCase[]) => ({ headers: ['field', 'value'], rows: cases.map((c) => [c.field.name, c.value]) });

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
    const withValue = (field: string, value: string) => step('payloadWithValue', 'given', [field, value], ['field', 'value']);
    const rejectedSteps = (field: string, value: string) => [...pre(requiresAuth), withValue(field, value), send, status(BAD_REQUEST), mentions(field)];
    const acceptedSteps = (field: string, value: string) => [...pre(requiresAuth), withValue(field, value), send, status(successStatus)];

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
        scenario(
          p.tUnauth,
          'High',
          [
            step('apiAvailable', 'given', [], []),
            step('notAuthenticated', 'given', [], []),
            ...(hasBody ? [step('validPayload', 'given', [], [])] : []),
            send,
            status(UNAUTHORIZED),
          ],
          // The unauthenticated case is security-critical but not part of the happy path
          { tags: [typeTag, '@security'] },
        ),
      );
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
        if (invalidCases.length > 0) {
          scenarios.push(scenario(p.tOutlineInvalid, 'Medium', rejectedSteps('<field>', '<value>'), { examples: examplesOf(invalidCases) }));
        }
        if (boundaryCases.length > 0) {
          scenarios.push(
            scenario(p.tOutlineBoundary, 'Medium', acceptedSteps('<field>', '<value>'), { examples: examplesOf(boundaryCases), tags: boundaryTags }),
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
        for (const c of invalidCases) scenarios.push(scenario(c.title, 'Medium', rejectedSteps(c.field.name, c.value)));
        for (const c of boundaryCases) scenarios.push(scenario(c.title, 'Medium', acceptedSteps(c.field.name, c.value), { tags: boundaryTags }));
      }
    }
  } else {
    const { page, button, successMessage } = input.e2e;
    const onPage = step('onPage', 'given', [page], ['pageName']);
    const fill = (field: string, value: string) => step('fill', 'when', [field, value], ['field', 'value']);
    const click = step('act', 'when', [button], ['label']);
    const fillAllExcept = (skip?: Field) => fields.filter((f) => f !== skip).map((f) => fill(f.name, f.valid));
    const success = step('see', 'then', [successMessage], ['text']);
    const rejected = (field: string) => [step('fieldError', 'then', [field], ['field']), step('notSee', 'then', [successMessage], ['text'])];

    scenarios.push(scenario(p.tHappyE2e, 'High', [onPage, ...fillAllExcept(), click, success]));

    if (includeNegatives) {
      if (input.style === 'outline') {
        // Fill every field with valid data first, then change the one under test
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
        if (invalidCases.length > 0) {
          scenarios.push(
            scenario(p.tOutlineInvalid, 'Medium', [onPage, ...fillAllExcept(), fill('<field>', '<value>'), click, ...rejected('<field>')], {
              examples: examplesOf(invalidCases),
            }),
          );
        }
        if (boundaryCases.length > 0) {
          scenarios.push(
            scenario(p.tOutlineBoundary, 'Medium', [onPage, ...fillAllExcept(), fill('<field>', '<value>'), click, success], {
              examples: examplesOf(boundaryCases),
              tags: boundaryTags,
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
        for (const c of invalidCases) {
          scenarios.push(scenario(c.title, 'Medium', [onPage, ...fillAllExcept(c.field), fill(c.field.name, c.value), click, ...rejected(c.field.name)]));
        }
        for (const c of boundaryCases) {
          scenarios.push(
            scenario(c.title, 'Medium', [onPage, ...fillAllExcept(c.field), fill(c.field.name, c.value), click, success], { tags: boundaryTags }),
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
