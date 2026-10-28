import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const password = 'Browser-test-password-only-2026';
test('first-run setup, responsive dashboard, navigation and safe disconnected state', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Make it your workspace.' })).toBeVisible();
  await page.getByLabel('One-time setup token').fill(readFileSync('.runtime/bootstrap.token','utf8').trim());
  await page.getByLabel('Create an administrator password').fill(password);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Overview.', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Set up connections' })).toBeVisible();
  await page.screenshot({ path: 'test-results/overview-desktop.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: 'Unified inbox', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unified inbox.', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/inbox-desktop.png', fullPage: true, animations: 'disabled' });
  for (const title of ['Relationships','Appointments','Knowledge','Automations','Activity & logs','Connections']) {
    await page.getByRole('link', { name: title, exact: true }).click();
    await expect(page.getByRole('heading', { name: title + '.', exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  await expect(page.locator('aside.sidebar')).not.toBeInViewport();
  await page.screenshot({ path: 'test-results/connections-mobile.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.locator('aside.sidebar')).toBeInViewport();
  // The overlay spans the viewport, but its center is covered by the 244px sidebar.
  // Click its exposed right edge, just as a user would, rather than forcing an intercepted click.
  await page.getByRole('button', { name: 'Close navigation' }).click({ position: { x: 380, y: 20 } });
  await expect(page.locator('aside.sidebar')).not.toBeInViewport();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.locator('aside.sidebar')).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.locator('aside.sidebar')).not.toBeInViewport();
});
test('customer-facing chat has honest pre-connection behavior', async ({ page }) => {
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: 'What can we help you build?' })).toBeVisible();
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page.locator('.notice-error[role="alert"]')).toContainText('DATABASE_URL');
  await page.screenshot({ path: 'test-results/customer-chat.png', fullPage: true, animations: 'disabled' });
});
test('unauthenticated visitors cannot read the CRM or saved configuration', async ({ request }) => {
  for (const endpoint of ['leads','settings','inbox','executions']) {
    const response = await request.get('/api/' + endpoint);
    expect(response.status()).toBe(401);
    const data = await response.json(); expect(data.error).toBeTruthy(); expect(data.configured).toBeUndefined();
  }
});
test('cross-origin authentication mutation is rejected', async ({ request }) => {
  const response = await request.post('/api/auth/login', { headers: { Origin: 'https://untrusted.example' }, data: { password } });
  expect(response.status()).toBe(403);
});
