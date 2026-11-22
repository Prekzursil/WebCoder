// [SPEC-GAPS A7 / roadmap UXP-2] Markdown + KaTeX statement rendering.
//
// Problem statements are math-heavy; rendering them as pre-wrap text was
// the single biggest statement-quality gap vs AtCoder/DMOJ. This component
// renders the statement_i18n markdown with GFM tables, math ($...$ /
// $$...$$ via remark-math + rehype-katex) and a sanitize pass that strips
// raw HTML before katex runs, so author content can never inject markup.
//
// Problem-page experience wave (item A): fenced code blocks render with
// real syntax highlighting (react-syntax-highlighter, language taken from
// the fence's info string) and the Constraints section renders as a
// callout BOX (the authoring toolbar's "constraint box" construct) —
// h3.constraints-heading + list/table gets the box skin via globals.css.

import { type ReactNode } from 'react';
import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';

// Allow class names (katex/math/code-chrome) while keeping everything else
// at the conservative default schema (no raw script/style/iframe/onclick).
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className'],
  },
};

/** Map a fence info string / registry language id to a Prism grammar. */
function highlightLanguage(info: string): string {
  const lang = (info || '').trim().split(/\s+/)[0]?.toLowerCase();
  const aliases: Record<string, string> = {
    py: 'python',
    python3: 'python',
    cpp: 'cpp',
    cpp17: 'cpp',
    c11: 'c',
    js: 'javascript',
    nodejs: 'javascript',
    nodejs20: 'javascript',
    ts: 'typescript',
    rs: 'rust',
    sh: 'bash',
    '': 'text',
  };
  if (!lang) return 'text';
  return aliases[lang] ?? lang;
}

function plainText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join('');
  const props = (node as { props?: { children?: ReactNode } }).props;
  return props?.children ? plainText(props.children) : '';
}

export default function StatementMarkdown({ markdown }: { markdown: string }) {
  return (
    <div
      className="statement-md"
      style={{ fontSize: '0.9rem', color: 'var(--body)', lineHeight: 1.8 }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeSanitize(schema) as never, rehypeKatex]}
        components={{
          // Statements embed code fences and inline code constantly; the
          // fences highlight by language, inline code stays a chip.
          code: ({ className, children }) => {
            const match = /language-([\w-]+)/.exec(className || '');
            const text = plainText(children);
            // Fenced blocks with no info string still carry newlines. They
            // must stay preformatted — the outer `pre` is unwrapped below
            // so highlighted fences are not double-wrapped.
            const block = Boolean(match) || text.includes('\n');
            if (!block) {
              return (
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
              );
            }
            if (!match) {
              return (
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.82rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    overflowX: 'auto',
                  }}
                >
                  <code>{text.replace(/\n$/, '')}</code>
                </pre>
              );
            }
            return (
              <SyntaxHighlighter
                language={highlightLanguage(match[1])}
                style={vscDarkPlus}
                customStyle={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.82rem',
                }}
              >
                {plainText(children)}
              </SyntaxHighlighter>
            );
          },
          pre: ({ children }) => <>{children}</>,
          h2: ({ children }) => {
            const text = plainText(children).trim().toLowerCase();
            const isConstraints =
              text === 'constraints' || text === 'restricții' || text === 'restriccii';
            return (
              <h2 className={isConstraints ? 'constraints-heading' : undefined}>{children}</h2>
            );
          },
          h3: ({ children }) => {
            const text = plainText(children).trim().toLowerCase();
            const isConstraints =
              text === 'constraints' || text === 'restricții' || text === 'restriccii';
            return (
              <h3 className={isConstraints ? 'constraints-heading' : undefined}>{children}</h3>
            );
          },
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
