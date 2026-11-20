// OfflineStore — wave G item 96: offline statements + drafts.
//
// Two AsyncStorage-backed stores:
//  - statement cache: every problem detail the user opens is saved; when
//    the API is unreachable the reader still gets the last-known copy
//    (marked with a `stale` flag so the UI can say so).
//  - draft outbox: code drafts written offline queue locally and sync to
//    the cross-device drafts API (PUT /submissions/drafts/{id}/) as soon
//    as connectivity returns.
import AsyncStorage from '@react-native-async-storage/async-storage';

const STATEMENT_PREFIX = 'wc_offline_statement_';
const DRAFT_PREFIX = 'wc_offline_draft_';
const DRAFT_INDEX_KEY = 'wc_offline_draft_index';

export interface CachedStatement {
  problemId: number;
  title: string;
  statement: string;
  savedAt: number;
}

export interface DraftOutboxRow {
  problemId: number;
  language: string;
  code: string;
  savedAt: number;
}

export async function saveStatement(row: Omit<CachedStatement, 'savedAt'>): Promise<void> {
  await AsyncStorage.setItem(
    STATEMENT_PREFIX + row.problemId,
    JSON.stringify({ ...row, savedAt: Date.now() } satisfies CachedStatement),
  );
}

export async function loadStatement(problemId: number): Promise<CachedStatement | null> {
  const raw = await AsyncStorage.getItem(STATEMENT_PREFIX + problemId);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedStatement;
  } catch {
    return null;
  }
}

export async function listStatements(): Promise<CachedStatement[]> {
  const keys = await AsyncStorage.getAllKeys();
  const rows: CachedStatement[] = [];
  for (const key of keys) {
    if (!key.startsWith(STATEMENT_PREFIX)) {
      continue;
    }
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      try {
        rows.push(JSON.parse(raw) as CachedStatement);
      } catch {
        /* skip corrupt rows */
      }
    }
  }
  return rows.sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveDraft(row: Omit<DraftOutboxRow, 'savedAt'>): Promise<void> {
  await AsyncStorage.setItem(
    DRAFT_PREFIX + row.problemId,
    JSON.stringify({ ...row, savedAt: Date.now() } satisfies DraftOutboxRow),
  );
  const index = await draftIndex();
  if (!index.includes(row.problemId)) {
    index.push(row.problemId);
    await AsyncStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(index));
  }
}

export async function draftIndex(): Promise<number[]> {
  const raw = await AsyncStorage.getItem(DRAFT_INDEX_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((id) => typeof id === 'number');
      }
    } catch {
      // Corrupt index — fall through to the empty default (drafts
      // re-index themselves on the next save).
    }
  }
  return [];
}

export async function pendingDrafts(): Promise<DraftOutboxRow[]> {
  const ids = await draftIndex();
  const rows: DraftOutboxRow[] = [];
  for (const id of ids) {
    const raw = await AsyncStorage.getItem(DRAFT_PREFIX + id);
    if (!raw) continue;
    try {
      rows.push(JSON.parse(raw) as DraftOutboxRow);
    } catch {
      /* skip corrupt rows */
    }
  }
  return rows.sort((a, b) => b.savedAt - a.savedAt);
}

/** Push every queued draft to the server; drops the rows that succeed.
 * Returns the number synced. */
export async function syncDrafts(
  save: (problemId: number, language: string, code: string) => Promise<unknown>,
): Promise<number> {
  const rows = await pendingDrafts();
  let synced = 0;
  for (const row of rows) {
    try {
      await save(row.problemId, row.language, row.code);
      await AsyncStorage.removeItem(DRAFT_PREFIX + row.problemId);
      synced += 1;
    } catch {
      /* still offline or auth expired — keep queued */
    }
  }
  const remaining = await draftIndex();
  const stillQueued: number[] = [];
  for (const id of remaining) {
    if (await AsyncStorage.getItem(DRAFT_PREFIX + id)) stillQueued.push(id);
  }
  await AsyncStorage.setItem(DRAFT_INDEX_KEY, JSON.stringify(stillQueued));
  return synced;
}

export async function clearOfflineData(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const ours = keys.filter(
    (key) =>
      key.startsWith(STATEMENT_PREFIX) || key.startsWith(DRAFT_PREFIX) || key === DRAFT_INDEX_KEY,
  );
  await AsyncStorage.multiRemove(ours);
}
