"use client";

import React, { useState, FormEvent, useEffect } from "react";
import IdentityCard from "./IdentityCard";
import TagProfilePanel from "./TagProfilePanel";
import type { TagProfile } from "@/types/api";
import { useTranslation } from "react-i18next";
import { AuthService, SubmissionService } from "@/services/ApiService";
import { useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/common/ProtectedRoute";
import ConfirmationModal from "@/components/common/ConfirmationModal";
import SecurityPanel from "@/components/common/SecurityPanel";
import { Box, TextField, Button, Alert, CircularProgress } from "@mui/material";
import GoogleIcon from "@mui/icons-material/Google";
import GitHubIcon from "@mui/icons-material/GitHub";
import { User } from "@/types";
import { API_BASE_URL } from "@/lib/api-config";
import Link from "next/link";

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

// [B5/RAT-4/5/6] Live statistics payload from /users/me/statistics/ —
// the profile overview renders exclusively from this (mocks deleted).
interface StatisticsPayload {
  solved: number;
  attempted: number;
  total_submissions: number;
  acceptance_rate: number | null;
  per_difficulty: Record<string, { solved: number; attempted: number }>;
  per_language: Record<string, number>;
  active_dates_90d: string[];
  current_streak: number;
  max_streak: number;
  total_active_days: number;
  ladder: { points: number; level: number; next_level_points: number; progress: number };
  badges: string[];
  /** RAT-7: per-tag skill profile + practice-next strip. */
  tag_profile?: TagProfile;
}

interface RecentSubmission {
  id: number;
  problem: { id: number; title_i18n: Record<string, string> };
  language: string;
  verdict: string;
  submission_time: string;
}

const BADGE_LABELS: Record<string, string> = {
  first_ac: "First AC",
  solved_10: "10 solved",
  solved_50: "50 solved",
  streak_7: "7-day streak",
  polyglot_3: "Polyglot (3 languages)",
};

const verdictConfig: Record<string, { color: string; bg: string }> = {
  AC: { color: "var(--success)", bg: "rgba(74,222,128,0.12)" },
  WA: { color: "var(--danger)", bg: "rgba(248,113,113,0.12)" },
  TLE: { color: "var(--warn)", bg: "rgba(251,191,36,0.12)" },
  MLE: { color: "var(--violet)", bg: "rgba(167,139,250,0.12)" },
  CE: { color: "var(--orange)", bg: "rgba(251,146,60,0.12)" },
};

function StatCard({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string | number;
  accent?: string;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "10px",
        padding: "1rem 1.25rem",
        flex: "1 1 120px",
      }}
    >
      <div
        style={{
          fontSize: "0.65rem",
          color: "var(--muted)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: "0.4rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "1.5rem",
          fontWeight: 800,
          color: accent ?? "var(--foreground)",
          letterSpacing: "-0.03em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", marginTop: "2px" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// [LEG-1/X5] Export-your-data + delete-your-account, wired to the GDPR
// endpoints from the account-control backend PR.
function AccountControlCard({ onAccountDeleted }: { onAccountDeleted: () => Promise<void> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const doExport = async () => {
    setBusy("export");
    setNotice(null);
    try {
      const dump = (await AuthService.exportAccount()) as unknown as Record<string, unknown>;
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "webcoder-account-export.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(t("gdpr_export_done", "Your data export downloaded."));
    } catch (err) {
      setNotice(errorMessage(err, t("gdpr_export_failed", "Export failed.")));
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async () => {
    setBusy("delete");
    setNotice(null);
    try {
      await AuthService.deleteAccount();
      setConfirmOpen(false);
      await onAccountDeleted();
    } catch (err) {
      setNotice(errorMessage(err, t("gdpr_delete_failed", "Deletion failed.")));
      setBusy(null);
    }
  };

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "12px",
        padding: "1.5rem",
        marginBottom: "1.5rem",
      }}
    >
      <div
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: "0.75rem",
        }}
      >
        {t("gdpr_card_header", "Your data (GDPR)")}
      </div>
      <div
        style={{
          fontSize: "0.82rem",
          color: "var(--muted)",
          marginBottom: "1rem",
          lineHeight: 1.6,
        }}
      >
        {t(
          "gdpr_card_body",
          "Download everything we store about you, or deactivate your account. Deletion anonymizes your identity immediately and purges personal side content within 30 days.",
        )}
      </div>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Button variant="outlined" onClick={doExport} disabled={busy !== null}>
          {busy === "export" ? (
            <CircularProgress size={18} />
          ) : (
            t("gdpr_export_button", "Export my data")
          )}
        </Button>
        <Button
          variant="outlined"
          color="error"
          onClick={() => setConfirmOpen(true)}
          disabled={busy !== null}
        >
          {t("gdpr_delete_button", "Delete my account")}
        </Button>
      </div>
      {notice && (
        <Alert severity="info" style={{ marginTop: "0.75rem" }}>
          {notice}
        </Alert>
      )}
      <ConfirmationModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doDelete}
        title={t("gdpr_delete_confirm_title", "Delete account?")}
        message={t(
          "gdpr_delete_confirm_body",
          "This deactivates your account and anonymizes your data. This cannot be undone.",
        )}
      />
    </div>
  );
}

function ProfileOverview({ user }: { user: User }) {
  const { t } = useTranslation();
  const initials = user.username.slice(0, 2).toUpperCase();
  const hue = (user.username.charCodeAt(0) * 37) % 360;

  // [B5] Live statistics; the overview degrades to an honest loading state
  // instead of fabricated numbers.
  const [stats, setStats] = useState<StatisticsPayload | null>(null);
  const [recent, setRecent] = useState<RecentSubmission[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    AuthService.getMyStatistics()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        // Statistics stay null → the loading cards render.
      });
    SubmissionService.getSubmissions({}, { pageSize: 5 })
      .then((page) => {
        if (!cancelled) setRecent(page.results.slice(0, 5));
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeDates = new Set(stats?.active_dates_90d ?? []);
  const heatmapCells: { date: string; active: boolean }[] = [];
  const today = new Date();
  for (let i = 89; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    heatmapCells.push({ date: iso, active: activeDates.has(iso) });
  }

  return (
    <div style={{ marginBottom: "2rem" }}>
      {/* Hero banner */}
      <div
        style={{
          background: "linear-gradient(135deg, var(--surface) 0%, var(--background) 100%)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "16px",
          padding: "2rem",
          marginBottom: "1.5rem",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "300px",
            height: "300px",
            background: `radial-gradient(circle at center, hsl(${hue},60%,40%) 0%, transparent 70%)`,
            opacity: 0.08,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "1.5rem",
            flexWrap: "wrap",
            position: "relative",
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "50%",
              background: `hsl(${hue}, 55%, 35%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
              fontWeight: 800,
              color: "#fff",
              border: "3px solid rgba(255,255,255,0.1)",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>

          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
                marginBottom: "0.4rem",
              }}
            >
              <h1
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  color: "var(--foreground)",
                  letterSpacing: "-0.02em",
                }}
              >
                {user.username}
              </h1>
              <span
                style={{
                  padding: "2px 10px",
                  borderRadius: "999px",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  color:
                    user.role === "ADMIN"
                      ? "var(--danger)"
                      : user.role === "PROBLEM_CREATOR"
                        ? "var(--warn)"
                        : user.role === "PROBLEM_VERIFIER"
                          ? "var(--violet)"
                          : "var(--accent)",
                  background:
                    user.role === "ADMIN"
                      ? "rgba(248,113,113,0.1)"
                      : user.role === "PROBLEM_CREATOR"
                        ? "rgba(251,191,36,0.1)"
                        : user.role === "PROBLEM_VERIFIER"
                          ? "rgba(167,139,250,0.1)"
                          : "rgba(56,189,248,0.1)",
                  border: `1px solid ${user.role === "ADMIN" ? "rgba(248,113,113,0.25)" : user.role === "PROBLEM_CREATOR" ? "rgba(251,191,36,0.25)" : user.role === "PROBLEM_VERIFIER" ? "rgba(167,139,250,0.25)" : "rgba(56,189,248,0.25)"}`,
                }}
              >
                {user.role.replace("_", " ")}
              </span>
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "1rem" }}>
              {user.email}
            </div>

            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--warn)" }}>
                  {stats ? `Lv ${stats.ladder.level}` : "—"}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                  {t("profile_ladder_level", "Practice level")}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--accent)" }}>
                  {stats ? stats.ladder.points.toLocaleString() : "—"}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                  {t("profile_ladder_points", "Ladder points")}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--success)" }}>
                  {stats ? stats.current_streak : "—"}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                  {t("profile_streak", "Day streak")}
                  {stats ? ` · ${t("profile_max_streak", "best")} ${stats.max_streak}` : ""}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <StatCard
          label={t("profile_solved", "Problems Solved")}
          value={stats?.solved ?? "—"}
          accent="var(--success)"
          sub={
            stats
              ? t("profile_of_attempted", "of {{n}} attempted", { n: stats.attempted })
              : undefined
          }
        />
        <StatCard
          label={t("profile_acceptance", "Acceptance Rate")}
          value={
            stats?.acceptance_rate != null ? `${Math.round(stats.acceptance_rate * 100)}%` : "—"
          }
          accent="var(--accent)"
        />
        <StatCard
          label={t("profile_total_submissions", "Total Submissions")}
          value={stats?.total_submissions ?? "—"}
        />
        <StatCard
          label={t("profile_active_days", "Active days")}
          value={stats?.total_active_days ?? "—"}
          accent="var(--violet)"
          sub={stats ? t("profile_last_90d", "last 90 days") : undefined}
        />
      </div>

      {/* Difficulty breakdown */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "12px",
          padding: "1.25rem 1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: "1rem",
          }}
        >
          Solved by Difficulty
        </div>
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          {[
            {
              label: t("difficulty_easy", "Easy"),
              count: stats?.per_difficulty?.EASY?.solved ?? 0,
              total: Math.max(stats?.per_difficulty?.EASY?.attempted ?? 1, 1),
              color: "var(--success)",
            },
            {
              label: t("difficulty_medium", "Medium"),
              count: stats?.per_difficulty?.MEDIUM?.solved ?? 0,
              total: Math.max(stats?.per_difficulty?.MEDIUM?.attempted ?? 1, 1),
              color: "var(--warn)",
            },
            {
              label: t("difficulty_hard", "Hard"),
              count: stats?.per_difficulty?.HARD?.solved ?? 0,
              total: Math.max(stats?.per_difficulty?.HARD?.attempted ?? 1, 1),
              color: "var(--danger)",
            },
          ].map((d) => (
            <div key={d.label} style={{ flex: "1 1 120px" }}>
              <div
                style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}
              >
                <span style={{ fontSize: "0.78rem", color: d.color, fontWeight: 600 }}>
                  {d.label}
                </span>
                <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: 700 }}>
                  {d.count}
                  <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>/{d.total}</span>
                </span>
              </div>
              <div
                style={{
                  height: "6px",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: "999px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(d.count / d.total) * 100}%`,
                    background: d.color,
                    borderRadius: "999px",
                    transition: "width 600ms ease",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RAT-7: per-tag skill profile + practice-next */}
      <TagProfilePanel profile={stats?.tag_profile} />

      {/* Practice ladder (RAT-4) + badges (RAT-5) */}
      {stats && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "12px",
            padding: "1.25rem 1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "8px",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {t("profile_ladder_header", "Practice ladder")}
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
              {stats.ladder.points} / {stats.ladder.next_level_points} →{" "}
              {t("profile_next_level", "level {{n}}", { n: stats.ladder.level + 1 })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(stats.ladder.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("profile_ladder_header", "Practice ladder")}
            style={{
              height: "8px",
              background: "rgba(255,255,255,0.06)",
              borderRadius: "999px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round(stats.ladder.progress * 100)}%`,
                background: "linear-gradient(90deg, var(--accent), var(--violet))",
                borderRadius: "999px",
              }}
            />
          </div>
          {stats.badges.length > 0 && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "0.85rem" }}>
              {stats.badges.map((badge) => (
                <span
                  key={badge}
                  style={{
                    padding: "3px 10px",
                    borderRadius: "999px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: "var(--warn)",
                    background: "rgba(251,191,36,0.1)",
                    border: "1px solid rgba(251,191,36,0.25)",
                  }}
                >
                  {t(`badge_${badge}`, BADGE_LABELS[badge] ?? badge)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 90-day activity heatmap (RAT-6) */}
      {stats && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "12px",
            padding: "1.25rem 1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <div
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "0.85rem",
            }}
          >
            {t("profile_heatmap_header", "Activity — last 90 days")}
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(30, 1fr)", gap: "3px" }}
            role="img"
            aria-label={t("profile_heatmap_header", "Activity — last 90 days")}
          >
            {heatmapCells.map((cell) => (
              <span
                key={cell.date}
                title={cell.date}
                style={{
                  aspectRatio: "1 / 1",
                  borderRadius: "2px",
                  background: cell.active ? "var(--success)" : "rgba(255,255,255,0.06)",
                  opacity: cell.active ? 0.85 : 1,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent submissions */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "1rem 1.5rem",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Recent Submissions
          </span>
          <Link
            href="/submission-history"
            style={{ fontSize: "0.75rem", color: "var(--accent)", textDecoration: "none" }}
          >
            View all →
          </Link>
        </div>
        <div>
          {recent === null ? (
            <div
              style={{ padding: "1rem 1.5rem", fontSize: "0.85rem", color: "var(--text-tertiary)" }}
            >
              {t("profile_recent_loading", "Loading recent submissions…")}
            </div>
          ) : recent.length === 0 ? (
            <div
              style={{ padding: "1rem 1.5rem", fontSize: "0.85rem", color: "var(--text-tertiary)" }}
            >
              {t(
                "profile_recent_empty",
                "No submissions yet — solve your first problem from the /start trio.",
              )}
            </div>
          ) : (
            recent.map((s) => {
              const vcfg = verdictConfig[s.verdict] ?? {
                color: "var(--muted)",
                bg: "rgba(148,163,184,0.1)",
              };
              return (
                <div
                  key={s.id}
                  style={{
                    padding: "0.875rem 1.5rem",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "999px",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      color: vcfg.color,
                      background: vcfg.bg,
                      minWidth: "36px",
                      textAlign: "center",
                    }}
                  >
                    {s.verdict}
                  </span>
                  <Link
                    href={`/submissions/${s.id}`}
                    style={{
                      color: "var(--foreground)",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      flex: 1,
                      minWidth: "120px",
                    }}
                  >
                    {s.problem?.title_i18n?.en ?? `#${s.problem?.id ?? ""}`}
                  </Link>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      color: "var(--text-tertiary)",
                      fontFamily: "monospace",
                    }}
                  >
                    {s.language}
                  </span>
                  <span
                    style={{ fontSize: "0.72rem", color: "var(--surface-2)", marginLeft: "auto" }}
                  >
                    {new Date(s.submission_time).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function UserProfilePage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"overview" | "settings">("overview");

  useEffect(() => {
    const fetchUserProfile = async () => {
      setError(null);
      try {
        const userData = await AuthService.getMe();
        setProfileUser(userData);
      } catch {
        setError(t("failed_to_load_profile", "Failed to load user profile."));
      }
    };
    fetchUserProfile();
  }, [t]);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirmNewPassword) {
      setError(t("passwords_do_not_match", "Passwords do not match."));
      return;
    }
    if (!auth.isAuthenticated) {
      setError(t("must_be_logged_in", "You must be logged in to change your password."));
      return;
    }
    setIsSubmitting(true);
    try {
      await AuthService.changePassword({
        old_password: currentPassword,
        new_password1: newPassword,
        new_password2: confirmNewPassword,
      });
      setMessage(t("password_change_successful", "Password changed successfully."));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      setError(errorMessage(err, t("password_change_failed", "Password change failed.")));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error && !profileUser) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!profileUser) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        <CircularProgress />
      </div>
    );
  }

  const apiBase = API_BASE_URL;

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          background: "rgba(255,255,255,0.04)",
          borderRadius: "10px",
          padding: "4px",
          marginBottom: "2rem",
          width: "fit-content",
        }}
      >
        {(["overview", "settings"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 20px",
              borderRadius: "7px",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              transition: "all 150ms ease",
              background: activeTab === tab ? "var(--accent)" : "transparent",
              color: activeTab === tab ? "var(--on-accent)" : "var(--muted)",
              textTransform: "capitalize",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <ProfileOverview user={profileUser} />}

      {activeTab === "settings" && (
        <div style={{ maxWidth: "600px" }}>
          {/* OPS-2 (Wave D): TOTP enrollment + personal API token. */}
          <SecurityPanel />

          {/* GDPR account control (roadmap LEG-1/X5) */}
          <AccountControlCard
            onAccountDeleted={async () => {
              await auth.logout();
              window.location.href = "/";
            }}
          />

          {/* User info card */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "12px",
              padding: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "1rem",
              }}
            >
              Account Info
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[
                { label: "Username", value: profileUser.username },
                { label: "Email", value: profileUser.email },
                { label: "Role", value: profileUser.role.replace("_", " ") },
                // RO-3: the Olympiad-geography fields on the own profile.
                { label: t("identity_county", "County"), value: profileUser.county || "—" },
                { label: t("identity_school", "School"), value: profileUser.school || "—" },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem 0",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{item.label}</span>
                  <span
                    style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--foreground)" }}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* RO-3: county/school + is_minor self-service */}
          <IdentityCard />

          {/* Connected accounts */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "12px",
              padding: "1.5rem",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "1rem",
              }}
            >
              {t("connected_accounts_header", "Connected Accounts")}
            </div>
            <Box sx={{ display: "flex", gap: 2 }}>
              <Button
                variant="outlined"
                startIcon={<GoogleIcon />}
                href={`${apiBase}/api/v1/auth/google/login/?process=connect`}
                size="small"
              >
                {t("connect_google", "Connect Google")}
              </Button>
              <Button
                variant="outlined"
                startIcon={<GitHubIcon />}
                href={`${apiBase}/api/v1/auth/github/login/?process=connect`}
                size="small"
              >
                {t("connect_github", "Connect GitHub")}
              </Button>
            </Box>
          </div>

          {/* Change password */}
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "12px",
              padding: "1.5rem",
            }}
          >
            <div
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "1rem",
              }}
            >
              {t("change_password_header", "Change Password")}
            </div>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            {message && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {message}
              </Alert>
            )}
            <Box component="form" onSubmit={handleChangePassword} noValidate>
              <TextField
                margin="normal"
                required
                fullWidth
                name="currentPassword"
                label={t("current_password_label", "Current Password")}
                type="password"
                id="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="newPassword"
                label={t("new_password_label", "New Password")}
                type="password"
                id="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmNewPassword"
                label={t("confirm_new_password_label", "Confirm New Password")}
                type="password"
                id="confirm-new-password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2 }}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <CircularProgress size={24} />
                ) : (
                  t("change_password_button", "Change Password")
                )}
              </Button>
            </Box>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UserProfilePageRoute() {
  return (
    <ProtectedRoute roles={["ADMIN", "PROBLEM_CREATOR", "PROBLEM_VERIFIER", "BASIC_USER"]}>
      <UserProfilePage />
    </ProtectedRoute>
  );
}
