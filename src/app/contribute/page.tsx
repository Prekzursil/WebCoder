// [roadmap EDU-11] The contributor program page: authoring as teacher
// training (the Campion lesson — teachers author to published specs, the
// committee reviews problem + solutions + tests, and authoring IS
// professional development). This page publishes the specs, the review
// feedback loop and the honor rewards, linking every surface a
// contributor needs.

import type { Metadata } from "next";
import Link from "next/link";
import { createTranslator, getLocale } from "../_lib/public-i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return { title: t("contribute_title", "Contribute: the authoring program") };
}

export default async function ContributePage() {
  const locale = await getLocale();
  const t = createTranslator(locale);

  const steps: { key: string; body: string }[] = [
    {
      key: "spec",
      body: t(
        "contribute_step_spec",
        "Write to the published spec: a bilingual statement (RO canonical, EN mirror), the input/output format, limits, subtasks when the problem is written with them, and the reference solution. The problem form and its validation enforce the spec mechanically.",
      ),
    },
    {
      key: "tests",
      body: t(
        "contribute_step_tests",
        "Provide tests that match the statement (samples are public, the rest hidden), a custom checker when the answer is not exact text (the testlib-compatible exit-code protocol), and — for interactive problems — the interactor. The stress runner lets you cross-check your solution against a brute force before submitting.",
      ),
    },
    {
      key: "review",
      body: t(
        "contribute_step_review",
        "Submissions go through the DRAFT → PENDING → APPROVED queue. A verifier reads the statement, runs the tests and returns structured feedback; you iterate until it is approved. That feedback loop is the training: it is how the campion teacher-authors got good.",
      ),
    },
    {
      key: "reward",
      body: t(
        "contribute_step_reward",
        "Approved problems, community editorials and articles earn contributor honor — the separate ladder that recognizes the people who build the bank, not just the people who solve it.",
      ),
    },
  ];

  return (
    <div className="page-container" style={{ paddingTop: "2.5rem", maxWidth: "760px" }}>
      <h1
        style={{
          fontSize: "1.75rem",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "var(--foreground)",
        }}
      >
        {t("contribute_title", "Contribute: the authoring program")}
      </h1>
      <p
        style={{
          color: "var(--muted)",
          fontSize: "0.9rem",
          margin: "0.5rem 0 2rem",
          lineHeight: 1.7,
        }}
      >
        {t(
          "contribute_intro",
          "WebCoder is bilingual because contributors make it bilingual. Teachers: writing problems here is professional development — you get a spec, a review and structured feedback, and your class gets problems in both languages.",
        )}
      </p>

      <ol style={{ display: "grid", gap: "1rem", paddingInlineStart: "1.25rem" }}>
        {steps.map((step) => (
          <li
            key={step.key}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "1rem 1.25rem",
              color: "var(--muted)",
              fontSize: "0.9rem",
              lineHeight: 1.7,
              listStylePosition: "inside",
            }}
          >
            {step.body}
          </li>
        ))}
      </ol>

      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginTop: "2rem", lineHeight: 1.7 }}>
        <Link href="/problems/create">{t("contribute_cta_problem", "Submit a problem")}</Link>
        {" · "}
        <Link href="/help/judge">{t("contribute_cta_judge", "The judge & limits")}</Link>
        {" · "}
        <Link href="/policies/ai">{t("contribute_cta_policy", "Contest rules")}</Link>
      </p>
    </div>
  );
}
