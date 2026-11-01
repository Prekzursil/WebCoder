"use client";

// [roadmap UXP-6] Bookmark star: the private "solve later" affordance on
// the problem page, wired to the idempotent toggle endpoint. Optimistic
// local state; failures roll back silently.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ProblemService } from "@/services/ApiService";
import { useAuth } from "@/context/AuthContext";
import StarBorderOutlinedIcon from "@mui/icons-material/StarBorderOutlined";
import StarOutlinedIcon from "@mui/icons-material/StarOutlined";

export default function BookmarkButton({ problemId }: { problemId: string }): ReactNode {
  const { t } = useTranslation();
  const auth = useAuth();
  const [starred, setStarred] = useState<boolean | null>(null); // null = loading
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    let cancelled = false;
    ProblemService.getBookmarkedIds()
      .then((data) => {
        if (!cancelled) setStarred(data.starred_ids.includes(Number(problemId)));
      })
      .catch(() => {
        if (!cancelled) setStarred(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, problemId]);

  if (!auth.isAuthenticated || starred === null) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const next = !starred;
    setStarred(next); // optimistic
    try {
      await ProblemService.setBookmark(problemId, next);
    } catch {
      setStarred(!next); // rollback
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={starred}
      aria-label={
        starred
          ? t("unbookmark_aria", "Remove bookmark")
          : t("bookmark_aria", "Bookmark this problem")
      }
      title={
        starred
          ? t("unbookmark_aria", "Remove bookmark")
          : t("bookmark_aria", "Bookmark this problem")
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 12px",
        borderRadius: "999px",
        fontSize: "0.72rem",
        fontWeight: 700,
        cursor: "pointer",
        border: "1px solid var(--border)",
        background: starred ? "rgba(251,191,36,0.1)" : "transparent",
        color: starred ? "var(--warn)" : "var(--muted)",
      }}
    >
      {starred ? (
        <StarOutlinedIcon fontSize="small" />
      ) : (
        <StarBorderOutlinedIcon fontSize="small" />
      )}
      {starred ? t("bookmarked_label", "Bookmarked") : t("bookmark_label", "Bookmark")}
    </button>
  );
}
