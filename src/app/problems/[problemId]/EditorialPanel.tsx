"use client";

// [roadmap EDT-1 / QW-8] Editorial panel with AFTER_AC gating: the backend
// returns 403 + locked:true while the publish policy hides the content
// (solve it first), 404 when no editorial exists. Locked state is honest
// UI, not an error.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ProblemService } from "@/services/ApiService";
import { palette, hexAlpha } from "@/theme/tokens";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

type EditorialState =
  | { kind: "loading" }
  | { kind: "none" }
  | { kind: "locked"; policy: string }
  | { kind: "open"; content: string };

export default function EditorialPanel({
  problemId,
  hasEditorial,
  locale,
}: {
  problemId: string;
  hasEditorial: boolean;
  locale: "en" | "ro";
}): ReactNode {
  const { t } = useTranslation();
  const [state, setState] = useState<EditorialState>({ kind: "loading" });

  useEffect(() => {
    if (!hasEditorial) {
      setState({ kind: "none" });
      return;
    }
    let cancelled = false;
    ProblemService.getEditorial(problemId)
      .then((editorial) => {
        if (cancelled) return;
        const content = locale === "ro" ? editorial.content_ro : editorial.content_en;
        setState({
          kind: "open",
          content: content || editorial.content_en || editorial.content_ro,
        });
      })
      .catch((err: { responseLocked?: boolean; policy?: string; notFound?: boolean }) => {
        if (cancelled) return;
        if (err?.notFound) setState({ kind: "none" });
        else if (err?.responseLocked)
          setState({ kind: "locked", policy: err.policy ?? "AFTER_AC" });
        else setState({ kind: "none" });
      });
    return () => {
      cancelled = true;
    };
  }, [problemId, hasEditorial, locale]);

  if (!hasEditorial || state.kind === "none") return null;

  if (state.kind === "locked") {
    return (
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          padding: "1rem 1.25rem",
          borderRadius: "var(--radius-md)",
          background: hexAlpha(palette.muted, 0.06),
          border: `1px solid ${hexAlpha(palette.muted, 0.2)}`,
          color: "var(--muted)",
          fontSize: "0.85rem",
        }}
      >
        <LockOutlinedIcon fontSize="small" />
        {state.policy === "AFTER_AC"
          ? t("editorial_locked_after_ac", "Editorial is locked until you solve this problem.")
          : t("editorial_locked_manual", "Editorial is not public yet.")}
      </div>
    );
  }

  return (
    <div
      style={{ fontSize: "0.88rem", color: "var(--body)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}
    >
      {state.kind === "loading" ? t("loading_editorial", "Loading editorial…") : state.content}
    </div>
  );
}
