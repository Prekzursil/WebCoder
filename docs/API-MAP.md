# WebCoder DRF API Map

- **Generated:** 22.09.2026
- **Branch:** `wave/nextjs-migration` @ `40fda968` (evidence: `git log --oneline -1`)
- **Method:** static read of `backend/webcoder_api/urls.py`, `backend/{problems,submissions,users}/urls.py|views.py|serializers.py|models.py`, `backend/users/permissions.py`, `backend/submissions/tasks.py`, `backend/webcoder_api/{settings.py,celery.py}`, `backend/users/api/oauth/{google,github}/urls.py|views.py`, and the installed `dj_rest_auth` URLconfs in `backend/venv/Lib/site-packages/dj_rest_auth/urls.py` + `registration/urls.py`. No server was started; all rows are code-derived (confidence: high unless tagged otherwise).
- **Scope note:** the task named a `backend/control` app. **No such Django app exists.** `backend/control/` contains only two kombu `filesystem://` broker artifacts (`celery.exchange`, `celery.pidbox.exchange` — JSON queue/exchange stubs created by the Celery filesystem transport; evidence: `file` output = "JSON text data", dir listing, dated Jun 15 2025). All Celery wiring actually lives in `webcoder_api/celery.py`, `webcoder_api/settings.py:275-285`, and `submissions/tasks.py`. Confidence: high.

## Global conventions

| Item | Value | Evidence |
|---|---|---|
| Base prefix | `/api/v1/` | `webcoder_api/urls.py:30-32` |
| Auth (default DRF) | JWT Bearer only (`rest_framework_simplejwt.authentication.JWTAuthentication`); no `DEFAULT_PERMISSION_CLASSES` set → views without explicit permissions are AllowAny | `settings.py:234-244` |
| JWT config | HS256, access 5 min, refresh 1 day, `UPDATE_LAST_LOGIN`, `AUTH_HEADER_TYPES=("Bearer",)` | `settings.py:256-266` |
| Pagination | **None configured** — every list endpoint returns the full queryset (relevant for the Next.js problem catalog) | `settings.py:234-244` (no `DEFAULT_PAGINATION_CLASS` anywhere in REST_FRAMEWORK) |
| Router flavor | `DefaultRouter` → trailing slash optional (`/tags` == `/tags/`) and `.format` suffix routes exist (e.g. `.json`) | `problems/urls.py:8-11`, DRF DefaultRouter semantics |
| CORS | `http://localhost:3000` only | `settings.py:88-90` |
| DB | PostgreSQL (default port 5433 on this machine) | `settings.py:115-125` |

Root URLconf also mounts: `/` → 302 to `/api/v1/problems/`, `/admin/` (Django admin), `/accounts/` (allauth browser views, not JSON API) — `webcoder_api/urls.py:27-43`.

---

## 1. Problems app — prefix `/api/v1/problems/`

Router registration: `tags`, `problems`, `testcases` (`problems/urls.py:8-11`).

### 1.1 Tags (`TagViewSet` — `problems/views.py:11-22`)

| Method | Path | Auth | Serializer | Celery |
|---|---|---|---|---|
| GET | `/api/v1/problems/tags/` | AllowAny (read) | `TagSerializer` | none |
| POST | `/api/v1/problems/tags/` | IsAuthenticated (any user — TODO comment at views.py:19-20 says temporary) | `TagSerializer` | none |
| GET | `/api/v1/problems/tags/{id}/` | AllowAny | `TagSerializer` | none |
| PUT | `/api/v1/problems/tags/{id}/` | IsAuthenticated | `TagSerializer` | none |
| PATCH | `/api/v1/problems/tags/{id}/` | IsAuthenticated | `TagSerializer` | none |
| DELETE | `/api/v1/problems/tags/{id}/` | IsAuthenticated | `TagSerializer` | none |

Serializer fields: `id`, `name_i18n` (JSON dict `{"en":…, "ro":…}`), `slug` (`problems/serializers.py:7-10`; model `problems/models.py:6-22`).

### 1.2 Problems (`ProblemViewSet` — `problems/views.py:25-105`)

Auth matrix from `get_permissions` (`views.py:30-41`); queryset visibility from `get_queryset` (`views.py:55-68`): anonymous → APPROVED only; authenticated non-staff → APPROVED + own DRAFT/PENDING_APPROVAL; staff / role ADMIN / role VERIFIER → everything.

| Method | Path | Auth | Serializer | Celery |
|---|---|---|---|---|
| GET | `/api/v1/problems/` | AllowAny | `ProblemSerializer` | none |
| POST | `/api/v1/problems/` | IsAuthenticated + `IsProblemCreator` (role CREATOR/VERIFIER/ADMIN) | `ProblemSerializer`; `perform_create` forces `author=request.user` (views.py:48-53) | none |
| GET | `/api/v1/problems/{id}/` | AllowAny (object must pass queryset visibility) | `ProblemDetailSerializer` (adds nested `test_cases`) | none |
| PUT | `/api/v1/problems/{id}/` | IsAuthenticated + `ProblemObjectPermissions` | `ProblemSerializer` | none |
| PATCH | `/api/v1/problems/{id}/` | IsAuthenticated + `ProblemObjectPermissions` | `ProblemSerializer` | none |
| DELETE | `/api/v1/problems/{id}/` | IsAuthenticated + `ProblemObjectPermissions` | `ProblemSerializer` | none |
| POST | `/api/v1/problems/{id}/submit-for-approval/` | IsAuthenticated + `ProblemObjectPermissions` (author, DRAFT only) | none (plain `{'status': …}` response, views.py:70-79) | none |
| POST | `/api/v1/problems/{id}/approve/` | IsAuthenticated + `IsProblemVerifier` (role VERIFIER/ADMIN) | none (views.py:81-90) | none |
| POST | `/api/v1/problems/{id}/reject/` | IsAuthenticated + `IsProblemVerifier`; requires `feedback` in body | none (views.py:92-105) | none |

Object-permission rules (`users/permissions.py:33-61`): admin/verifier can edit anything; author can update/destroy/submit only own problems in DRAFT or PRIVATE (rejected) state.

Serializer fields (`problems/serializers.py:37-81`): `id, title_i18n, statement_i18n, author, author_id, verifier, status, difficulty, default_time_limit_ms, default_memory_limit_kb, allowed_languages, custom_libraries_allowed, comparison_mode, float_comparison_epsilon, checker_code, checker_language, creation_date, last_modified_date, tags, tag_ids` (+ `test_cases` on detail). Note `checker_code` is exposed in the **list** representation to anonymous users — flag for the public catalog (see Findings).

`TestCaseSerializer.to_representation` hides `expected_output_data` for non-sample test cases unless the requester is admin/verifier/problem author (`problems/serializers.py:17-35`) — so the anonymous `ProblemDetailSerializer` payload leaks only sample outputs. Confidence: high.

### 1.3 Test cases (`TestCaseViewSet` — `problems/views.py:108-145`)

| Method | Path | Auth | Serializer | Celery |
|---|---|---|---|---|
| GET | `/api/v1/problems/testcases/` | IsAuthenticated; optional `?problem_id=` filter (views.py:116-122) | `TestCaseSerializer` | none |
| POST | `/api/v1/problems/testcases/` | IsAuthenticated + manual `ProblemObjectPermissions.has_object_permission` on the parent problem (views.py:124-131) | `TestCaseSerializer` | none |
| GET | `/api/v1/problems/testcases/{id}/` | IsAuthenticated | `TestCaseSerializer` | none |
| PUT | `/api/v1/problems/testcases/{id}/` | IsAuthenticated + parent-problem object check (views.py:133-138) | `TestCaseSerializer` | none |
| PATCH | `/api/v1/problems/testcases/{id}/` | IsAuthenticated + parent-problem object check | `TestCaseSerializer` | none |
| DELETE | `/api/v1/problems/testcases/{id}/` | IsAuthenticated + parent-problem object check (views.py:140-145) | — | none |

Model fields (`problems/models.py:135-156`): `problem` FK, `input_data`, `expected_output_data`, `is_sample`, `points` (default 10), `order`.

---

## 2. Submissions app — prefix `/api/v1/submissions/`

Router registration: `submissions` (ReadOnly) + explicit `submit/` path (`submissions/urls.py:9-17`).

| Method | Path | View | Auth | Serializer | Celery |
|---|---|---|---|---|---|
| GET | `/api/v1/submissions/submissions/` | `SubmissionViewSet.list` | IsAuthenticated + `IsOwnerOrAdminForSubmission`; queryset: own submissions, admins (`is_staff` or role ADMIN) see all (views.py:18-27) | `SubmissionSerializer` (nested `test_results`) | none |
| GET | `/api/v1/submissions/submissions/{id}/` | `SubmissionViewSet.retrieve` | IsAuthenticated + `IsOwnerOrAdminForSubmission` | `SubmissionSerializer` | none |
| POST | `/api/v1/submissions/submit/` | `SubmissionCreateView` | IsAuthenticated | in: `SubmissionCreateSerializer` (`problem` id, `language`, `code`) — out: `SubmissionSerializer` (views.py:30-56) | **YES — `judge_submission_task.delay(submission.id)` at `submissions/views.py:45`** |

There is **no** update/patch/delete endpoint for submissions (ReadOnlyModelViewSet, `submissions/views.py:8`).

`SubmissionSerializer` fields (`submissions/serializers.py:35-65`): `id, user, problem (nested id+title_i18n), language, code, submission_time, verdict, execution_time_ms, memory_used_kb, score, detailed_feedback, test_results` (per-test: `test_case_details{id,order,is_sample,points}, verdict, execution_time_ms, memory_used_kb, actual_output, error_output`).

### Celery: `judge_submission_task` (`submissions/tasks.py:17-157`)

- Dispatch: only from `SubmissionCreateView.create` (`submissions/views.py:45`). No other producer exists (grep of `delay(`/`apply_async` across app code: single call site — confidence: high).
- Lifecycle written onto the `Submission` row: `PENDING → COMPILING → RUNNING → final verdict` with `select_for_update()` transactions at each transition (tasks.py:22-30, 43-54, 128-137). Final verdicts: `AC, WA, TLE, MLE, CE, RE, IE` (`submissions/models.py:12-23`).
- Per test case it creates a `SubmissionTestResult` row (verdict, time, memory, truncated outputs at 10 000 chars — tasks.py:112-120) and sums `points` for passed cases into `submission.score`.
- Execution sandbox: shells out to **Docker** (`docker run --rm -i` wrapped in `timeout --signal=SIGKILL`) with per-language images `python:3.11-slim`, `gcc:latest`, `openjdk:11-jre-slim` (`submissions/judge_utils/execution.py:39-81,118-129`). Custom checkers run the same way (`judge_utils/checkers.py`).
- Broker: `filesystem://` kombu transport with folders `celery_broker{,_processed,_sent}` beside `backend/` (`webcoder_api/celery.py:20-27`, `settings.py:276-285`). This is a dev-only transport — and the reason `backend/control/` exists as an exchange-artifact directory.
- Misc: `debug_task` exists (`webcoder_api/celery.py:32-34`) but is not HTTP-routed.

---

## 3. Users app — prefix `/api/v1/users/`

URL order matters: explicit paths precede `include(router.urls)` (`users/urls.py:12-19`), so `register/`, `me/`, `password/change/`, `admin/stats/` are never shadowed by the `UserViewSet` detail route.

| Method | Path | View | Auth | Serializer | Celery |
|---|---|---|---|---|---|
| POST | `/api/v1/users/register/` | `UserRegistrationView` | AllowAny | `UserRegistrationSerializer` (username, email, password, password2, first/last name, optional role) | none |
| GET | `/api/v1/users/me/` | `UserMeView` | IsAuthenticated | `UserSerializer` | none |
| POST | `/api/v1/users/password/change/` | `PasswordChangeView` | IsAuthenticated | `PasswordChangeSerializer` (old_password, new_password1/2) | none |
| GET | `/api/v1/users/admin/stats/` | `AdminStatsView` | `IsAdminUser` (role ADMIN or superuser, `users/permissions.py:5-13`) | none — plain counts `{user_count, problem_count, submission_count}` (views.py:101-111) | none |
| GET | `/api/v1/users/` | `UserViewSet.list` | IsAuthenticated | `UserSerializer` | none |
| GET | `/api/v1/users/{id}/` | `UserViewSet.retrieve` | IsAuthenticated | `UserSerializer` | none |
| GET | `/api/v1/users/admin/manage/` | `AdminUserViewSet.list` | `IsAdminUser` | `UserSerializer` | none |
| POST | `/api/v1/users/admin/manage/` | `AdminUserViewSet.create` | `IsAdminUser` | `AdminUserSerializer` | none |
| GET | `/api/v1/users/admin/manage/{id}/` | `AdminUserViewSet.retrieve` | `IsAdminUser` | `UserSerializer` | none |
| PUT | `/api/v1/users/admin/manage/{id}/` | `AdminUserViewSet.update` | `IsAdminUser` | `AdminUserSerializer` (username/email read-only here) | none |
| PATCH | `/api/v1/users/admin/manage/{id}/` | `AdminUserViewSet.partial_update` | `IsAdminUser` | `AdminUserSerializer` | none |
| DELETE | `/api/v1/users/admin/manage/{id}/` | `AdminUserViewSet.destroy` | `IsAdminUser` | — | none |

Roles (`users/models.py:10-29`): `BASIC`, `CREATOR`, `VERIFIER`, `ADMIN` (custom `role` field on `AbstractUser`). `UserSerializer` fields: `id, username, email, first_name, last_name, role, is_staff, is_active, date_joined` (`users/serializers.py:61-68`).

Note: `UserViewSet.get_permissions` branches for `update/partial_update/destroy` (`users/views.py:68-71`) but the viewset is ReadOnly — that branch is dead code. Likewise `GoogleLogin`/`GithubLogin` defined in `users/views.py:85-93` are imported into `users/urls.py:3` but **never routed** — the live OAuth views are the ones in `users/api/oauth/{google,github}/views.py`. Confidence: high (urls.py has no path for them).

---

## 4. JWT endpoints (simplejwt) — `webcoder_api/urls.py:34-36`

| Method | Path | View | Auth | Serializer | Celery |
|---|---|---|---|---|---|
| POST | `/api/v1/token/` | `TokenObtainPairView` | AllowAny | simplejwt `TokenObtainPairSerializer` (returns access + refresh) | none |
| POST | `/api/v1/token/refresh/` | `TokenRefreshView` | AllowAny | simplejwt `TokenRefreshSerializer` | none |
| POST | `/api/v1/token/verify/` | `TokenVerifyView` | AllowAny | simplejwt `TokenVerifySerializer` | none |

## 5. dj-rest-auth — prefix `/api/v1/auth/` (`USE_JWT=True`, `settings.py:268-273`)

Endpoints from the installed package URLconf (`venv/.../dj_rest_auth/urls.py:11-30`, `registration/urls.py:7-31`). These rows are package-derived, not hand-written in this repo — confidence: high (read from the venv actually installed).

| Method | Path | Auth | Serializer | Celery |
|---|---|---|---|---|
| POST | `/api/v1/auth/login/` | AllowAny | `users.serializers.CustomLoginSerializer` (wired via `settings.py:271`; adds `user` object to response) | none |
| POST | `/api/v1/auth/logout/` | AllowAny (needs valid token to have effect) | — | none |
| GET/PUT/PATCH | `/api/v1/auth/user/` | authenticated | dj-rest-auth `UserDetailsSerializer` | none |
| POST | `/api/v1/auth/password/change/` | authenticated | dj-rest-auth `PasswordChangeSerializer` | none |
| POST | `/api/v1/auth/password/reset/` | AllowAny | `PasswordResetSerializer` (sends email via allauth) | none |
| POST | `/api/v1/auth/password/reset/confirm/` | AllowAny | `PasswordResetConfirmSerializer` | none |
| POST | `/api/v1/auth/token/verify/` | AllowAny | simplejwt `TokenVerifySerializer` | none |
| POST | `/api/v1/auth/token/refresh/` | AllowAny | refreshed-view `TokenRefreshSerializer` (blacklist app installed, `settings.py:57`) | none |
| POST | `/api/v1/auth/registration/` | AllowAny | dj-rest-auth `RegisterSerializer` (`SIGNUP_FIELDS`: username, email, password) | none |
| POST | `/api/v1/auth/registration/verify-email/` | AllowAny | `VerifyEmailSerializer` | none |
| POST | `/api/v1/auth/registration/resend-email/` | AllowAny | `ResendEmailVerificationSerializer` | none |
| GET | `/api/v1/auth/registration/account-confirm-email/{key}/` | AllowAny | TemplateView (HTML placeholder) | none |
| GET | `/api/v1/auth/registration/account-email-verification-sent/` | AllowAny | TemplateView (HTML placeholder) | none |

## 6. Social OAuth — `webcoder_api/urls.py:40-41` → `users/api/oauth/{google,github}/urls.py`

| Method | Path | View | Auth | Serializer | Celery |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/google/login/` | `GoogleLogin` (SocialLoginView) | AllowAny | dj-rest-auth social login serializer (access_token or code) | none |
| POST | `/api/v1/auth/google/login/token/` | `GoogleTokenLogin` | AllowAny | same | none |
| POST | `/api/v1/auth/github/login/` | `GitHubLogin` | AllowAny | same | none |
| POST | `/api/v1/auth/github/login/token/` | `GitHubTokenLogin` | AllowAny | same | none |

Callbacks point at the CRA dev origin `http://localhost:3000/login/{google,github}/callback` (`users/api/oauth/google/views.py:7`, `github/views.py:7`) — will need updating for the Next.js frontend origin.

## 7. Non-JSON surfaces (for completeness)

- `/admin/` — Django admin site (`webcoder_api/urls.py:29`), session auth.
- `/accounts/` — allauth browser views (login/signup/email/social flows; `webcoder_api/urls.py:42`).
- `/` — RedirectView → `/api/v1/problems/` (`webcoder_api/urls.py:28`).

---

## Models quick reference

| Model | Key fields | Evidence |
|---|---|---|
| `users.User` | `role` (BASIC/CREATOR/VERIFIER/ADMIN) on `AbstractUser` | `users/models.py:5-47` |
| `problems.Tag` | `name_i18n` JSON, unique `slug` | `problems/models.py:6-22` |
| `problems.Problem` | `title_i18n`/`statement_i18n` JSON, author/verifier FKs (sentinel on delete), status DRAFT/PENDING/APPROVED/PRIVATE, difficulty, time/memory limits, `allowed_languages`, `custom_libraries_allowed`, comparison_mode (+epsilon, checker_code/language), `verifier_feedback`, M2M tags | `problems/models.py:24-133` |
| `problems.TestCase` | problem FK, input/expected TextFields, `is_sample`, `points`, `order` | `problems/models.py:135-156` |
| `submissions.Submission` | user/problem FKs, `language`, `code`, verdict (PENDING/COMPILING/RUNNING/AC/WA/TLE/MLE/CE/RE/IE), time/memory, `score`, `detailed_feedback`; indexed on (user,problem),(problem,time),(user,time),(verdict) | `submissions/models.py:8-79` |
| `submissions.SubmissionTestResult` | submission/test-case FKs, verdict, time/mem, actual/error output; unique (submission, test_case) | `submissions/models.py:81-116` |

## Findings relevant to the Next.js migration (all static-read; none executed)

1. **`IsOwnerOrAdminForSubmission` checks `obj.author` but `Submission` has no `author` field** (it is `user`) — `users/permissions.py:85` vs `submissions/models.py:25-31`. A GET of `/api/v1/submissions/submissions/{id}/` by a non-admin would hit `has_object_permission` and raise `AttributeError` (500) rather than 403. UNVERIFIED by execution; statically high confidence.
2. **No pagination anywhere** — `GET /api/v1/problems/` returns the entire visible catalog in one response; the public SEO-facing catalog should add pagination or SSG caching.
3. **`checker_code` and full `statement_i18n` are in the anonymous list payload** (`problems/serializers.py:59-67`) — custom checker source ships to any anonymous list/retrieve caller for APPROVED problems.
4. **Tag write access is open to any authenticated user** (temporary TODO in `problems/views.py:18-21`).
5. **OAuth callbacks hardcode `localhost:3000`** (CRA port) in `users/api/oauth/*/views.py:7` — must move with the frontend.
6. **`GET /api/v1/users/` lists all users to any authenticated user** (no restriction to self) — `users/views.py:60-66`.
7. **Celery uses the `filesystem://` broker** (dev-only; leaves `backend/control/` artifact dirs) — swap before production.
8. Dead code: `GoogleLogin`/`GithubLogin` in `users/views.py:85-93`; `UserViewSet` write-permission branch `users/views.py:68-71`.

*If this file reads as all-UNKNOWN, the unit died before measuring and no verdict in it may be cited. (Not the case: all rows above carry file:line anchors from reads performed 22.09.2026.)*
