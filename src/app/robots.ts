import { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://webcoder.momentstudio.ro';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/problems', '/problems/*'],
        disallow: [
          '/admin/',
          '/profile',
          '/my-submissions',
          '/my-created-problems',
          '/complete-registration',
          '/api/',
        ],
      },
      {
        userAgent: 'GPTBot',
        allow: ['/', '/problems', '/problems/*'],
      },
      {
        userAgent: 'Claude-Web',
        allow: ['/', '/problems', '/problems/*'],
      },
      {
        userAgent: 'PerplexityBot',
        allow: ['/', '/problems', '/problems/*'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
