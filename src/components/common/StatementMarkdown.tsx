// [SPEC-GAPS A7 / roadmap UXP-2] Markdown + KaTeX statement rendering.
//
// Problem statements are math-heavy; rendering them as pre-wrap text was
// the single biggest statement-quality gap vs AtCoder/DMOJ. This component
// renders the statement_i18n markdown with GFM tables, math ($...$ /
// $$...$$ via remark-math + rehype-katex) and a sanitize pass that strips
// raw HTML before katex runs, so author content can never inject markup.

import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

// Allow class names (katex/math/code-chrome) while keeping everything else
// at the conservative default schema (no raw script/style/iframe/onclick).
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className'],
  },
};

export default function StatementMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="statement-md" style={{ fontSize: '0.9rem', color: 'var(--body)', lineHeight: 1.8 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeSanitize(schema) as never, rehypeKatex]}
        components={{
          // Statements embed code fences and inline code constantly.
          code: ({ children }) => (
            <code
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85em',
                background: 'rgba(255,255,255,0.06)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                overflowX: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
              }}
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                fontSize: '0.85rem',
              }}
            >
              {children}
            </table>
          ),
          th: ({ children }) => (
            <th
              style={{
                border: '1px solid var(--border)',
                padding: '6px 10px',
                textAlign: 'left',
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td style={{ border: '1px solid var(--border)', padding: '6px 10px' }}>{children}</td>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
