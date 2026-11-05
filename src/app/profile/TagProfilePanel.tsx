"use client";

import React from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import type { TagProfile } from "@/types/api";
import { palette } from "@/theme/tokens";

/**
 * RAT-7 — the per-tag skill profile + the "what to practice next" strip.
 * Bars show ladder points per covered tag (the CNT-3 coverage floor is
 * enforced server-side; uncovered tags render dimmed with a note), and
 * the strip links the weakest-tag, easiest-first suggestions.
 */
export default function TagProfilePanel({ profile }: { profile: TagProfile | undefined }) {
  const { t } = useTranslation();
  if (!profile || profile.tags.length === 0) return null;

  const covered = profile.tags.filter((row) => row.covered);
  const maxPoints = Math.max(1, ...covered.map((row) => row.points));

  return (
    <section aria-label={t("tag_profile_title", "Skill profile")} data-testid="tag-profile">
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
        {t("tag_profile_title", "Skill profile")}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.5rem" }}>
        {profile.tags.map((row) => (
          <li
            key={row.tag}
            data-testid={`tag-row-${row.tag}`}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr 70px",
              alignItems: "center",
              gap: "0.75rem",
              opacity: row.covered ? 1 : 0.55,
            }}
          >
            <span style={{ fontSize: "0.85rem", color: "var(--foreground)" }}>{row.tag}</span>
            <div
              style={{
                background: "rgba(255,255,255,0.06)",
                borderRadius: "6px",
                height: "8px",
                overflow: "hidden",
              }}
              role="meter"
              aria-valuenow={row.points}
              aria-valuemin={0}
              aria-valuemax={maxPoints}
              aria-label={t("tag_profile_points", "{{tag}} skill points", { tag: row.tag })}
            >
              <div
                style={{
                  width: `${Math.round((row.points / maxPoints) * 100)}%`,
                  background: palette.accent,
                  height: "100%",
                }}
              />
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)", textAlign: "right" }}>
              {row.solved} {t("tag_profile_solved", "solved")}
              {!row.covered && (
                <span title={t("tag_profile_uncovered", "few problems carry this tag yet")}>
                  {" "}
                  ·{t("tag_profile_new", "new")}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {profile.practice_next.length > 0 && (
        <div style={{ marginTop: "1.25rem" }} data-testid="practice-next">
          <div
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "0.5rem",
            }}
          >
            {t("practice_next_title", "Practice next")}
          </div>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.35rem" }}>
            {profile.practice_next.map((row) => (
              <li key={row.id} style={{ fontSize: "0.85rem" }}>
                <Link href={`/problems/${row.id}`}>
                  {row.title_i18n?.en ?? row.title_i18n?.ro ?? `#${row.id}`}
                </Link>
                <span style={{ color: "var(--muted)", fontSize: "0.75rem", marginLeft: "0.4rem" }}>
                  {row.tags.join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
