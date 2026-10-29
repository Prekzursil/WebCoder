import type { Metadata, Viewport } from "next";
import Providers from "./providers";
import ExamModeBanner from "@/components/common/ExamModeBanner";
import "./globals.css";
import { palette } from "@/theme/tokens";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://webcoder.momentstudio.ro';

export const metadata: Metadata = {
  // OPS-6 (Wave D): the PWA manifest — installable app shell, offline
  // problem browsing via the service worker, app shortcuts.
  manifest: "/manifest.webmanifest",
  applicationName: "WebCoder",
  appleWebApp: {
    capable: true,
    title: "WebCoder",
    statusBarStyle: "black-translucent",
  },
  title: {
    default: "WebCoder — Competitive Programming Platform",
    template: "%s | WebCoder",
  },
  description: "WebCoder is an online judge and competitive programming platform. Solve algorithmic problems, submit solutions in Python, C++, Java, and compete with developers worldwide.",
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'WebCoder',
    title: 'WebCoder — Competitive Programming Platform',
    description: 'Solve algorithmic problems, submit solutions in Python, C++, Java, and compete with developers worldwide.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WebCoder — Competitive Programming Platform',
    description: 'Solve algorithmic problems, submit solutions in Python, C++, Java, and compete with developers worldwide.',
  },
  alternates: {
    canonical: siteUrl,
    // [OPS-4/Q5] hreflang RO/EN — the bilingual moat, machine-readable.
    languages: {
      en: siteUrl,
      ro: siteUrl,
    },
  },
};

// Next 15+: theme color lives in the separate Viewport export.
export const viewport: Viewport = {
  // Palette token, not a literal — the A2 design-token gate enforces this.
  themeColor: palette.bg,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const schemaOrg = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'WebCoder',
        url: siteUrl,
        description: 'Online judge and competitive programming platform',
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: siteUrl,
        name: 'WebCoder',
        publisher: { '@id': `${siteUrl}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${siteUrl}/problems?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${siteUrl}/#app`,
        name: 'WebCoder',
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web',
        url: siteUrl,
        description: 'Competitive programming online judge supporting Python 3, C++17, and Java 11',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
    ],
  };

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
        />
        {/* [SPEC-GAPS A15] third-party rocket.new analytics scripts removed —
            telemetry to an unrelated host, shipped on every page with no consent. */}
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <ExamModeBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
