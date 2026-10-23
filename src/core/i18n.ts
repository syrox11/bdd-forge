import type { Language } from './types';

/** Gherkin keywords per language, as defined by the official Gherkin dialects. */
export const KEYWORDS: Record<
  Language,
  { feature: string; scenario: string; outline: string; examples: string; given: string; when: string; then: string; and: string }
> = {
  en: {
    feature: 'Feature',
    scenario: 'Scenario',
    outline: 'Scenario Outline',
    examples: 'Examples',
    given: 'Given',
    when: 'When',
    then: 'Then',
    and: 'And',
  },
  es: {
    feature: 'Característica',
    scenario: 'Escenario',
    outline: 'Esquema del escenario',
    examples: 'Ejemplos',
    given: 'Dado',
    when: 'Cuando',
    then: 'Entonces',
    and: 'Y',
  },
};

/** Step patterns (Cucumber expressions) and scenario titles per language. */
export const PHRASES = {
  en: {
    narrativeRole: (s: string) => `As a ${s}`,
    narrativeGoal: (s: string) => `I want ${s}`,
    narrativeBenefit: (s: string) => `So that ${s}`,
    // API
    apiAvailable: 'the API is available',
    authenticated: 'I am authenticated',
    notAuthenticated: 'I am not authenticated',
    validPayload: 'a valid payload',
    payloadWithout: 'a valid payload without the {string} field',
    payloadWithValue: 'a valid payload with {string} set to {string}',
    send: 'I send a {string} request to {string}',
    status: 'the response status should be {int}',
    errorMentions: 'the response error should mention {string}',
    // E2E
    onPage: 'I am on the {string} page',
    fill: 'I fill in {string} with {string}',
    leaveEmpty: 'I leave {string} empty',
    act: 'I click {string}',
    see: 'I should see {string}',
    fieldError: 'I should see a validation error for {string}',
    notSee: 'I should not see {string}',
    // Titles
    tHappy: 'Successful request with valid data',
    tHappyE2e: 'Successful submission with valid data',
    tMissing: (f: string) => `Missing required field "${f}"`,
    tInvalid: (f: string) => `Invalid value for "${f}"`,
    tUnauth: 'Request without authentication is rejected',
    tOutlineMissing: 'A missing required field is rejected',
    tOutlineInvalid: 'An invalid value is rejected',
    // Manual
    preconditionNone: 'None',
  },
  es: {
    narrativeRole: (s: string) => `Como ${s}`,
    narrativeGoal: (s: string) => `Quiero ${s}`,
    narrativeBenefit: (s: string) => `Para ${s}`,
    apiAvailable: 'que la API está disponible',
    authenticated: 'que estoy autenticado',
    notAuthenticated: 'que no estoy autenticado',
    validPayload: 'un payload válido',
    payloadWithout: 'un payload válido sin el campo {string}',
    payloadWithValue: 'un payload válido con {string} igual a {string}',
    send: 'envío una petición {string} a {string}',
    status: 'el código de respuesta debe ser {int}',
    errorMentions: 'el error de la respuesta debe mencionar {string}',
    onPage: 'que estoy en la página {string}',
    fill: 'relleno {string} con {string}',
    leaveEmpty: 'dejo {string} vacío',
    act: 'pulso {string}',
    see: 'debo ver {string}',
    fieldError: 'debo ver un error de validación en {string}',
    notSee: 'no debo ver {string}',
    tHappy: 'Petición correcta con datos válidos',
    tHappyE2e: 'Envío correcto con datos válidos',
    tMissing: (f: string) => `Falta el campo obligatorio "${f}"`,
    tInvalid: (f: string) => `Valor no válido en "${f}"`,
    tUnauth: 'Una petición sin autenticación es rechazada',
    tOutlineMissing: 'Un campo obligatorio ausente es rechazado',
    tOutlineInvalid: 'Un valor no válido es rechazado',
    preconditionNone: 'Ninguna',
  },
} as const;

/** UI and export labels for manual test cases. */
export const MANUAL_HEADERS: Record<Language, string[]> = {
  en: ['ID', 'Title', 'Priority', 'Preconditions', 'Steps', 'Expected result', 'Tags'],
  es: ['ID', 'Título', 'Prioridad', 'Precondiciones', 'Pasos', 'Resultado esperado', 'Etiquetas'],
};

export const PRIORITY_LABEL: Record<Language, Record<'High' | 'Medium' | 'Low', string>> = {
  en: { High: 'High', Medium: 'Medium', Low: 'Low' },
  es: { High: 'Alta', Medium: 'Media', Low: 'Baja' },
};
