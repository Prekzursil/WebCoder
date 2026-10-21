import React from 'react';

// Shared empty-state component [SPEC-GAPS A11]: replaces the bare centered
// gray text blocks with a consistent card: icon, title, optional description
// and optional call-to-action. Plain (server-safe) — colors via CSS vars.
interface EmptyStateProps {
  title: string;
  description?: string;
  /** Glyph or icon element rendered above the title. */
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export default function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div
      style={{
        padding: '3rem 1.5rem',
        textAlign: 'center',
        color: 'var(--muted)',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
      }}
      role="status"
    >
      {icon && (
        <span style={{ fontSize: '1.75rem', lineHeight: 1, color: 'var(--text-tertiary)' }} aria-hidden="true">
          {icon}
        </span>
      )}
      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--muted)' }}>{title}</div>
      {description && (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', maxWidth: '420px' }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: '0.75rem' }}>{action}</div>}
    </div>
  );
}
