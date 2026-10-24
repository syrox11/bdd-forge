import type { Field, PhraseKey } from '../types';
import { isBoolean, isNumber, namedFields, pascal, patternWords, uniqueNames, type StepRenderer } from './shared';

function literal(value: string): string {
  return isNumber(value) || isBoolean(value) ? value : JSON.stringify(value);
}

function hint(key: PhraseKey): string[] {
  switch (key) {
    case 'apiAvailable':
      return ['// Optional: check a health endpoint before the scenario starts'];
    case 'authenticated':
      return ['_headers["Authorization"] = $"Bearer {Environment.GetEnvironmentVariable("API_TOKEN")}";'];
    case 'notAuthenticated':
      return ['_headers.Clear();'];
    case 'validPayload':
      return ['_payload = ValidPayload();'];
    case 'payloadWithout':
      return ['_payload = ValidPayload();', '_payload.Remove(field);'];
    case 'payloadWithValue':
      return ['_payload = ValidPayload();', '_payload[field] = value;'];
    case 'send':
      return [
        'var request = new HttpRequestMessage(new HttpMethod(method), path);',
        'foreach (var (name, value) in _headers) request.Headers.TryAddWithoutValidation(name, value);',
        'if (method is not ("GET" or "DELETE")) request.Content = JsonContent.Create(_payload);',
        '_response = await Http.SendAsync(request);',
      ];
    case 'status':
      return ['Assert.Equal(status, (int)_response!.StatusCode);'];
    case 'errorMentions':
      return ['Assert.Contains(field, await _response!.Content.ReadAsStringAsync());'];
    case 'onPage':
      return ['// TODO: map the page name to its URL', 'await _page.GotoAsync("/");'];
    case 'fill':
      return ['await _page.GetByLabel(field).FillAsync(value);'];
    case 'leaveEmpty':
      return ['await _page.GetByLabel(field).ClearAsync();'];
    case 'act':
      return ['await _page.GetByRole(AriaRole.Button, new() { Name = label }).ClickAsync();'];
    case 'see':
      return ['await Expect(_page.GetByText(text)).ToBeVisibleAsync();'];
    case 'fieldError':
      return ['// TODO: adapt to how the app flags invalid fields', 'await Expect(_page.GetByLabel(field)).ToHaveAttributeAsync("aria-invalid", "true");'];
    case 'notSee':
      return ['await Expect(_page.GetByText(text)).ToBeHiddenAsync();'];
  }
}

function payloadInitializer(fields: Field[]): string[] {
  const entries = namedFields(fields).map((f) => `        [${JSON.stringify(f.name)}] = ${literal(f.valid)},`);
  return ['    private static Dictionary<string, object?> ValidPayload() => new()', '    {', ...entries, '    };'];
}

/** Reqnroll binds Cucumber expressions directly, so patterns are used as they are. */
export const renderReqnroll: StepRenderer = (input, defs) => {
  const api = input.level === 'api';
  const className = `${pascal(patternWords(input.feature)) || 'Feature'}Steps`;
  const out = api
    ? ['using System.Net.Http.Json;', 'using Reqnroll;', 'using Xunit;']
    : ['using Microsoft.Playwright;', 'using Reqnroll;', 'using static Microsoft.Playwright.Assertions;'];
  out.push('', 'namespace Tests.StepDefinitions;', '', '[Binding]', `public class ${className}`, '{');
  if (api) {
    out.push(
      '    private static readonly HttpClient Http = new()',
      '    {',
      '        BaseAddress = new Uri(Environment.GetEnvironmentVariable("BASE_URL") ?? "http://localhost:3000"),',
      '    };',
      '',
      '    private readonly Dictionary<string, string> _headers = new();',
      '    private Dictionary<string, object?> _payload = new();',
      '    private HttpResponseMessage? _response;',
      '',
      ...payloadInitializer(input.fields),
    );
  } else {
    out.push(
      '    private readonly IPage _page;',
      '',
      '    // Register the Playwright IPage in the scenario container from a [BeforeScenario] hook',
      `    public ${className}(IPage page) => _page = page;`,
    );
  }

  const names = uniqueNames(defs.map((d) => pascal(patternWords(d.pattern)) || 'Step'));
  const attr = { given: 'Given', when: 'When', then: 'Then' } as const;
  defs.forEach((def, i) => {
    const body = hint(def.key);
    const isAsync = body.some((l) => l.includes('await '));
    const params = def.params.map((p) => `${p.type === 'number' ? 'int' : 'string'} ${p.name}`).join(', ');
    out.push(
      '',
      `    [${attr[def.kind]}(${JSON.stringify(def.pattern)})]`,
      `    public ${isAsync ? 'async Task' : 'void'} ${names[i]}(${params})`,
      '    {',
      ...body.map((l) => `        ${l}`),
      '    }',
    );
  });
  out.push('}');
  return out.join('\n') + '\n';
};
