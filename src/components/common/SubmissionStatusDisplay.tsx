"use client";

import React from "react";
import { useTranslation } from "react-i18next";
import { palette, hexAlpha } from "@/theme/tokens";

// Ported from frontend/webcoder_ui/src/components/common/SubmissionStatusDisplay.tsx (CRA reference).
//
// [SPEC-GAPS A11/Q10] The CRA light-theme alert colors (dark green text on a
// pale green card, dark red on pale red) are replaced with token washes
// readable on dark, and the regions carry role=status / role=alert so screen
// readers hear judge status changes.

interface SubmissionStatusDisplayProps {
  status: string | null;
  error: string | null;
}

const SubmissionStatusDisplay: React.FC<SubmissionStatusDisplayProps> = ({ status, error }) => {
  const { t } = useTranslation();

  if (!status && !error) {
    return null;
  }

  return (
    <div
      style={{
        marginTop: "15px",
        padding: "10px",
        borderRadius: "var(--radius-md)",
        border: "1px solid transparent",
      }}
    >
      {status && (
        <p
          role="status"
          aria-live="polite"
          style={{
            color: palette.success,
            backgroundColor: hexAlpha(palette.success, 0.1),
            borderColor: hexAlpha(palette.success, 0.25),
            padding: "10px",
            borderRadius: "var(--radius-md)",
            margin: 0,
          }}
        >
          {status}
        </p>
      )}
      {error && (
        <p
          role="alert"
          style={{
            color: palette.danger,
            backgroundColor: hexAlpha(palette.danger, 0.1),
            borderColor: hexAlpha(palette.danger, 0.25),
            padding: "10px",
            borderRadius: "var(--radius-md)",
            margin: status ? "10px 0 0 0" : 0,
          }}
        >
          <strong>{t("error_label", "Error")}:</strong> {error}
        </p>
      )}
    </div>
  );
};

export default SubmissionStatusDisplay;
