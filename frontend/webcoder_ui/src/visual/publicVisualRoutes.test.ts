const { publicVisualRoutes } = require('../../visual/publicVisualRoutes.cjs');

describe('publicVisualRoutes', () => {
  it('keeps the visual seam limited to public non-auth routes', () => {
    expect(publicVisualRoutes).toEqual([
      {
        name: 'home',
        path: '/',
        heading: 'Welcome to WebCoder',
        primaryAction: 'View Problems',
      },
      {
        name: 'login',
        path: '/login',
        heading: 'Login',
        primaryAction: 'Login',
      },
      {
        name: 'register',
        path: '/register',
        heading: 'Register',
        primaryAction: 'Register',
      },
    ]);
  });

  it('uses unique route names and paths', () => {
    expect(new Set(publicVisualRoutes.map((route) => route.name)).size).toBe(publicVisualRoutes.length);
    expect(new Set(publicVisualRoutes.map((route) => route.path)).size).toBe(publicVisualRoutes.length);
  });
});
