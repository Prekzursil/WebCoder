"""Wave G PR6 backend tests — integrity & safety (items 113-119)."""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from forum.models import Post, Thread
from messaging.models import Conversation, Message, MessageReport
from rest_framework.test import APIClient
from users.models import User

from integrity.models import Appeal, ModerationAction, SimilarityFlag
from integrity.services import (
    FLAG_THRESHOLD,
    abuse_queue,
    multi_account_clusters,
    scan_boilerplate,
    scan_problem_plagiarism,
    similarity,
)
from problems.models import Problem
from submissions.models import Submission


def _problem(**extra):
    return Problem.objects.create(
        title_i18n={"en": "Sum"},
        statement_i18n={"en": "Add."},
        status=Problem.ProblemStatus.APPROVED,
        **extra,
    )


def _sub(user, problem, code, **extra):
    return Submission.objects.create(
        user=user, problem=problem, language="python3", code=code, **extra
    )


class SimilarityTest(TestCase):
    """Item 113 — the scanner's primitives."""

    def test_similarity_basics(self):
        a = "def solve(n):\n    return n + n\n"
        same = "def solve(n):\n    return n + n\n"
        different = "print('completely different tokens here entirely')\n"
        self.assertGreater(similarity(a, same), 0.99)
        self.assertLess(similarity(a, different), 0.05)
        self.assertEqual(similarity("", "x"), 0.0)


class PlagiarismScanTest(TestCase):
    """Item 113 — the pairwise scan."""

    def setUp(self):
        self.alice = User.objects.create_user(username="palice", password="pw")
        self.bob = User.objects.create_user(username="pbob", password="pw")
        self.carol = User.objects.create_user(username="pcarol", password="pw")
        self.problem = _problem()
        self.verifier = User.objects.create_user(
            username="pver", password="pw", role="VERIFIER"
        )

    def test_identical_sources_flag_and_scans_are_idempotent(self):
        code = "n = int(input())\nprint(2 * n)\n"
        _sub(self.alice, self.problem, code)
        _sub(self.bob, self.problem, code)
        _sub(self.carol, self.problem, "print('unique answer tokens')\n")
        created = scan_problem_plagiarism(self.problem)
        self.assertGreaterEqual(created, 1)
        flag = SimilarityFlag.objects.filter(
            kind=SimilarityFlag.Kind.PLAGIARISM
        ).first()
        self.assertGreaterEqual(flag.score, FLAG_THRESHOLD)
        # Re-running the scan creates nothing new (pairs skipped).
        self.assertEqual(scan_problem_plagiarism(self.problem), 0)
        # Carol's unique submission never flags.
        self.assertFalse(
            SimilarityFlag.objects.filter(submission__user=self.carol).exists()
        )

    def test_same_user_pairs_not_flagged(self):
        code = "n = int(input())\nprint(2 * n)\n"
        _sub(self.alice, self.problem, code)
        _sub(self.alice, self.problem, code)
        self.assertEqual(scan_problem_plagiarism(self.problem), 0)


class BoilerplateScanTest(TestCase):
    """Item 114 — submission-vs-template."""

    def test_template_clone_flags(self):
        author = User.objects.create_user(username="bauth", password="pw")
        problem = _problem(
            author=author,
            code_template=(
                "#include <iostream>\nint main() { int n; std::cin >> n; "
                "std::cout << 2 * n; }\n"
            ),
        )
        user = User.objects.create_user(username="bclone", password="pw")
        _sub(user, problem, problem.code_template + "\n")
        original = User.objects.create_user(username="borig", password="pw")
        _sub(original, problem, "entirely different tokens answer program\n")
        created = scan_boilerplate(problem)
        self.assertEqual(created, 1)
        flag = SimilarityFlag.objects.get(kind=SimilarityFlag.Kind.BOILERPLATE)
        self.assertGreaterEqual(flag.score, 0.95)
        self.assertIsNone(flag.other_submission)

    def test_no_template_is_a_noop(self):
        problem = _problem()
        user = User.objects.create_user(username="bnoop", password="pw")
        _sub(user, problem, "anything")
        self.assertEqual(scan_boilerplate(problem), 0)


class IntegrityAPITest(TestCase):
    """Items 113/114 — scan + flags + review endpoints."""

    def setUp(self):
        self.verifier = User.objects.create_user(
            username="iver", password="pw", role="VERIFIER"
        )
        self.admin = User.objects.create_user(
            username="iadm", password="pw", role="ADMIN"
        )
        self.basic = User.objects.create_user(username="ibas", password="pw")
        self.alice = User.objects.create_user(username="ialice", password="pw")
        self.bob = User.objects.create_user(username="ibob", password="pw")
        self.problem = _problem()
        code = "n = int(input())\nprint(2 * n)\n"
        _sub(self.alice, self.problem, code)
        _sub(self.bob, self.problem, code)
        self.client = APIClient()

    def test_scan_requires_moderator(self):
        anon = APIClient().post(
            "/api/v1/integrity/scan/", {"problem": 1}, format="json"
        )
        self.assertEqual(anon.status_code, 401)
        self.client.force_authenticate(self.basic)
        self.assertEqual(
            self.client.post(
                "/api/v1/integrity/scan/", {"problem": self.problem.id}, format="json"
            ).status_code,
            404,
        )

    def test_scan_flags_and_list_and_review(self):
        self.client.force_authenticate(self.verifier)
        scan = self.client.post(
            "/api/v1/integrity/scan/", {"problem": self.problem.id}, format="json"
        )
        self.assertEqual(scan.status_code, 200)
        self.assertGreaterEqual(scan.data["flags_created"]["plagiarism"], 1)

        listed = self.client.get("/api/v1/integrity/flags/")
        self.assertEqual(listed.status_code, 200)
        flag_id = listed.data[0]["id"]
        self.assertEqual(listed.data[0]["submission"]["user"], "ibob")

        bad = self.client.post(
            f"/api/v1/integrity/flags/{flag_id}/review/",
            {"decision": "meh"},
            format="json",
        )
        self.assertEqual(bad.status_code, 400)
        review = self.client.post(
            f"/api/v1/integrity/flags/{flag_id}/review/",
            {"decision": "confirmed"},
            format="json",
        )
        self.assertEqual(review.data["status"], "CONFIRMED")
        self.assertTrue(
            ModerationAction.objects.filter(
                action=ModerationAction.ActionKind.SIMILARITY_REVIEWED
            ).exists()
        )

    def test_scan_unknown_problem_404(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/integrity/scan/", {"problem": 999999}, format="json"
        )
        self.assertEqual(response.status_code, 404)


class MultiAccountTest(TestCase):
    """Item 115 — shared-IP heuristics."""

    def test_clusters_by_shared_ips(self):
        alice = User.objects.create_user(username="malice", password="pw")
        bob = User.objects.create_user(username="mbob", password="pw")
        carol = User.objects.create_user(username="mcarol", password="pw")
        problem = _problem()
        _sub(alice, problem, "a", ip_address="10.0.0.1")
        _sub(bob, problem, "b", ip_address="10.0.0.1")
        _sub(alice, problem, "a2", ip_address="10.0.0.2")
        _sub(bob, problem, "b2", ip_address="10.0.0.2")
        _sub(carol, problem, "c", ip_address="10.0.0.9")
        clusters = multi_account_clusters()
        self.assertEqual(len(clusters), 1)
        row = clusters[0]
        self.assertEqual(row["user_ids"], [alice.id, bob.id])
        self.assertEqual(sorted(row["shared_ips"]), ["10.0.0.1", "10.0.0.2"])
        # Admin endpoint resolves usernames.
        admin = User.objects.create_user(username="madm", password="pw", role="ADMIN")
        client = APIClient()
        client.force_authenticate(admin)
        data = client.get("/api/v1/integrity/multi-accounts/").data
        self.assertEqual(data["clusters"][0]["usernames"], ["malice", "mbob"])

    def test_basic_cannot_access(self):
        basic = User.objects.create_user(username="mbas", password="pw")
        client = APIClient()
        client.force_authenticate(basic)
        self.assertEqual(
            client.get("/api/v1/integrity/multi-accounts/").status_code, 403
        )

    def test_ip_captured_on_submit(self):
        user = User.objects.create_user(username="mip", password="pw")
        problem = _problem()
        client = APIClient()
        client.force_authenticate(user)
        from unittest import mock

        with mock.patch("submissions.views.judge_task"):
            client.post(
                "/api/v1/submissions/submit/",
                {"problem": problem.id, "language": "python3", "code": "print(1)"},
                format="json",
                REMOTE_ADDR="203.0.113.9",
            )
        sub = Submission.objects.get(user=user, problem=problem)
        self.assertEqual(sub.ip_address, "203.0.113.9")


class AbuseQueueTest(TestCase):
    """Item 117 — unified queue + SLA."""

    def test_queue_merges_sources_with_sla(self):
        author = User.objects.create_user(username="qauth", password="pw")
        reporter = User.objects.create_user(username="qrep", password="pw")
        thread = Thread.objects.create(title="T", author=author)
        post = Post.objects.create(thread=thread, author=author, content="x")
        from forum.models import Report

        Report.objects.create(
            post=post,
            reporter=reporter,
            reason=Report.Reason.SPAM,
            details="",
        )
        post2 = Post.objects.create(thread=thread, author=author, content="y")
        old_report = Report.objects.create(
            post=post2,
            reporter=reporter,
            reason=Report.Reason.OTHER,
            details="",
        )
        Report.objects.filter(pk=old_report.pk).update(
            created_at=timezone.now() - timedelta(hours=50)
        )
        queue = abuse_queue()
        self.assertEqual(queue["open_count"], 2)
        self.assertEqual(queue["sla_breached_count"], 1)
        self.assertEqual(queue["items"][0]["id"], old_report.id)

        verifier = User.objects.create_user(
            username="qver", password="pw", role="VERIFIER"
        )
        client = APIClient()
        client.force_authenticate(verifier)
        data = client.get("/api/v1/integrity/abuse-queue/").data
        self.assertEqual(data["open_count"], 2)
        # Non-moderators get 404.
        client.force_authenticate(reporter)
        self.assertEqual(client.get("/api/v1/integrity/abuse-queue/").status_code, 404)


class AppealsTest(TestCase):
    """Item 118 — audit trail + appeals."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="aadm", password="pw", role="ADMIN"
        )
        self.verifier = User.objects.create_user(
            username="aver", password="pw", role="VERIFIER"
        )
        self.target = User.objects.create_user(username="atgt", password="pw")
        self.action = ModerationAction.objects.create(
            moderator=self.verifier,
            target_user=self.target,
            action=ModerationAction.ActionKind.CONTENT_HIDDEN,
            note="hid a post",
        )
        self.client = APIClient()

    def test_audit_lists_actions(self):
        self.client.force_authenticate(self.verifier)
        data = self.client.get("/api/v1/integrity/audit/").data
        self.assertEqual(data[0]["action"], "CONTENT_HIDDEN")
        self.assertEqual(data[0]["target_user"], "atgt")

    def test_appeal_lifecycle(self):
        self.client.force_authenticate(self.target)
        short = self.client.post(
            "/api/v1/integrity/appeals/",
            {"action": self.action.id, "text": "x"},
            format="json",
        )
        self.assertEqual(short.status_code, 400)
        created = self.client.post(
            "/api/v1/integrity/appeals/",
            {
                "action": self.action.id,
                "text": "I believe this hide was wrong because.",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        dup = self.client.post(
            "/api/v1/integrity/appeals/",
            {"action": self.action.id, "text": "second try, also long enough."},
            format="json",
        )
        self.assertEqual(dup.status_code, 409)
        # Another user cannot appeal someone else's action.
        other = User.objects.create_user(username="aoth", password="pw")
        self.client.force_authenticate(other)
        self.assertEqual(
            self.client.post(
                "/api/v1/integrity/appeals/",
                {"action": self.action.id, "text": "not my action at all."},
                format="json",
            ).status_code,
            403,
        )
        # Admin sees pending + decides.
        self.client.force_authenticate(self.admin)
        listed = self.client.get("/api/v1/integrity/appeals/").data
        self.assertEqual(len(listed), 1)
        bad = self.client.post(
            f"/api/v1/integrity/appeals/{created.data['id']}/decide/",
            {"decision": "maybe"},
            format="json",
        )
        self.assertEqual(bad.status_code, 400)
        decided = self.client.post(
            f"/api/v1/integrity/appeals/{created.data['id']}/decide/",
            {"decision": "accepted", "note": "fair point"},
            format="json",
        )
        self.assertEqual(decided.data["status"], "ACCEPTED")
        again = self.client.post(
            f"/api/v1/integrity/appeals/{created.data['id']}/decide/",
            {"decision": "rejected"},
            format="json",
        )
        self.assertEqual(again.status_code, 409)

    def test_verifier_cannot_decide(self):
        self.client.force_authenticate(self.target)
        created = self.client.post(
            "/api/v1/integrity/appeals/",
            {"action": self.action.id, "text": "please reconsider this hide."},
            format="json",
        )
        self.client.force_authenticate(self.verifier)
        self.assertEqual(
            self.client.post(
                f"/api/v1/integrity/appeals/{created.data['id']}/decide/",
                {"decision": "rejected"},
                format="json",
            ).status_code,
            403,
        )


class AILabelTest(TestCase):
    """Item 116 — the ai_assisted self-declaration."""

    def test_submit_stores_and_displays_the_flag(self):
        user = User.objects.create_user(username="ailab", password="pw")
        problem = _problem()
        client = APIClient()
        client.force_authenticate(user)
        from unittest import mock

        with mock.patch("submissions.views.judge_task"):
            created = client.post(
                "/api/v1/submissions/submit/",
                {
                    "problem": problem.id,
                    "language": "python3",
                    "code": "print(1)",
                    "ai_assisted": True,
                },
                format="json",
            )
        self.assertEqual(created.status_code, 201)
        sub = Submission.objects.get(pk=created.data["id"])
        self.assertTrue(sub.ai_assisted)
        detail = client.get(f"/api/v1/submissions/submissions/{sub.id}/").data
        self.assertTrue(detail["ai_assisted"])


class CoverageChaseTest(TestCase):
    """Full-line-coverage chase for the new integrity modules (the wave-G
    gate pins every new backend app at 100%): __str__ renderers, the
    `since` scan window, below-threshold multi-account pairs, the abuse
    queue's message-report and similarity-flag lanes, and the guard /
    not-found / single-kind branches of every view."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="cadr", password="pw", role="ADMIN"
        )
        self.verifier = User.objects.create_user(
            username="cver", password="pw", role="VERIFIER"
        )
        self.basic = User.objects.create_user(username="cbas", password="pw")
        self.alice = User.objects.create_user(username="calice", password="pw")
        self.bob = User.objects.create_user(username="cbob", password="pw")
        self.problem = _problem()
        self.client = APIClient()

    def test_model_str_representations(self):
        code = "n = int(input())\nprint(2 * n)\n"
        _sub(self.alice, self.problem, code)
        _sub(self.bob, self.problem, code)
        scan_problem_plagiarism(self.problem)
        flag = SimilarityFlag.objects.filter(
            kind=SimilarityFlag.Kind.PLAGIARISM
        ).first()
        self.assertIn("PLAGIARISM", str(flag))

        templated = _problem(code_template=code)
        _sub(self.alice, templated, code)
        scan_boilerplate(templated)
        boiler = SimilarityFlag.objects.filter(
            kind=SimilarityFlag.Kind.BOILERPLATE
        ).first()
        self.assertIn("template", str(boiler))

        action = ModerationAction.objects.create(
            moderator=self.verifier,
            target_user=self.alice,
            action=ModerationAction.ActionKind.CONTENT_HIDDEN,
            note="n",
        )
        self.assertIn("CONTENT_HIDDEN", str(action))
        appeal = Appeal.objects.create(
            action=action, appellant=self.alice, text="please review this hide."
        )
        self.assertIn("PENDING", str(appeal))

    def test_plagiarism_scan_since_window_excludes_old_rows(self):
        code = "n = int(input())\nprint(2 * n)\n"
        old = _sub(self.alice, self.problem, code)
        _sub(self.bob, self.problem, code)
        Submission.objects.filter(pk=old.pk).update(
            submission_time=timezone.now() - timedelta(days=10)
        )
        # The `since` window drops alice's old row, leaving no cross-user
        # pair: zero flags (and the no-window call still finds the pair).
        self.assertEqual(
            scan_problem_plagiarism(
                self.problem, since=timezone.now() - timedelta(days=1)
            ),
            0,
        )
        self.assertEqual(scan_problem_plagiarism(self.problem), 1)

    def test_multi_account_pair_below_threshold_is_dropped(self):
        # One shared IP is below the default min_shared_ips=2 → no cluster,
        # exercising the loop's False branch.
        _sub(self.alice, self.problem, "a", ip_address="10.9.9.1")
        _sub(self.bob, self.problem, "b", ip_address="10.9.9.1")
        self.assertEqual(multi_account_clusters(), [])

    def test_abuse_queue_merges_message_reports_and_flags(self):
        u1, u2 = sorted([self.alice, self.bob], key=lambda u: u.id)
        conversation = Conversation.objects.create(user1=u1, user2=u2)
        message = Message.objects.create(
            conversation=conversation, sender=self.alice, body="buy my thing"
        )
        MessageReport.objects.create(
            message=message,
            reporter=self.bob,
            reason=MessageReport.Reason.SPAM,
            details="",
        )
        code = "n = int(input())\nprint(2 * n)\n"
        a = _sub(self.alice, self.problem, code)
        b = _sub(self.bob, self.problem, code)
        SimilarityFlag.objects.create(
            kind=SimilarityFlag.Kind.PLAGIARISM,
            submission=a,
            other_submission=b,
            score=0.91,
        )
        queue = abuse_queue()
        kinds = {item["kind"] for item in queue["items"]}
        self.assertIn("message_report", kinds)
        self.assertIn("similarity_flag", kinds)

    def test_guard_not_found_and_single_kind_branches(self):
        # Non-moderator guards 404 on flags / review / audit / appeals list.
        self.client.force_authenticate(self.basic)
        self.assertEqual(self.client.get("/api/v1/integrity/flags/").status_code, 404)
        self.assertEqual(
            self.client.post(
                "/api/v1/integrity/flags/1/review/",
                {"decision": "confirmed"},
                format="json",
            ).status_code,
            404,
        )
        self.assertEqual(self.client.get("/api/v1/integrity/audit/").status_code, 404)
        self.assertEqual(
            self.client.post(
                "/api/v1/integrity/appeals/",
                {"action": 999999, "text": "an action that does not exist."},
                format="json",
            ).status_code,
            404,
        )
        self.assertEqual(self.client.get("/api/v1/integrity/appeals/").status_code, 404)

        # Moderator: unknown flag 404 + single-kind scans.
        self.client.force_authenticate(self.verifier)
        self.assertEqual(
            self.client.post(
                "/api/v1/integrity/flags/999999/review/",
                {"decision": "confirmed"},
                format="json",
            ).status_code,
            404,
        )
        # Single-kind scans: both counters always ship, but only the
        # requested kind actually runs (a cross-user pair exists →
        # plagiarism 1; the problem has no template → boilerplate 0).
        code = "n = int(input())\nprint(2 * n)\n"
        _sub(self.alice, self.problem, code)
        _sub(self.bob, self.problem, code)
        plagiarism_only = self.client.post(
            "/api/v1/integrity/scan/",
            {"problem": self.problem.id, "kinds": ["plagiarism"]},
            format="json",
        )
        self.assertEqual(plagiarism_only.status_code, 200)
        self.assertEqual(plagiarism_only.data["flags_created"]["plagiarism"], 1)
        self.assertEqual(plagiarism_only.data["flags_created"]["boilerplate"], 0)
        boilerplate_only = self.client.post(
            "/api/v1/integrity/scan/",
            {"problem": self.problem.id, "kinds": ["boilerplate"]},
            format="json",
        )
        self.assertEqual(boilerplate_only.status_code, 200)
        self.assertEqual(boilerplate_only.data["flags_created"]["plagiarism"], 0)
        self.assertEqual(boilerplate_only.data["flags_created"]["boilerplate"], 0)

        # Admin: unknown appeal 404 + the audit ?user= filter.
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.post(
                "/api/v1/integrity/appeals/999999/decide/",
                {"decision": "accepted"},
                format="json",
            ).status_code,
            404,
        )
        ModerationAction.objects.create(
            moderator=self.verifier,
            target_user=self.bob,
            action=ModerationAction.ActionKind.CONTENT_HIDDEN,
            note="n",
        )
        data = self.client.get("/api/v1/integrity/audit/", {"user": "cbob"}).data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["target_user"], "cbob")
