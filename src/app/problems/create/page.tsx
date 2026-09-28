'use client';

import ProtectedRoute from '@/components/common/ProtectedRoute';
import ProblemFormPage from '../_components/ProblemFormPage';

// Route port of CRA App.tsx:36 — /problems/create -> ProblemFormPage guarded
// by [ADMIN, PROBLEM_CREATOR, PROBLEM_VERIFIER]. The static segment "create"
// wins over the sibling dynamic [problemId] segment (App Router precedence),
// so no route conflict exists with /problems/[problemId].

const AUTHORING_ROLES = ['ADMIN', 'PROBLEM_CREATOR', 'PROBLEM_VERIFIER'];

export default function CreateProblemPage() {
  return (
    <ProtectedRoute roles={AUTHORING_ROLES}>
      <ProblemFormPage />
    </ProtectedRoute>
  );
}
