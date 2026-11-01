"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ContestService } from "@/services/ApiService";
import { useAuth } from "@/context/AuthContext";
import { palette } from "@/theme/tokens";
import PageHeader from "@/components/common/PageHeader";

/**
 * CON-9 — community contest creation (mashups). CREATOR/TEACHER roles may
 * assemble a PRIVATE, unrated contest from the APPROVED problem pool; the
 * backend enforces both constraints again (defense in depth).
 */
export default function CreateContestPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const router = useRouter();

  const [titleEn, setTitleEn] = useState("");
  const [titleRo, setTitleRo] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [problemIds, setProblemIds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Backend serializes the short enum values (CREATOR/TEACHER/ADMIN); the
  // legacy long spelling PROBLEM_CREATOR is accepted defensively.
  const role = auth.user?.role ?? "";
  const allowed =
    auth.isAuthenticated && ["CREATOR", "TEACHER", "ADMIN", "PROBLEM_CREATOR"].includes(role);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const ids = problemIds
      .split(",")
      .map((token) => Number.parseInt(token.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0);
    setBusy(true);
    try {
      const contest = await ContestService.createContest({
        title_i18n: { en: titleEn, ro: titleRo || titleEn },
        visibility: "PRIVATE",
        access_code: accessCode,
        is_rated: false,
        format: "IOI",
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        problem_ids: ids,
      });
      router.push(`/contests/${contest.id}`);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t("contest_create_error", "Could not create the contest."),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
        <PageHeader
          title={t("contest_create_title", "New community contest")}
          subtitle={t(
            "contest_create_not_allowed",
            "Community contests are created by teachers and verified creators.",
          )}
        />
        <Link href="/contests" style={{ color: palette.accent }}>
          ← {t("contests_back", "Back to contests")}
        </Link>
      </main>
    );
  }

  const fieldStyle = {
    display: "block",
    width: "100%",
    maxWidth: 420,
    padding: 8,
    marginBottom: 12,
    borderRadius: 8,
    border: `1px solid ${palette.border}`,
    background: "transparent",
    color: palette.foreground,
  } as const;

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
      <PageHeader
        title={t("contest_create_title", "New community contest")}
        subtitle={t(
          "contest_create_subtitle",
          "Private, unrated mashups assembled from the approved problem pool.",
        )}
      />
      <form onSubmit={submit} style={{ display: "grid" }}>
        <label htmlFor="cc-title-en">
          {t("contest_create_title_en", "Title (English)")}
          <input
            id="cc-title-en"
            style={fieldStyle}
            value={titleEn}
            onChange={(e) => setTitleEn(e.target.value)}
            required
            minLength={3}
          />
        </label>
        <label htmlFor="cc-title-ro">
          {t("contest_create_title_ro", "Title (Romanian)")}
          <input
            id="cc-title-ro"
            style={fieldStyle}
            value={titleRo}
            onChange={(e) => setTitleRo(e.target.value)}
          />
        </label>
        <label htmlFor="cc-start">
          {t("contest_create_start", "Starts at")}
          <input
            id="cc-start"
            type="datetime-local"
            style={fieldStyle}
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
          />
        </label>
        <label htmlFor="cc-end">
          {t("contest_create_end", "Ends at")}
          <input
            id="cc-end"
            type="datetime-local"
            style={fieldStyle}
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            required
          />
        </label>
        <label htmlFor="cc-code">
          {t("contest_create_code", "Access code")}
          <input
            id="cc-code"
            style={fieldStyle}
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            required
            minLength={4}
          />
        </label>
        <label htmlFor="cc-problems">
          {t("contest_create_problems", "Problem IDs (comma-separated, in board order)")}
          <input
            id="cc-problems"
            style={fieldStyle}
            value={problemIds}
            onChange={(e) => setProblemIds(e.target.value)}
            placeholder="12, 15, 30"
            required
          />
        </label>
        {error && (
          <p role="alert" style={{ color: palette.danger }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          style={{ padding: "10px 18px", justifySelf: "start" }}
        >
          {t("contest_create_submit", "Create contest")}
        </button>
      </form>
    </main>
  );
}
