// [Wave G item 87] Display-timezone helpers. Times are STORED and judged
// in UTC; these utilities render them in the visitor's chosen IANA
// timezone (profile setting for accounts, localStorage for guests).
// Nothing here feeds correctness-relevant math — presentation only.

const TZ_STORAGE_KEY = 'wc-display-timezone';

export function readGuestTimezone(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(TZ_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function storeGuestTimezone(tz: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (tz) window.localStorage.setItem(TZ_STORAGE_KEY, tz);
    else window.localStorage.removeItem(TZ_STORAGE_KEY);
  } catch {
    /* private mode: session-only */
  }
}

/** The effective display timezone: the account's, else the guest's. */
export function displayTimezone(userTz?: string | null): string {
  return (userTz && userTz.trim()) || readGuestTimezone() || 'UTC';
}

/** Format an ISO timestamp in the display timezone (medium date + time). */
export function formatInTimezone(iso: string, tz: string, locale?: string): string {
  const zone = tz || 'UTC';
  try {
    return new Intl.DateTimeFormat(locale ?? undefined, {
      timeZone: zone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    // Unknown IANA name (stale profile data) — degrade to UTC.
    return new Intl.DateTimeFormat(locale ?? undefined, {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }
}

/** The timezone's UTC offset label at the given instant (for tooltips). */
export function timezoneOffsetLabel(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'UTC',
      timeZoneName: 'shortOffset',
    }).formatToParts(at);
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

/** IANA zone list for pickers (Intl.supportedValuesOf where available,
 * a curated fallback where not — e.g. older Safari). */
export function timezoneOptions(): string[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  if (typeof supported === 'function') {
    try {
      return supported('timeZone');
    } catch {
      /* fall through */
    }
  }
  return [
    'UTC',
    'Europe/Bucharest',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Paris',
    'Europe/Madrid',
    'Europe/Rome',
    'Europe/Chisinau',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'America/Sao_Paulo',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Asia/Almaty',
    'Australia/Sydney',
  ];
}
