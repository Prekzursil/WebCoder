'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Post {
  id: number;
  author: string;
  authorColor: string;
  authorRole: string;
  content: string;
  createdAt: string;
  upvotes: number;
  isAccepted: boolean;
  isOp: boolean;
  codeBlock?: { lang: string; code: string };
}

const THREAD_DATA: Record<string, {
  id: number; title: string; category: string; categoryColor: string;
  isPinned: boolean; isSolved: boolean; isLocked: boolean;
  tags: string[]; viewCount: number; posts: Post[];
}> = {
  '3': {
    id: 3,
    title: 'Why does my Python solution get TLE on test case 12?',
    category: 'Help & Support',
    categoryColor: '#4ade80',
    isPinned: false,
    isSolved: true,
    isLocked: false,
    tags: ['python', 'tle', 'optimization'],
    viewCount: 210,
    posts: [
      {
        id: 1, author: 'radu_bits', authorColor: '#4ade80', authorRole: 'Member', isOp: true, isAccepted: false,
        createdAt: '2026-09-28T09:30:00Z', upvotes: 12,
        content: "I have a working solution for Merge Sort (Problem #5) but it times out on the last few test cases. My current approach is O(n log n) but test case 12 seems to have n = 10^6. Here is my current code:",
        codeBlock: { lang: 'python', code: `def merge_sort(arr):
    if len(arr) <= 1:
        return arr
    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)

def merge(left, right):
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result` },
      },
      {
        id: 2, author: 'mihai_dev', authorColor: '#38bdf8', authorRole: 'Pro Member', isOp: false, isAccepted: false,
        createdAt: '2026-09-28T10:15:00Z', upvotes: 8,
        content: "The issue is the list slicing `arr[:mid]` and `arr[mid:]` — each slice creates a new list, adding O(n) overhead at every level of recursion. For n = 10^6 this becomes very expensive. Try using indices instead:",
        codeBlock: { lang: 'python', code: `def merge_sort(arr, left=0, right=None):
    if right is None:
        right = len(arr) - 1
    if left >= right:
        return
    mid = (left + right) // 2
    merge_sort(arr, left, mid)
    merge_sort(arr, mid + 1, right)
    merge_in_place(arr, left, mid, right)` },
      },
      {
        id: 3, author: 'ioana_pro', authorColor: '#a78bfa', authorRole: 'Expert', isOp: false, isAccepted: true,
        createdAt: '2026-09-28T11:00:00Z', upvotes: 31,
        content: "Mihai is right about the slicing. Additionally, for Python specifically, you can get a big speedup by using the built-in `sorted()` for the merge step — it's implemented in C and much faster than a pure-Python loop. Also consider increasing the recursion limit with `sys.setrecursionlimit(200000)` for large inputs. Here is the optimized version that should pass all test cases:",
        codeBlock: { lang: 'python', code: `import sys
sys.setrecursionlimit(200000)

def merge_sort(arr, buf, left, right):
    if right - left <= 1:
        return
    mid = (left + right) // 2
    merge_sort(arr, buf, left, mid)
    merge_sort(arr, buf, mid, right)
    # Use sorted() for the merge — C-speed
    arr[left:right] = sorted(arr[left:right])

n = int(input())
arr = list(map(int, input().split()))
buf = arr[:]
merge_sort(arr, buf, 0, n)
print(*arr)` },
      },
      {
        id: 4, author: 'radu_bits', authorColor: '#4ade80', authorRole: 'Member', isOp: true, isAccepted: false,
        createdAt: '2026-09-28T12:30:00Z', upvotes: 5,
        content: "Thank you both! Ioana's solution worked perfectly — all 12 test cases pass now. The key insight was avoiding list slicing and using sorted() for the merge. Marking as solved!",
      },
    ],
  },
};

const FALLBACK_THREAD = {
  id: 1,
  title: 'Welcome to the WebCoder Community Forum!',
  category: 'General Discussion',
  categoryColor: '#38bdf8',
  isPinned: true,
  isSolved: false,
  isLocked: false,
  tags: ['announcement', 'welcome'],
  viewCount: 1820,
  posts: [
    {
      id: 1, author: 'admin', authorColor: '#f87171', authorRole: 'Administrator', isOp: true, isAccepted: false,
      createdAt: '2026-09-01T10:00:00Z', upvotes: 98,
      content: "Welcome to the official WebCoder community forum! This is the place to discuss problems, share solutions, ask for help, and connect with fellow competitive programmers.\n\nPlease read the community guidelines before posting:\n• Be respectful and constructive\n• Use spoiler tags when sharing solutions\n• Search before posting — your question may already be answered\n• Tag your posts appropriately\n\nHappy coding! 🚀",
    },
  ],
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div style={{
      background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px', overflow: 'hidden', margin: '1rem 0',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 14px', background: 'rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace', fontWeight: 600 }}>{lang}</span>
        <button onClick={handleCopy} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '0.72rem', color: copied ? '#4ade80' : '#64748b', padding: '2px 6px',
        }}>{copied ? '✓ Copied' : 'Copy'}</button>
      </div>
      <pre style={{
        padding: '1rem', margin: 0, overflowX: 'auto',
        fontSize: '0.82rem', lineHeight: 1.6, color: '#e2e8f0',
        fontFamily: 'JetBrains Mono, Consolas, monospace',
        whiteSpace: 'pre',
      }}>{code}</pre>
    </div>
  );
}

export default function ForumThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const thread = THREAD_DATA[threadId] ?? FALLBACK_THREAD;
  const [replyText, setReplyText] = useState('');
  const [votes, setVotes] = useState<Record<number, number>>({});

  const handleVote = (postId: number, delta: number) => {
    setVotes(v => ({ ...v, [postId]: (v[postId] ?? 0) + delta }));
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem', fontSize: '0.8rem', color: '#64748b' }}>
        <Link href="/forum" style={{ color: '#38bdf8' }}>Forum</Link>
        <span>›</span>
        <span style={{ color: thread.categoryColor }}>{thread.category}</span>
        <span>›</span>
        <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>{thread.title}</span>
      </div>

      {/* Thread header */}
      <div style={{
        background: '#1e293b',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {thread.isPinned && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#38bdf8', background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>📌 Pinned</span>}
          {thread.isSolved && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>✓ Solved</span>}
          {thread.isLocked && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>🔒 Locked</span>}
          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: thread.categoryColor, background: `${thread.categoryColor}12`, border: `1px solid ${thread.categoryColor}25`, padding: '2px 8px', borderRadius: '4px' }}>{thread.category}</span>
        </div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em', marginBottom: '0.75rem', lineHeight: 1.3 }}>
          {thread.title}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', color: '#475569' }}>{thread.posts.length} replies</span>
          <span style={{ fontSize: '0.78rem', color: '#475569' }}>{thread.viewCount} views</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {thread.tags.map(tag => (
              <span key={tag} style={{ fontSize: '0.65rem', padding: '1px 7px', borderRadius: '4px', color: '#64748b', background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.15)' }}>{tag}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Posts */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
        {thread.posts.map((post, idx) => (
          <div key={post.id} style={{
            background: '#1e293b',
            border: `1px solid ${post.isAccepted ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            {post.isAccepted && (
              <div style={{ background: 'rgba(74,222,128,0.08)', borderBottom: '1px solid rgba(74,222,128,0.2)', padding: '6px 16px', fontSize: '0.72rem', fontWeight: 700, color: '#4ade80', letterSpacing: '0.04em' }}>
                ✓ ACCEPTED ANSWER
              </div>
            )}
            <div style={{ display: 'flex', gap: '1rem', padding: '1.25rem 1.5rem' }}>
              {/* Vote column */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '40px' }}>
                <button onClick={() => handleVote(post.id, 1)} style={{
                  background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)',
                  borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#38bdf8', fontSize: '0.75rem',
                }}>▲</button>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8' }}>{post.upvotes + (votes[post.id] ?? 0)}</span>
                <button onClick={() => handleVote(post.id, -1)} style={{
                  background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
                  borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#f87171', fontSize: '0.75rem',
                }}>▼</button>
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    background: post.authorColor, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>{post.author[0].toUpperCase()}</div>
                  <span style={{ fontWeight: 700, color: '#f1f5f9', fontSize: '0.875rem' }}>{post.author}</span>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', background: 'rgba(100,116,139,0.1)', padding: '1px 7px', borderRadius: '4px' }}>{post.authorRole}</span>
                  {post.isOp && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#38bdf8', background: 'rgba(56,189,248,0.1)', padding: '1px 7px', borderRadius: '4px' }}>OP</span>}
                  <span style={{ fontSize: '0.75rem', color: '#475569', marginLeft: 'auto' }}>
                    {idx === 0 ? 'Posted' : 'Replied'} {timeAgo(post.createdAt)}
                  </span>
                </div>

                <div style={{ fontSize: '0.875rem', color: '#cbd5e1', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {post.content}
                </div>

                {post.codeBlock && <CodeBlock lang={post.codeBlock.lang} code={post.codeBlock.code} />}

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#475569', padding: '4px 0' }}>💬 Reply</button>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#475569', padding: '4px 0' }}>🔗 Share</button>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#475569', padding: '4px 0' }}>⚑ Report</button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reply box */}
      {!thread.isLocked ? (
        <div style={{
          background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px',
          padding: '1.5rem',
        }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '1rem' }}>Post a Reply</h3>
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="Write your reply… Use ``` for code blocks."
            rows={6}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px',
              color: '#f1f5f9', padding: '12px', fontSize: '0.875rem',
              resize: 'vertical', outline: 'none', lineHeight: 1.6,
              fontFamily: 'DM Sans, system-ui, sans-serif',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem', gap: '0.75rem' }}>
            <button onClick={() => setReplyText('')} style={{
              padding: '8px 18px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8', cursor: 'pointer',
            }}>Cancel</button>
            <button style={{
              padding: '8px 20px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700,
              background: replyText.trim() ? '#38bdf8' : 'rgba(56,189,248,0.3)',
              border: 'none', color: replyText.trim() ? '#0f172a' : '#64748b',
              cursor: replyText.trim() ? 'pointer' : 'not-allowed',
            }} disabled={!replyText.trim()}>
              Post Reply
            </button>
          </div>
        </div>
      ) : (
        <div style={{
          padding: '1.25rem', background: 'rgba(100,116,139,0.08)',
          border: '1px solid rgba(100,116,139,0.2)', borderRadius: '10px',
          textAlign: 'center', color: '#64748b', fontSize: '0.875rem',
        }}>
          🔒 This thread is locked. No new replies can be posted.
        </div>
      )}
    </div>
  );
}
