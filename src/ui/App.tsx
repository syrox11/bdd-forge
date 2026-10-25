import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import {
  CSV_FORMATS,
  emptyField,
  frameworkFor,
  FRAMEWORKS,
  generate,
  sampleInput,
  type CsvFormat,
  type Field,
  type Framework,
  type GeneratorInput,
  type HttpMethod,
} from '../core';
import { MANUAL_HEADERS } from '../core/i18n';
import { download, slug } from './download';
import { loadInput, saveInput } from './storage';

type Tab = 'feature' | 'steps' | 'manual';

export function App() {
  const [input, setInput] = useState<GeneratorInput>(loadInput);
  const [tab, setTab] = useState<Tab>('feature');
  const [csvFormat, setCsvFormat] = useState<CsvFormat>('generic');
  const output = useMemo(() => generate(input), [input]);

  useEffect(() => saveInput(input), [input]);
  // Manual runs have no step definitions, so that tab disappears
  const activeTab: Tab = tab === 'steps' && !output.steps ? 'feature' : tab;

  const set = <K extends keyof GeneratorInput>(key: K, value: GeneratorInput[K]) => setInput((prev) => ({ ...prev, [key]: value }));
  const setField = (index: number, patch: Partial<Field>) =>
    set(
      'fields',
      input.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );

  const name = slug(input.feature);
  // Karate automates API only; on E2E the choice is kept but playwright-bdd is used and shown
  const framework = frameworkFor(input);
  const frameworks = (Object.keys(FRAMEWORKS) as Framework[]).filter((f) => FRAMEWORKS[f].levels.includes(input.level));

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>BDD Forge</h1>
          <p className="tagline">Scenarios, step definitions and manual test cases from a few QA parameters.</p>
        </div>
        <button type="button" className="ghost" onClick={() => setInput(sampleInput())}>
          Load example
        </button>
      </header>

      <main className="layout">
        <form className="panel form" onSubmit={(e) => e.preventDefault()} aria-label="Generator settings">
          <Section title="Feature">
            <Text label="Feature name" value={input.feature} onChange={(v) => set('feature', v)} />
            <Text label="Story ID" value={input.storyId} onChange={(v) => set('storyId', v)} placeholder="e.g. AUTH-12" />
            <Text label="As a" value={input.role} onChange={(v) => set('role', v)} placeholder="registered user" />
            <Text label="I want" value={input.goal} onChange={(v) => set('goal', v)} placeholder="to sign in" />
            <Text label="So that" value={input.benefit} onChange={(v) => set('benefit', v)} placeholder="I can access my account" />
          </Section>

          <Section title="Test">
            <Choice
              label="Level"
              value={input.level}
              onChange={(v) => set('level', v)}
              options={[
                ['e2e', 'E2E / UI'],
                ['api', 'API'],
              ]}
            />
            <Choice
              label="Execution"
              value={input.execution}
              onChange={(v) => set('execution', v)}
              options={[
                ['automated', 'Automated'],
                ['manual', 'Manual'],
              ]}
            />
            <Choice
              label="Test type"
              value={input.testType}
              onChange={(v) => set('testType', v)}
              options={[
                ['regression', 'Regression'],
                ['functional', 'Functional'],
                ['smoke', 'Smoke'],
              ]}
            />
            <Choice
              label="Gherkin language"
              value={input.language}
              onChange={(v) => set('language', v)}
              options={[
                ['en', 'English'],
                ['es', 'Español'],
              ]}
            />
            <Choice
              label="Negative cases as"
              value={input.style}
              onChange={(v) => set('style', v)}
              options={[
                ['scenario', 'One scenario each'],
                ['outline', 'Scenario Outline'],
              ]}
            />
            {input.execution === 'automated' && (
              <Choice
                label="Framework"
                value={framework}
                onChange={(v) => set('framework', v)}
                options={frameworks.map((f) => [f, `${FRAMEWORKS[f].label} (${FRAMEWORKS[f].codeLanguage})`])}
              />
            )}
          </Section>

          {input.level === 'api' ? (
            <Section title="Endpoint">
              <div className="row">
                <Select
                  label="Method"
                  value={input.api.method}
                  options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE']}
                  onChange={(v) => set('api', { ...input.api, method: v as HttpMethod })}
                />
                <Text label="Path" value={input.api.path} onChange={(v) => set('api', { ...input.api, path: v })} />
                <Text
                  label="Success status"
                  type="number"
                  value={String(input.api.successStatus)}
                  onChange={(v) => set('api', { ...input.api, successStatus: Number(v) || 200 })}
                />
              </div>
              <Check
                label="Requires authentication"
                checked={input.api.requiresAuth}
                onChange={(v) => set('api', { ...input.api, requiresAuth: v })}
              />
            </Section>
          ) : (
            <Section title="Page">
              <Text label="Page name" value={input.e2e.page} onChange={(v) => set('e2e', { ...input.e2e, page: v })} />
              <Text label="Submit button" value={input.e2e.button} onChange={(v) => set('e2e', { ...input.e2e, button: v })} />
              <Text
                label="Success message"
                value={input.e2e.successMessage}
                onChange={(v) => set('e2e', { ...input.e2e, successMessage: v })}
              />
            </Section>
          )}

          <Section title={input.level === 'api' ? 'Payload fields' : 'Form fields'}>
            <p className="hint">
              A required field gets a "missing" case and an invalid value an "invalid" case. Min / max add boundary values: each bound is
              accepted, one step past it is rejected (for text, the bounds are lengths).
            </p>
            <div className="fields">
              {input.fields.map((f, i) => (
                <fieldset key={i} className="field-row" aria-label={`Field ${i + 1}`}>
                  <Text label="Name" value={f.name} onChange={(v) => setField(i, { name: v })} />
                  <Text label="Valid value" value={f.valid} onChange={(v) => setField(i, { valid: v })} />
                  <Text label="Invalid value" value={f.invalid} onChange={(v) => setField(i, { invalid: v })} placeholder="optional" />
                  <Select
                    label="Type"
                    value={f.kind}
                    options={['text', 'number']}
                    onChange={(v) => setField(i, { kind: v as Field['kind'] })}
                  />
                  <Text label={f.kind === 'text' ? 'Min length' : 'Min'} type="number" value={f.min} onChange={(v) => setField(i, { min: v })} />
                  <Text label={f.kind === 'text' ? 'Max length' : 'Max'} type="number" value={f.max} onChange={(v) => setField(i, { max: v })} />
                  <Check label="Required" checked={f.required} onChange={(v) => setField(i, { required: v })} />
                  <button
                    type="button"
                    className="icon"
                    aria-label={`Remove field ${f.name || i + 1}`}
                    onClick={() =>
                      set(
                        'fields',
                        input.fields.filter((_, j) => j !== i),
                      )
                    }
                  >
                    ×
                  </button>
                </fieldset>
              ))}
            </div>
            <button type="button" className="ghost" onClick={() => set('fields', [...input.fields, emptyField()])}>
              + Add field
            </button>
          </Section>
        </form>

        <section className="panel output" aria-label="Generated output">
          <div className="tabs" role="tablist">
            <TabButton id="feature" active={activeTab} onSelect={setTab}>
              .feature
            </TabButton>
            {output.steps && (
              <TabButton id="steps" active={activeTab} onSelect={setTab}>
                {FRAMEWORKS[framework].output}
              </TabButton>
            )}
            <TabButton id="manual" active={activeTab} onSelect={setTab}>
              Manual test cases ({output.manual.length})
            </TabButton>
          </div>

          {activeTab === 'feature' && <Code code={output.feature} filename={`${name}.feature`} label="feature file" />}
          {activeTab === 'steps' && output.steps && <Code code={output.steps} filename={FRAMEWORKS[framework].filename(name, input.feature)} label={FRAMEWORKS[framework].output.toLowerCase()} />}
          {activeTab === 'manual' && (
            <div role="tabpanel" aria-label="Manual test cases">
              <div className="actions">
                <label className="inline">
                  CSV format
                  <select value={csvFormat} onChange={(e) => setCsvFormat(e.target.value as CsvFormat)}>
                    {(Object.keys(CSV_FORMATS) as CsvFormat[]).map((f) => (
                      <option key={f} value={f}>
                        {CSV_FORMATS[f].label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => download(`${name}-${CSV_FORMATS[csvFormat].suffix}.csv`, output.csv[csvFormat], 'text/csv')}>
                  Download CSV
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {MANUAL_HEADERS[input.language].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {output.manual.map((c) => (
                      <tr key={c.id}>
                        <td className="mono">{c.id}</td>
                        <td>{c.title}</td>
                        <td>{c.priority}</td>
                        <td>
                          <List items={c.preconditions} />
                        </td>
                        <td>
                          <List items={c.steps} />
                        </td>
                        <td>
                          <List items={c.expected} />
                        </td>
                        <td className="mono small">{c.tags.join(' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      <footer className="foot">
        Built by <a href="https://syrovatskyy.com">Artiom Syrovatskyy</a> ·{' '}
        <a href="https://github.com/syrox11/bdd-forge">Source on GitHub</a>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Text(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  const id = useId();
  return (
    <div className="control">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

function Select(props: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="control">
      <label htmlFor={id}>{props.label}</label>
      <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

function Choice<T extends string>(props: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const name = useId();
  return (
    <div className="control" role="radiogroup" aria-label={props.label}>
      <span className="label">{props.label}</span>
      <div className="segmented">
        {props.options.map(([value, text]) => (
          <label key={value} className={value === props.value ? 'on' : ''}>
            <input type="radio" name={name} value={value} checked={value === props.value} onChange={() => props.onChange(value)} />
            {text}
          </label>
        ))}
      </div>
    </div>
  );
}

function TabButton({ id, active, onSelect, children }: { id: Tab; active: Tab; onSelect: (t: Tab) => void; children: ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active === id} className={active === id ? 'tab on' : 'tab'} onClick={() => onSelect(id)}>
      {children}
    </button>
  );
}

function Code({ code, filename, label }: { code: string; filename: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the text is still selectable
    }
  };
  return (
    <div role="tabpanel" aria-label={label}>
      <div className="actions">
        <span className="filename">{filename}</span>
        <button type="button" className="ghost" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" onClick={() => download(filename, code)}>
          Download
        </button>
      </div>
      <pre className="code" data-testid="code">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return items.length === 1 ? (
    <>{items[0]}</>
  ) : (
    <ol>
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}
