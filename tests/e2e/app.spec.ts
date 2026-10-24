import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const code = (page: Page) => page.getByTestId('code');
const settings = (page: Page) => page.getByRole('form', { name: 'Generator settings' });

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  // Start every test from the bundled example, whatever an earlier run saved
  await page.getByRole('button', { name: 'Load example' }).click();
});

test('opens with a ready example feature', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'BDD Forge' })).toBeVisible();
  await expect(code(page)).toContainText('Feature: User login');
  await expect(code(page)).toContainText('Scenario: Successful submission with valid data');
});

test('the feature updates live as the form changes', async ({ page }) => {
  await settings(page).getByLabel('Feature name').fill('Checkout');
  await settings(page).getByLabel('Submit button').fill('Pay now');
  await expect(code(page)).toContainText('Feature: Checkout');
  await expect(code(page)).toContainText('And I click "Pay now"');
});

test('switching to Spanish uses Spanish Gherkin keywords', async ({ page }) => {
  await page.getByRole('radiogroup', { name: 'Gherkin language' }).getByText('Español').click();
  await expect(code(page)).toContainText('# language: es');
  await expect(code(page)).toContainText('Característica: User login');
  await expect(code(page)).toContainText('Dado que estoy en la página "Login"');
});

test('API level shows endpoint settings and an authentication scenario', async ({ page }) => {
  await page.getByRole('radiogroup', { name: 'Level' }).getByText('API').click();
  await settings(page).getByLabel('Path').fill('/api/orders');
  await settings(page).getByLabel('Requires authentication').check();
  await expect(code(page)).toContainText('When I send a "POST" request to "/api/orders"');
  await expect(code(page)).toContainText('Then the response status should be 401');
});

test('outline style groups negative cases with Examples', async ({ page }) => {
  await page.getByRole('radiogroup', { name: 'Negative cases as' }).getByText('Scenario Outline').click();
  await expect(code(page)).toContainText('Scenario Outline: A missing required field is rejected');
  await expect(code(page)).toContainText('Examples:');
});

test('manual execution hides step definitions and keeps manual cases', async ({ page }) => {
  await expect(page.getByRole('tab', { name: 'Step definitions' })).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Execution' }).getByText('Manual').click();
  await expect(page.getByRole('tab', { name: 'Step definitions' })).toHaveCount(0);
  await expect(code(page)).toContainText('@e2e @manual @AUTH-12');
});

test('step definitions follow the chosen framework', async ({ page }) => {
  await page.getByRole('tab', { name: 'Step definitions' }).click();
  await expect(code(page)).toContainText("import { createBdd } from 'playwright-bdd';");
  await page.getByRole('radiogroup', { name: 'Framework' }).getByText('Cucumber.js').click();
  await expect(code(page)).toContainText("import { Given, When, Then } from '@cucumber/cucumber';");
});

test('adding and removing fields changes the generated cases', async ({ page }) => {
  await page.getByRole('tab', { name: /Manual test cases/ }).click();
  await expect(page.getByRole('tab', { name: 'Manual test cases (6)' })).toBeVisible();

  await page.getByRole('button', { name: '+ Add field' }).click();
  const added = settings(page).getByRole('group', { name: 'Field 3' });
  await added.getByLabel('Name').fill('Remember me');
  await expect(page.getByRole('tab', { name: 'Manual test cases (7)' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Missing required field "Remember me"' })).toBeVisible();

  await page.getByRole('button', { name: 'Remove field Remember me' }).click();
  await expect(page.getByRole('tab', { name: 'Manual test cases (6)' })).toBeVisible();
});

test('downloads the feature file and the CSV', async ({ page }) => {
  const featureDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const feature = await featureDownload;
  expect(feature.suggestedFilename()).toBe('user-login.feature');
  expect(await readFile(await feature.path(), 'utf8')).toContain('Feature: User login');

  await page.getByRole('tab', { name: /Manual test cases/ }).click();
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toBe('user-login-test-cases.csv');
  expect(await readFile(await csv.path(), 'utf8')).toMatch(/^ID,Title,Priority,Preconditions,Steps,Expected result,Tags\r\n/);
});

test('Behave generates Python step definitions with a Python file name', async ({ page }) => {
  await page.getByRole('radiogroup', { name: 'Framework' }).getByText('Behave (Python)').click();
  await page.getByRole('tab', { name: 'Step definitions' }).click();
  await expect(page.getByText('user_login_steps.py')).toBeVisible();
  await expect(code(page)).toContainText("@when('I fill in \"{field}\" with \"{value}\"')");
});

test('exports manual cases in the Xray format', async ({ page }) => {
  await page.getByRole('tab', { name: /Manual test cases/ }).click();
  await page.getByLabel('CSV format').selectOption({ label: 'Xray (Jira)' });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe('user-login-xray.csv');
  expect(await readFile(await file.path(), 'utf8')).toMatch(/^Test ID,Summary,Priority,Labels,Precondition,Action,Data,Expected Result\r\n/);
});

test('numeric bounds add boundary-value scenarios', async ({ page }) => {
  await page.getByRole('button', { name: '+ Add field' }).click();
  const age = settings(page).getByRole('group', { name: 'Field 3' });
  await age.getByLabel('Name').fill('Age');
  await age.getByLabel('Valid value', { exact: true }).fill('30');
  await age.getByLabel('Type').selectOption('number');
  await age.getByLabel('Required').uncheck();
  await age.getByLabel('Min', { exact: true }).fill('18');
  await age.getByLabel('Max', { exact: true }).fill('99');
  await expect(code(page)).toContainText('Scenario: Value below the minimum for "Age"');
  await expect(code(page)).toContainText('And I fill in "Age" with "17"');
  await expect(code(page)).toContainText('Scenario: Boundary value accepted for "Age" (maximum)');
});

test('remembers the form after a reload', async ({ page }) => {
  await settings(page).getByLabel('Feature name').fill('Password reset');
  await page.reload();
  await expect(code(page)).toContainText('Feature: Password reset');
});

test('fits a phone screen without horizontal scroll', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
