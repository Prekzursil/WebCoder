// Catalog table skeleton [SPEC-GAPS A11]: Suspense fallback for the
// URL-filtered client island (and a layout-matching placeholder instead of a
// bare spinner). Server-safe; uses the shared .skeleton shimmer class.

export default function ProblemsTableSkeleton() {
  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem' }} aria-busy="true" aria-label="Loading problems">
      <div
        className="skeleton"
        style={{ height: '2.25rem', width: '180px', marginBottom: '1.5rem' }}
      />
      <div
        className="skeleton"
        style={{ height: '58px', marginBottom: '1.25rem', borderRadius: 'var(--radius-lg)' }}
      />
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '0.5rem 0',
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="skeleton"
            style={{
              height: '46px',
              margin: '0.25rem 20px',
              borderRadius: 'var(--radius-sm)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
