'use client';

// [Wave G item 80] The Ctrl-K command palette: one keyboard surface for
// navigation + problem search. Hand-rolled (no cmdk dependency, matching
// the hand-rolled SW decision): a fixed overlay with an input, arrow-key
// navigation, Enter to run, Esc to close. Commands cover the main nav
// areas plus role-aware links; typing a query also searches the problem
// catalog server-side (?search=) and offers direct problem jumps.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { ProblemService, SearchService } from '@/services/ApiService';
import type { FederatedHits } from '@/services/ApiService';
import SearchIcon from '@mui/icons-material/Search';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface ProblemHit {
  id: number;
  title_i18n?: { en?: string; ro?: string } | string;
}

function problemTitle(hit: ProblemHit, locale: string): string {
  if (typeof hit.title_i18n === 'string') return hit.title_i18n;
  const dict = (hit.title_i18n ?? {}) as Record<string, string | undefined>;
  return dict[locale] || dict.en || dict.ro || `#${hit.id}`;
}

export default function CommandPalette(): ReactNode {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [problemHits, setProblemHits] = useState<ProblemHit[]>([]);
  const [federated, setFederated] = useState<FederatedHits | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setProblemHits([]);
    setActiveIndex(0);
  }, []);

  // Global Ctrl+K / Cmd+K (and Ctrl+P is deliberately NOT bound — browsers
  // own print). Opens from anywhere except inside a CodeMirror editor,
  // where Mod-K may be editor state; CodeMirror does not bind Mod-K by
  // default, so the window listener still wins.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isK = event.key.toLowerCase() === 'k';
      if (!isK || !(event.ctrlKey || event.metaKey) || event.altKey) return;
      event.preventDefault();
      setOpen((wasOpen) => {
        if (wasOpen) close();
        return !wasOpen;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  // Focus the input whenever the palette opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced problem search once the query is long enough.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setProblemHits([]);
      setFederated(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      Promise.resolve(ProblemService.getProblems({ search: q }, { pageSize: 5 }))
        .then((data) => {
          if (!cancelled) setProblemHits(data?.results ?? []);
        })
        .catch(() => {
          if (!cancelled) setProblemHits([]);
        });
      // [wave G item 82] federated hits: threads, articles, contests, users.
      const locale = (i18n.language ?? 'en').startsWith('ro') ? 'ro' : 'en';
      Promise.resolve(SearchService.federated(q, locale))
        .then((data) => {
          if (!cancelled) setFederated(data?.results ?? null);
        })
        .catch(() => {
          if (!cancelled) setFederated(null);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, open, i18n.language]);

  const navCommands: CommandItem[] = useMemo(() => {
    const go = (href: string) => () => {
      close();
      router.push(href);
    };
    const items: CommandItem[] = [
      { id: 'home', label: t('nav_home', 'Home'), hint: '/', run: go('/') },
      {
        id: 'problems',
        label: t('nav_problems', 'Problems'),
        hint: '/problems',
        run: go('/problems'),
      },
      { id: 'tracks', label: t('nav_tracks', 'Tracks'), hint: '/tracks', run: go('/tracks') },
      {
        id: 'contests',
        label: t('nav_contests', 'Contests'),
        hint: '/contests',
        run: go('/contests'),
      },
      { id: 'ratings', label: t('nav_ratings', 'Ratings'), hint: '/ratings', run: go('/ratings') },
      {
        id: 'leaderboard',
        label: t('nav_leaderboard', 'Leaderboard'),
        hint: '/leaderboard',
        run: go('/leaderboard'),
      },
      { id: 'forum', label: t('nav_forum', 'Forum'), hint: '/forum', run: go('/forum') },
      {
        id: 'start',
        label: t('start_page_title', 'Start here'),
        hint: '/start',
        run: go('/start'),
      },
      {
        id: 'try',
        label: t('try_guest_title', 'Try it without an account'),
        hint: '/try',
        run: go('/try'),
      },
    ];
    if (auth.isAuthenticated) {
      items.push(
        {
          id: 'profile',
          label: t('nav_profile', 'Profile'),
          hint: '/profile',
          run: go('/profile'),
        },
        {
          id: 'my-submissions',
          label: t('nav_my_submissions', 'My Submissions'),
          hint: '/my-submissions',
          run: go('/my-submissions'),
        },
        {
          id: 'notifications',
          label: t('nav_notifications', 'Notifications'),
          hint: '/notifications',
          run: go('/notifications'),
        },
      );
    } else {
      items.push(
        { id: 'login', label: t('nav_login', 'Login'), hint: '/login', run: go('/login') },
        {
          id: 'register',
          label: t('nav_register', 'Register'),
          hint: '/register',
          run: go('/register'),
        },
      );
    }
    return items;
  }, [t, auth.isAuthenticated, close, router]);

  const items: CommandItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filteredNav = q
      ? navCommands.filter((item) => item.label.toLowerCase().includes(q))
      : navCommands;
    const problemItems: CommandItem[] = problemHits.map((hit) => ({
      id: `problem-${hit.id}`,
      label: problemTitle(hit, i18n.language ?? 'en'),
      hint: t('palette_problem_hint', 'problem'),
      run: () => {
        close();
        router.push(`/problems/${hit.id}`);
      },
    }));
    const federatedItems: CommandItem[] = [];
    if (q.trim().length >= 2 && federated) {
      for (const row of federated.threads) {
        federatedItems.push({
          id: `thread-${row.id}`,
          label: row.title,
          hint: t('palette_kind_thread', 'forum'),
          run: () => {
            close();
            router.push(`/forum/threads/${row.id}`);
          },
        });
      }
      for (const row of federated.articles) {
        federatedItems.push({
          id: `article-${row.id}`,
          label: row.title,
          hint: t('palette_kind_article', 'article'),
          run: () => {
            close();
            router.push(`/wiki`);
          },
        });
      }
      for (const row of federated.contests) {
        federatedItems.push({
          id: `contest-${row.id}`,
          label: row.title,
          hint: t('palette_kind_contest', 'contest'),
          run: () => {
            close();
            router.push(`/contests/${row.id}`);
          },
        });
      }
      for (const row of federated.users) {
        federatedItems.push({
          id: `user-${row.id}`,
          label: row.username,
          hint: t('palette_kind_user', 'user'),
          run: () => {
            close();
            router.push(`/profile/${encodeURIComponent(row.username)}`);
          },
        });
      }
    }
    return [...filteredNav, ...problemItems, ...federatedItems];
  }, [navCommands, query, problemHits, federated, i18n.language, t, close, router]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, problemHits]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) item.run();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  // Keep the active item in view while arrowing through a long list.
  useEffect(() => {
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('palette_title', 'Command palette')}
      data-testid="command-palette"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '12vh 1rem 1rem',
        background: 'rgba(0, 0, 0, 0.55)',
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        style={{
          width: 'min(560px, 100%)',
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px' }}>
          <span style={{ color: 'var(--muted)', display: 'inline-flex' }} aria-hidden="true">
            <SearchIcon fontSize="small" />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('palette_placeholder', 'Type a command or search problems…')}
            aria-label={t('palette_placeholder', 'Type a command or search problems…')}
            aria-controls="command-palette-list"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--foreground)',
            }}
          />
          <span
            aria-hidden="true"
            style={{
              fontSize: '0.7rem',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            esc
          </span>
        </div>
        <ul
          id="command-palette-list"
          ref={listRef}
          role="listbox"
          aria-label={t('palette_results', 'Results')}
          style={{
            listStyle: 'none',
            margin: 0,
            padding: '4px',
            maxHeight: '46vh',
            overflowY: 'auto',
          }}
        >
          {items.length === 0 && (
            <li style={{ padding: '12px', color: 'var(--muted)', fontSize: '0.85rem' }}>
              {t('palette_empty', 'No matches.')}
            </li>
          )}
          {items.map((item, index) => (
            <li key={item.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onClick={item.run}
                onMouseEnter={() => setActiveIndex(index)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: index === activeIndex ? 'var(--wash-14)' : 'transparent',
                  color: 'var(--foreground)',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'start',
                  fontSize: '0.875rem',
                }}
              >
                <span>{item.label}</span>
                {item.hint && (
                  <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{item.hint}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
