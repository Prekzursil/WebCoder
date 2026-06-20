import { expect, test } from '@chromatic-com/playwright';

import { preparePublicVisualState, stabilizeRoute } from '../support/publicApp';

test.beforeEach(async ({ page }) => {
  await preparePublicVisualState(page);
});

test('home route renders', async ({ page }) => {
  await stabilizeRoute(page, '/');
  await expect(page.getByRole('heading', { name: /welcome to webcoder/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /view problems/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /sign up/i })).toBeVisible();
});

test('login route renders', async ({ page }) => {
  await stabilizeRoute(page, '/login');
  await expect(page.getByRole('heading', { name: /login/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /^google$/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /^github$/i })).toBeVisible();
});

test('register route renders', async ({ page }) => {
  await stabilizeRoute(page, '/register');
  await expect(page.getByRole('heading', { name: /register/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /register/i })).toBeVisible();
});

test('problems route renders', async ({ page }) => {
  await stabilizeRoute(page, '/problems');
  await expect(page.getByRole('heading', { name: /^problems$/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /two sum warmup/i })).toBeVisible();
});
