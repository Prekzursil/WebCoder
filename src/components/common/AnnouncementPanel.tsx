"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ForumService } from "@/services/ApiService";
import type { ForumThread, GetForumThreadsResponse } from "@/types/api";
import { palette } from "@/theme/tokens";

/**
 * COM-6 — the home announcements panel. Reads the forum's
 * ?announcements=1 feed (moderator-pinned news threads) and renders the
 * community heartbeat above the activity feed. Hidden entirely when the
 * feed is empty.
 */
export default function AnnouncementPanel() {
  const { t } = useTranslation();
  const [threads, setThreads] = useState<ForumThread[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    ForumService.getThreads({ announcements: true, pageSize: 3 })
      .then((data: GetForumThreadsResponse) => {
        if (!cancelled) setThreads(data.results);
      })
      .catch(() => {
        if (!cancelled) setThreads([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (threads === null || threads.length === 0) return null;

  return (
    <section
      aria-label={t("announcements_title", "Announcements")}
      data-testid="announcements-panel"
      style={{ maxWidth: "720px", margin: "2rem auto 0" }}
    >
      <h2 style={{ fontSize: "1.1rem" }}>📣 {t("announcements_title", "Announcements")}</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {threads.map((thread) => (
          <li key={thread.id} style={{ padding: "0.25rem 0" }}>
            <Link href={`/forum/${thread.id}`}>{thread.title}</Link>
            <span style={{ color: palette.muted, marginLeft: "0.5rem" }}>
              {new Date(thread.last_activity).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
