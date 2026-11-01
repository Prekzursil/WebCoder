"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { ForumService, ProblemService, collectAllPages } from "@/services/ApiService";
import { useAuth } from "@/context/AuthContext";
import { ProblemType } from "@/types";

// New-thread form wired to POST /api/v1/forum/threads/ ({title, content,
// problem?} — creates the thread + first post atomically, backend PR #188).
// The mock category picker is gone: the backend has no categories, only an
// optional problem link, so the picker is now an optional problem dropdown
// fed by the (paginated) approved-problems catalog. Requires auth — the
// backend rejects anonymous creates with 401.

export default function NewThreadPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const [title, setTitle] = useState("");
  const [problemId, setProblemId] = useState("");
  const [body, setBody] = useState("");
  const [problems, setProblems] = useState<ProblemType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Best-effort problem dropdown (bounded: collectAllPages caps at 50 pages).
  useEffect(() => {
    let cancelled = false;
    collectAllPages((page) => ProblemService.getProblems({}, { page, pageSize: 100 }))
      .then((all) => {
        if (!cancelled) setProblems(all);
      })
      .catch(() => {
        // Dropdown stays empty — creating a GLOBAL thread still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isValid = title.trim().length >= 10 && body.trim().length >= 20;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const thread = await ForumService.createThread({
        title: title.trim(),
        content: body.trim(),
        problem: problemId ? Number(problemId) : null,
      });
      router.push(`/forum/${thread.id}`);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t("forum_create_error", "Failed to create thread."),
      );
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "1.5rem",
          fontSize: "0.8rem",
          color: "var(--muted)",
        }}
      >
        <Link href="/forum" style={{ color: "var(--accent)" }}>
          Forum
        </Link>
        <span>›</span>
        <span style={{ color: "var(--muted)" }}>{t("forum_new_breadcrumb", "New Thread")}</span>
      </div>

      <div style={{ marginBottom: "2rem" }}>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "var(--foreground)",
            marginBottom: "0.4rem",
          }}
        >
          {t("forum_new_header", "Create New Thread")}
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
          {t("forum_new_subtitle", "Share a question, insight, or discussion with the community.")}
        </p>
      </div>

      {!auth.isAuthenticated ? (
        <div
          style={{
            padding: "2rem",
            textAlign: "center",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            color: "var(--muted)",
          }}
        >
          <p style={{ marginBottom: "1rem" }}>
            <Link href="/login" style={{ color: "var(--accent)" }}>
              {t("log_in_button", "Log in")}
            </Link>{" "}
            {t("forum_login_to_start_suffix", "to start a thread.")}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Optional problem link */}
            <div>
              <label
                htmlFor="thread-problem"
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--muted)",
                  marginBottom: "0.5rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {t("forum_linked_problem_label", "Linked problem")}{" "}
                <span style={{ color: "var(--text-tertiary)" }}>
                  {t("optional_suffix", "(optional)")}
                </span>
              </label>
              <select
                id="thread-problem"
                value={problemId}
                onChange={(e) => setProblemId(e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--foreground)",
                  padding: "10px 14px",
                  fontSize: "0.9rem",
                }}
              >
                <option value="">
                  {t("forum_general_thread_option", "General thread (no problem)")}
                </option>
                {problems.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id} —{" "}
                    {p.title_i18n?.en ?? t("problem_id_label", "Problem ID") + " #" + p.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <label
                htmlFor="thread-title"
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--muted)",
                  marginBottom: "0.5rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {t("forum_title_label", "Title")} <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="thread-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t(
                  "forum_title_placeholder",
                  "Be specific and descriptive (min. 10 characters)",
                )}
                style={{
                  width: "100%",
                  background: "var(--surface)",
                  border: `1px solid ${title.length > 0 && title.length < 10 ? "rgba(248,113,113,0.4)" : "var(--border)"}`,
                  borderRadius: "8px",
                  color: "var(--foreground)",
                  padding: "10px 14px",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />
              {title.length > 0 && title.length < 10 && (
                <p style={{ fontSize: "0.72rem", color: "var(--danger)", marginTop: "4px" }}>
                  {t("forum_title_too_short", "Title must be at least 10 characters.")}
                </p>
              )}
            </div>

            {/* Body */}
            <div>
              <label
                htmlFor="thread-body"
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--muted)",
                  marginBottom: "0.5rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {t("forum_content_label", "Content")}{" "}
                <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <textarea
                id="thread-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t(
                  "forum_content_placeholder",
                  "Describe your question or topic in detail.",
                )}
                rows={10}
                style={{
                  width: "100%",
                  background: "var(--surface)",
                  border: `1px solid ${body.length > 0 && body.length < 20 ? "rgba(248,113,113,0.4)" : "var(--border)"}`,
                  borderRadius: "8px",
                  color: "var(--foreground)",
                  padding: "12px 14px",
                  fontSize: "0.875rem",
                  outline: "none",
                  resize: "vertical",
                  lineHeight: 1.7,
                }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                {body.length > 0 && body.length < 20 && (
                  <p style={{ fontSize: "0.72rem", color: "var(--danger)" }}>
                    {t("forum_content_too_short", "Content must be at least 20 characters.")}
                  </p>
                )}
                <span
                  style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", marginLeft: "auto" }}
                >
                  {t("forum_chars_count", "{{count}} chars", { count: body.length })}
                </span>
              </div>
            </div>

            {error && (
              <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                {error}
              </p>
            )}

            {/* Actions */}
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                justifyContent: "flex-end",
                paddingTop: "0.5rem",
              }}
            >
              <Link
                href="/forum"
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {t("cancel_button", "Cancel")}
              </Link>
              <button
                type="submit"
                disabled={!isValid || submitting}
                className="btn btn--primary"
                style={{ opacity: isValid && !submitting ? 1 : 0.5 }}
              >
                {submitting
                  ? t("forum_posting", "Posting…")
                  : t("forum_post_thread", "Post Thread")}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
