'use client';

// [wave E item 45] Structured courses — ordered lessons blending theory
// cards, drills and problems. The Scratch→Python bridge is the seeded
// first course: the on-ramp from the block editor to text code.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { LearningService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { palette } from '@/theme/tokens';

interface LessonRow {
  id: number;
  order: number;
  title_i18n: Record<string, string>;
  theory: { front_en: string; back_en: string; front_ro: string; back_ro: string } | null;
  drills: { id: number; kind: string }[];
  problems: {
    id: number;
    title_i18n: Record<string, string>;
    difficulty: string;
    is_solved: boolean;
  }[];
  solved_count: number;
}

interface CourseDetail {
  slug: string;
  title_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  lessons: LessonRow[];
}

interface CourseRow {
  slug: string;
  title_i18n: Record<string, string>;
  description_i18n: Record<string, string>;
  lesson_count: number;
  problem_count: number;
  solved_count: number;
}

export default function CoursesPage(): ReactNode {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const lang = i18n.language.startsWith('ro') ? 'ro' : 'en';
  const [courses, setCourses] = useState<CourseRow[] | null>(null);
  const [open, setOpen] = useState<CourseDetail | null>(null);
  const [flipped, setFlipped] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    LearningService.courses()
      .then((d) => setCourses(d.results))
      .catch(() => setCourses([]));
  }, []);

  const openCourse = (slug: string) => {
    setError(null);
    LearningService.course(slug)
      .then(setOpen)
      .catch(() => setError(t('courses_load_error', 'Failed to load the course.')));
  };

  return (
    <div className="page-container" style={{ paddingTop: '2.5rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
        {t('courses_title', 'Courses')}
      </h1>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
        {t(
          'courses_intro',
          'Structured paths: read the idea, drill it, then solve the problems — in order.',
        )}
      </p>
      {error && <p style={{ color: palette.danger }}>{error}</p>}
      {courses === null ? (
        <LoadingSpinner />
      ) : courses.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          {t('courses_empty', 'No courses yet — the first one is on its way.')}
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }} data-testid="courses-list">
          {courses.map((course) => (
            <button
              type="button"
              key={course.slug}
              onClick={() => openCourse(course.slug)}
              data-testid={`course-${course.slug}`}
              style={{
                textAlign: 'left',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1rem 1.25rem',
                cursor: 'pointer',
                color: 'var(--foreground)',
              }}
            >
              <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                {course.title_i18n?.[lang] || course.title_i18n?.en}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '4px 0' }}>
                {course.description_i18n?.[lang] || course.description_i18n?.en}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>
                {course.lesson_count} {t('courses_lessons', 'lessons')} ·{' '}
                {t('start_ladder_progress', '{{n}}/{{m}} solved', {
                  n: course.solved_count,
                  m: course.problem_count,
                })}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && (
        <section style={{ marginTop: '1.5rem' }} data-testid="course-detail">
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.75rem' }}>
            {open.title_i18n?.[lang] || open.title_i18n?.en}
          </h2>
          <div style={{ display: 'grid', gap: '10px' }}>
            {open.lessons.map((lesson) => (
              <div
                key={lesson.id}
                data-testid={`lesson-${lesson.order}`}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1rem 1.25rem',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                  {lesson.order}. {lesson.title_i18n?.[lang] || lesson.title_i18n?.en}
                </div>
                {lesson.theory && (
                  <button
                    type="button"
                    onClick={() => setFlipped(flipped === lesson.id ? null : lesson.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      color: 'var(--foreground)',
                    }}
                  >
                    <div className="micro-label" style={{ marginBottom: '4px' }}>
                      {t('learning_theory_title', 'Theory cards')}
                    </div>
                    <div style={{ fontSize: '0.85rem' }}>
                      {flipped === lesson.id
                        ? lang === 'ro'
                          ? lesson.theory.back_ro
                          : lesson.theory.back_en
                        : lang === 'ro'
                          ? lesson.theory.front_ro
                          : lesson.theory.front_en}
                    </div>
                  </button>
                )}
                {lesson.drills.length > 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '6px' }}>
                    {t('courses_drill_hint', '{{n}} drills on the drills page', {
                      n: lesson.drills.length,
                    })}{' '}
                    → <Link href="/drills">/drills</Link>
                  </div>
                )}
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {lesson.problems.map((problem) => (
                    <li key={problem.id} style={{ padding: '3px 0' }}>
                      <Link
                        href={`/problems/${problem.id}`}
                        style={{
                          color: problem.is_solved ? palette.success : 'var(--accent)',
                          fontWeight: problem.is_solved ? 600 : 400,
                        }}
                      >
                        {problem.is_solved ? '✓ ' : ''}
                        {problem.title_i18n?.[lang] || problem.title_i18n?.en}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {!auth.isAuthenticated && (
            <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
              {t('courses_login_progress', 'Log in to track your progress through the course.')}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
