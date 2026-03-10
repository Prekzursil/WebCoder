import { test, expect } from '@playwright/test';
import { BatchInfo, Eyes, Target } from '@applitools/eyes-playwright';
import { publicVisualRoutes, openPublicRoute } from './helpers.mjs';

const batch = new BatchInfo('WebCoder public routes');

for (const route of publicVisualRoutes) {
  test(`${route.name} applitools snapshot`, async ({ page }) => {
    const eyes = new Eyes();
    eyes.setBatch(batch);

    await eyes.open(page, 'WebCoder', `public route: ${route.name}`, { width: 1440, height: 900 });
    await openPublicRoute(page, route);

    await expect(page.getByRole('heading', { name: route.heading, exact: true })).toBeVisible();
    await eyes.check(route.name, Target.window().fully());
    await eyes.close(false);
  });
}
