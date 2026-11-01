"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { CommunityService } from "@/services/ApiService";
import { WeeklyBoardRow } from "@/types/api";
import { palette } from "@/theme/tokens";
import UserChip from "@/components/common/UserChip";

/**
 * RAT-9 — the weekly-reset board: solves + points inside the rolling
 * 7-day window. Mid-tier friendly while the all-time board freezes under
 * power users (the roadmap's exact motivation).
 */
export default function WeeklyBoard() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<WeeklyBoardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    CommunityService.getWeeklyBoard()
      .then((data) => {
        if (!cancelled) setRows(data.results);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error && err.message
              ? err.message
              : t("weekly_board_error", "Failed to load the weekly board."),
          );
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <section aria-label={t("weekly_board_title", "This week")} data-testid="weekly-board">
      <h3>🔥 {t("weekly_board_title", "This week")}</h3>
      <p style={{ color: palette.muted, fontSize: "0.85rem" }}>
        {t("weekly_board_hint", "Rolling 7-day window — solves and points from the past week.")}
      </p>
      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      {rows === null ? (
        !error && <p aria-busy="true">{t("weekly_board_loading", "Loading…")}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: palette.muted }}>
          {t("weekly_board_empty", "No solves this week yet — be the first.")}
        </p>
      ) : (
        <ol style={{ paddingLeft: 20 }}>
          {rows.slice(0, 10).map((row) => (
            <li key={row.user_id} data-testid={`weekly-row-${row.username}`}>
              <UserChip username={row.username} /> — {row.solved} {t("weekly_solves", "solves")} ·{" "}
              {row.points} {t("weekly_points", "pts")}
            </li>
          ))}
        </ol>
      )}
      <Link href="/leaderboard" style={{ color: palette.accent }}>
        {t("weekly_board_all_time", "All-time leaderboard →")}
      </Link>
    </section>
  );
}
