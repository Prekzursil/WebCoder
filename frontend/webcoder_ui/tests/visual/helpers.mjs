import routesModule from '../../visual/publicVisualRoutes.cjs';

const { publicVisualRoutes } = routesModule;

export { publicVisualRoutes };

export async function openPublicRoute(page, route) {
  await page.goto(route.path, { waitUntil: 'networkidle' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('main').waitFor({ state: 'visible' });
}
