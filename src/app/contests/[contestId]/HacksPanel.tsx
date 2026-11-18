'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContestService } from '@/services/ApiService';
import { ContestProblemRow, HackRow, HackTargetRow } from '@/types/api';
import { palette } from '@/theme/tokens';

const VERDICT_COLORS: Record<HackRow['verdict'], string> = {
  SUCCESSFUL: palette.success,
  UNSUCCESSFUL: palette.danger,
  INVALID: palette.warn,
  PENDING: palette.muted,
};

/**
 * Item 48 — the open-hacks phase (Codeforces lock-to-hack):
 *
 * 1. lock a fully-solved board problem (irreversible — no resubmission);
 * 2. read other participants' solutions for the locked problem;
 * 3. submit a counter-test; the judge runs it against the reference and
 *    the target, then posts the verdict to the public feed.
 */
export default function HacksPanel({
  contestId,
  problems,
}: {
  contestId: number;
  problems: ContestProblemRow[] | null;
}) {
  const { t } = useTranslation();
  const [hacks, setHacks] = useState<HackRow[] | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const [targets, setTargets] = useState<HackTargetRow[] | null>(null);
  const [selected, setSelected] = useState<HackTargetRow | null>(null);
  const [inputData, setInputData] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [feed, targetList] = await Promise.all([
        ContestService.getHacks(contestId),
        ContestService.getHackTargets(contestId).catch(() => ({ count: 0, results: [] as HackTargetRow[] })),
      ]);
      setHacks(feed.results);
      setWindowOpen(feed.window_open);
      setTargets(targetList.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  }, [contestId]);

  useEffect(() => {
    load();
  }, [load]);

  const lock = async (contestProblemId: number) => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await ContestService.lockProblem(contestId, contestProblemId);
      setMessage(response.detail);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitHack = async () => {
    if (!selected || !inputData.trim()) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const hack = await ContestService.submitHack(contestId, selected.id, inputData);
      setMessage(
        `${t('hack_verdict', 'Verdict')}: ${hack.verdict}${hack.feedback ? ` — ${hack.feedback}` : ''}`,
      );
      setInputData('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="contest-hacks">
      <p
        style={{
          color: windowOpen ? palette.success : palette.muted,
          fontWeight: 700,
        }}
        data-testid="hacks-window-state"
      >
        {windowOpen
          ? t('hacks_window_open', 'Hacking window is OPEN — lock a solved problem to hack others.')
          : t('hacks_window_closed', 'The hacking window is closed (it opens at the freeze, or from the start when no freeze is set).')}
      </p>

      {problems && problems.length > 0 && (
        <div style={{ marginBottom: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {problems.map((cp) => (
            <button
              key={cp.id}
              type="button"
              disabled={busy}
              onClick={() => lock(cp.id)}
              data-testid={`hack-lock-${cp.label}`}
              title={t(
                'hack_lock_title',
                'Lock {{label}} after fully solving it — irreversible, unlocks hacking.',
                { label: cp.label },
              )}
              style={{ padding: '6px 12px' }}
            >
              {t('hack_lock', 'Lock {{label}}', { label: cp.label })}
            </button>
          ))}
        </div>
      )}

      {error && <p role="alert" style={{ color: palette.danger }}>{error}</p>}
      {message && (
        <p data-testid="hack-message" style={{ color: palette.success }}>{message}</p>
      )}

      {targets && targets.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <h4>{t('hack_targets_title', 'Hackable solutions')}</h4>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {targets.map((target) => (
              <li key={target.id} style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong>{target.problem_label}</strong>
                  <span>{target.user.username}</span>
                  <span style={{ color: palette.muted, fontSize: 13 }}>
                    {target.language} · {target.verdict} · {target.score}
                  </span>
                  <button
                    type="button"
                    style={{ marginLeft: 'auto' }}
                    aria-pressed={selected?.id === target.id}
                    onClick={() => setSelected(selected?.id === target.id ? null : target)}
                    data-testid={`hack-target-${target.id}`}
                  >
                    {selected?.id === target.id
                      ? t('hack_hide_code', 'Hide code')
                      : t('hack_read_code', 'Read code')}
                  </button>
                </div>
                {selected?.id === target.id && (
                  <>
                    <pre
                      data-testid={`hack-code-${target.id}`}
                      style={{
                        background: palette.muted,
                        padding: 10,
                        borderRadius: 8,
                        overflowX: 'auto',
                        maxHeight: 260,
                      }}
                    >
                      {target.code}
                    </pre>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <textarea
                        value={inputData}
                        onChange={(e) => setInputData(e.target.value)}
                        placeholder={t('hack_input_placeholder', 'Adversarial stdin for the hack…')}
                        aria-label={t('hack_input_placeholder', 'Adversarial stdin for the hack…')}
                        rows={3}
                        style={{ flex: 1 }}
                        data-testid="hack-input"
                      />
                      <button
                        type="button"
                        onClick={submitHack}
                        disabled={busy || !inputData.trim()}
                        data-testid="hack-submit"
                      >
                        {t('hack_submit', 'Hack!')}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h4>{t('hacks_feed_title', 'Hack feed')}</h4>
      {hacks === null ? (
        <p aria-busy="true">{t('hacks_loading', 'Loading hacks…')}</p>
      ) : hacks.length === 0 ? (
        <p style={{ color: palette.muted }}>
          {t('hacks_empty', 'No hacks yet — successful counter-tests land here as they are judged.')}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {hacks.map((hack) => (
            <li
              key={hack.id}
              data-testid={`hack-row-${hack.id}`}
              style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: 10 }}
            >
              <span style={{ fontWeight: 700, color: VERDICT_COLORS[hack.verdict] }}>
                {hack.verdict}
              </span>{' '}
              <span>
                {t('hack_by', '{{hacker}} hacked {{target}} on {{label}}', {
                  hacker: hack.hacker_username,
                  target: hack.target_username,
                  label: hack.problem_label,
                })}
              </span>
              {hack.feedback && (
                <div style={{ color: palette.muted, fontSize: 13 }}>{hack.feedback}</div>
              )}
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: 'pointer', color: palette.accent, fontSize: 13 }}>
                  {t('hack_show_input', 'Show hack input')}
                </summary>
                <pre style={{ background: palette.muted, padding: 8, borderRadius: 6 }}>
                  {hack.input_data}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
