'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContestService } from '@/services/ApiService';
import { ContestTeamRow, TeamStandingsRow } from '@/types/api';
import { palette } from '@/theme/tokens';

/**
 * Item 49 — the teams surface: the roster (who sits where) and the team
 * standings board (per-team aggregates over the members' submissions).
 */
export default function TeamsPanel({ contestId }: { contestId: number }) {
  const { t } = useTranslation();
  const [teams, setTeams] = useState<ContestTeamRow[] | null>(null);
  const [board, setBoard] = useState<TeamStandingsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [roster, standings] = await Promise.all([
        ContestService.getTeams(contestId),
        ContestService.getTeamStandings(contestId).catch(() => null),
      ]);
      setTeams(roster.results);
      setBoard(standings ? standings.results : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  }, [contestId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div data-testid="contest-teams">
      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      <h4>{t('teams_roster_title', 'Teams')}</h4>
      {teams === null ? (
        <p aria-busy="true">{t('teams_loading', 'Loading teams…')}</p>
      ) : teams.length === 0 ? (
        <p style={{ color: palette.muted }}>
          {t('teams_empty', 'No teams yet — register with a team name to found one.')}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
          {teams.map((team) => (
            <li
              key={team.id}
              data-testid={`team-row-${team.name}`}
              style={{ border: `1px solid ${palette.border}`, borderRadius: 10, padding: 10 }}
            >
              <strong>{team.name}</strong>{' '}
              <span style={{ color: palette.muted, fontSize: 13 }}>
                {t('teams_members', '{{joined}}/{{max}} members', {
                  joined: team.member_count,
                  max: team.max_members,
                })}
              </span>
              <div>{team.members.join(', ')}</div>
            </li>
          ))}
        </ul>
      )}

      {board && board.length > 0 && (
        <>
          <h4>{t('teams_board_title', 'Team standings')}</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="team-standings">
            <thead>
              <tr style={{ textAlign: 'left', color: palette.muted }}>
                <th style={{ padding: 8 }}>#</th>
                <th>{t('teams_team', 'Team')}</th>
                <th>{t('teams_members_col', 'Members')}</th>
                <th>{t('drama_score', 'Score')}</th>
              </tr>
            </thead>
            <tbody>
              {board.map((row) => (
                <tr
                  key={row.team_id}
                  data-testid={`team-standing-${row.team}`}
                  style={{ borderTop: `1px solid ${palette.border}` }}
                >
                  <td style={{ padding: 8 }}>{row.rank}</td>
                  <td style={{ padding: 8, fontWeight: 700 }}>{row.team}</td>
                  <td style={{ padding: 8 }}>{row.members.join(', ')}</td>
                  <td style={{ padding: 8, fontWeight: 700 }}>{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
