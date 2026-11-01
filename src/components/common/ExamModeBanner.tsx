"use client";

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClassroomService } from "@/services/ApiService";
import { useAuth } from "@/context/AuthContext";
import { palette } from "@/theme/tokens";
import { ExamModeStatus } from "@/types/api";

/**
 * EDU-4 exam-mode banner: while the signed-in student sits an OPEN is_exam
 * temă, the backend locks every non-exam surface — this banner says so, so
 * the 403s never look like breakage. Polled once per mount + on focus.
 */
export default function ExamModeBanner() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [status, setStatus] = useState<ExamModeStatus | null>(null);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    let cancelled = false;
    ClassroomService.getExamMode()
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated]);

  if (!status?.active || !status.assignment) return null;
  return (
    <div
      role="alert"
      data-testid="exam-mode-banner"
      style={{
        background: palette.danger,
        color: "#fff",
        padding: "10px 16px",
        textAlign: "center",
        fontWeight: 600,
      }}
    >
      {t("exam_mode_banner", "Exam mode is ON — the site is locked to your exam until")}{" "}
      {new Date(status.assignment.due_at).toLocaleTimeString()}
    </div>
  );
}
