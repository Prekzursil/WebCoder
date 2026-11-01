// [roadmap OPS-7 / round-2 D.9] Support WebCoder — donations and contest
// sponsorship. GROUNDWORK ONLY: an informational page with the contact
// rails; there is NO payment processing, no paid tier, and no checkout —
// consumer paywalls are explicitly not recommended by the roadmap and
// any paid hosting tier waits for Romanian fiscal/legal groundwork
// (invoicing, registration), stated plainly here.

import type { Metadata } from "next";
import { createTranslator, getLocale } from "../_lib/public-i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return { title: t("support_title", "Support WebCoder") };
}

export default async function SupportPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);

  const cards: { key: string; title: string; body: string; cta: string; href: string }[] = [
    {
      key: "donate",
      title: t("support_donate_title", "Donate"),
      body: t(
        "support_donate_body",
        "WebCoder is free for students and teachers. Donations cover hosting, the judge infrastructure and the bilingual content work. Write to us and we will send the current donation channel — we publish a donor wall on request.",
      ),
      cta: t("support_donate_cta", "Email us about donating"),
      href: "mailto:contact@webcoder.example?subject=Donation",
    },
    {
      key: "sponsor",
      title: t("support_sponsor_title", "Sponsor a contest"),
      body: t(
        "support_sponsor_body",
        "Companies and organizations can sponsor a rated round or a school olympiad: your name and logo appear on the contest page and standings (attribution only — the contest stays free for everyone). Codeforces-style sponsor rounds are the sustainable model for a community judge.",
      ),
      cta: t("support_sponsor_cta", "Become a sponsor"),
      href: "mailto:sponsors@webcoder.example?subject=Sponsoring%20a%20contest",
    },
    {
      key: "school",
      title: t("support_school_title", "Hosted school contests"),
      body: t(
        "support_school_body",
        "Schools and county olympiads can run private contests on WebCoder (windowed, personal timers, gradebook export). This is currently free while the platform is in its community phase; a paid hosting tier with an SLA is planned only after the legal and fiscal groundwork (invoicing, registration) exists.",
      ),
      cta: t("support_school_cta", "Talk to us about hosting"),
      href: "mailto:schools@webcoder.example?subject=Hosted%20contest",
    },
  ];

  return (
    <div className="page-container" style={{ paddingTop: "2.5rem", maxWidth: "860px" }}>
      <h1
        style={{
          fontSize: "1.75rem",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "var(--foreground)",
        }}
      >
        {t("support_title", "Support WebCoder")}
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
          "support_intro",
          "The platform is free for students and teachers, and it stays that way. If it helps your class, your club or your olympiad preparation, here is how you can keep it running.",
        )}
      </p>

      <div
        style={{
          display: "grid",
          gap: "1.25rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        {cards.map((card) => (
          <section
            key={card.key}
            style={{
              background: "var(--surface)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "12px",
              padding: "1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <h2
              style={{ fontSize: "1rem", fontWeight: 700, color: "var(--foreground)", margin: 0 }}
            >
              {card.title}
            </h2>
            <p
              style={{
                color: "var(--muted)",
                fontSize: "0.85rem",
                lineHeight: 1.7,
                margin: 0,
                flex: 1,
              }}
            >
              {card.body}
            </p>
            <a
              href={card.href}
              style={{
                justifySelf: "start",
                padding: "0.55rem 1.1rem",
                borderRadius: "9px",
                background: "rgba(56,189,248,0.15)",
                color: "var(--accent)",
                border: "1px solid rgba(56,189,248,0.3)",
                fontWeight: 600,
                fontSize: "0.85rem",
                textDecoration: "none",
              }}
            >
              {card.cta}
            </a>
          </section>
        ))}
      </div>

      <p
        style={{
          color: "var(--text-tertiary)",
          fontSize: "0.78rem",
          margin: "2rem 0 0",
          lineHeight: 1.7,
        }}
      >
        {t(
          "support_no_payments_note",
          "Note: this page processes no payments. Donation channels and any future paid hosting tier will launch with proper invoicing and legal terms — until then, everything on WebCoder is free.",
        )}
      </p>
    </div>
  );
}
