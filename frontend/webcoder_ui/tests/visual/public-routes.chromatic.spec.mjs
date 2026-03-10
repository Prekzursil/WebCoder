import { test, expect } from '@chromatic-com/playwright';
import { publicVisualRoutes, openPublicRoute } from './helpers.mjs';

for (const route of publicVisualRoutes) {
  test(`${route.name} chromatic snapshot`, async ({ page }) => {
    await openPublicRoute(page, route);

    await expect(page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: route.primaryAction, exact: true })).toBeVisible();
  });
}
