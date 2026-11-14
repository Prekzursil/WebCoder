// Server-side data access for the PUBLIC certificate verification page
// (Wave D atestats). Mirrors problems-api.ts: centralized base URL, no
// silent catch — a down backend surfaces as the page's not-found/error
// state rather than a phantom "valid" answer.
//
// Verification answers are 60s-revalidated (ISR): a revocation lands
// within a minute; the printed serial+UUID stay stable.

import { CertificateType } from '@/types/api';
import { apiUrl } from '@/lib/api-config';

export async function getCertificate(
  uuid: string,
): Promise<CertificateType | null> {
  const cacheOpts = process.env.E2E_API_BASE
    ? ({ cache: 'no-store' } as RequestInit)
    : ({ next: { revalidate: 60 } } as RequestInit);
  const response = await fetch(
    apiUrl(`/certificates/verify/${uuid}/`),
    cacheOpts,
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  return (await response.json()) as CertificateType;
}
