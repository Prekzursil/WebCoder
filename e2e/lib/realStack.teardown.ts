// Playwright globalTeardown [Q13] — deletes the real-stack e2e seed pair
// (Two Sum / Reverse String) once, AFTER every spec file has finished.
// Wired only in real-backend mode by playwright.config.ts; inert otherwise.

import { teardownRealStackFixtures } from './realStack';

export default async function globalTeardown() {
  await teardownRealStackFixtures();
}
