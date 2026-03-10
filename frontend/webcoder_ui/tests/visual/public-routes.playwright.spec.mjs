import { test, expect } from '@playwright/test';
import { publicVisualRoutes, openPublicRoute } from './helpers.mjs';

for (const route of publicVisualRoutes) {
  test(`${route.name} route renders without authentication`, async ({ page }) => {
    await openPublicRoute(page, route);

    await expect(page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: route.primaryAction, exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${route.path === '/' ? '/?$' : `${route.path}/?$`}`));
  });
}
