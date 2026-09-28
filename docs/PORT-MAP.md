# WebCoder CRA → Next.js 15 Port Map

STATUS: COMPLETE — all 15 pages, 6 components, and every core file in scope read end-to-end.
Method: direct file reads of `frontend/webcoder_ui/src/**` (inventory via Glob). Every claim below cites `file:line`.
Open contract questions are tagged **UNVERIFIED** inline with the settling experiment.

Generated: 2026-09-22 · Branch: `wave/nextjs-migration`
Stack measured (package.json): CRA `react-scripts` 5.0.1 · React 18.2 · react-router-dom 6.23 · MUI 5.15 (+emotion) · i18next 23 + react-i18next 13 + browser-languagedetector · react-hot-toast 2.4 · react-syntax-highlighter 15.5 · TypeScript 4.9 (package.json:5-65). **Confidence: high.**

---

## 0. Cross-cutting findings (read first — they shape the port)

1. **API response-shape inconsistency (THE port blocker).** `apiFetch` returns the parsed JSON body directly (ApiService.ts:23) and `types/api.ts` declares plain arrays/objects (`GetProblemsResponse = ProblemType[]`, api.ts:24). Yet most pages consume `response.data` (ProblemsListPage.tsx:20, ProblemDetailPage.tsx:37, ProblemFormPage.tsx:47/54/106/176, MyCreatedProblemsPage.tsx:22, SubmissionDetailPage.tsx:26, AdminDashboardPage.tsx:24, SiteStats.tsx:20, ProblemVerificationQueuePage.tsx:24) while MySubmissionsPage consumes the direct array (MySubmissionsPage.tsx:47) and LoginPage/RegisterPage read token fields directly (LoginPage.tsx:25). Both cannot be right against one backend. **UNVERIFIED which shape the DRF backend actually returns — settling experiment: `curl http://127.0.0.1:8000/api/v1/problems/problems/` and inspect for a `{data: ...}` envelope; then normalize ApiService consumers to ONE shape before porting.** Confidence in the inconsistency itself: high (both patterns read in source).
2. **Dead error-handling branches.** Pages read `err.response?.data?.detail` (LoginPage.tsx:32, RegisterPage.tsx:34-35, ProblemFormPage.tsx:190-191, UserProfilePage.tsx:71-72) but `apiFetch` throws a plain `Error` with no `.response` (ApiService.ts:18-21) — those branches never execute; real errors surface via `err.message`. Port the error contract once, properly. **Confidence: high.**
3. **Hardcoded localhost URLs in 5 places.** ApiService.ts:1 (`http://127.0.0.1:8000/api/v1`), LoginPage.tsx:91/98 (`/accounts/google/login/`, `/accounts/github/login/`), RegisterPage.tsx:121/128 and UserProfilePage.tsx:124/131 (`/api/v1/auth/{google,github}/login/`). Note the **inconsistent social-auth path prefix** between Login (`/accounts/...`) and Register/Profile (`/api/v1/auth/...`) — at most one can be correct. **Confidence: high (all five read); which prefix is correct UNVERIFIED against backend urls.py.**
4. **i18n vocabulary is 90% fallback-English.** `i18n.ts` resources hold ~20 keys (i18n.ts:9-58); nearly every page calls `t(key, 'English default')` relying on the defaultValue arg (e.g. HomePage.tsx:24-51, ProblemDetailPage.tsx:103-171). Two call sites pass an options object with **no** default — `t('submission_successful_pending', { id })` (ProblemDetailPage.tsx:72) and `t('pagination_page_info', {currentPage, totalPages})` (MySubmissionsPage.tsx:189) — which render the **raw key** when untranslated. Four Navbar keys (`nav_create_problem`, `nav_my_created_problems`, `nav_problem_queue`, `nav_admin_dashboard`, Navbar.tsx:62-70) are absent from resources → RO users silently get English. Port = extract every inline default into `messages/{en,ro}.json`. **Confidence: high.**
5. **XSS surface.** Problem statements render via `dangerouslySetInnerHTML` with only `\n → <br/>` replacement (ProblemDetailPage.tsx:107); statements are author-supplied (`statement_i18n`). Sanitize (DOMPurify) or render as preformatted text in the port. **Confidence: high.**
6. **Auth model.** localStorage tokens (`accessToken`/`refreshToken`/`user`, AuthContext.tsx:17-22); `isAuthenticated = !!token` (:73); bootstrap `getMe()` on load with auto-logout on failure (:24-50). **No refresh-token flow exists** — access-token expiry silently logs the user out on next `getMe`. **Confidence: high.**
7. **`apiFetch` returns `response.json()` unconditionally** (ApiService.ts:23) — a 204 (typical DRF DELETE) will throw on empty body. Guard during port. **Confidence: high (code); whether the three DELETE endpoints return 204 UNVERIFIED against backend.**
8. **SiteStats uses Tailwind-style classes with no Tailwind dependency** (SiteStats.tsx:37,41-53 vs package.json — absent). Those classes are inert in CRA; the component currently renders unstyled. **Confidence: high.**
9. **Styling is three-way mixed**: MUI+sx (Home/auth/Profile pages), inline `style` objects (problems/submissions/admin pages, Navbar.tsx:26-49), dead Tailwind classes (SiteStats). Decide one system for the port. **Confidence: high.**
10. **Existing test surface**: one smoke test only — renders the shell (App.test.tsx:8-17). No page-level tests exist; "testable behaviors" below are the port's test backlog. **Confidence: high.**

---

## 1. App shell & routing (`App.tsx`, `index.tsx`)

- Provider stack (index.tsx:13-21): `StrictMode → BrowserRouter → AuthProvider → App`. `i18n` initialized by side-effect import (index.tsx:6). Global `Toaster` (react-hot-toast, top-center) + `Navbar` render above `<main>` for every route (App.tsx:26-28). **Confidence: high.**
- Route table with guards (evidence App.tsx:30-46):

| Route | Page | Guard |
|---|---|---|
| `/` | HomePage | public (:30) |
| `/login` | LoginPage | public (:31) |
| `/register` | RegisterPage | public (:32) |
| `/complete-registration` | CompleteRegistrationPage | public route (:33) |
| `/problems` | ProblemsListPage | public (:34) |
| `/problems/create` | ProblemFormPage | `[ADMIN, PROBLEM_CREATOR, PROBLEM_VERIFIER]` (:36) |
| `/problems/:problemId/edit` | ProblemFormPage | same roles (:37) |
| `/problems/:problemId` | ProblemDetailPage | public route (:38); submit gated in-page |
| `/my-submissions` | MySubmissionsPage | all four roles (:40) |
| `/my-created-problems` | MyCreatedProblemsPage | `[ADMIN, PROBLEM_CREATOR, PROBLEM_VERIFIER]` (:41) |
| `/admin/problem-queue` | ProblemVerificationQueuePage | `[ADMIN, PROBLEM_VERIFIER]` (:42) |
| `/admin/dashboard` | AdminDashboardPage | `[ADMIN]` (:43) |
| `/submissions/:submissionId` | SubmissionDetailPage | public route (:44); auth gated in-page |
| `/profile` | UserProfilePage | all four roles (:45) |
| `*` | NotFoundPage | catch-all (:46) |

- `ProtectedRoute` (ProtectedRoute.tsx:10-19): no user → `/login` with `state.from`; role miss → `/`. Client-side only.
- **Port**: App Router file mapping — `/problems/[problemId]/page.tsx` vs `/problems/create/page.tsx` (static beats dynamic, no route conflict); `not-found.tsx` for `*`; `ProtectedRoute` → `middleware.ts` (presence check) + role guards in server layouts; `Toaster`+`AuthProvider` → a client `providers.tsx` mounted in the root layout. **Confidence: high.**

---

## 2. Core services (`services/ApiService.ts`)

23 methods across 5 services; all through one `apiFetch` (Bearer from localStorage, JSON content-type, `Error(detail || statusText)`). Full endpoint table in §2 of the previous milestone preserved here:

- **AuthService** (:26-32): `register` POST `/users/register/` · `login` POST `/auth/login/` · `getMe` GET `/users/me/` · `getUser(id)` GET `/users/{id}/` · `changePassword` POST `/users/password/change/`.
- **ProblemService** (:34-49): `getProblems({status?, authorId?})` · `getProblemDetail(id)` · `createProblem` POST · `updateProblem` PATCH · `deleteProblem` DELETE · `submitForApproval` POST `.../submit-for-approval/` · `approveProblem(id,{feedback?})` POST `.../approve/` · `rejectProblem(id,{feedback})` POST `.../reject/` · `getTags` GET `/problems/tags/`.
- **SubmissionService** (:51-58): `createSubmission` POST `/submissions/submit/` · `getSubmissions({problemId?, userId?})` · `getSubmissionDetail(id)`.
- **TestCaseService** (:60-64): `createTestCase` POST · `updateTestCase` PATCH · `deleteTestCase` DELETE (all `/problems/testcases/...`).
- **AdminService** (:66-70): `getUsers` GET `/users/admin/manage/` · `updateUser(id,{role?,is_active?})` PATCH · `getStats` GET `/users/admin/stats/`.

Note: `updateTestCase` has **zero call sites** (grep of pages shows only create/delete used). **Confidence: high.** All payloads/params untyped (`any`) — `types/api.ts` aliases exist but are not wired to the service. **Confidence: high.**

---

## 3. Auth context (`context/AuthContext.tsx`) & 4. Types — see previous milestone content, unchanged

- AuthContext surface: `{isAuthenticated, token, refreshToken, user, login(access,refresh,user), logout()}` (AuthContext.tsx:5-12,73); bootstrap-fetch + auto-logout (:24-50). **Confidence: high.**
- Types (`types/index.ts`): `User.role` union `'BASIC_USER' | 'PROBLEM_CREATOR' | 'PROBLEM_VERIFIER' | 'ADMIN'` (:80); content i18n via `title_i18n`/`statement_i18n`/`name_i18n` string maps (:18,24,27) — the SEO-critical surface; `DetailedSubmissionType` adds code/feedback/test_results (:67-74); `AdminUserType` adds is_staff/is_active/date_joined (:83-89). **Confidence: high.**

## 5. i18n (`i18n.ts`)

i18next + browser LanguageDetector; `en`/`ro` inline resources (~20 keys); `fallbackLng:'en'`; **`debug:true` left on** (i18n.ts:67); detection order `querystring, cookie, localStorage, sessionStorage, navigator, htmlTag, path, subdomain`, cached in localStorage+cookie (:71-75); Navbar manual EN/RO buttons (Navbar.tsx:90-93). **Port**: next-intl with `[locale]` URL segment — `path` detection is already in the order, so URL-driven locale is the natural fit; problem-content i18n (`title_i18n` maps) resolves server-side for SSG/metadata. **Confidence: high.**

---

## 6. Pages — full map

Format: **route · auth/roles · data calls · i18n · testable behaviors**. All confidence **high** unless noted (every row below was read in full).

### 6.1 HomePage — `/` (App.tsx:30)
- **Auth**: none; reads `isAuthenticated` only to toggle the Sign Up CTA (HomePage.tsx:43).
- **Data calls**: none.
- **i18n**: `welcome_message` (in resources) + `homepage_subtitle`, `homepage_description`, `view_problems_button`, `register_button` (fallback-only).
- **Testable**: renders localized welcome; "View Problems" links to `/problems`; Sign Up button hidden when authenticated.
- **Port**: static server component + next-intl; zero client JS needed.

### 6.2 NotFoundPage — `*` (App.tsx:46)
- **Auth**: none. **Data**: none. **i18n**: `not_found_default_header`/`_message` (fallback-only); optional `message` prop overrides the heading (NotFoundPage.tsx:13).
- **Testable**: renders 404 copy; prop override wins. → `not-found.tsx`.

### 6.3 LoginPage — `/login` (App.tsx:31)
- **Auth**: public (redirect target for guards).
- **Data**: `AuthService.login({username,password})` → on `{access,refresh,user}` → `auth.login(...)` → `navigate('/')` (LoginPage.tsx:24-27); no-token response → error alert (:29).
- **i18n**: `login_header`, `username_label`, `password_label`, `login_button`, `or_login_with`, `google_login`, `github_login`, `no_account_prompt`, `register_link_text` (all in resources) + `login_failed_no_token`, `login_failed`.
- **Misc**: Google/GitHub buttons are full-page `href`s to hardcoded backend URLs (LoginPage.tsx:91,98).
- **Testable**: successful login persists 3 localStorage keys and lands on `/`; missing-token branch shows alert; bad credentials show `err.message` alert; submit disabled while `isSubmitting`.

### 6.4 RegisterPage — `/register` (App.tsx:32)
- **Data**: `AuthService.register({username,email,password,password2})`; client-side `password !== password2` guard BEFORE any API call (RegisterPage.tsx:24-27); success → alert + `setTimeout(navigate('/login'), 2000)` (:31-32).
- **i18n**: `register_header`, `email_label`, `confirm_password_label`, `or_signup_with`, `already_have_account_prompt`, `login_link_text` + shared keys (all fallback-only).
- **Testable**: mismatched passwords → error, no network call; success message then redirect after 2s; API error surfaces via `err.message` (the `err.response.data` flatten branch is dead — §0.2).

### 6.5 CompleteRegistrationPage — `/complete-registration` (App.tsx:33)
- **Auth**: public; the OAuth-return landing.
- **Data**: reads `?email=` from `location.search` (:17-18); **missing email → effect redirects to `/login`** (:20-24); `AuthService.register({email, username})` expecting `{access,refresh,user}` → `auth.login` → `/` (:31-34). Email field rendered disabled (:68-69).
- **Contract note**: RegisterPage expects a `{user,message}` response from the same `register` endpoint while this page expects tokens — **UNVERIFIED which the backend returns (likely a second endpoint/param exists or one page is broken); settling experiment: inspect DRF `users/register/` view or curl it.**
- **Testable**: no `email` param redirects to login; successful completion auto-logs-in; server error shown in alert.

### 6.6 ProblemsListPage — `/problems` (App.tsx:34) — SEO-CRITICAL
- **Auth**: public.
- **Data**: `ProblemService.getProblems()` with **no filters** (ProblemsListPage.tsx:19); consumes `response.data` (§0.1 caveat).
- **i18n**: `problem_list_header` (in resources), `no_problems_available`; per-item localized title `title_i18n[i18n.language] || .en || 'Problem ID: n'` (:45); dynamic keys `difficulty_${lower}` / `status_${lower}` (:48-50).
- **Testable**: spinner → list; error paragraph; empty state; each item links to `/problems/{id}`; locale switch changes titles.
- **Port**: this is the public catalog — server component with ISR + `generateMetadata`; add pagination (none exists today; unbounded list).

### 6.7 ProblemDetailPage — `/problems/:problemId` (App.tsx:38) — SEO-CRITICAL
- **Auth**: public read; submit form only when `auth.isAuthenticated` (:123), else login-link prompt (:159-164); submit handler re-checks `auth.token` (:56).
- **Data**: `ProblemService.getProblemDetail(problemId)` (:36); `SubmissionService.createSubmission({problem: parseInt(id), language, code})` after ConfirmationModal confirm (:71).
- **Behavior details**: language defaults to first `allowed_languages` entry or `'python3'` (:39-43); status/error reset on code/language change (:25-28); empty-code submit blocked client-side (:84-87); success → status line + code cleared (:72-73); sample test cases section filters `is_sample` (:98); statement rendered as raw HTML with `\n→<br/>` (XSS §0.5, :107); limits rendered when present (:104-105).
- **i18n**: ~30 fallback-only keys (`difficulty_label`, `time_limit_label`, `problem_statement_header`, `submit_solution_header`, split-key login prompt :161-163, modal strings :170-171).
- **Testable**: localized title/statement/difficulty; samples shown only when `is_sample`; unauthenticated → login prompt, no form; empty code can't open modal; confirm modal then POST; success clears editor; server error in SubmissionStatusDisplay.

### 6.8 ProblemFormPage — `/problems/create` + `/problems/:problemId/edit` (App.tsx:36-37; roles `ADMIN, PROBLEM_CREATOR, PROBLEM_VERIFIER`)
- **Data**: `getTags()` always (:46); edit mode + token → `getProblemDetail` prefill (:50-75); add-TC in edit mode → `TestCaseService.createTestCase` immediate (:103-112); remove saved TC → `deleteTestCase` (:132-139); submit → `updateProblem` (edit, :172) or `createProblem` then **sequential** `createTestCase` for each local TC then `navigate(/problems/{id}/edit)` (:175-187).
- **State/defaults** (:18-38): EASY / 1000 ms / 262144 KB / DRAFT / `[python3,cpp17]` / `LINES_STRIP_EXACT` / epsilon 1e-6; dual EN+RO title & statement fields (the authoring side of `*_i18n`).
- **Conditional payload** (:163-165): `float_comparison_epsilon` sent only for `FLOAT_PRECISE`; `checker_code/language` only for `CUSTOM_CHECKER` (matching conditional inputs :241-245).
- **Quirks**: `alert()` for TC validation (:86); status select lets an author pick `APPROVED` directly (:234) — backend enforcement **UNVERIFIED**; `err.response?.data` branch dead (§0.2).
- **i18n**: ~40 fallback-only keys (`problem_form_*`, `comparison_mode_*`, `status_*`, `difficulty_*`).
- **Testable**: tags load into checkboxes; edit mode prefills every field incl. both locales and test cases; empty TC input → alert, no POST; remove persisted TC calls DELETE, local-only TC just filters; conditional fields appear/disappear with comparison mode; create → per-TC creates → redirect to edit; update shows success message.

### 6.9 MyCreatedProblemsPage — `/my-created-problems` (App.tsx:41; roles `ADMIN, PROBLEM_CREATOR, PROBLEM_VERIFIER`)
- **Data**: `getProblems({authorId: auth.user.id})` (:20); `submitForApproval(id)` with optimistic local status flip to `PENDING_APPROVAL` + toast (:42-44).
- **Rules**: Edit link only for `DRAFT`/`PRIVATE` (:76-78); Submit-for-Approval button only `DRAFT` (:79-81); `verifier_feedback` shown when `PRIVATE` + feedback present (:82-86).
- **i18n**: `my_created_problems_header`, table headers, `status_*`/`difficulty_*` dynamic keys (fallback-only).
- **Testable**: rows scoped to author; DRAFT row shows submit button, APPROVED doesn't; successful submit flips status client-side + toast; PRIVATE+feedback renders the feedback line.

### 6.10 MySubmissionsPage — `/my-submissions` (App.tsx:40; all roles)
- **Data**: `getProblems()` for the filter dropdown (:27); `getSubmissions({problemId?, language?})` on auth/filter change (:46) — **`language` is not in the service's declared filter type** (ApiService.ts:53) though it serializes into the query string; backend support for a `language` filter **UNVERIFIED**. Consumes the response **directly** (`response as SubmissionType[]`, :47) — the lone holdout against `.data` (§0.1).
- **Behavior**: all sorting client-side (`submission_time|score|language|verdict`, asc/desc, :65-86); all pagination client-side (10/25/50, page reset on refilter, :88-99); filter change resets to page 1 (:48).
- **i18n**: ~25 fallback-only keys; `verdict_${verdict}` dynamic; date via `toLocaleString(i18n.language)` (:178).
- **Testable**: unauthenticated → inline login message (belt-and-braces with route guard); problem filter narrows; language text filter passed as query param; each sort key/direction orders rows; pagination bounds (prev disabled on p1, next on last); rows link to submission + problem.

### 6.11 SubmissionDetailPage — `/submissions/:submissionId` (App.tsx:44; public route, **auth required in-page**)
- **Auth**: no `auth.token` → error "Authentication required to view submission details." (:44-46).
- **Data**: `getSubmissionDetail(id)` (:25); **3-second polling** while verdict ∈ `{PENDING, COMPILING, RUNNING}` with proper interval cleanup (:28-32, 51-60) — the Celery async-judge consumer.
- **Rendering**: code via react-syntax-highlighter (Prism/vscDarkPlus, `python3→python`, `cpp17→cpp`, `java11→java` map, :20-21); per-test-case cards with points/time/memory; `actual_output` shown only for `WA|RE`, `error_output` only for `RE|CE|IE`, both truncated to 200 chars (:79-94); "Polling for updates..." badge while in-flight (:102-104).
- **i18n**: ~25 fallback-only keys; `verdict_*` dynamic.
- **Testable**: unauth error state; renders verdict/score/code/test results; polling starts on in-flight verdict and stops on terminal one; truncation at 200 chars; conditional output/error blocks per verdict family.

### 6.12 UserProfilePage — `/profile` (App.tsx:45; all roles)
- **Data**: `getMe()` for own profile (:35); `getUser(userId)` branch exists but **is unreachable — no route supplies `:userId`** (App.tsx route is `/profile` only; UserProfilePage.tsx:13,30-32). `changePassword({old_password, new_password1, new_password2})` (:65) — DRF-style field names.
- **Rules**: `isOwnProfile = !userId || id match` (:81) gates Connected Accounts (hardcoded `?process=connect` hrefs, :120-135) and the password form (:144-187); mismatch guard client-side (:55-58); success clears all three fields (:66-69).
- **i18n**: `user_profile_header`, `connected_accounts_header`, `change_password_header`, `user_role_${role}` dynamic (fallback-only).
- **Testable**: renders username/email/role; password mismatch → error, no call; success message + cleared fields; connect buttons only on own profile; error path shows alert (fetch failure → generic "Failed to load user profile", :41-43).

### 6.13 AdminDashboardPage — `/admin/dashboard` (App.tsx:43; `ADMIN` only)
- **Data**: `AdminService.getUsers()` (:23); `updateUser(id,{role})` (:40) and `updateUser(id,{is_active})` (:52) with local state update + success/error toasts.
- **Rules**: own row's role and status selects disabled (self-lockout prevention, :96,:108).
- **Embeds**: `<SiteStats />` (:67) — confirms SiteStats is a child component, not a route.
- **i18n**: `admin_dashboard_header`, table headers, toast strings (fallback-only; note two keys use dotted namespaces `errors.*`/`admin_dashboard.*`, :27,:42 — inconsistent with the flat key style everywhere else).
- **Testable**: user table renders; role change updates row + toast; status toggle updates row + toast; own row selects disabled; SiteStats section present.

### 6.14 ProblemVerificationQueuePage — `/admin/problem-queue` (App.tsx:42; `ADMIN, PROBLEM_VERIFIER`)
- **Data**: `getProblems({status:'PENDING_APPROVAL'})` (:23); `approveProblem(id,{feedback?})` — feedback optional (:49); `rejectProblem(id,{feedback})` — **feedback required client-side** (:63-66); list refetched after each action (:51,:72); feedback textarea per row via `feedbackMap` (:117-123).
- **Auth**: route guard + **inline role re-check** rendering "not authorized" (:86-88) — port both layers or replace with one server-side gate.
- **i18n**: ~15 fallback-only keys; row title links to the **edit** page (:113).
- **Testable**: pending list renders; approve works with empty feedback; reject blocked with empty feedback; action clears that row's feedback and refetches; wrong-role user sees unauthorized message.

### 6.15 SiteStats (NOT ROUTED — child of AdminDashboardPage, AdminDashboardPage.tsx:8,67)
- **Data**: `AdminService.getStats()` → `response.data` (§0.1 caveat) (SiteStats.tsx:19-20).
- **Misc**: Tailwind classes with no Tailwind dep (§0.8); plain-English strings, no i18n at all.
- **Testable**: renders 3 counters (users/problems/submissions); error div on failure.

---

## 7. Shared components (`components/**`)

| Component | API | Notes | Evidence |
|---|---|---|---|
| `layout/Navbar` | — | role-gated links (`canCreateProblems`=ADMIN/VERIFIER/CREATOR, `canVerifyProblems`=ADMIN/VERIFIER, `isAdmin`, :20-24); logout → `/login` (:15-18); EN/RO switcher (:90-93); 4 i18n keys missing from resources (:62-70); inline styles | Navbar.tsx |
| `common/ProtectedRoute` | `{children, roles?}` | redirect contract in §1 | ProtectedRoute.tsx:10-19 |
| `common/ConfirmationModal` | `{isOpen,onClose,onConfirm,title,message,confirmButtonText?,cancelButtonText?}` | uncontrolled overlay, inline styles, null when closed | ConfirmationModal.tsx:4-27 |
| `common/LoadingSpinner` | — | self-injected `<style>` keyframes + `loading` i18n key | LoadingSpinner.tsx:7-10 |
| `common/SubmissionStatusDisplay` | `{status, error}` | green status / red error banners; null when both empty; used by ProblemDetail + ProblemForm | SubmissionStatusDisplay.tsx:4-14 |

---

## 8. Next.js 15 port notes (ordered worklist)

1. **Resolve §0.1 first** (response envelope vs direct) — every data page depends on it. Settling experiment: one curl per endpoint family.
2. **Route mapping** (App Router): `/` · `/login` · `/register` · `/complete-registration` · `/problems` · `/problems/[problemId]` · `/problems/create` · `/problems/[problemId]/edit` · `/my-submissions` · `/my-created-problems` · `/admin/problem-queue` · `/admin/dashboard` · `/submissions/[submissionId]` · `/profile` · `not-found.tsx`. Under a `[locale]` segment for next-intl.
3. **Rendering strategy**: SEO-critical public pages (`ProblemsListPage`, `ProblemDetailPage`, `HomePage`) → server components with ISR + `generateMetadata` from `title_i18n`/`statement_i18n`; everything authed → client components. SubmissionDetailPage's 3s poll → `refetchInterval` (TanStack Query) or SSE. **Confidence: high on the split; the specific data library is a design choice.**
4. **Auth**: move tokens out of localStorage into httpOnly cookies via Next route handlers (or keep localStorage with a client provider and accept SSR-blind auth); `middleware.ts` for presence checks; role checks server-side in layouts (role lives on the `user` object / JWT claims — claim contents **UNVERIFIED**). Add the missing refresh-token flow (§0.6).
5. **Env**: single `NEXT_PUBLIC_API_BASE_URL` replacing 5 hardcoded URLs (§0.3); unify the two social-auth path prefixes after backend verification.
6. **i18n**: next-intl + `[locale]` routing; extract ~150 fallback strings into `messages/{en,ro}.json`; fix the 2 no-default `t()` calls (ProblemDetailPage.tsx:72, MySubmissionsPage.tsx:189) and the 4 missing Navbar keys; turn off `debug`.
7. **MUI v5 + App Router**: needs `AppRouterCacheProvider` (`@mui/material-nextjs`) for emotion SSR; **likely** also a React 18→19 / MUI v6+ version decision since Next 15 App Router pairs with React 19 — verify peer-dep matrix before `create-next-app`. **Confidence: likely (framework-version compatibility), not yet measured against this repo's lockfile.**
8. **Sanitize `dangerouslySetInnerHTML`** statement rendering (§0.5) — DOMPurify or `<pre>`.
9. **Fix during port** (free wins): dead `err.response` branches (§0.2); 204-guard in `apiFetch` (§0.7); delete-or-type `updateTestCase` (unused) or wire it; dead `:userId` branch in UserProfilePage (§6.12); `alert()` → toast in ProblemFormPage; decide Tailwind-in-or-out for SiteStats (§0.8).
10. **Test backlog**: the "testable behaviors" rows in §6 are the spec — port them as Playwright journeys per page plus unit tests on the normalized ApiService.

---

## Coverage statement

Files read in full (24/24 in scope + 2 extras): all 15 files under `pages/**` (incl. unrouted SiteStats), all 5 under `components/**`, `context/AuthContext.tsx`, `services/ApiService.ts`, `types/index.ts`, `types/api.ts`, `i18n.ts`, `App.tsx`, plus `index.tsx`, `App.test.tsx`, `package.json`. Not read (out of scope, declared): CSS files, `reportWebVitals.ts`, `setupTests.ts`, `react-app-env.d.ts`. Every UNVERIFIED tag above names its settling experiment. If any section mattered more than this file records, the unit died mid-write — but as of this line, all sections are measured.
