const publicVisualRoutes = Object.freeze([
  Object.freeze({
    name: 'home',
    path: '/',
    heading: 'Welcome to WebCoder',
    primaryAction: 'View Problems',
  }),
  Object.freeze({
    name: 'login',
    path: '/login',
    heading: 'Login',
    primaryAction: 'Login',
  }),
  Object.freeze({
    name: 'register',
    path: '/register',
    heading: 'Register',
    primaryAction: 'Register',
  }),
]);

module.exports = { publicVisualRoutes };
