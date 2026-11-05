// [roadmap SAF-2 / round-2] The rated-contest AI and conduct policy,
// bilingual, published BEFORE the first rated contest (the round-2 gate).
// Model: USACO's plain-language bans + AtCoder's versioned AI rules.
// This page is linked from the contest list and the rules line on rated
// contests; violations are handled with the DQ + rating-rollback tooling.

import type { Metadata } from "next";
import { createTranslator, getLocale } from "../../_lib/public-i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return { title: t("ai_policy_title", "Rated contests: conduct & AI policy") };
}

export default async function AiPolicyPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);

  const rules: { key: string; body: string }[] = [
    {
      key: "own-work",
      body: t(
        "ai_policy_own_work",
        "Submissions during a rated contest must be entirely your own work. Using generative AI (ChatGPT, Copilot, Gemini or similar) to produce, debug or complete a solution during a rated round is cheating.",
      ),
    },
    {
      key: "no-sharing",
      body: t(
        "ai_policy_no_sharing",
        "Do not share solutions, hints or test observations with other participants while a rated contest is running, and do not publish them before the round ends.",
      ),
    },
    {
      key: "one-account",
      body: t(
        "ai_policy_one_account",
        "One account per person. Multi-accounting in rated contests (including entering a division you are not eligible for) is cheating.",
      ),
    },
    {
      key: "tools",
      body: t(
        "ai_policy_tools",
        "Allowed: the platform editor, its starter templates, and scratch runs. Not allowed: external AI assistants, collaboration tools, published solutions of the same problem, and other people — in the room or online.",
      ),
    },
    {
      key: "enforcement",
      body: t(
        "ai_policy_enforcement",
        "After each rated contest we review solve patterns and run similarity checks. Confirmed violations mean disqualification from the round, rollback of the rating it produced and, for repeated offenses, loss of the account. Judgements are made by the organizers; you can appeal by email.",
      ),
    },
    {
      key: "practice",
      body: t(
        "ai_policy_practice",
        "Outside rated contests — practice, editorials, community discussions — AI tools are yours to use for learning. The restrictions above exist only to keep the rating ladder honest.",
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
        {t("ai_policy_title", "Rated contests: conduct & AI policy")}
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
          "ai_policy_intro",
          "The rating ladder only means something if the solves are real. These rules apply to every rated contest on WebCoder; registering for one means you accept them.",
        )}
      </p>

      <ol style={{ display: "grid", gap: "1rem", paddingInlineStart: "1.25rem" }}>
        {rules.map((rule) => (
          <li
            key={rule.key}
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
            {rule.body}
          </li>
        ))}
      </ol>
    </div>
  );
}
