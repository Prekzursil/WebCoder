# API Envelope Receipt — PORT-MAP §0.1 settling experiment

- **Generated:** 2026-09-22 (wave A4, workflow wf_c8e4c79c)
- **Branch:** `wave/nextjs-migration`
- **Settles:** `docs/PORT-MAP.md` §0.1 — "UNVERIFIED which shape the DRF backend actually
  returns — settling experiment: `curl http://127.0.0.1:8000/api/v1/problems/problems/`
  and inspect for a `{data: ...}` envelope".
- **Method:** STATIC determination from source (no server started), plus runtime
  corroboration under the sqlite test settings where cheap. Every claim cites `file:line`.
  Confidence bands inline per the wave honesty contract.

---

## 1. Answer

**Every DRF list endpoint returns a BARE JSON ARRAY.** There is **no `{data: ...}`
envelope** and **no DRF pagination wrapper** (`{count, next, previous, results}`) on any
endpoint. Retrieve/detail endpoints return the serialized object directly.

**Confidence: high (static)** — Sherman-Kent band ~90–95% pre-runtime, resting on five
independent static signals (section 2) with zero counter-signals in the tree; the residual
is closed by the one-line CI probe in section 5, which has not yet run against a live
server (section 4 explains why it could not run locally today).

Consequence for the port: the Next 15 frontend's direct-array consumption
(`types/api.ts` + `problems-api.ts`) is **correct**; the CRA pages' `response.data` reads
were the bug, exactly as `frontend/web/src/app/problems/_lib/problems-api.ts:10-14`
claims. PORT-MAP §0.1's blocker is resolved in favor of the plain-array shape.

## 2. Static evidence chain (all read this session)

| # | Signal | Evidence |
|---|---|---|
| 1 | No global pagination: the `REST_FRAMEWORK` block sets neither `DEFAULT_PAGINATION_CLASS` nor `PAGE_SIZE`; the only mention of pagination in the whole settings file is a "you can add" comment | `backend/webcoder_api/settings.py:234-244` (comment at :243) |
| 2 | No per-view pagination: every list-serving view is stock DRF (`ModelViewSet` / `ReadOnlyModelViewSet` / `generics.*` / `APIView`); grep for `pagination\|Pagination` across `problems/views.py`, `submissions/views.py`, `users/views.py` → zero matches | `backend/problems/views.py:11,25,108`; `backend/submissions/views.py:8,30`; `backend/users/views.py:60,73,95` |
| 3 | No envelope renderer: grep for `Renderer\|renderer` across `backend/{webcoder_api,problems,submissions,users}/**/*.py` → only the settings comment | `backend/webcoder_api/settings.py:243` (sole hit) |
| 4 | DRF semantics: with `pagination_class = None` (the framework default absent `DEFAULT_PAGINATION_CLASS`), `ListModelMixin.list()` returns `serializer.data` directly → renders as a JSON array; `{count, next, previous, results}` requires an explicit pagination class, `{data: ...}` requires a custom renderer/mixin — neither exists (signals 1–3) | DRF `GenericAPIView.pagination_class` default; no override anywhere |
| 5 | Frontend contract (consumer side) agrees: `apiFetch` returns `response.json()` cast to `T` with no unwrapping, and every list type is a plain array | `frontend/web/src/services/ApiService.ts:23-48` (esp. :47); `frontend/web/src/types/api.ts:25,29,36,49` (`GetProblemsResponse = ProblemType[]`, `GetSubmissionsResponse = SubmissionType[]`, `GetAdminUsersResponse = AdminUserType[]`, `GetTagsResponse = TagType[]`) |

In-repo corroboration (secondary sources, consistent): `problems-api.ts:10-14`
("plain ModelViewSet with no pagination and no `{data: ...}` envelope ... list returns
`ProblemType[]`") and `docs/API-MAP.md` global-conventions table ("Pagination: **None
configured** — every list endpoint returns the full queryset", citing settings.py:234-244).

## 3. Runtime corroboration (measured this session, sqlite test settings)

Command: `cd backend && SECRET_KEY=testkey DB_PASSWORD=x ./venv/Scripts/python.exe -m
pytest --ds webcoder_api.test_settings users submissions` → **194 passed, 5 failed**
(the 5 failures are pre-existing latent defects in the newly-collected
`submissions/test_wave.py`, proven independent of this receipt by a revert-control run —
see section 6).

Among the passing tests, the submission LIST endpoint's array shape is exercised at
runtime through the real DRF stack (URLconf → view → serializer → renderer):

- `submissions/test_wave.py` `SubmissionViewTests.test_list_returns_own_submissions_only`
  and `test_list_staff_sees_all` iterate `resp.data` directly as rows
  (`{row["id"] for row in resp.data}`) and PASSED — a list response consumed as a plain
  Python list, which the JSON renderer emits as a bare JSON array.

This is runtime proof for `/api/v1/submissions/` on the identical DRF configuration
surface that serves `/api/v1/problems/problems/` (same settings block, same stock
viewset pattern). It is corroborating, not the settling experiment itself — the problems
endpoint's live-HTTP probe remains section 5.

## 4. Cheap Django bootability (manage.py check)

`SECRET_KEY=testkey DB_PASSWORD=x ./venv/Scripts/python.exe manage.py check --settings
webcoder_api.test_settings` — Django **boots** (settings resolve, all apps import) but
the check **exits non-zero**: 1 CRITICAL allauth issue (`'password' is not a valid field
for ACCOUNT_SIGNUP_FIELDS, use 'password1'` — the pre-existing auth-audit A-01 defect,
`settings.py:197-201`) plus 2 account warnings (W001 + deprecated
`ACCOUNT_SIGNUP_PASSWORD_ENTER_TWICE`). This is why a local live-server curl could not be
run today: the system check blocks `runserver` until A-01 is fixed and the owner's
`backend/.env` bootstrap lands (wave report §5.1). The check itself is the cheap
runnability proof requested: import-level boot works under the sqlite override.

## 5. Settling runtime command (for CI — the receipt's forward contract)

The PORT-MAP-named experiment, executable once a server is up (CI service container or
post-A-01 local runserver):

```bash
curl -s -H "Accept: application/json" http://127.0.0.1:8000/api/v1/problems/problems/ \
  | jq -e 'type == "array"'   # exit 0 = bare array (envelope would be type "object")
```

Hermetic CI equivalent (no server, no DB bootstrap — drops into the existing
`pytest --ds webcoder_api.test_settings` job):

```python
def test_problems_list_envelope_is_bare_array(self):
    resp = self.client.get("/api/v1/problems/problems/",
                           HTTP_ACCEPT="application/json")
    self.assertEqual(resp.status_code, 200, resp.content)
    # Bare array: first rendered byte is '['. A {data:...} envelope or DRF
    # pagination wrapper would render as '{'.
    self.assertTrue(resp.content.lstrip().startswith(b"["), resp.content[:80])
```

Anonymous GET on the problems list is permission-open and returns only APPROVED problems
— an empty database yields `[]`, which still settles the shape question (array vs object).
**Status: FAILED-TO-RUN against live HTTP this session (blocked by §4); static
determination stands at high confidence until this probe lands in CI.**

## 6. Provenance notes

- The 5 pytest failures referenced in §3 are all in `backend/submissions/test_wave.py`
  (renamed from `tests_wave.py` during this session by the concurrent D2 sweep; this
  unit's edits traveled with the rename, verified by grep after the fact):
  `SerializerTests::test_create_serializer_creates_submission` (IntegrityError
  NOT NULL user_id), `SerializerTests::test_submission_serializer_without_problem`,
  `SerializerTests::test_test_result_serializer_without_test_case`,
  `SubmissionAdminTests::test_links_render_na_for_missing_relations` (null-FK
  `RelatedObjectDoesNotExist`), `ExecutionTests::test_zero_time_limit_uses_one_second`
  (docker-timing TLE vs AC). A both-states control (temporarily reverting the
  permissions fix and re-running) reproduced the identical 5 failures, proving them
  pre-existing and unrelated to this receipt's change surface.
- No server was started for this receipt; no git write operations were performed.
- PORT-MAP.md §0.1 (:14) and §8-adjacent UNVERIFIED tag (:194) should be flipped to
  settled by that doc's owner — this unit's scope is this receipt only.
