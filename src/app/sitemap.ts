import { MetadataRoute } from "next";
import { getProblems } from "./problems/_lib/problems-api";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://webcoder.momentstudio.ro";

// [SPEC-GAPS A17] Sitemap previously omitted /leaderboard and /forum entirely
// and listed zero individual problem URLs despite the per-problem metadata —
// search engines had no path to any problem detail. Per-problem entries are
// best-effort: a catalog fetch failure degrades to the static routes.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${siteUrl}/problems`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/contests`,
      changeFrequency: "daily" as const,
      priority: 0.8,
      lastModified: now,
    },
    {
      url: `${siteUrl}/ratings`,
      changeFrequency: "daily" as const,
      priority: 0.7,
      lastModified: now,
    },
    {
      url: `${siteUrl}/leaderboard`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/forum`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/login`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/register`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  try {
    const problems = await getProblems();
    const problemRoutes: MetadataRoute.Sitemap = problems.map((p) => ({
      url: `${siteUrl}/problems/${p.id}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
    return [...staticRoutes, ...problemRoutes];
  } catch {
    return staticRoutes;
  }
}
