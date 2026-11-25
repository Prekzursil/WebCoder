// E2E [wave E item 45]: the courses page — catalog, lesson sequence,
// flippable theory, solved marks. Mock mode.

import { test, expect } from '@playwright/test';

test('the courses page opens the Scratch→Python bridge', async ({ page }) => {
  await page.route(/\/api\/v1\/learning\/courses\/?$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        count: 1,
        results: [
          {
            slug: 'scratch-to-python',
            title_i18n: { en: 'From blocks to Python' },
            description_i18n: { en: 'Six lessons.' },
            lesson_count: 6,
            problem_count: 9,
            solved_count: 2,
          },
        ],
      }),
    });
  });
  await page.route(/\/api\/v1\/learning\/courses\/scratch-to-python\/?$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        slug: 'scratch-to-python',
        title_i18n: { en: 'From blocks to Python' },
        description_i18n: { en: 'Six lessons.' },
        lessons: [
          {
            id: 1,
            order: 1,
            title_i18n: { en: 'Say hello (print)' },
            theory: {
              front_en: 'Three parts of every program?',
              back_en: 'Read, compute, print.',
              front_ro: 'F?',
              back_ro: 'B?',
            },
            drills: [{ id: 4, kind: 'READ_CODE' }],
            problems: [
              {
                id: 11,
                title_i18n: { en: 'Hello, Judge!' },
                difficulty: 'VERY_EASY',
                is_solved: true,
              },
            ],
            solved_count: 1,
          },
          {
            id: 2,
            order: 2,
            title_i18n: { en: 'Find fast (binary search)' },
            theory: null,
            drills: [],
            problems: [
              {
                id: 20,
                title_i18n: { en: 'Binary Search Position' },
                difficulty: 'EASY',
                is_solved: false,
              },
            ],
            solved_count: 0,
          },
        ],
      }),
    });
  });

  await page.goto('/courses');
  await expect(page.getByTestId('courses-list')).toBeVisible();
  await expect(page.getByText('From blocks to Python')).toBeVisible();
  await expect(page.getByText(/2\/9 solved/i)).toBeVisible();

  await page.getByTestId('course-scratch-to-python').click();
  const detail = page.getByTestId('course-detail');
  await expect(detail).toBeVisible();
  await expect(page.getByTestId('lesson-1')).toContainText('Hello, Judge!');
  await expect(page.getByTestId('lesson-2')).toContainText('Binary Search Position');

  // The theory card flips in place.
  const theory = page.getByText('Three parts of every program?');
  await theory.click();
  await expect(page.getByText('Read, compute, print.')).toBeVisible();
});
