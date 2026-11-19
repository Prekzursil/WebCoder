'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { AuthService } from '@/services/ApiService';
import { storeGuestTimezone, timezoneOptions } from '@/lib/datetime';
import { palette } from '@/theme/tokens';

/**
 * RO-3 — the Olympiad-geography identity card: optional county/school on
 * the profile (feeding the segmented leaderboards) + the LEG-2 is_minor
 * self-declaration with its privacy note (a minor's county/school never
 * show to other viewers and they stay off segmented boards).
 */
export default function IdentityCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [county, setCounty] = useState(user?.county ?? '');
  const [school, setSchool] = useState(user?.school ?? '');
  const [isMinor, setIsMinor] = useState(Boolean(user?.is_minor));
  const [bio, setBio] = useState(user?.bio ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? '');
  const [digest, setDigest] = useState(user?.notification_digest ?? 'none');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  if (!user) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    try {
      const updated = await AuthService.updateMe({
        county: county.trim(),
        school: school.trim(),
        isMinor: isMinor,
        bio: bio.slice(0, 500),
        timezone: timezone.trim(),
        notificationDigest: digest,
      });
      // Guests share the picker — persist the choice locally too so
      // unauthenticated pages render in the same zone.
      storeGuestTimezone(timezone.trim());
      // The next /users/me/ read picks the update up; the saved
      // marker confirms it for the user.
      void updated;
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section
      aria-label={t('identity_title', 'Identity (Olympiad geography)')}
      data-testid="identity-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}
    >
      <div
        style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '1rem',
        }}
      >
        {t('identity_title', 'Identity (Olympiad geography)')}
      </div>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            fontSize: '0.85rem',
            color: 'var(--muted)',
          }}
        >
          {t('identity_county', 'County')}
          <input
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            data-testid="identity-county"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--foreground)',
              padding: '8px',
            }}
          />
        </label>
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            fontSize: '0.85rem',
            color: 'var(--muted)',
          }}
        >
          {t('identity_school', 'School')}
          <input
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            data-testid="identity-school"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--foreground)',
              padding: '8px',
            }}
          />
        </label>
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            fontSize: '0.85rem',
            color: 'var(--muted)',
          }}
        >
          {t('identity_bio', 'Bio')}
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={2}
            data-testid="identity-bio"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--foreground)',
              padding: '8px',
              resize: 'vertical',
            }}
          />
        </label>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.85rem',
            color: 'var(--muted)',
          }}
        >
          <input
            type="checkbox"
            checked={isMinor}
            onChange={(e) => setIsMinor(e.target.checked)}
            data-testid="identity-minor"
          />
          {t('identity_minor', 'I am under 16')}
        </label>
        <p style={{ fontSize: '0.75rem', color: palette.muted, margin: 0 }}>
          {t(
            'identity_privacy_note',
            'Optional. Your county/school powers the county Top-100 boards; if you are under 16, they stay private and you appear only on the global board (GDPR age rules).',
          )}
        </p>
        {/* [wave G item 87] display-timezone picker (IANA zones). */}
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            fontSize: '0.85rem',
            color: 'var(--muted)',
          }}
        >
          {t('identity_timezone', 'Display timezone')}
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            data-testid="identity-timezone"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--foreground)',
              padding: '8px',
            }}
          >
            <option value="">{t('identity_timezone_utc', 'UTC (default)')}</option>
            {timezoneOptions().map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        {/* [wave G item 84] notification digest frequency. */}
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            fontSize: '0.85rem',
            color: 'var(--muted)',
          }}
        >
          {t('digest_label', 'Notification digest')}
          <select
            value={digest}
            onChange={(e) => setDigest(e.target.value)}
            data-testid="identity-digest"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--foreground)',
              padding: '8px',
            }}
          >
            <option value="none">{t('digest_none', 'No digest (in-app only)')}</option>
            <option value="daily">{t('digest_daily', 'Daily email')}</option>
            <option value="weekly">{t('digest_weekly', 'Weekly email')}</option>
          </select>
        </label>
        <div>
          <button type="submit" disabled={status === 'saving'} data-testid="identity-save">
            {status === 'saving'
              ? t('identity_saving', 'Saving…')
              : t('identity_save', 'Save identity')}
          </button>
          {status === 'saved' && (
            <span
              role="status"
              style={{ marginLeft: '0.5rem', color: palette.success, fontSize: '0.8rem' }}
            >
              {t('identity_saved', 'Saved')}
            </span>
          )}
          {status === 'error' && (
            <span
              role="alert"
              style={{ marginLeft: '0.5rem', color: palette.danger, fontSize: '0.8rem' }}
            >
              {t('identity_error', 'Could not save')}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
