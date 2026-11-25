// [Wave D atestats] The public /certificates/[uuid] verification page:
// the frozen achievement renders for anonymous visitors, revoked
// certificates answer honestly (with reason), unknown UUIDs get the
// not-found copy, and the RO locale picks the Romanian contest title.

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const cookie = vi.hoisted(() => ({ value: 'en' }));
const certRow = vi.hoisted(() => ({ value: null as null | object }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'i18nextLng' ? { value: cookie.value } : undefined),
  }),
}));

vi.mock('../_lib/certificates-api', () => ({
  getCertificate: async () => certRow.value,
}));

import VerifyPage from './page';

const VALID_CERT = {
  uuid: '11111111-2222-3333-4444-555555555555',
  serial: 'WC-2026-000004',
  kind: 'CONTEST_PARTICIPATION',
  status: 'VALID',
  holder: 'alice',
  details: {
    rank: 2,
    rating_after: 1662,
    contest_id: 7,
    contest_title_en: 'Winter Cup',
    contest_title_ro: 'Cupa de Iarnă',
  },
  issued_at: '2026-11-01T12:00:00Z',
  revoked_at: null,
  revoked_reason: '',
};

async function renderPage() {
  const jsx = (await VerifyPage({ params: Promise.resolve({ uuid: 'x' }) })) as React.ReactElement;
  return renderToStaticMarkup(jsx);
}

describe('CertificateVerifyPage [Wave D]', () => {
  it('renders the frozen achievement + serial for a valid certificate', async () => {
    cookie.value = 'en';
    certRow.value = VALID_CERT;
    const html = await renderPage();
    expect(html).toContain('WC-2026-000004');
    expect(html).toContain('Winter Cup');
    expect(html).toContain('This certificate is valid.');
    expect(html).toContain('Final rank');
    expect(html).toContain('Print / save as PDF');
  });

  it('answers REVOKED with the reason instead of vanishing', async () => {
    cookie.value = 'en';
    certRow.value = {
      ...VALID_CERT,
      status: 'REVOKED',
      revoked_reason: 'contest 7 ratings discarded by organizer',
    };
    const html = await renderPage();
    expect(html).toContain('This certificate has been revoked.');
    expect(html).toContain('ratings discarded');
    expect(html).not.toContain('This certificate is valid.');
  });

  it('renders the not-found copy for an unknown UUID', async () => {
    cookie.value = 'en';
    certRow.value = null;
    const html = await renderPage();
    expect(html).toContain('Certificate not found');
    expect(html).toContain('does not match any certificate');
  });

  it('prefers the Romanian contest title on the ro locale', async () => {
    cookie.value = 'ro';
    certRow.value = VALID_CERT;
    const html = await renderPage();
    expect(html).toContain('Cupa de Iarnă');
    expect(html).toContain('Acest atestat este valid.');
  });
});
