'use client';

// [Wave G item 88] The onboarding checklist: the first-hour steps
// computed server-side (account, first submission, first AC, first
// contest, bio, first class join) rendered as the beginner's progress
// card on /start. Authenticated only — guests see the sign-up CTA
// instead (the /start trio already covers the anonymous pitch).

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { OnboardingService } from '@/services/ApiService';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';

interface Step {
  key: string;
  done: boolean;
}

const STEP_LINKS: Record<string, string> = {
  first_submission: '/start',
  first_ac: '/start',
  first_contest: '/contests',
  profile_bio: '/profile',
  joined_class: '/classes',
};

export default function OnboardingChecklist(): ReactNode {
  const { t } = useTranslation();
  const auth = useAuth();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    OnboardingService.get()
      .then((data) => {
        setSteps(data.steps);
        setDone(data.done);
        setTotal(data.total);
      })
      .catch(() => setSteps(null));
  }, [auth.isAuthenticated]);

  if (!auth.isAuthenticated || steps === null) return null;

  const label = (key: string): string => {
    const map: Record<string, string> = {
      account: t('onboarding_account', 'Create your account'),
      first_submission: t('onboarding_first_submission', 'Make your first submission'),
      first_ac: t('onboarding_first_ac', 'Get your first Accepted'),
      first_contest: t('onboarding_first_contest', 'Register for a contest'),
      profile_bio: t('onboarding_profile_bio', 'Add a profile bio'),
      joined_class: t('onboarding_joined_class', 'Join a class'),
    };
    return map[key] ?? key;
  };

  return (
    <div className="card" style={{ marginTop: '1.5rem' }} data-testid="onboarding-checklist">
      <strong style={{ color: 'var(--foreground)', fontSize: '0.95rem' }}>
        {t('onboarding_title', 'Your first hour — {{done}}/{{total}}', { done, total })}
      </strong>
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        style={{
          height: 6,
          borderRadius: 3,
          background: 'var(--surface-2)',
          margin: '10px 0 14px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${total ? (100 * done) / total : 0}%`,
            height: '100%',
            background: 'var(--success)',
            transition: 'width 300ms ease',
          }}
        />
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {steps.map((step) => {
          const href = STEP_LINKS[step.key];
          const body = (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 0',
                color: step.done ? 'var(--muted)' : 'var(--body)',
                textDecoration: 'none',
              }}
            >
              {step.done ? (
                <CheckCircleIcon sx={{ fontSize: 18, color: 'var(--success)' }} />
              ) : (
                <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: 'var(--muted)' }} />
              )}
              <span style={step.done ? { textDecoration: 'line-through' } : undefined}>
                {label(step.key)}
              </span>
            </span>
          );
          return (
            <li key={step.key}>{href && !step.done ? <Link href={href}>{body}</Link> : body}</li>
          );
        })}
      </ul>
    </div>
  );
}
