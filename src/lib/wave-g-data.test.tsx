import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import {
  displayTimezone,
  formatInTimezone,
  readGuestTimezone,
  storeGuestTimezone,
  timezoneOffsetLabel,
  timezoneOptions,
} from './datetime';
import AnnotationsPanel from '@/app/problems/[problemId]/AnnotationsPanel';
import SaveOfflinePackButton from '@/app/problems/[problemId]/SaveOfflinePackButton';

// [Wave G items 87 + 78 + 92] Timezone helpers, the annotations panel and
// the offline-pack button.

const api = vi.hoisted(() => ({
  listAnnotations: vi.fn(),
  addAnnotation: vi.fn(),
  deleteAnnotation: vi.fn(),
  getStatementPack: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  // [wave G item 82/88] the palette/onboarding surfaces need these.
  SearchService: { federated: vi.fn().mockResolvedValue({ query: '', results: {} }) },
  OnboardingService: { get: vi.fn().mockResolvedValue({ steps: [], done: 0, total: 0 }) },
  StudyAidService: api,
}));

const mocks = vi.hoisted(() => ({
  auth: {
    isAuthenticated: true,
    user: {
      id: 7,
      username: 'ana',
      email: 'a@x.com',
      role: 'BASIC',
      timezone: 'Europe/Bucharest',
    },
    login: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

afterEach(cleanup);

describe('datetime helpers [item 87]', () => {
  it('formats an ISO instant in the given timezone', () => {
    const iso = '2026-11-18T12:00:00Z';
    expect(formatInTimezone(iso, 'UTC')).toMatch(/Nov 18, 2026/);
    expect(formatInTimezone(iso, 'UTC')).toMatch(/12:00/);
    // The same instant shifted into Bucharest (UTC+2 in November).
    expect(formatInTimezone(iso, 'Europe/Bucharest')).toMatch(/2:00 PM|14:00/);
  });

  it('degrades to UTC on an invalid zone name', () => {
    expect(formatInTimezone('2026-11-18T12:00:00Z', 'Mars/Olympus')).toMatch(/12:00/);
  });

  it('prefers the account timezone, then the guest one, then UTC', () => {
    expect(displayTimezone('Europe/Bucharest')).toBe('Europe/Bucharest');
    storeGuestTimezone('Asia/Tokyo');
    expect(readGuestTimezone()).toBe('Asia/Tokyo');
    expect(displayTimezone(null)).toBe('Asia/Tokyo');
    storeGuestTimezone('');
    expect(displayTimezone('  ')).toBe('UTC');
  });

  it('labels the offset and lists zones', () => {
    expect(timezoneOffsetLabel('UTC')).toMatch(/UTC|GMT/);
    const zones = timezoneOptions();
    expect(zones).toContain('Europe/Bucharest');
    expect(zones.length).toBeGreaterThan(10);
  });
});

describe('AnnotationsPanel [item 78]', () => {
  it('lists existing annotations', async () => {
    api.listAnnotations.mockResolvedValue([
      { id: 3, quote: 'two numbers', note: 'watch overflow', updated_at: '2026-11-01T10:00:00Z' },
    ]);
    render(<AnnotationsPanel problemId="1" />);
    await screen.findByText(/watch overflow/);
    expect(screen.getByText(/two numbers/)).toBeInTheDocument();
  });

  it('captures the selection and adds an annotation', async () => {
    api.listAnnotations.mockResolvedValue([]);
    api.addAnnotation.mockResolvedValue({
      id: 9,
      quote: 'print their sum',
      note: 'int is enough',
      updated_at: '2026-11-02T10:00:00Z',
    });
    render(<AnnotationsPanel problemId="1" />);
    fireEvent.click(screen.getByRole('button', { name: /capture selection/i }));
    // The quote input state is fed by window.getSelection — simulate a
    // selection via the DOM API jsdom supports.
    expect(screen.getByRole('button', { name: /add note/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/your note…/i), {
      target: { value: 'int is enough' },
    });
    // Without a real selection the quote stays empty; set one via the
    // document body range.
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(document.body);
    selection?.removeAllRanges();
    selection?.addRange(range);
    fireEvent.click(screen.getByRole('button', { name: /capture selection/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add note/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /add note/i }));
    await screen.findByText(/int is enough/);
    expect(api.addAnnotation).toHaveBeenCalled();
  });

  it('deletes an annotation', async () => {
    api.listAnnotations.mockResolvedValue([
      {
        id: 3,
        quote: 'the quoted bit',
        note: 'a unique note body',
        updated_at: '2026-11-01T10:00:00Z',
      },
    ]);
    api.deleteAnnotation.mockResolvedValue({ deleted: '3' });
    render(<AnnotationsPanel problemId="1" />);
    await screen.findByText(/a unique note body/);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(screen.queryByText(/a unique note body/)).toBeNull());
  });

  it('stays hidden for guests', () => {
    mocks.auth.isAuthenticated = false;
    const { container } = render(<AnnotationsPanel problemId="1" />);
    expect(container.querySelector('[data-testid="annotations-panel"]')).toBeNull();
    mocks.auth.isAuthenticated = true;
  });
});

describe('SaveOfflinePackButton [item 92]', () => {
  it('downloads the pack html', async () => {
    api.getStatementPack.mockResolvedValue({
      problem_id: 1,
      lang: 'en',
      html: '<!DOCTYPE html><html><body>Sum</body></html>',
    });
    const clickSpy = vi.fn();
    // jsdom does not implement anchor.click() downloads — spy on it.
    const anchorProto = HTMLAnchorElement.prototype;
    const origClick = anchorProto.click;
    anchorProto.click = clickSpy;
    render(<SaveOfflinePackButton problemId="1" title="Sum Two Numbers" />);
    fireEvent.click(screen.getByTestId('save-offline-pack'));
    await waitFor(() => expect(api.getStatementPack).toHaveBeenCalledWith('1', 'en'));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    anchorProto.click = origClick;
  });

  it('surfaces a failure message', async () => {
    api.getStatementPack.mockRejectedValue(new Error('boom'));
    render(<SaveOfflinePackButton problemId="1" title="Sum" />);
    fireEvent.click(screen.getByTestId('save-offline-pack'));
    await screen.findByText(/could not build/i);
  });
});
