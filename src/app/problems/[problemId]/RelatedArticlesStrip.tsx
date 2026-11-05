"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { CommunityService } from "@/services/ApiService";
import { ArticleRow } from "@/types/api";
import { palette } from "@/theme/tokens";

/** EDT-6 — "related reading": approved articles sharing ≥1 tag with the
 * problem (the tag cross-link that seeds the lecture layer). */
export default function RelatedArticlesStrip({ problemId }: { problemId: number }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "ro" ? "ro" : "en";
  const [articles, setArticles] = useState<ArticleRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    CommunityService.getRelatedArticles(problemId)
      .then((data) => {
        if (!cancelled) setArticles(data.results);
      })
      .catch(() => setArticles([]));
    return () => {
      cancelled = true;
    };
  }, [problemId]);

  if (articles.length === 0) return null;
  return (
    <section aria-label={t("related_reading", "Related reading")} data-testid="related-articles">
      <h3>{t("related_reading", "Related reading")}</h3>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {articles.map((article) => (
          <li key={article.id} style={{ padding: "4px 0" }}>
            <Link href={`/articles/${article.id}`} style={{ color: palette.accent }}>
              {String(article.title_i18n[lang] ?? article.title_i18n.en ?? "")}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
