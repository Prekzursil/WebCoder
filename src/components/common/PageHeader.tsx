// Shared page header [SPEC-GAPS A12]: emits the centralized pageTitle /
// subtitle ramp so pages stop hand-rolling the same 1.75rem/800/-0.03em
// recipe. Plain (server-safe).
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div
      style={{
        marginBottom: '1.5rem',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'var(--foreground)',
            margin: 0,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
