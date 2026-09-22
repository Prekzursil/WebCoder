// App Router loading boundary for the /problems catalog (and the detail route
// nested under it) — replaces the CRA client-side `<LoadingSpinner />` return
// while the list/detail fetch is in flight (ProblemsListPage.tsx:32,
// ProblemDetailPage.tsx:91). Rendering the ported client spinner keeps the
// visual identical to the CRA app.

import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function ProblemsLoading() {
  return <LoadingSpinner />;
}
