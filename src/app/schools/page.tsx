// [wave G item 147] The public school-partnerships program page: what a
// partnership includes, the DPA link, and the application form
// (public, throttled server-side by the partnership_apply scope).

'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/services/ApiService';

export default function SchoolsPage() {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    school_name: '',
    city: '',
    contact_name: '',
    contact_email: '',
    estimated_students: '',
    message: '',
  });
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const update =
    (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('sending');
    setError('');
    try {
      await apiFetch('/partnerships/apply/', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          estimated_students: Number(form.estimated_students || 0),
        }),
      });
      setState('sent');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'error');
    }
  };

  return (
    <div className="page-container" data-testid="schools-page">
      <h1 style={{ fontSize: '1.75rem', color: 'var(--foreground)' }}>
        {t('schools_title', 'School partnerships')}
      </h1>
      <p>
        {t(
          'schools_intro',
          'Run your informatics classes and school contests on WebCoder — free for public schools.',
        )}
      </p>

      <section data-testid="schools-includes" style={{ marginTop: '1rem' }}>
        <h2>{t('schools_includes_header', 'What a partnership includes')}</h2>
        <ul>
          <li>{t('schools_include_classes', 'Classes, teme with deadlines and exam mode')}</li>
          <li>{t('schools_include_export', 'CSV grade exports per teme')}</li>
          <li>
            {t(
              'schools_include_onboarding',
              'Teacher onboarding + certification (see /teach/certification)',
            )}
          </li>
          <li>
            {t(
              'schools_include_dpa',
              'A signed data-processing agreement (DPA) for minors\u2019 data',
            )}
          </li>
        </ul>
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h2>{t('schools_apply_header', 'Apply')}</h2>
        {state === 'sent' ? (
          <p role="status" data-testid="schools-applied">
            {t(
              'schools_applied',
              'Application received — we will contact the school address you provided.',
            )}
          </p>
        ) : (
          <form
            onSubmit={submit}
            data-testid="schools-form"
            style={{ display: 'grid', gap: '8px', maxWidth: '480px' }}
          >
            <input
              required
              value={form.school_name}
              onChange={update('school_name')}
              placeholder={t('schools_f_school', 'School name')}
              data-testid="schools-school"
            />
            <input
              required
              value={form.city}
              onChange={update('city')}
              placeholder={t('schools_f_city', 'City')}
              data-testid="schools-city"
            />
            <input
              required
              value={form.contact_name}
              onChange={update('contact_name')}
              placeholder={t('schools_f_contact', 'Contact teacher / principal')}
              data-testid="schools-contact"
            />
            <input
              required
              type="email"
              value={form.contact_email}
              onChange={update('contact_email')}
              placeholder={t('schools_f_email', 'Contact email')}
              data-testid="schools-email"
            />
            <input
              inputMode="numeric"
              value={form.estimated_students}
              onChange={update('estimated_students')}
              placeholder={t('schools_f_students', 'Estimated students')}
              data-testid="schools-students"
            />
            <textarea
              rows={3}
              value={form.message}
              onChange={update('message')}
              placeholder={t('schools_f_message', 'Anything we should know?')}
            />
            <button
              className="btn btn--primary"
              type="submit"
              disabled={state === 'sending'}
              data-testid="schools-submit"
            >
              {state === 'sending'
                ? t('schools_sending', 'Sending…')
                : t('schools_submit', 'Apply')}
            </button>
            {state === 'error' && (
              <p role="alert" style={{ color: 'var(--danger)' }} data-testid="schools-error">
                {error}
              </p>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
