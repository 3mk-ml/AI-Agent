import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
test('first-run setup, responsive dashboard, navigation and safe disconnected state', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Make it your workspace.' })).toBeVisible();
  await page.getByLabel('One-time setup token').fill(readFileSync('.runtime/bootstrap.token','utf8').trim());
  await page.getByLabel('Create an administrator password').fill('Browser-test-password-only-2026');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Overview.', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Set up connections' })).toBeVisible();
  await page.screenshot({ path: 'test-results/overview-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Unified inbox', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unified inbox.', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/inbox-desktop.png', fullPage: true });
  for (const title of ['Relationships','Appointments','Knowledge','Automations','Activity & logs','Connections']) {
    await page.getByRole('link', { name: title, exact: true }).click();
    await expect(page.getByRole('heading', { name: title + '.', exact: true })).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  await page.screenshot({ path: 'test-results/connections-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('customer-facing chat has honest pre-connection behavior', async ({ page }) => {
  await page.goto('/chat');
  await expect(page.getByRole('heading', { name: 'What can we help you build?' })).toBeVisible();
  await page.getByRole('button', { name: 'Start a conversation' }).click();
  await expect(page.getByRole('alert')).toContainText('DATABASE_URL');
});
