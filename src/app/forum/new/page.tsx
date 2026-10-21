'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const CATEGORIES = [
  { id: 'general', name: 'General Discussion', icon: '💬' },
  { id: 'help', name: 'Help & Support', icon: '🙋' },
  { id: 'editorial', name: 'Editorials', icon: '📝' },
  { id: 'contest', name: 'Contests', icon: '🏆' },
  { id: 'bugs', name: 'Bug Reports', icon: '🐛' },
  { id: 'feature', name: 'Feature Requests', icon: '✨' },
];

export default function NewThreadPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isValid = title.trim().length >= 10 && category && body.trim().length >= 20;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);
    setTimeout(() => {
      router.push('/forum');
    }, 800);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem', fontSize: '0.8rem', color: '#64748b' }}>
        <Link href="/forum" style={{ color: '#38bdf8' }}>Forum</Link>
        <span>›</span>
        <span style={{ color: '#94a3b8' }}>New Thread</span>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#f1f5f9', marginBottom: '0.4rem' }}>
          Create New Thread
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
          Share a question, insight, or discussion with the community.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Category */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Category <span style={{ color: '#f87171' }}>*</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    border: `1px solid ${category === cat.id ? '#38bdf8' : 'rgba(255,255,255,0.08)'}`,
                    background: category === cat.id ? 'rgba(56,189,248,0.1)' : '#1e293b',
                    color: category === cat.id ? '#38bdf8' : '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 150ms ease',
                  }}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Title <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Be specific and descriptive (min. 10 characters)"
              style={{
                width: '100%',
                background: '#1e293b',
                border: `1px solid ${title.length > 0 && title.length < 10 ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '8px', color: '#f1f5f9',
                padding: '10px 14px', fontSize: '0.9rem', outline: 'none',
              }}
            />
            {title.length > 0 && title.length < 10 && (
              <p style={{ fontSize: '0.72rem', color: '#f87171', marginTop: '4px' }}>Title must be at least 10 characters.</p>
            )}
          </div>

          {/* Body */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Content <span style={{ color: '#f87171' }}>*</span>
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Describe your question or topic in detail. Use ``` for code blocks."
              rows={10}
              style={{
                width: '100%',
                background: '#1e293b',
                border: `1px solid ${body.length > 0 && body.length < 20 ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '8px', color: '#f1f5f9',
                padding: '12px 14px', fontSize: '0.875rem', outline: 'none',
                resize: 'vertical', lineHeight: 1.7,
                fontFamily: 'DM Sans, system-ui, sans-serif',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              {body.length > 0 && body.length < 20 && (
                <p style={{ fontSize: '0.72rem', color: '#f87171' }}>Content must be at least 20 characters.</p>
              )}
              <span style={{ fontSize: '0.72rem', color: '#475569', marginLeft: 'auto' }}>{body.length} chars</span>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tags <span style={{ color: '#475569' }}>(optional)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="e.g. python, dp, graphs (comma-separated)"
              style={{
                width: '100%',
                background: '#1e293b',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px', color: '#f1f5f9',
                padding: '10px 14px', fontSize: '0.875rem', outline: 'none',
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
            <Link href="/forum" style={{
              padding: '10px 20px', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
            }}>Cancel</Link>
            <button
              type="submit"
              disabled={!isValid || submitting}
              style={{
                padding: '10px 24px', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 700,
                background: isValid && !submitting ? '#38bdf8' : 'rgba(56,189,248,0.3)',
                border: 'none',
                color: isValid && !submitting ? '#0f172a' : '#64748b',
                cursor: isValid && !submitting ? 'pointer' : 'not-allowed',
                transition: 'all 150ms ease',
              }}
            >
              {submitting ? 'Posting…' : 'Post Thread'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
