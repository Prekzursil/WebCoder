"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ForumService } from "@/services/ApiService";
import { AuthContext } from "@/context/AuthContext";
import type { ForumThread, GetForumThreadsResponse } from "@/types/api";
import { palette } from "@/theme/tokens";

/**
 * COM-1 — per-problem discussion threads. The forum's ?problem_id= filter
 * is the whole backend contract; this panel surfaces it on the problem
 * page (list + start-a-thread). Replies happen on the thread page, where
 * the spoiler flag (COM-1) is available.
 */
export default function DiscussionsPanel({ problemId }: { problemId: number }) {
  const { t } = useTranslation();
  const auth = React.useContext(AuthContext);
  const [threads, setThreads] = useState<ForumThread[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    ForumService.getThreads({ problemId, pageSize: 10 })
      .then((data: GetForumThreadsResponse) => setThreads(data.results))
      .catch(() => setError(t("discussions_error", "Could not load discussions.")));
  }, [problemId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await ForumService.createThread({
        title: title.trim(),
        content: content.trim(),
        problem: problemId,
      });
      setTitle("");
      setContent("");
      setShowForm(false);
      load();
    } catch {
      setFormError(t("discussions_submit_error", "Could not start the discussion."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section aria-label={t("discussions_title", "Discussions")} data-testid="discussions-panel">
      <h3>{t("discussions_title", "Discussions")}</h3>
      {error && <p style={{ color: palette.danger }}>{error}</p>}
      {threads === null && !error ? (
        <p style={{ color: palette.muted }}>{t("discussions_loading", "Loading…")}</p>
      ) : threads && threads.length === 0 ? (
        <p style={{ color: palette.muted }}>
          {t("discussions_empty", "No discussions yet — start the first one.")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {threads?.map((thread) => (
            <li
              key={thread.id}
              style={{
                padding: "0.5rem 0",
                borderBottom: `1px solid ${palette.border}`,
              }}
            >
              <Link href={`/forum/${thread.id}`}>{thread.title}</Link>
              <span style={{ color: palette.muted, marginLeft: "0.5rem" }}>
                · {thread.post_count} {t("discussions_replies", "replies")} · {thread.author}
              </span>
            </li>
          ))}
        </ul>
      )}
      {auth?.isAuthenticated ? (
        showForm ? (
          <form onSubmit={submit} style={{ marginTop: "1rem" }} data-testid="discussions-form">
            <label htmlFor="discussion-title" className="sr-only">
              {t("discussions_title_label", "Title")}
            </label>
            <input
              id="discussion-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("discussions_title_label", "Title")}
              style={{ width: "100%", marginBottom: "0.5rem" }}
            />
            <label htmlFor="discussion-content" className="sr-only">
              {t("discussions_content_label", "Your question")}
            </label>
            <textarea
              id="discussion-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("discussions_content_label", "Your question")}
              rows={3}
              style={{ width: "100%", marginBottom: "0.5rem" }}
            />
            {formError && <p style={{ color: palette.danger }}>{formError}</p>}
            <button type="submit" disabled={submitting}>
              {submitting
                ? t("discussions_submitting", "Posting…")
                : t("discussions_submit", "Post")}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{ marginLeft: "0.5rem" }}
            >
              {t("cancel", "Cancel")}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            data-testid="discussions-start"
            style={{ marginTop: "0.75rem" }}
          >
            {t("discussions_start", "Start a discussion")}
          </button>
        )
      ) : (
        <p style={{ color: palette.muted }}>
          {t("discussions_login_hint", "Log in to join the discussion.")}
        </p>
      )}
    </section>
  );
}
