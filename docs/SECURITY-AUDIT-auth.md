# Security Audit — Auth / CORS / Secrets — WebCoder backend + webcoder_ui frontend

- Date: 2026-09-22 · Branch: `wave/nextjs-migration` · Audited commit: `40fda968` (2026-09-22, "env-driven secrets, pin missing deps, port default 5433")
- Scope: `backend/webcoder_api/settings.py` (302 lines, full read) · `backend/webcoder_api/urls.py` (44 lines) · `backend/users/{urls,views,serializers,adapters,models,permissions}.py` · `backend/users/api/oauth/{google,github}/urls.py` · `frontend/webcoder_ui/src/context/AuthContext.tsx` (85 lines) · `frontend/webcoder_ui/src/services/ApiService.ts` (71 lines) · `backend/requirements.txt` · `manage.py check` (executed) · `.gitignore`
- Method: static reads with file:line anchors + command-output anchors. Read-only; NO source code was modified by this audit. `manage.py check` was executed with a process-local dummy SECRET_KEY/DB_PASSWORD (values never persisted anywhere; see §3).
- Confidence vocabulary: high = directly measured on disk/command output; likely = derived from pinned library behavior, settling experiment named; uncertain/UNVERIFIED = not measured.
- This is v2 (final). v1 skeleton carried findings A-01..A-13; v2 adds measured A-14..A-20, the executed check output, and the URL/token-flow inventory. Every load-bearing claim below carries an inline band + anchor.

## 0. Verdict

**NOT production-ready.** One directly exploitable privilege-escalation (A-14: anonymous self-registration as ADMIN, full chain measured), DEBUG=True, JWT pair in localStorage with no rotation and client-side-only logout, and a failing Django system check (1 CRITICAL + 2 warnings). 19 patch items below, ordered P0→P3. The port applying this list should land P0 before any public deployment. Confidence: high (each item anchored).

## 1. Findings summary

| ID | Severity | Confidence | Evidence | Summary |
|----|----------|------------|----------|---------|
| A-14 | CRITICAL | high | users/serializers.py:29,33,56 + users/views.py:21 + users/models.py:14,23-29 + users/permissions.py:13 | `role` is a writable field on the AllowAny registration endpoint → anyone can POST `role:"ADMIN"` and pass `IsAdminUser` |
| A-19 | CRITICAL | high | `manage.py check` output §3.1 | allauth `ACCOUNT_SIGNUP_FIELDS` uses invalid `'password'` key (must be `password1`) — Django check exits 1 |
| A-01 | CRITICAL | high | settings.py:37 | `DEBUG = True` hardcoded (corroborated: security.W018) |
| A-15 | HIGH | likely | users/serializers.py:17-21 + settings.py:268-273 | `logger.info` logs the full login response, which contains live access+refresh JWTs → tokens written to app logs on every login |
| A-02 | HIGH | high | settings.py:39 | `ALLOWED_HOSTS = []` (corroborated: security.W020) — no production host path; invites `*` as a "fix" |
| A-03 | HIGH | high | AuthContext.tsx:17-18,54-56 | access AND refresh JWT persisted in `localStorage` — XSS-stealable |
| A-04 | HIGH | high | settings.py:215-220 | GitHub OAuth scope requests `repo` + `read:org` = write access to users' PRIVATE repositories |
| A-05 | HIGH | high | settings.py:256-266 | no `ROTATE_REFRESH_TOKENS`/`BLACKLIST_AFTER_ROTATION`; blacklist app installed (settings.py:57) but never triggered |
| A-06 | HIGH | high | AuthContext.tsx:63-71 + urls.py:38 | logout only clears localStorage; refresh token stays server-valid for its full 1-day lifetime |
| A-07 | MEDIUM | high | settings.py:195 | `ACCOUNT_EMAIL_VERIFICATION = 'optional'` on a public platform |
| A-08 | MEDIUM | high | settings.py:234-244 | DRF `DEFAULT_PERMISSION_CLASSES` commented out → every view without explicit permissions defaults to AllowAny |
| A-09 | MEDIUM | high | settings.py:202-204 vs 269-273 | `DJ_REST_AUTH` assigned twice; first dict is dead code, silently shadowed |
| A-16 | MEDIUM | high | ApiService.ts (full read, 71 lines) + §5 grep | no token-refresh flow exists anywhere in the frontend; the stored 1-day refresh token is pure attack surface with zero benefit; 5-min access tokens expire without recovery |
| A-10 | LOW | high | settings.py:88-90 | CORS is a narrow explicit list (GOOD) but hardcoded `http://localhost:3000`; no env path for prod origins |
| A-11 | LOW | high | AuthContext.tsx:28,33,60,70 | `console.log` of user data / auth state |
| A-12 | LOW | high | settings.py:276-282 | Celery `filesystem://` broker + import-time `os.makedirs` in settings (side effects at settings import) |
| A-17 | LOW | high | ApiService.ts:1,4,7 | `API_BASE_URL` hardcoded `http://127.0.0.1:8000/api/v1`; Bearer header re-read from localStorage per call |
| A-18 | LOW | likely | users/views.py:85-93 | dead duplicate GoogleLogin/GithubLogin with hardcoded `callback_url = "http://localhost:3000/login"`; the ROUTED oauth views (users/api/oauth/*/views.py) were not read — UNVERIFIED what callback they use |
| A-20 | LOW | likely | users/adapters.py:11-35 | `pre_social_login` logic is effectively dead (bare except on a non-raising block); redirects put email in a URL query param |
| A-13 | INFO (positive) | high | settings.py:34,120 + .gitignore:7-8 | SECRET_KEY/DB_PASSWORD are fail-loud env reads; no hardcoded secrets; backend/.env gitignored |

## 2. Finding detail

### A-14 (CRITICAL, high) — Anonymous self-registration as ADMIN
Chain, all measured: `UserRegistrationView` is `AllowAny` (users/views.py:21). `UserRegistrationSerializer.Meta.fields` includes `role` (users/serializers.py:29) with only `required: False` (users/serializers.py:33); `create()` passes it through: `role=validated_data.get('role', User.Roles.BASIC_USER)` (users/serializers.py:56). `role` accepts `'ADMIN'` (users/models.py:14,23-29), and `IsAdminUser` grants on `role == ADMIN` OR `is_superuser` (users/permissions.py:13). Therefore `POST /api/v1/users/register/ {"username":..., "password":..., "password2":..., "email":..., "role":"ADMIN"}` (route: users/urls.py:13) yields an account that passes `IsAdminUser` → admin user-management (`/api/v1/users/admin/manage/`, users/urls.py:9), admin stats (users/urls.py:16), verifier/creator powers (users/permissions.py:22,31). Fix: patch P0-1.

### A-19 (CRITICAL, high) — Django system check fails
`manage.py check` exits 1 with a CRITICAL: `'password' is not a valid field for ACCOUNT_SIGNUP_FIELDS, use 'password1'` (full output §3.1). Root: settings.py:197-201 defines `ACCOUNT_SIGNUP_FIELDS` as a dict keyed `password`; allauth 65.19.4 expects the list form with `password1`. The same dict is passed to `DJ_REST_AUTH['SIGNUP_FIELDS']` (settings.py:203,272). Two accompanying warnings: `account.W001` (ACCOUNT_LOGIN_METHODS conflicts with ACCOUNT_SIGNUP_FIELDS, settings.py:196) and the deprecated `ACCOUNT_SIGNUP_PASSWORD_ENTER_TWICE` (settings.py:193). Fix: P1-5.

### A-01/A-02 (CRITICAL/HIGH, high) — Deployment posture
`DEBUG = True` (settings.py:37) and `ALLOWED_HOSTS = []` (settings.py:39) are unconditional; independently corroborated by security.W018/W020 (§3.2). Both must be env-driven before prod.

### A-15 (HIGH, likely) — JWTs written to application logs
`CustomLoginSerializer.to_representation` calls `logger.info(f"CustomLoginSerializer response: {ret}")` (users/serializers.py:20). With `USE_JWT` (settings.py:268-273), dj-rest-auth 7.2.0's `LoginSerializer.to_representation` includes the live `access`/`refresh` tokens in `ret` — so both tokens land in logs at INFO on every login. The log line is measured; the token-content of `ret` is library behavior (likely, not re-measured here). Corroboration: the frontend consumes exactly `response.access`/`response.refresh` from login (LoginPage.tsx:25-26). Settling experiment: grep existing backend logs for `CustomLoginSerializer response:` and look for `eyJ` (JWT prefix). Fix: P0-3.

### A-03/A-05/A-06/A-16 (HIGH, high) — Token lifecycle
Storage: both tokens in localStorage (AuthContext.tsx:17-18,54-56); attached per-request from localStorage (ApiService.ts:4,7). Backend lifetimes: 5 min access / 1 day refresh, no rotation, no blacklist-after-rotation (settings.py:256-266). Logout removes localStorage keys only (AuthContext.tsx:63-71); a `/api/v1/auth/logout/` route exists via the dj_rest_auth.urls include (urls.py:38) and, with USE_JWT + the blacklist app installed (settings.py:57,269-273), dj-rest-auth's LogoutView blacklists the presented refresh token — that specific runtime behavior is likely (library docs, not measured); the frontend simply never calls it. No blacklist route is wired explicitly (urls.py:34-36 route obtain/refresh/verify only), and no frontend refresh call/interceptor exists at all (ApiService.ts is native fetch, 71 lines, no interceptor; §5 grep across src). Net effect: an XSS or localStorage read steals a 24h refresh token that nothing rotates or blacklists; conversely honest users are logged out after 5 minutes with no recovery. Fixes: P1-3, P1-4, P1-6.

### A-04 (HIGH, high) — OAuth over-scoping
GitHub provider scope `['user', 'repo', 'read:org']` (settings.py:215-220). `repo` grants read/write to the signer's PRIVATE repositories — massively over-privileged for SSO identity. Login needs `['user', 'user:email']`. (Google scope `profile,email` at settings.py:205-214 is fine.)

### A-07/A-08/A-09 (MEDIUM, high) — Config hardening
Email verification optional (settings.py:195) on a public SEO-facing platform → disposable accounts, unverified emails on file. DRF default permissions commented out (settings.py:234-244) → any future view that forgets `permission_classes` is public by default (current users/problems/submissions views do set explicit permissions — measured in users/views.py:21,40,55,66,78,99 — but the safety net is off). Duplicate `DJ_REST_AUTH` dict (settings.py:202-204 shadowed by 269-273).

## 3. manage.py check — MEASURED

Executed 2026-09-22 on this tree with process-local dummy `SECRET_KEY`/`DB_PASSWORD` (the real values live in `backend/.env`, absent on this machine; the dummy values existed only in the child process env and were never written anywhere). First attempt WITHOUT them: FAILED-TO-RUN (`KeyError: 'SECRET_KEY'` at settings.py:34 — the fail-loud env read working as designed, positive finding A-13).

### 3.1 `manage.py check` — exit 1, 3 issues (verbatim)

```
CRITICALS:
?: 'password' is not a valid field for ACCOUNT_SIGNUP_FIELDS, use 'password1'

WARNINGS:
?: (account.W001) ACCOUNT_LOGIN_METHODS conflicts with ACCOUNT_SIGNUP_FIELDS
?: settings.ACCOUNT_SIGNUP_PASSWORD_ENTER_TWICE is deprecated, use: settings.ACCOUNT_SIGNUP_FIELDS = ['username', 'email', 'password']

System check identified 3 issues (0 silenced).
```

These are "the 3 manage.py check warnings" — 1 CRITICAL + 2 warnings, all settings.py-local (193,196,197-201).

### 3.2 `manage.py check --deploy` — exit 1, 10 issues (new ones verbatim, condensed)

`security.W004` SECURE_HSTS_SECONDS unset · `security.W008` SECURE_SSL_REDIRECT not True · `security.W009` SECRET_KEY looks weak · `security.W012` SESSION_COOKIE_SECURE not True · `security.W016` CSRF_COOKIE_SECURE not True · `security.W018` DEBUG=True · `security.W020` ALLOWED_HOSTS empty — plus the 3 issues from §3.1. **W009 is a probe artifact**: it fired on the 20-char dummy key injected for this run, not on the repo's real key (which this audit deliberately never read). The real key's strength is UNVERIFIED; settling check: run `check --deploy` with the production key present. W004/W008/W012/W016 map to patch P2-1; W018/W020 to P0-2/P0-4.

## 4. Auth URL surface (measured)

| Route | View | Evidence |
|---|---|---|
| `/api/v1/token/` `/refresh/` `/verify/` | simplejwt obtain/refresh/verify | urls.py:34-36 |
| `/api/v1/auth/` + `/auth/registration/` | dj_rest_auth.urls + registration include (login/logout/password flows) | urls.py:38-39 |
| `/api/v1/auth/google/login/` `/login/token/` | GoogleLogin, GoogleTokenLogin | users/api/oauth/google/urls.py:5-6 |
| `/api/v1/auth/github/login/` `/login/token/` | GitHubLogin, GitHubTokenLogin | users/api/oauth/github/urls.py:5-6 |
| `/api/v1/users/register/` `/me/` `/password/change/` `/admin/stats/` `/admin/manage/` | users/urls.py:13-16,9 | |
| `/accounts/` | allauth.urls (browser flows) | urls.py:42 |

No explicit blacklist route is wired (simplejwt TokenBlacklistView absent); no `rest_framework.authtoken` route exists despite the app being installed (settings.py:55) — inert, removable.

## 5. Frontend token flow (measured)

Login pages pass `response.access/response.refresh/response.user` into `auth.login()` (LoginPage.tsx:25-26, CompleteRegistrationPage.tsx:32-33) → both tokens + user JSON persisted to localStorage (AuthContext.tsx:53-58) → `apiFetch` re-reads `accessToken` from localStorage and sets `Authorization: Bearer` (ApiService.ts:4,7). Grep across `frontend/webcoder_ui/src` for `Authorization|Bearer|axios|interceptors|refresh` (content mode, cross-checked with count mode; 17 matches, both probes agree): **zero** refresh calls, zero interceptors, zero other Bearer sites. `API_BASE_URL` hardcoded `http://127.0.0.1:8000/api/v1` (ApiService.ts:1).

## 6. HARDENING PATCH LIST (do not edit code from this audit — the Next.js port applies this)

Order = priority. Each item names file:line and the target state.

### P0 — before any public exposure

1. **Kill the role mass-assignment** — `backend/users/serializers.py:29,33,56`: remove `role` from `UserRegistrationSerializer` fields/extra_kwargs and hardcode `role=User.Roles.BASIC_USER` in `create()`; role changes stay on `AdminUserViewSet` only. [A-14]
2. **DEBUG env-driven** — `settings.py:37` → `DEBUG = os.environ.get("DJANGO_DEBUG", "False").lower() == "true"` (default False). [A-01; W018]
3. **Stop logging JWTs** — `backend/users/serializers.py:20`: delete the `logger.info` (or gate to DEBUG with tokens redacted). [A-15]
4. **ALLOWED_HOSTS env-driven** — `settings.py:39` → `os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")`; NEVER `*` for a credentialed API. [A-02; W020]

### P1 — high, same week

5. **Fix the check CRITICALs/warnings** — `settings.py:193,197-201`: `ACCOUNT_SIGNUP_FIELDS = ['username', 'email', 'password1']` (list form; add `'password2'` if double-entry wanted), drop `ACCOUNT_SIGNUP_PASSWORD_ENTER_TWICE`, align/remove `ACCOUNT_LOGIN_METHODS` (settings.py:196) per `account.W001`; keep `DJ_REST_AUTH['SIGNUP_FIELDS']` in dj-rest-auth's own dict shape with `password1`/`password2` keys (verify exact shape against dj-rest-auth 7.2.0 docs). Gate: `manage.py check` exits 0 with 0 issues. [A-19]
6. **Token rotation + blacklist** — `settings.py:256-266`: add `"ROTATE_REFRESH_TOKENS": True, "BLACKLIST_AFTER_ROTATION": True` (blacklist app already installed, settings.py:57). [A-05]
7. **Real logout** — frontend `logout()` must POST the refresh token to `/api/v1/auth/logout/` (dj-rest-auth LogoutView blacklists it under USE_JWT; UNVERIFIED at runtime — verify once when porting) before clearing storage. Backend optionally also wires `TokenBlacklistView`. [A-06]
8. **GitHub scope reduction** — `settings.py:215-220`: SCOPE → `['user', 'user:email']`. Requires no new OAuth app, just re-consent. [A-04]
9. **Token storage strategy (decision for the Next 15 port)** — preferred: dj-rest-auth `JWT_AUTH_COOKIE`/`JWT_AUTH_REFRESH_COOKIE` httpOnly cookies + CSRF handling (drop localStorage entirely). If localStorage must survive short-term: keep ONLY the 5-min access token in memory (not localStorage), refresh via rotated httpOnly cookie or at-least-rotated refresh call, add CSP. Either way implement the refresh flow that is currently entirely missing (A-16). [A-03]

### P2 — medium

10. **Deploy security block** (env-gated so dev is unaffected): `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS=31536000` + `SECURE_HSTS_INCLUDE_SUBDOMAINS` + `SECURE_HSTS_PRELOAD`, `SESSION_COOKIE_SECURE=True`, `CSRF_COOKIE_SECURE=True`, `SECURE_PROXY_SSL_HEADER` (if behind a proxy), `SECURE_REFERRER_POLICY="same-origin"`. Gate: `check --deploy` reports 0 (with the real SECRET_KEY present — also settles W009). [W004/W008/W012/W016]
11. **Email verification** — `settings.py:195`: `ACCOUNT_EMAIL_VERIFICATION='mandatory'` (+ `SOCIALACCOUNT_EMAIL_REQUIRED=True`, `SOCIALACCOUNT_EMAIL_VERIFICATION='mandatory'`) for the public platform; dev can override via env. [A-07]
12. **DRF default-deny** — `settings.py:234-244`: set `'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated']` and add explicit `AllowAny` only on the public catalog endpoints that need it. [A-08]
13. **Merge duplicate DJ_REST_AUTH** — delete `settings.py:202-204` (dead), keep the single dict at 269-273 with all keys. [A-09]
14. **CORS env-driven** — `settings.py:88-90`: origins from env (comma-separated), https-only values in prod. [A-10]

### P3 — low / hygiene

15. Delete dead `GoogleLogin`/`GithubLogin` in `users/views.py:85-93`; make every oauth `callback_url` env-driven (check the routed views in `users/api/oauth/*/views.py` — UNVERIFIED). [A-18]
16. Remove `console.log` of user/auth state — `AuthContext.tsx:28,33,60,70`. [A-11]
17. Celery: broker URL env-driven for prod + move `os.makedirs` out of settings import — `settings.py:276-282`. [A-12]
18. `API_BASE_URL` from env — `ApiService.ts:1` (moot if the Next port replaces ApiService). [A-17]
19. Optional: dedicated `SIMPLE_JWT` signing key via env instead of reusing Django `SECRET_KEY` (`settings.py:257-258`) to decouple key rotation. Also consider removing unused `rest_framework.authtoken` (settings.py:55).

## 7. Positive findings (keep these properties)

- Fail-loud secrets: `SECRET_KEY = os.environ["SECRET_KEY"]` (settings.py:34), `DB_PASSWORD` same (settings.py:120); no insecure fallbacks; no secret literals anywhere in settings.py. [high]
- `backend/.env` and `.env` gitignored (.gitignore:7-8); no `.env*`/`*.pem`/`*.key` files committed at depth<=2; a `backend/.env.example` documents the shape. [high]
- CORS is a narrow explicit allowlist, no wildcard/regex/credentials combo (settings.py:88-90). [high]
- `rest_framework_simplejwt.token_blacklist` IS installed (settings.py:57) — only the trigger settings are missing (P1-6/P1-7). [high]
- JWT lifetimes are conservative defaults (5 min / 1 day, settings.py:260-261). [high]
- every users-app endpoint sets explicit permission_classes (users/views.py:21,40,55,66,78,99). [high]
- Version pins present for the auth stack (requirements.txt:10-15: Django 5.2.1, DRF 3.16.0, simplejwt 5.5.0, cors-headers 4.9.0, dj-rest-auth 7.2.0, allauth 65.19.4). [high]

## 8. UNVERIFIED / residuals (each with its settling experiment)

1. Production SECRET_KEY strength — never read (by design). Settle: `check --deploy` with the real key; expect W009 to disappear if >=50 random chars. [A-13/W009]
2. dj-rest-auth 7.2.0 LogoutView blacklisting under USE_JWT — library-docs-derived (likely). Settle: one curl logout with a refresh token, then attempt that refresh. [A-06/P1-7]
3. `users/api/oauth/{google,github}/views.py` internals (callback_url, GoogleTokenLogin/GitHubTokenLogin implementations) — not read. Settle: read both files during the port. [A-18]
4. Real-world JWT-in-logs (A-15) — settle: grep backend logs for `CustomLoginSerializer response:` + `eyJ`.
5. `problems.urls` / `submissions.urls` permission surface — outside this audit's auth scope (catalog is intended public; submissions assumed authed). Settle: dedicated pass during the port.
6. The Next 15 App Router tree's own auth handling — the audited frontend is the CRA-era `frontend/webcoder_ui`; the migration target's patterns (server components, middleware) are out of scope here.

## 9. Provenance

All file:line anchors were captured by full-file reads on 2026-09-22 at commit 40fda968, branch wave/nextjs-migration. `manage.py check` outputs are verbatim from execution with a process-local dummy env (§3); the dummy values were never written to any file. No source files were modified; the only file created by this audit is this document (v1 skeleton 4289 B → this v2). If any numbered claim above lacks an inline anchor, treat it as unmeasured.
