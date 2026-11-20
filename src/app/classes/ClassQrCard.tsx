'use client';

// [Wave G item 99] The teacher-side join QR: renders the class join
// payload (deep link, carrying code + password when set) as a QR the
// mobile app scans to join. The QR generation is server-side of the
// client render (the `qrcode` package, data URL into an <img>) so no
// dependency on external chart APIs.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import QRCode from 'qrcode';
import { lightPalette } from '@/theme/tokens';
import { useTranslation } from 'react-i18next';

export function buildClassJoinDeepLink(code: string, password: string): string {
  const params = new URLSearchParams({ c: code.toUpperCase() });
  if (password) params.set('p', password);
  return `webcoder://join?${params.toString()}`;
}

export default function ClassQrCard({
  code,
  hasPassword,
  className,
}: {
  code: string;
  /** The class joins with a password (stored hashed server-side — the
   * teacher embeds it in the QR locally; it never travels an API). */
  hasPassword?: boolean;
  className?: string;
}): ReactNode {
  const { t } = useTranslation();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const payload = buildClassJoinDeepLink(code, password);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(payload, {
      margin: 1,
      width: 220,
      // QR quiet zone must be white for scanners — the light token.
      color: { light: lightPalette.surface },
    })
      .then((url) => {
        if (alive) setDataUrl(url);
      })
      .catch(() => {
        if (alive) setDataUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [payload]);

  return (
    <div
      className={className}
      data-testid={`class-qr-${code}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        padding: '10px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface)',
      }}
    >
      {dataUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element -- a
           client-generated data URL; next/image adds nothing here */
        <img
          src={dataUrl}
          alt={t('qr_alt', 'Class join QR code')}
          width={180}
          height={180}
          style={{ borderRadius: 6 }}
        />
      ) : (
        <div style={{ width: 180, height: 180, background: 'var(--surface-2)' }} />
      )}
      <strong style={{ fontSize: '0.8rem', color: 'var(--foreground)', letterSpacing: '0.08em' }}>
        {code}
      </strong>
      {hasPassword ? (
        <label
          style={{
            fontSize: '0.7rem',
            color: 'var(--muted)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {t('qr_password_embed', 'Embed the join password (stays on this device)')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label={t('qr_password_embed', 'Embed the join password (stays on this device)')}
            data-testid={`qr-password-${code}`}
            style={{ fontSize: '0.75rem', width: 160 }}
          />
        </label>
      ) : (
        <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
          {t('qr_scan_hint', 'Students scan to join')}
        </span>
      )}
    </div>
  );
}
