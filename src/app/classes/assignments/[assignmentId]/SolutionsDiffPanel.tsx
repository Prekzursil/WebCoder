"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClassroomService } from "@/services/ApiService";
import type { AssignmentSolutionRow } from "@/types/api";
import { palette } from "@/theme/tokens";

/**
 * JDG-13 v1 — the teacher's side-by-side solutions view for one temă.
 * Round-2 D.8: "keep the v1 diff view + download-all-solutions; defer the
 * batch [MOSS/Dolos] runner". Two students' submissions for the same
 * problem render in aligned columns — the advisory, human-judgement
 * surface; nothing auto-punishes.
 */
export default function SolutionsDiffPanel({ assignmentId }: { assignmentId: number }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AssignmentSolutionRow[] | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [leftId, setLeftId] = useState<number | null>(null);
  const [rightId, setRightId] = useState<number | null>(null);
  const [problemFilter, setProblemFilter] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    ClassroomService.getAssignmentSolutionsJson(assignmentId)
      .then((data) => {
        if (!cancelled) setRows(data.results);
      })
      .catch(() => {
        if (!cancelled) setDenied(t("diff_denied", "Only the teacher can compare solutions."));
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId, t]);

  const problems = useMemo(() => {
    const seen = new Map<number, number>();
    rows?.forEach((row) => seen.set(row.problem_id, (seen.get(row.problem_id) ?? 0) + 1));
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const candidates = useMemo(
    () => (rows ?? []).filter((row) => problemFilter === null || row.problem_id === problemFilter),
    [rows, problemFilter],
  );

  if (denied) {
    return (
      <section aria-label={t("diff_title", "Compare solutions")} data-testid="solutions-diff">
        <p style={{ color: palette.muted }}>🔒 {denied}</p>
      </section>
    );
  }
  if (rows === null) return null;
  if (rows.length === 0) return null;

  const left = candidates.find((row) => row.id === leftId) ?? null;
  const right = candidates.find((row) => row.id === rightId) ?? null;

  return (
    <section aria-label={t("diff_title", "Compare solutions")} data-testid="solutions-diff">
      <h3>{t("diff_title", "Compare solutions")}</h3>
      <p style={{ color: palette.muted, fontSize: "0.8rem" }}>
        {t(
          "diff_note",
          "Advisory only: similarity is a human judgement here, and confirmed cheating goes through the DQ flow — nothing is automatic.",
        )}
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", margin: "0.75rem 0" }}>
        <label style={{ fontSize: "0.8rem", color: palette.muted }}>
          {t("diff_problem", "Problem")}
          <select
            value={problemFilter ?? ""}
            onChange={(e) => {
              setProblemFilter(e.target.value ? Number(e.target.value) : null);
              setLeftId(null);
              setRightId(null);
            }}
            style={{ marginLeft: "0.5rem" }}
            data-testid="diff-problem"
          >
            <option value="">{t("diff_all_problems", "All")}</option>
            {problems.map(([pid, n]) => (
              <option key={pid} value={pid}>
                #{pid} ({n})
              </option>
            ))}
          </select>
        </label>
        {(["left", "right"] as const).map((side) => (
          <label key={side} style={{ fontSize: "0.8rem", color: palette.muted }}>
            {side === "left" ? t("diff_left", "Student A") : t("diff_right", "Student B")}
            <select
              value={side === "left" ? (leftId ?? "") : (rightId ?? "")}
              onChange={(e) =>
                (side === "left" ? setLeftId : setRightId)(
                  e.target.value ? Number(e.target.value) : null,
                )
              }
              style={{ marginLeft: "0.5rem" }}
              data-testid={`diff-${side}`}
            >
              <option value="">—</option>
              {candidates.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.username} · {row.verdict} · {row.score}p
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {left && right && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
            marginTop: "0.75rem",
          }}
          data-testid="diff-columns"
        >
          {[left, right].map((row, idx) => (
            <div
              key={row.id}
              style={{
                border: `1px solid ${palette.border}`,
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "0.4rem 0.75rem",
                  borderBottom: `1px solid ${palette.border}`,
                  fontSize: "0.8rem",
                  color: palette.muted,
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                {idx === 0 ? "A" : "B"} · {row.username} · {row.language} ·{" "}
                {new Date(row.submission_time).toLocaleString()}
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.78rem",
                  lineHeight: 1.6,
                  overflowX: "auto",
                  maxHeight: "480px",
                  whiteSpace: "pre",
                }}
              >
                {row.code}
              </pre>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
