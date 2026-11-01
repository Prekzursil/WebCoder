"use client";

// [ANA-1 / Wave D] The weekly owner dashboard panel: live activation
// funnel + D1/D7 retention + 30-day submission bars + the frozen weekly
// trend. Reads /users/admin/activation/ (live) and .../history/ (weekly
// snapshots written by the celery-beat task).

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@mui/material";
import { AdminService } from "@/services/ApiService";
import LoadingSpinner from "@/components/common/LoadingSpinner";

type Activation = Awaited<ReturnType<typeof AdminService.getActivation>>;
type HistoryRow = Awaited<ReturnType<typeof AdminService.getActivationHistory>>["history"][number];

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: "10px",
  padding: "1rem 1.25rem",
  flex: "1 1 140px",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.65rem",
  color: "var(--muted)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "0.4rem",
};

const valueStyle: React.CSSProperties = {
  fontSize: "1.5rem",
  fontWeight: 800,
  color: "var(--foreground)",
  letterSpacing: "-0.03em",
};

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value}</div>
      {sub && (
        <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function OwnerAnalytics() {
  const { t } = useTranslation();
  const [live, setLive] = useState<Activation | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [activation, historyResponse] = await Promise.all([
          AdminService.getActivation(),
          AdminService.getActivationHistory(12),
        ]);
        if (cancelled) return;
        setLive(activation);
        setHistory(historyResponse.history);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error && err.message ? err.message : "Failed to load analytics.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error)
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        {error}
      </Alert>
    );
  if (!live) return <LoadingSpinner />;

  const pct = (rate: number | null) => (rate == null ? "—" : `${(rate * 100).toFixed(1)}%`);
  const days = Object.entries(live.submissions_per_day_30d);
  const maxDay = Math.max(1, ...days.map(([, n]) => n));

  return (
    <div data-testid="owner-analytics">
      {/* Funnel + retention strip */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "1rem" }}>
        <Metric label={t("analytics_total_users", "Users")} value={live.total_users} />
        <Metric
          label={t("analytics_activation", "Made a submission")}
          value={live.users_with_submission}
          sub={pct(live.activation_rate)}
        />
        <Metric
          label={t("analytics_first_ac", "First AC")}
          value={live.users_with_ac}
          sub={pct(live.first_ac_rate)}
        />
        <Metric
          label={t("analytics_d1", "D1 active")}
          value={live.d1_active}
          sub={pct(live.d1_rate)}
        />
        <Metric
          label={t("analytics_d7", "D7 active")}
          value={live.d7_active}
          sub={pct(live.d7_rate)}
        />
        <Metric
          label={t("analytics_total_submissions", "Submissions")}
          value={live.total_submissions}
        />
      </div>

      {/* 30-day volume bars */}
      <div style={{ marginTop: "1.5rem" }}>
        <div style={labelStyle}>{t("analytics_30d_volume", "Submissions — last 30 days")}</div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
            height: 72,
            background: "var(--surface)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "10px",
            padding: "0.75rem",
          }}
          role="img"
          aria-label={t("analytics_30d_volume", "Submissions — last 30 days")}
        >
          {days.length === 0 ? (
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              {t("analytics_no_data", "No submissions yet.")}
            </span>
          ) : (
            days.map(([day, count]) => (
              <div
                key={day}
                title={`${day}: ${count}`}
                style={{
                  flex: 1,
                  minWidth: 4,
                  height: `${Math.max(4, (count / maxDay) * 100)}%`,
                  background: "var(--accent)",
                  opacity: 0.75,
                  borderRadius: 2,
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* Weekly frozen trend */}
      <div style={{ marginTop: "1.5rem" }}>
        <div style={labelStyle}>{t("analytics_weekly_trend", "Weekly snapshots (Mondays)")}</div>
        {history.length === 0 ? (
          <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            {t(
              "analytics_no_snapshots",
              "No weekly snapshots captured yet — the beat task runs Monday 06:30.",
            )}
          </p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.85rem",
              background: "var(--surface)",
              borderRadius: "10px",
            }}
          >
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                <th style={{ padding: "0.5rem 0.75rem" }}>{t("analytics_week", "Week")}</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>{t("analytics_total_users", "Users")}</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>
                  {t("analytics_activation", "Made a submission")}
                </th>
                <th style={{ padding: "0.5rem 0.75rem" }}>{t("analytics_first_ac", "First AC")}</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>{t("analytics_d1", "D1")}</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>{t("analytics_d7", "D7")}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.week} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "0.4rem 0.75rem", color: "var(--foreground)" }}>
                    {row.week}
                  </td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>{row.total_users}</td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>{row.users_with_submission}</td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>{row.users_with_ac}</td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>{row.d1_active}</td>
                  <td style={{ padding: "0.4rem 0.75rem" }}>{row.d7_active}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", marginTop: "1rem" }}>
        {t(
          "analytics_cookie_light_note",
          "Derived server-side from platform data — no third-party trackers, no cookies (ANA-1).",
        )}
      </p>
    </div>
  );
}
