"use client";

// OPS-2 (Wave D) "warn" phase: a persistent banner on privileged surfaces
// for role members who have not enrolled TOTP yet. The hard gate lives
// behind TWO_FACTOR_ENFORCE on the backend; the banner is the progressive
// nudge the roadmap prescribes before that flip.

import React from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

const PRIVILEGED_ROLES = new Set([
  "CREATOR",
  "VERIFIER",
  "TEACHER",
  "ADMIN",
  "PROBLEM_CREATOR",
  "PROBLEM_VERIFIER",
]);

export default function TwoFactorBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  if (!user) return null;
  if (user.two_factor_enabled) return null;
  // The backend computes the same flag (two_factor_required on /users/me/)
  // — mirror it client-side so the banner also works for a stale snapshot.
  const privileged = user.two_factor_required === true || PRIVILEGED_ROLES.has(user.role);
  if (!privileged) return null;

  return (
    <div
      role="status"
      data-testid="two-factor-banner"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        flexWrap: "wrap",
        background: "rgba(251,191,36,0.08)",
        border: "1px solid rgba(251,191,36,0.3)",
        borderRadius: "10px",
        padding: "0.75rem 1rem",
        marginBottom: "1.25rem",
        fontSize: "0.85rem",
        color: "var(--foreground)",
      }}
    >
      <span aria-hidden="true">🔐</span>
      <span>
        {t(
          "two_factor_banner_text",
          "Two-factor authentication is required for your role. Enable it to keep your access.",
        )}{" "}
        <Link href="/profile" style={{ color: "var(--accent)", fontWeight: 600 }}>
          {t("two_factor_banner_link", "Enable it in Profile → Security")}
        </Link>
      </span>
    </div>
  );
}
