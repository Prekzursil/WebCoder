// QrJoin — wave G item 99: the shared join-payload codec.
//
// The teacher's class page (web) renders a QR carrying either the deep
// link `webcoder://join?c=CODE&p=PASSWORD` or the web URL
// `https://<site>/classes/join?code=CODE&p=PASSWORD`; the mobile scanner
// parses both into the {code, password} the join API takes.
export interface JoinPayload {
  code: string;
  password: string;
}

export function buildJoinDeepLink(payload: JoinPayload): string {
  const params = new URLSearchParams({ c: payload.code });
  if (payload.password) params.set('p', payload.password);
  return `webcoder://join?${params.toString()}`;
}

export function buildJoinWebUrl(site: string, payload: JoinPayload): string {
  const params = new URLSearchParams({ code: payload.code });
  if (payload.password) params.set('p', payload.password);
  return `https://${site}/classes/join?${params.toString()}`;
}

/** Extract {code, password} from a scanned string; null when it is not a
 * join payload (the scanner stays quiet instead of erroring). */
export function parseJoinPayload(scanned: string): JoinPayload | null {
  const text = scanned.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const isDeepLink = url.protocol === 'webcoder:' && url.host === 'join';
    const isWebUrl =
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.pathname.endsWith('/classes/join');
    if (!isDeepLink && !isWebUrl) return null;
    const code = isDeepLink
      ? (url.searchParams.get('c') ?? '').trim().toUpperCase()
      : (url.searchParams.get('code') ?? '').trim().toUpperCase();
    if (!code) return null;
    const password = isDeepLink
      ? (url.searchParams.get('p') ?? '')
      : (url.searchParams.get('p') ?? '');
    return { code, password };
  } catch {
    return null;
  }
}
