'use client';

import ProtectedRoute from '@/components/common/ProtectedRoute';
import ProblemFormPage from '../../_components/ProblemFormPage';



// Route port of CRA App.tsx:37 — /problems/:problemId/edit -> ProblemFormPage
// guarded by [ADMIN, PROBLEM_CREATOR, PROBLEM_VERIFIER]. The problemId route
// param is read inside ProblemFormPage via useParams(); its presence switches
// the form into edit mode.

const AUTHORING_ROLES = ['ADMIN', 'PROBLEM_CREATOR', 'PROBLEM_VERIFIER'];

export default function EditProblemPage() {
  return (
    <ProtectedRoute roles={AUTHORING_ROLES}>
      <ProblemFormPage />
    </ProtectedRoute>
  );
}
