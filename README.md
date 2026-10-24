# BDD Forge

[![CI](https://github.com/syrox11/bdd-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/syrox11/bdd-forge/actions/workflows/ci.yml)

A tool for QA engineers: set a few parameters and it writes the BDD scenarios, the step definitions and the manual test cases for you.

**▶ Try it: [syrox11.github.io/bdd-forge](https://syrox11.github.io/bdd-forge/)**

## What it does

You describe what you are testing:

- **Feature and user story**: feature name, story ID, *As a / I want / So that*
- **Level**: E2E / UI (page, submit button, success message) or API (method, path, success status, authentication)
- **Execution**: automated or manual
- **Test type**: regression, functional or smoke
- **Gherkin language**: English or Spanish
- **Negative cases**: one scenario each, or grouped in a *Scenario Outline* with *Examples*
- **Framework**: [playwright-bdd](https://github.com/vitalets/playwright-bdd) or [Cucumber.js](https://github.com/cucumber/cucumber-js) (TypeScript), [Behave](https://github.com/behave/behave) (Python) or [Reqnroll](https://reqnroll.net/) (C#)
- **Fields**: name, a valid value, an optional invalid value, whether it is required, and optional min / max bounds (a value for numbers, a length for text)

And it generates, live:

| Output | Contents |
|--------|----------|
| `.feature` | Happy path, one case per missing required field, one per invalid value, boundary values for bounded fields (each bound accepted, one step past it rejected), and a 401 case for authenticated APIs. Tagged by level, execution, test type and story (`@e2e @automated @regression @AUTH-12`). Smoke keeps only the critical path. |
| Step definitions | One definition per step, in the framework's own idiom (Cucumber expressions, Behave `parse` patterns, a Reqnroll `[Binding]` class), with a working starting point: Playwright locators for E2E, a payload built from your valid values for API. |
| Manual test cases | Given / When / Then split into preconditions, steps and expected results, with IDs, priorities and tags. Outlines expand into one case per *Examples* row. Download as a generic CSV or in the import layout of Xray (Jira), TestRail or Azure DevOps: one row per step, case columns on the first row. |

### Example

```gherkin
@e2e @automated @AUTH-12
Feature: User login
  As a registered user
  I want to sign in with my email and password
  So that I can access my account

  @regression @happy-path
  Scenario: Successful submission with valid data
    Given I am on the "Login" page
    When I fill in "Email" with "ana@example.com"
    And I fill in "Password" with "S3cure!pass"
    And I click "Sign in"
    Then I should see "Welcome back"

  @regression @negative
  Scenario: Missing required field "Email"
    Given I am on the "Login" page
    When I fill in "Password" with "S3cure!pass"
    And I leave "Email" empty
    And I click "Sign in"
    Then I should see a validation error for "Email"
    And I should not see "Welcome back"
```

## How it is tested

The generator is a pure TypeScript core (`src/core`) with the React UI on top, so most of the logic is tested without a browser.

- **The output is valid Gherkin.** Every combination of level, style, language and test type (24 in total) is parsed with the official [`@cucumber/gherkin`](https://github.com/cucumber/gherkin) parser.
- **Every step is implemented exactly once.** Each step of the parsed feature, with outlines expanded, is matched against the generated step definitions using [`@cucumber/cucumber-expressions`](https://github.com/cucumber/cucumber-expressions), the way Cucumber and Reqnroll bind them at run time, and against the `parse` patterns Behave uses. A missing or ambiguous step fails the build.
- **Every framework declares every pattern** the feature needs, in English and Spanish, for API and E2E.
- **CSV exports keep a consistent shape**: every row of every format has the same number of columns, checked with an RFC 4180 reader.
- **Unit tests** (Vitest, 85) cover scenario selection, boundary-value analysis, rendering, step definitions per framework, manual cases and CSV layouts.
- **End-to-end tests** (Playwright, 28) drive the real build on desktop and mobile: live updates, language switch, API mode, outlines, frameworks, boundary values, downloads in each CSV format, persistence and the phone layout.
- **CI** (GitHub Actions) runs typecheck, unit tests, build and E2E on every push, then deploys to GitHub Pages.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run test:e2e   # Playwright (builds first)
```

## Roadmap

- Karate (API DSL) output
- Optional AI mode: paste a user story or an endpoint and get suggested scenarios (bring your own Claude API key, stored only in your browser)

## License

[MIT](LICENSE). Built by [Artiom Syrovatskyy](https://syrovatskyy.com).
