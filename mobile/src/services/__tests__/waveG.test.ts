// [wave G items 95/96/97/98/99] mobile service tests: push flow, the
// offline stores, the streak widget text provider, tablet detection
// thresholds and the QR join codec.
import * as Notifications from 'expo-notifications';
import MockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
import { apiFetch } from '../ApiClient';
import {
  configurePresentation,
  enablePush,
  getExpoPushToken,
  registerPushToken,
  unregisterPushToken,
} from '../PushService';
import {
  clearOfflineData,
  draftIndex,
  listStatements,
  loadStatement,
  pendingDrafts,
  saveDraft,
  saveStatement,
  syncDrafts,
} from '../OfflineStore';
import * as Widget from 'expo-widget';
import { cacheStreak, readStreak, streakWidgetTask, streakWidgetText } from '../StreakWidget';
import { ClassroomService, DraftService, UserStatsService } from '../services';
import { buildJoinDeepLink, buildJoinWebUrl, parseJoinPayload } from '../QrJoin';
import { TABLET_MIN_WIDTH } from '../../utils/useIsTablet';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: MockAsyncStorage,
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));

jest.mock('expo-widget', () => ({
  setWidgetData: jest.fn(),
}));

jest.mock('../ApiClient', () => ({
  apiFetch: jest.fn(),
}));

const fetchMock = apiFetch as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  await MockAsyncStorage.clear();
});

describe('PushService [item 95]', () => {
  it('registers the expo token with the backend', async () => {
    fetchMock.mockResolvedValue({ registered: true });
    await expect(registerPushToken('ExpoPushToken[x]')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/users/me/push-token/',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reports failure when the backend rejects', async () => {
    fetchMock.mockRejectedValue(new Error('401'));
    await expect(registerPushToken('t')).resolves.toBe(false);
  });

  it('enablePush returns null when permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
    });
    await expect(enablePush()).resolves.toBeNull();
  });

  it('enablePush flows token → backend', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExpoPushToken[y]',
    });
    fetchMock.mockResolvedValue({});
    await expect(enablePush()).resolves.toBe('ExpoPushToken[y]');
  });
});

describe('OfflineStore [item 96]', () => {
  it('round-trips cached statements', async () => {
    await saveStatement({ problemId: 1, title: 'Sum', statement: 'Add two numbers.' });
    const cached = await loadStatement(1);
    expect(cached?.title).toBe('Sum');
    expect(cached?.savedAt).toBeGreaterThan(0);
    expect(await loadStatement(999)).toBeNull();
  });

  it('queues drafts offline and syncs them when online', async () => {
    await saveDraft({ problemId: 5, language: 'python3', code: 'print(1)' });
    await saveDraft({ problemId: 6, language: 'cpp17', code: 'int main(){}' });
    expect((await pendingDrafts()).length).toBe(2);

    const save = jest.fn().mockResolvedValue({});
    const synced = await syncDrafts(save);
    expect(synced).toBe(2);
    expect(save).toHaveBeenCalledWith(5, 'python3', 'print(1)');
    expect((await pendingDrafts()).length).toBe(0);
  });

  it('keeps drafts queued when the save fails (still offline)', async () => {
    await saveDraft({ problemId: 7, language: 'python3', code: 'x' });
    const save = jest.fn().mockRejectedValue(new Error('offline'));
    const synced = await syncDrafts(save);
    expect(synced).toBe(0);
    expect((await pendingDrafts()).length).toBe(1);
  });
});

describe('StreakWidget [item 97]', () => {
  it('renders the streak text with day pluralization', () => {
    expect(streakWidgetText({ current: 1, best: 3, updatedAt: 1 }).headline).toBe('1 day');
    expect(streakWidgetText({ current: 5, best: 9, updatedAt: 1 }).headline).toBe('5 days');
    expect(streakWidgetText(null)).toEqual({
      headline: '—',
      sub: 'Solve today to start a streak',
    });
  });

  it('caches and reads the snapshot', async () => {
    await cacheStreak(4, 10);
    const snap = await readStreak();
    expect(snap?.current).toBe(4);
    expect(snap?.best).toBe(10);
  });
});

describe('tablet threshold [item 98]', () => {
  it('is the canonical 768dp breakpoint', () => {
    expect(TABLET_MIN_WIDTH).toBe(768);
  });
});

describe('QrJoin codec [item 99]', () => {
  it('round-trips the deep link', () => {
    const link = buildJoinDeepLink({ code: 'AB12CD', password: 'secret' });
    expect(parseJoinPayload(link)).toEqual({ code: 'AB12CD', password: 'secret' });
  });

  it('parses the web join URL and upper-cases the code', () => {
    const url = buildJoinWebUrl('webcoder.example', { code: 'xy99', password: '' });
    expect(parseJoinPayload(url)).toEqual({ code: 'XY99', password: '' });
  });

  it('ignores non-join payloads', () => {
    expect(parseJoinPayload('https://webcoder.example/problems')).toBeNull();
    expect(parseJoinPayload('webcoder://home')).toBeNull();
    expect(parseJoinPayload('random text')).toBeNull();
    expect(parseJoinPayload('')).toBeNull();
  });
});

describe('PushService remaining arms [item 95]', () => {
  it('configurePresentation installs the handler and the body runs', async () => {
    configurePresentation();
    const call = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0][0];
    const behavior = await call.handleNotification();
    expect(behavior).toEqual({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    });
  });

  it('unregisterPushToken is best-effort on success and failure', async () => {
    fetchMock.mockResolvedValue({});
    await expect(unregisterPushToken('tok')).resolves.toBeUndefined();
    fetchMock.mockRejectedValue(new Error('401'));
    await expect(unregisterPushToken('tok')).resolves.toBeUndefined();
  });

  it('getExpoPushToken returns null when the expo call throws', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(new Error('no services'));
    await expect(getExpoPushToken()).resolves.toBeNull();
  });

  it('enablePush returns null when backend registration fails', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      data: 'ExpoPushToken[z]',
    });
    fetchMock.mockRejectedValue(new Error('500'));
    await expect(enablePush()).resolves.toBeNull();
  });
});

describe('OfflineStore remaining arms [item 96]', () => {
  it('lists cached statements newest-first and clears everything', async () => {
    await saveStatement({ problemId: 1, title: 'A', statement: 'a' });
    await saveStatement({ problemId: 2, title: 'B', statement: 'b' });
    const rows = await listStatements();
    expect(rows.length).toBe(2);
    expect(rows[0].savedAt).toBeGreaterThanOrEqual(rows[1].savedAt);
    await clearOfflineData();
    expect(await listStatements()).toEqual([]);
    expect(await pendingDrafts()).toEqual([]);
  });

  it('skips corrupt cached rows everywhere', async () => {
    const store = MockAsyncStorage as unknown as {
      setItem: (k: string, v: string) => Promise<void>;
    };
    await store.setItem('wc_offline_statement_9', '{not json');
    await store.setItem('wc_offline_draft_8', '{not json');
    await store.setItem('wc_offline_draft_index', '[1,"x"]');
    expect(await loadStatement(9)).toBeNull();
    expect((await listStatements()).length).toBe(0);
    expect((await pendingDrafts()).length).toBe(0);
    expect(await draftIndex()).toEqual([1]);
  });

  it('returns [] when nothing at all is cached', async () => {
    expect(await listStatements()).toEqual([]);
    expect(await draftIndex()).toEqual([]);
  });
});

describe('StreakWidget task + cache arms [item 97]', () => {
  it('feeds the widget from the cache and swallows module errors', async () => {
    await cacheStreak(2, 5);
    (Widget.setWidgetData as jest.Mock).mockImplementation(() => {
      throw new Error('no widget');
    });
    await expect(streakWidgetTask()).resolves.toBeUndefined();
    (Widget.setWidgetData as jest.Mock).mockImplementation(() => undefined);
    await expect(streakWidgetTask()).resolves.toBeUndefined();
    expect(Widget.setWidgetData).toHaveBeenCalledWith(
      expect.objectContaining({ headline: '2 days' }),
    );
  });

  it('readStreak returns null on corrupt JSON and on empty cache', async () => {
    expect(await readStreak()).toBeNull();
    const store = MockAsyncStorage as unknown as {
      setItem: (k: string, v: string) => Promise<void>;
    };
    await store.setItem('wc_streak_cache', '{oops');
    expect(await readStreak()).toBeNull();
  });
});

describe('new service methods ride apiFetch [items 96/97/99]', () => {
  it('join posts to the class join endpoint', async () => {
    fetchMock.mockResolvedValue({ detail: 'joined' });
    await ClassroomService.join('AB12CD', 'pw');
    expect(fetchMock).toHaveBeenCalledWith(
      '/classroom/classes/join/',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('DraftService.save PUTs the draft', async () => {
    fetchMock.mockResolvedValue({});
    await DraftService.save(5, 'python3', 'print(1)');
    expect(fetchMock).toHaveBeenCalledWith(
      '/submissions/drafts/5/',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('UserStatsService.getStatistics reads the stats endpoint', async () => {
    fetchMock.mockResolvedValue({
      current_streak: 3,
      max_streak: 9,
      solved: 10,
      total_active_days: 20,
    });
    const stats = await UserStatsService.getStatistics();
    expect(stats.current_streak).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith('/users/me/statistics/');
  });
});

describe('final statement arms [items 96/99]', () => {
  it('listStatements skips non-statement keys', async () => {
    await saveStatement({ problemId: 4, title: 'D', statement: 'd' });
    const store = MockAsyncStorage as unknown as {
      setItem: (k: string, v: string) => Promise<void>;
    };
    await store.setItem('wc_offline_draft_4', '{}'); // non-statement key
    const rows = await listStatements();
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe('D');
  });

  it('draftIndex falls back to [] when parsed is not an array', async () => {
    const store = MockAsyncStorage as unknown as {
      setItem: (k: string, v: string) => Promise<void>;
    };
    await store.setItem('wc_offline_draft_index', '{"not":"an array"}');
    expect(await draftIndex()).toEqual([]);
  });

  it('draftIndex falls back to [] on unparseable JSON', async () => {
    const store = MockAsyncStorage as unknown as {
      setItem: (k: string, v: string) => Promise<void>;
    };
    await store.setItem('wc_offline_draft_index', 'definitely not json');
    expect(await draftIndex()).toEqual([]);
  });

  it('buildJoinWebUrl omits the password when blank and embeds it when set', () => {
    expect(buildJoinWebUrl('webcoder.example', { code: 'XY99', password: '' })).toBe(
      'https://webcoder.example/classes/join?code=XY99',
    );
    expect(buildJoinWebUrl('webcoder.example', { code: 'XY99', password: 'pw' })).toBe(
      'https://webcoder.example/classes/join?code=XY99&p=pw',
    );
  });

  it('parseJoinPayload returns null for a deep link without a code', () => {
    expect(parseJoinPayload('webcoder://join?c=')).toBeNull();
    expect(parseJoinPayload('webcoder://join')).toBeNull();
  });
});
