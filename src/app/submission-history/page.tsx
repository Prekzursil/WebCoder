"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import ProtectedRoute from "@/components/common/ProtectedRoute";
import TableScroll from "@/components/common/TableScroll";

interface SubmissionRecord {
  id: number;
  problemId: number;
  problemTitle: string;
  difficulty: "Easy" | "Medium" | "Hard";
  language: string;
  verdict: string;
  score: number | null;
  time: string;
  executionMs: number | null;
  memoryKb: number | null;
}

const MOCK_SUBMISSIONS: SubmissionRecord[] = [
  {
    id: 1042,
    problemId: 3,
    problemTitle: "Binary Tree Traversal",
    difficulty: "Medium",
    language: "python3",
    verdict: "AC",
    score: 100,
    time: "2026-09-28T14:32:00Z",
    executionMs: 42,
    memoryKb: 14200,
  },
  {
    id: 1041,
    problemId: 7,
    problemTitle: "Graph Shortest Path",
    difficulty: "Hard",
    language: "cpp17",
    verdict: "WA",
    score: 60,
    time: "2026-09-28T11:15:00Z",
    executionMs: 120,
    memoryKb: 32100,
  },
  {
    id: 1040,
    problemId: 1,
    problemTitle: "Two Sum",
    difficulty: "Easy",
    language: "python3",
    verdict: "AC",
    score: 100,
    time: "2026-09-27T20:05:00Z",
    executionMs: 18,
    memoryKb: 8400,
  },
  {
    id: 1039,
    problemId: 5,
    problemTitle: "Merge Sort",
    difficulty: "Medium",
    language: "java11",
    verdict: "TLE",
    score: 40,
    time: "2026-09-27T16:44:00Z",
    executionMs: 2100,
    memoryKb: 28000,
  },
  {
    id: 1038,
    problemId: 2,
    problemTitle: "Palindrome Check",
    difficulty: "Easy",
    language: "python3",
    verdict: "AC",
    score: 100,
    time: "2026-09-26T09:30:00Z",
    executionMs: 12,
    memoryKb: 7200,
  },
  {
    id: 1037,
    problemId: 7,
    problemTitle: "Graph Shortest Path",
    difficulty: "Hard",
    language: "cpp17",
    verdict: "AC",
    score: 100,
    time: "2026-09-25T22:10:00Z",
    executionMs: 88,
    memoryKb: 31500,
  },
  {
    id: 1036,
    problemId: 4,
    problemTitle: "Dynamic Programming Knapsack",
    difficulty: "Hard",
    language: "python3",
    verdict: "MLE",
    score: 0,
    time: "2026-09-25T18:00:00Z",
    executionMs: null,
    memoryKb: 65000,
  },
  {
    id: 1035,
    problemId: 6,
    problemTitle: "String Matching",
    difficulty: "Medium",
    language: "cpp17",
    verdict: "AC",
    score: 100,
    time: "2026-09-24T14:20:00Z",
    executionMs: 35,
    memoryKb: 12800,
  },
  {
    id: 1034,
    problemId: 3,
    problemTitle: "Binary Tree Traversal",
    difficulty: "Medium",
    language: "java11",
    verdict: "CE",
    score: 0,
    time: "2026-09-23T10:55:00Z",
    executionMs: null,
    memoryKb: null,
  },
  {
    id: 1033,
    problemId: 8,
    problemTitle: "Segment Tree",
    difficulty: "Hard",
    language: "cpp17",
    verdict: "AC",
    score: 100,
    time: "2026-09-22T19:40:00Z",
    executionMs: 65,
    memoryKb: 22400,
  },
  {
    id: 1032,
    problemId: 1,
    problemTitle: "Two Sum",
    difficulty: "Easy",
    language: "java11",
    verdict: "AC",
    score: 100,
    time: "2026-09-21T08:15:00Z",
    executionMs: 22,
    memoryKb: 9100,
  },
  {
    id: 1031,
    problemId: 9,
    problemTitle: "Matrix Exponentiation",
    difficulty: "Hard",
    language: "cpp17",
    verdict: "WA",
    score: 20,
    time: "2026-09-20T17:30:00Z",
    executionMs: 200,
    memoryKb: 18000,
  },
];

// [Q2/Q6] verdict chips render translated labels (verdict_ac/wa/tle/…);
// the raw backend code stays as the badge title for greppability.
const verdictConfig: Record<
  string,
  { color: string; bg: string; labelKey: string; fallback: string }
> = {
  AC: {
    color: "var(--success)",
    bg: "rgba(74,222,128,0.12)",
    labelKey: "verdict_ac",
    fallback: "Accepted",
  },
  WA: {
    color: "var(--danger)",
    bg: "rgba(248,113,113,0.12)",
    labelKey: "verdict_wa",
    fallback: "Wrong Answer",
  },
  TLE: {
    color: "var(--warn)",
    bg: "rgba(251,191,36,0.12)",
    labelKey: "verdict_tle",
    fallback: "Time Limit",
  },
  MLE: {
    color: "var(--violet)",
    bg: "rgba(167,139,250,0.12)",
    labelKey: "verdict_mle",
    fallback: "Memory Limit",
  },
  CE: {
    color: "var(--orange)",
    bg: "rgba(251,146,60,0.12)",
    labelKey: "verdict_ce",
    fallback: "Compile Error",
  },
  RE: {
    color: "var(--pink)",
    bg: "rgba(244,114,182,0.12)",
    labelKey: "verdict_re",
    fallback: "Runtime Error",
  },
};

const difficultyConfig: Record<string, { color: string; bg: string }> = {
  Easy: { color: "var(--success)", bg: "rgba(74,222,128,0.1)" },
  Medium: { color: "var(--warn)", bg: "rgba(251,191,36,0.1)" },
  Hard: { color: "var(--danger)", bg: "rgba(248,113,113,0.1)" },
};

const langColors: Record<string, string> = {
  python3: "var(--blue)",
  cpp17: "var(--violet)",
  java11: "var(--orange)",
};

function VerdictBadge({
  verdict,
  t,
}: {
  verdict: string;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const cfg = verdictConfig[verdict];
  const label = cfg ? t(cfg.labelKey, cfg.fallback) : verdict;
  const color = cfg?.color ?? "var(--muted)";
  const bg = cfg?.bg ?? "rgba(148,163,184,0.1)";
  return (
    <span
      title={verdict}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: "999px",
        fontSize: "0.72rem",
        fontWeight: 700,
        color,
        background: bg,
        border: `1px solid ${color}30`,
        letterSpacing: "0.04em",
      }}
    >
      {label}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "12px",
        padding: "1.25rem 1.5rem",
        flex: "1 1 140px",
      }}
    >
      <div
        style={{
          fontSize: "0.72rem",
          color: "var(--muted)",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: "0.5rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "1.75rem",
          fontWeight: 800,
          color: accent ?? "var(--foreground)",
          letterSpacing: "-0.03em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function SubmissionHistoryContent() {
  const { t } = useTranslation();
  const [verdictFilter, setVerdictFilter] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [diffFilter, setDiffFilter] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"table" | "timeline">("table");

  const stats = useMemo(() => {
    const total = MOCK_SUBMISSIONS.length;
    const accepted = MOCK_SUBMISSIONS.filter((s) => s.verdict === "AC").length;
    const uniqueProblems = new Set(
      MOCK_SUBMISSIONS.filter((s) => s.verdict === "AC").map((s) => s.problemId),
    ).size;
    const avgScore = Math.round(MOCK_SUBMISSIONS.reduce((a, s) => a + (s.score ?? 0), 0) / total);
    return {
      total,
      accepted,
      uniqueProblems,
      avgScore,
      rate: Math.round((accepted / total) * 100),
    };
  }, []);

  const filtered = useMemo(() => {
    return MOCK_SUBMISSIONS.filter((s) => {
      const matchVerdict = verdictFilter ? s.verdict === verdictFilter : true;
      const matchLang = langFilter ? s.language === langFilter : true;
      const matchDiff = diffFilter ? s.difficulty === diffFilter : true;
      const matchSearch = search
        ? s.problemTitle.toLowerCase().includes(search.toLowerCase())
        : true;
      return matchVerdict && matchLang && matchDiff && matchSearch;
    });
  }, [verdictFilter, langFilter, diffFilter, search]);

  const hasFilters = verdictFilter || langFilter || diffFilter || search;

  // Group by date for timeline
  const byDate = useMemo(() => {
    const groups: Record<string, SubmissionRecord[]> = {};
    filtered.forEach((s) => {
      const d = new Date(s.time).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      if (!groups[d]) groups[d] = [];
      groups[d].push(s);
    });
    return groups;
  }, [filtered]);

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "0.5rem" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "var(--brand-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.1rem",
            }}
          >
            📋
          </div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "var(--foreground)",
            }}
          >
            {t("submission_history_header", "Submission History")}
          </h1>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          {t("submission_history_subtitle", "A full record of every solution you've submitted.")}
        </p>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "2rem" }}>
        <StatCard label={t("history_stat_total", "Total Submissions")} value={stats.total} />
        <StatCard
          label={t("history_stat_accepted", "Accepted")}
          value={stats.accepted}
          accent="var(--success)"
          sub={t("history_success_rate", "{{rate}}% success rate", { rate: stats.rate })}
        />
        <StatCard
          label={t("history_stat_solved", "Problems Solved")}
          value={stats.uniqueProblems}
          accent="var(--accent)"
        />
        <StatCard
          label={t("history_stat_avg", "Avg Score")}
          value={`${stats.avgScore}%`}
          accent="var(--warn)"
        />
      </div>

      {/* Verdict distribution bar */}
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
            fontSize: "0.75rem",
            color: "var(--muted)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: "0.75rem",
          }}
        >
          {t("history_verdict_breakdown", "Verdict Breakdown")}
        </div>
        <div
          style={{
            display: "flex",
            height: "10px",
            borderRadius: "999px",
            overflow: "hidden",
            gap: "2px",
            marginBottom: "0.75rem",
          }}
        >
          {Object.entries(verdictConfig).map(([v, cfg]) => {
            const count = MOCK_SUBMISSIONS.filter((s) => s.verdict === v).length;
            const pct = (count / MOCK_SUBMISSIONS.length) * 100;
            if (pct === 0) return null;
            return (
              <div
                key={v}
                style={{
                  width: `${pct}%`,
                  background: cfg.color,
                  borderRadius: "2px",
                  transition: "width 300ms ease",
                }}
                title={`${t(cfg.labelKey, cfg.fallback)}: ${count}`}
              />
            );
          })}
        </div>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          {Object.entries(verdictConfig).map(([v, cfg]) => {
            const count = MOCK_SUBMISSIONS.filter((s) => s.verdict === v).length;
            if (count === 0) return null;
            return (
              <div key={v} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: cfg.color,
                  }}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                  {t(cfg.labelKey, cfg.fallback)}
                </span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: cfg.color }}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter bar + view toggle */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "12px",
          padding: "1rem 1.25rem",
          marginBottom: "1.25rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder={t("history_search_placeholder", "Search problem…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 180px",
            minWidth: "140px",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            color: "var(--foreground)",
            padding: "7px 12px",
            fontSize: "0.875rem",
            outline: "none",
          }}
        />

        <select
          value={verdictFilter}
          onChange={(e) => setVerdictFilter(e.target.value)}
          style={{
            background: "var(--background)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            color: "var(--muted)",
            padding: "7px 10px",
            fontSize: "0.8rem",
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="">{t("history_all_verdicts", "All Verdicts")}</option>
          {Object.entries(verdictConfig).map(([v, c]) => (
            <option key={v} value={v}>
              {t(c.labelKey, c.fallback)}
            </option>
          ))}
        </select>

        <select
          value={langFilter}
          onChange={(e) => setLangFilter(e.target.value)}
          style={{
            background: "var(--background)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            color: "var(--muted)",
            padding: "7px 10px",
            fontSize: "0.8rem",
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="">{t("history_all_languages", "All Languages")}</option>
          <option value="python3">Python 3</option>
          <option value="cpp17">C++17</option>
          <option value="java11">Java 11</option>
        </select>

        <select
          value={diffFilter}
          onChange={(e) => setDiffFilter(e.target.value)}
          style={{
            background: "var(--background)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "8px",
            color: "var(--muted)",
            padding: "7px 10px",
            fontSize: "0.8rem",
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="">{t("history_all_difficulties", "All Difficulties")}</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => {
              setVerdictFilter("");
              setLangFilter("");
              setDiffFilter("");
              setSearch("");
            }}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              fontSize: "0.75rem",
              border: "1px solid rgba(248,113,113,0.3)",
              background: "rgba(248,113,113,0.08)",
              color: "var(--danger)",
              cursor: "pointer",
            }}
          >
            {t("clear_filters_button", "✕ Clear")}
          </button>
        )}

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: "4px",
            background: "rgba(255,255,255,0.04)",
            borderRadius: "8px",
            padding: "3px",
          }}
        >
          {(["table", "timeline"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "5px 14px",
                borderRadius: "6px",
                fontSize: "0.75rem",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                transition: "all 120ms ease",
                background: view === v ? "var(--accent)" : "transparent",
                color: view === v ? "var(--on-accent)" : "var(--muted)",
              }}
            >
              {v === "table"
                ? t("history_view_table", "⊞ Table")
                : t("history_view_timeline", "⏱ Timeline")}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", marginBottom: "0.75rem" }}>
        {t(
          filtered.length === 1 ? "history_showing_one" : "history_showing_many",
          "Showing {{shown}} submissions",
          {
            // The optional "of N" segment is pre-localized and folded into
            // the count so both locales keep a natural word order.
            shown: `${filtered.length}${hasFilters ? t("history_showing_of", " of {{total}}", { total: MOCK_SUBMISSIONS.length }) : ""}`,
          },
        )}
      </div>

      {/* Table view */}
      {view === "table" && (
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <TableScroll>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {[
                    "#",
                    t("history_th_problem", "Problem"),
                    t("difficulty_label", "Difficulty"),
                    t("language_label", "Language"),
                    t("verdict_th", "Verdict"),
                    t("score_th", "Score"),
                    t("time_th", "Time"),
                    t("memory_label", "Memory"),
                    t("history_th_submitted", "Submitted"),
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 16px",
                        textAlign: "left",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        color: "var(--muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}
                    >
                      {t("history_no_match", "No submissions match your filters.")}
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => {
                    const diffCfg = difficultyConfig[s.difficulty];
                    const langColor = langColors[s.language] ?? "var(--muted)";
                    return (
                      <tr key={s.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <Link
                            href={`/submissions/${s.id}`}
                            style={{ color: "var(--accent)", fontWeight: 600, fontSize: "0.85rem" }}
                          >
                            #{s.id}
                          </Link>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <Link
                            href={`/problems/${s.problemId}`}
                            style={{
                              color: "var(--foreground)",
                              fontWeight: 500,
                              fontSize: "0.875rem",
                            }}
                          >
                            {s.problemTitle}
                          </Link>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span
                            style={{
                              padding: "2px 10px",
                              borderRadius: "999px",
                              fontSize: "0.72rem",
                              fontWeight: 600,
                              color: diffCfg.color,
                              background: diffCfg.bg,
                              border: `1px solid ${diffCfg.color}30`,
                            }}
                          >
                            {s.difficulty}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span
                            style={{
                              padding: "2px 10px",
                              borderRadius: "6px",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              color: langColor,
                              background: `${langColor}18`,
                              border: `1px solid ${langColor}30`,
                              fontFamily: "JetBrains Mono, monospace",
                            }}
                          >
                            {s.language}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <VerdictBadge verdict={s.verdict} t={t} />
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span
                            style={{
                              color:
                                s.score === 100
                                  ? "var(--success)"
                                  : s.score === 0
                                    ? "var(--danger)"
                                    : "var(--warn)",
                              fontWeight: 700,
                            }}
                          >
                            {s.score !== null ? `${s.score}%` : "—"}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            color: "var(--muted)",
                            fontSize: "0.8rem",
                          }}
                        >
                          {s.executionMs !== null ? `${s.executionMs} ms` : "—"}
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            color: "var(--muted)",
                            fontSize: "0.8rem",
                          }}
                        >
                          {s.memoryKb !== null
                            ? `${Math.round((s.memoryKb / 1024) * 10) / 10} MB`
                            : "—"}
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            color: "var(--text-tertiary)",
                            fontSize: "0.78rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {new Date(s.time).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          <span style={{ color: "var(--surface-2)" }}>
                            {new Date(s.time).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}

      {/* Timeline view */}
      {view === "timeline" && (
        <div>
          {Object.entries(byDate).length === 0 ? (
            <div
              style={{
                padding: "3rem",
                textAlign: "center",
                color: "var(--muted)",
                background: "var(--surface)",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {t("history_no_match", "No submissions match your filters.")}
            </div>
          ) : (
            Object.entries(byDate).map(([date, subs]) => (
              <div key={date} style={{ marginBottom: "1.5rem" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "0.75rem",
                  }}
                >
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      background: "var(--accent)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {date}
                  </span>
                  <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.06)" }} />
                  <span style={{ fontSize: "0.72rem", color: "var(--surface-2)" }}>
                    {subs.length === 1
                      ? t("history_group_submissions_one", "{{count}} submission", {
                          count: subs.length,
                        })
                      : t("history_group_submissions_many", "{{count}} submissions", {
                          count: subs.length,
                        })}
                  </span>
                </div>
                <div
                  style={{
                    paddingLeft: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  {subs.map((s) => {
                    const diffCfg = difficultyConfig[s.difficulty];
                    const langColor = langColors[s.language] ?? "var(--muted)";
                    return (
                      <div
                        key={s.id}
                        style={{
                          background: "var(--surface)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: "10px",
                          padding: "0.875rem 1.25rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "1rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <Link
                          href={`/submissions/${s.id}`}
                          style={{
                            color: "var(--accent)",
                            fontWeight: 700,
                            fontSize: "0.8rem",
                            minWidth: "52px",
                          }}
                        >
                          #{s.id}
                        </Link>
                        <Link
                          href={`/problems/${s.problemId}`}
                          style={{
                            color: "var(--foreground)",
                            fontWeight: 500,
                            fontSize: "0.875rem",
                            flex: 1,
                            minWidth: "140px",
                          }}
                        >
                          {s.problemTitle}
                        </Link>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "999px",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            color: diffCfg.color,
                            background: diffCfg.bg,
                          }}
                        >
                          {s.difficulty}
                        </span>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "6px",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            color: langColor,
                            background: `${langColor}18`,
                            fontFamily: "monospace",
                          }}
                        >
                          {s.language}
                        </span>
                        <VerdictBadge verdict={s.verdict} t={t} />
                        {s.executionMs !== null && (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                            {s.executionMs} ms
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--surface-2)",
                            marginLeft: "auto",
                          }}
                        >
                          {new Date(s.time).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function SubmissionHistoryPage() {
  return (
    <ProtectedRoute roles={["ADMIN", "PROBLEM_CREATOR", "PROBLEM_VERIFIER", "BASIC_USER"]}>
      <SubmissionHistoryContent />
    </ProtectedRoute>
  );
}
