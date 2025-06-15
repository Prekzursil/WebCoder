// Shared type definitions for the WebCoder frontend

export interface TestCaseType { 
  id?: number; 
  input_data: string;
  expected_output_data: string;
  is_sample: boolean;
  points: number;
  order?: number; 
}

export interface TestCaseUIManaged extends TestCaseType { 
  local_id?: string; 
}

export interface TagType { 
  id: number; 
  name_i18n: { [key: string]: string }; 
  slug: string; 
}

export interface ProblemType { 
  id: number;
  title_i18n: { [key: string]: string };
  difficulty: string;
  status: string;
  statement_i18n?: { [key: string]: string }; 
  default_time_limit_ms?: number;
  default_memory_limit_kb?: number;
  test_cases?: TestCaseType[]; 
  allowed_languages?: string[];
  custom_libraries_allowed?: string[]; // Added this based on backend model
  comparison_mode?: string;
  float_comparison_epsilon?: number | null;
  checker_code?: string | null;
  checker_language?: string | null;
  tag_ids?: number[]; 
  tags?: TagType[]; 
  verifier_feedback?: string | null;
  author?: {id: number; username: string}; 
}

export interface SubmissionType { 
  id: number;
  problem: { id: number; title_i18n: { [key: string]: string } }; 
  language: string;
  verdict: string;
  submission_time: string;
  score?: number | null;
}

export interface SubmissionTestResultType {
  id: number;
  test_case_details: {
    id: number;
    order?: number;
    is_sample: boolean;
    points: number;
  };
  verdict: string;
  execution_time_ms?: number | null;
  memory_used_kb?: number | null;
  actual_output?: string | null;
  error_output?: string | null;
}

export interface DetailedSubmissionType extends SubmissionType {
  code: string;
  detailed_feedback?: string;
  execution_time_ms?: number | null;
  memory_used_kb?: number | null;
  user?: { username: string; id: number }; 
  test_results?: SubmissionTestResultType[];
}

export interface User {
  id: number;
  username: string;
  email: string;
  role: 'BASIC_USER' | 'PROBLEM_CREATOR' | 'PROBLEM_VERIFIER' | 'ADMIN';
}

export interface AdminUserType extends User {
    is_staff: boolean;
    is_active: boolean;
    date_joined: string;
    first_name?: string;
    last_name?: string;
}
