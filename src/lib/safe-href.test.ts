import { describe, expect, it } from 'vitest';
import { safeApiHref } from './safe-href';

// CodeQL guard: the export URL must only ever point at the configured API
// origin; everything else collapses to '#'.

describe('safeApiHref', () => {
  it('passes same-origin API URLs through', () => {
    const ok = safeApiHref('http://localhost:8000/api/v1/classroom/assignments/3/export/');
    expect(ok).toBe('http://localhost:8000/api/v1/classroom/assignments/3/export/');
  });

  it('collapses foreign origins, dangerous schemes and junk', () => {
    expect(safeApiHref('https://evil.example.com/x')).toBe('#');
    expect(safeApiHref('javascript:alert(1)')).toBe('#');
    expect(safeApiHref('data:text/html;base64,xxx')).toBe('#');
    expect(safeApiHref('//evil.example.com')).toBe('#');
    expect(safeApiHref('')).toBe('#');
    expect(safeApiHref(undefined)).toBe('#');
  });

  it('resolves relative API paths against the API origin', () => {
    const resolved = safeApiHref('/api/v1/classroom/assignments/3/export/');
    expect(resolved).toBe(
      'http://localhost:8000/api/v1/classroom/assignments/3/export/'
    );
  });
});
