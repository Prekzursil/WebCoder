from rest_framework import serializers
from django.core.exceptions import ObjectDoesNotExist
from .models import Submission, SubmissionTestResult  # Import SubmissionTestResult
from users.serializers import UserSerializer
from contests.models import Contest
from problems.models import (
    Problem,
)  # Import TestCase for SubmissionTestResultSerializer
from .judge_utils.custom_libs import is_allowed_requirement
from .judge_utils.languages import (
    SCRATCH_LANGUAGE_ID,
    SUPPORTED_LANGUAGE_IDS,
    get_language,
)


class SubmissionTestResultSerializer(serializers.ModelSerializer):
    # test_case_id = serializers.ReadOnlyField(source='test_case.id') # Simple ID
    # To provide more context, like test case order or if it's sample
    test_case_details = serializers.SerializerMethodField()

    class Meta:
        model = SubmissionTestResult
        fields = [
            "id",
            # 'test_case', # Using PrimaryKeyRelatedField by default is okay for ID
            "test_case_details",
            "verdict",
            "execution_time_ms",
            "memory_used_kb",
            # Wave E items 6/19/25: the bar each test ran against, persisted
            # at judge time (per-test override > language-adjusted problem
            # limit) so "used vs bar" needs no client-side re-derivation.
            "limit_time_ms",
            "limit_memory_kb",
            "actual_output",  # Consider truncating or omitting by default if too large for lists
            "error_output",  # Same as above
        ]
        read_only_fields = (
            fields  # All fields are read-only as they are set by the judge
        )

    def _privileged(self, obj) -> bool:
        """J10 visibility: staff, ADMIN/VERIFIER roles and the problem's
        author see hidden-test detail; everyone else gets verdict/time/
        memory only (sample tests stay fully visible — they are public by
        design, and carry their input/expected pair for the WA diff view).
        """
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return False
        if user.is_superuser or user.is_staff:
            return True
        if getattr(user, "role", "") in ("ADMIN", "VERIFIER"):
            return True
        try:
            return obj.submission.problem.author_id == user.pk
        except ObjectDoesNotExist:
            return False

    def get_test_case_details(self, obj):
        try:
            if obj.test_case:
                details = {
                    "id": obj.test_case.id,
                    "order": obj.test_case.order,
                    "is_sample": obj.test_case.is_sample,
                    "points": obj.test_case.points,
                }
                # Wave E item 7 (WA diff viewer): sample tests expose their
                # input/expected pair so the submission page can render a
                # line diff of expected vs actual output.
                if obj.test_case.is_sample or self._privileged(obj):
                    details["input_data"] = obj.test_case.input_data
                    details["expected_output_data"] = obj.test_case.expected_output_data
                return details
        except ObjectDoesNotExist:
            # Unset required FK (unsaved/defensive display path) — schema stays NOT NULL.
            pass
        return None

    def to_representation(self, obj):
        representation = super().to_representation(obj)
        # J10 (feedback granularity): hidden-test rows never leak the
        # program's captured output/stderr to non-privileged viewers — the
        # verdict, timing and memory stay (which numbered test failed is
        # the pedagogically useful part).
        if not obj.test_case_id or obj.test_case.is_sample:
            return representation
        if not self._privileged(obj):
            representation["actual_output"] = None
            representation["error_output"] = None
        return representation


class SubmissionSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    problem_id = serializers.IntegerField(
        write_only=True, source="problem.id", required=False
    )
    # 'problem' field will be used for read, populated by to_representation or nested serializer
    # J6: the denominator next to score, so the UI renders "30/100" with a
    # PARTIAL state instead of a bare number.
    max_score = serializers.SerializerMethodField()
    # Matrix row 61 (runtime percentile vs community): the share of AC
    # submissions on the same problem + language this run is faster than
    # (LeetCode's "beats X% in runtime"). None without a measured time or
    # a comparison pool.
    runtime_percentile = serializers.SerializerMethodField()
    # Wave E item 21 ("Am I close?" bands): a banded reading of
    # score/full_score so a near-miss submission reads as "so close!"
    # instead of a bare WA. None when the problem has no score denominator
    # or the submission has not been scored yet.
    closeness = serializers.SerializerMethodField()
    # Wave E item 14 (compile-error explainers): beginner-friendly
    # bilingual hints mapped from the raw compiler diagnostics on CE
    # verdicts; empty on every other verdict.
    compile_hints = serializers.SerializerMethodField()
    # Wave E item 13 (submission versioning/diff): the caller's own
    # previous submission id on the SAME problem (null for a first
    # attempt) — the detail page chains "diff vs previous" views.
    previous_submission_id = serializers.SerializerMethodField()

    test_results = SubmissionTestResultSerializer(
        many=True, read_only=True
    )  # Nested serializer for test results

    class Meta:
        model = Submission
        fields = [
            "id",
            "user",
            "problem",
            "problem_id",
            "language",
            "code",
            "submission_time",
            "verdict",
            "execution_time_ms",
            "memory_used_kb",
            "score",
            "max_score",
            "runtime_percentile",
            "closeness",
            "compile_hints",
            "previous_submission_id",
            "detailed_feedback",
            "contest",
            "ai_assisted",
            "test_results",  # Add test results + contest (read-only id)
        ]
        read_only_fields = [
            "id",
            "user",
            "problem",
            "submission_time",
            "verdict",
            "execution_time_ms",
            "memory_used_kb",
            "score",
            "max_score",
            "runtime_percentile",
            "closeness",
            "compile_hints",
            "previous_submission_id",
            "detailed_feedback",
            "contest",
            "test_results",
        ]

    def get_max_score(self, obj):
        return obj.problem.full_score if obj.problem_id else 0

    def get_closeness(self, obj):
        """Item 21: banded score ratio. SOLVED at full score; SO_CLOSE at
        >= 75%; HALFWAY at >= 50%; STARTED above zero; NONE at zero; None
        before scoring or when the problem has no points at all.
        """
        max_score = obj.problem.full_score if obj.problem_id else 0
        if obj.score is None or max_score <= 0:
            return None
        ratio = float(obj.score) / float(max_score)
        if ratio >= 1.0:
            band = "SOLVED"
        elif ratio >= 0.75:
            band = "SO_CLOSE"
        elif ratio >= 0.5:
            band = "HALFWAY"
        elif ratio > 0.0:
            band = "STARTED"
        else:
            band = "NONE"
        return {"band": band, "ratio": round(ratio, 4)}

    def get_previous_submission_id(self, obj):
        """Item 13: the user's own immediately-previous attempt on this
        problem (strictly earlier submission_time, latest such row).
        Viewers only ever see their own chain (this serializer serves the
        submitter and staff).
        """
        from submissions.models import Submission

        prev = (
            Submission.objects.filter(
                user_id=obj.user_id,
                problem_id=obj.problem_id,
                submission_time__lt=obj.submission_time,
            )
            .order_by("-submission_time")
            .values_list("id", flat=True)
            .first()
        )
        return prev

    def get_compile_hints(self, obj):
        """Item 14: hints only on compile errors — other verdicts keep the
        field as an empty list (shape stability for the client)."""
        if obj.verdict != Submission.VerdictStatus.COMPILE_ERROR:
            return []
        from .explain import explain_compile_errors

        return explain_compile_errors(obj.detailed_feedback)

    def get_runtime_percentile(self, obj):
        time_ms = obj.execution_time_ms
        if not time_ms:
            return None
        from submissions.models import Submission

        pool = Submission.objects.filter(
            problem_id=obj.problem_id,
            language=obj.language,
            verdict=Submission.VerdictStatus.ACCEPTED,
        ).exclude(execution_time_ms__isnull=True)
        total = pool.count()
        if total == 0:
            return None
        slower = pool.filter(execution_time_ms__gt=time_ms).count()
        return round(slower / total, 4)

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        try:
            if instance.problem:
                representation["problem"] = {
                    "id": instance.problem.id,
                    "title_i18n": instance.problem.title_i18n,
                }
        except ObjectDoesNotExist:
            representation["problem"] = None
        # Ensure test_results are serialized if not handled by default due to read_only=True on field
        # This is usually handled automatically by DRF if 'test_results' is in fields.
        return representation


class SubmissionListSerializer(SubmissionSerializer):
    """Slim serializer for the LIST action (SPEC-GAPS D-B4 item 5).

    Omits ``code`` and ``test_results`` so list fetches (e.g. /my-submissions)
    stop pulling every submission's full source code + per-test rows. The
    list shape stays a strict subset of the retrieve shape (same field names).
    """

    test_results = None  # type: ignore[assignment]  # drop the nested rows

    class Meta(SubmissionSerializer.Meta):
        fields = [
            f
            for f in SubmissionSerializer.Meta.fields
            if f not in ("code", "test_results")
        ]


class SubmissionCreateSerializer(serializers.ModelSerializer):
    problem = serializers.PrimaryKeyRelatedField(queryset=Problem.objects.all())
    # Contest-bound submit (CON-1): optional; validated by
    # contests.gating.check_contest_submission (registered + window open +
    # problem on the board + cooldown). Write-only: reads expose the id via
    # SubmissionSerializer.contest.
    contest = serializers.PrimaryKeyRelatedField(
        queryset=Contest.objects.all(), required=False, allow_null=True, write_only=True
    )

    class Meta:
        model = Submission
        fields = ["problem", "language", "code", "contest", "ai_assisted"]

    def validate(self, attrs):
        """Submit-time validation: language registry + allowed_languages
        (SPEC-GAPS G10), Scratch project validation (wave D engine 2),
        and, for contest-bound submissions, the CON-1 gate (registered +
        window open + board membership + cooldown).
        """
        language = attrs.get("language")
        # Wave D engine 2: 'scratch' is a valid SUBMISSION language (the
        # sb3 project JSON transpiles to Python at judge time) even though
        # it has no judge-registry toolchain of its own.
        if language != SCRATCH_LANGUAGE_ID and get_language(language) is None:
            raise serializers.ValidationError(
                {
                    "language": (
                        f"Unsupported language '{language}'. "
                        f"Supported languages: "
                        f"{', '.join((*SUPPORTED_LANGUAGE_IDS, SCRATCH_LANGUAGE_ID))}."
                    )
                }
            )
        problem = attrs.get("problem")
        if problem is not None:
            allowed = problem.allowed_languages or []
            if allowed and language not in allowed:
                raise serializers.ValidationError(
                    {
                        "language": (
                            f"Language '{language}' is not allowed for this "
                            f"problem. Allowed: {', '.join(map(str, allowed))}."
                        )
                    }
                )
            # Custom-library allowlist (SPEC-GAPS J3/E1): pip requirement
            # entries are judge inputs — reject URL/VCS/path/extras
            # specifiers at submit time with a 400 instead of executing
            # them anywhere near the judge. (The judge re-validates.)
            # Wave C: the policy's python "allowed" extras face the SAME
            # pip allowlist validation as custom_libraries_allowed.
            from problems.feature_policy import allowed_libraries as _policy_allows

            for entry in [
                *(problem.custom_libraries_allowed or []),
                *_policy_allows(problem.library_policy, "python3"),
            ]:
                if not is_allowed_requirement(entry):
                    raise serializers.ValidationError(
                        {
                            "problem": (
                                f"disallowed library specifier: {entry!r} "
                                "(only 'name' or 'name==version' allowed)"
                            )
                        }
                    )
            # Wave E (partial-code): the submission must be the FULL
            # assembled skeleton with every locked region byte-identical
            # (documented whitespace policy); the language is the
            # template's language, not a free choice.
            if problem.code_template:
                from problems.code_template import verify_locked_integrity

                if language != problem.code_template_language:
                    raise serializers.ValidationError(
                        {
                            "language": (
                                f"This is a partial-code problem; submissions "
                                f"must use the template's language "
                                f"({problem.code_template_language})."
                            )
                        }
                    )
                ok, message = verify_locked_integrity(
                    problem.code_template, attrs.get("code") or ""
                )
                if not ok:
                    raise serializers.ValidationError({"code": message})

            # Wave C library/feature policy (problems/feature_policy.py):
            # submit-time static scan — a banned import/include/feature
            # rejects the submission with a clear 400 instead of a
            # judge-side surprise. (The judge re-scans: defense in depth.)
            if problem.library_policy:
                from problems.feature_policy import scan_policy_violations

                violations = scan_policy_violations(
                    attrs.get("code") or "", language, problem.library_policy
                )
                if violations:
                    raise serializers.ValidationError({"code": " ".join(violations)})
            # Wave D engine 2 (Scratch): the problem must be a Scratch
            # block problem, and the submitted project must only use the
            # blocks this problem allows. (The judge re-validates before
            # transpiling: defense in depth, same pattern as wave C/E.)
            if language == SCRATCH_LANGUAGE_ID:
                block_config = problem.block_config or {}
                if block_config.get("engine") != "scratch":
                    raise serializers.ValidationError(
                        {
                            "language": (
                                "This problem does not accept Scratch submissions."
                            )
                        }
                    )
                from problems.scratch_transpiler import validate_project

                problems_found = validate_project(
                    attrs.get("code") or "",
                    block_config.get("scratch_blocks"),
                )
                if problems_found:
                    raise serializers.ValidationError(
                        {"code": " ".join(problems_found)}
                    )
        # Contest gate (CON-1): registered + window open + board membership
        # + the OPR-4 in-contest cooldown.
        contest = attrs.get("contest")
        if contest is not None and problem is not None:
            from contests.gating import check_contest_submission

            ok, error = check_contest_submission(
                contest, self.context.get("request").user, problem.id
            )
            if not ok:
                raise serializers.ValidationError({"contest": error})
        elif problem is not None:
            # CON-5 archive gate: while the problem belongs to a contest that
            # has not reverted to practice yet, the problem page stays shut
            # (otherwise the live board leaks through practice submissions).
            from contests.gating import practice_blocked_reason

            reason = practice_blocked_reason(
                problem, getattr(self.context.get("request"), "user", None)
            )
            if reason:
                raise serializers.ValidationError({"problem": reason})
        return attrs

    def create(self, validated_data):
        # User is set in the view (e.g., self.perform_create)
        submission = Submission.objects.create(**validated_data)
        return submission
