"""Wave G item 89 — guest try-it endpoint tests (sandbox mocked).

The anonymous surface must: work without an account, carry the tight
``scratch_guest`` IP throttle, persist a PII-free audit row (hashed IP,
truncated source), and map compile/timeout failures onto the status enum
exactly like the authenticated scratch run.
"""

from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from submissions.models import Submission

from .models import GuestScratchRun

SCRATCH = "scratch.views"


class GuestScratchEndpointTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.payload = {"language": "python3", "code": "print(input())", "input": "42"}

    def test_anonymous_happy_path(self):
        with (
            mock.patch(
                f"{SCRATCH}.compile_code_in_sandbox",
                return_value=(True, "", "/tmp/exe"),
            ),
            mock.patch(
                f"{SCRATCH}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 9, 1024, "42\n", ""),
            ),
        ):
            response = self.client.post(
                "/api/v1/scratch/guest/", self.payload, REMOTE_ADDR="203.0.113.7"
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "OK")
        self.assertEqual(response.data["output"], "42\n")
        run = GuestScratchRun.objects.get()
        self.assertEqual(run.language, "python3")
        self.assertNotEqual(run.ip_hash, "203.0.113.7")  # hashed, not raw
        self.assertEqual(len(run.ip_hash), 32)
        # The same IP hashes to the same value (abuse correlation works).
        again = mock.Mock()
        again.META = {"REMOTE_ADDR": "203.0.113.7"}
        from .views import _hash_ip

        self.assertEqual(_hash_ip(again), run.ip_hash)

    def test_unknown_language_rejected(self):
        response = self.client.post(
            "/api/v1/scratch/guest/",
            {"language": "cobol", "code": "x", "input": ""},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsupported language", str(response.data))

    def test_compile_error_arm(self):
        with mock.patch(
            f"{SCRATCH}.compile_code_in_sandbox",
            return_value=(False, "SyntaxError: invalid syntax", None),
        ):
            response = self.client.post("/api/v1/scratch/guest/", self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "COMPILE_ERROR")
        self.assertIn("SyntaxError", response.data["error"])

    def test_timeout_maps_to_timeout_status(self):
        with (
            mock.patch(
                f"{SCRATCH}.compile_code_in_sandbox",
                return_value=(True, "", "/tmp/exe"),
            ),
            mock.patch(
                f"{SCRATCH}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.TIME_LIMIT_EXCEEDED, -1, -1, "", ""),
            ),
        ):
            response = self.client.post("/api/v1/scratch/guest/", self.payload)
        self.assertEqual(response.data["status"], "TIMEOUT")

    def test_runtime_error_mapping(self):
        with (
            mock.patch(
                f"{SCRATCH}.compile_code_in_sandbox",
                return_value=(True, "", "/tmp/exe"),
            ),
            mock.patch(
                f"{SCRATCH}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.RUNTIME_ERROR, -1, -1, "", "boom"),
            ),
        ):
            response = self.client.post("/api/v1/scratch/guest/", self.payload)
        self.assertEqual(response.data["status"], "RUNTIME_ERROR")

    def test_output_truncated_at_guest_cap(self):
        big = "x" * 20_000
        with (
            mock.patch(
                f"{SCRATCH}.compile_code_in_sandbox",
                return_value=(True, "", "/tmp/exe"),
            ),
            mock.patch(
                f"{SCRATCH}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 512, big, ""),
            ),
        ):
            response = self.client.post("/api/v1/scratch/guest/", self.payload)
        self.assertEqual(len(response.data["output"]), 4_000)

    def test_source_truncated_in_audit_row_only(self):
        long_code = "a" * 6_000
        with (
            mock.patch(
                f"{SCRATCH}.compile_code_in_sandbox",
                return_value=(True, "", "/tmp/exe"),
            ),
            mock.patch(
                f"{SCRATCH}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 512, "ok", ""),
            ),
        ):
            response = self.client.post(
                "/api/v1/scratch/guest/",
                {"language": "python3", "code": long_code, "input": ""},
            )
        self.assertEqual(response.status_code, 200)
        run = GuestScratchRun.objects.get()
        self.assertEqual(len(run.source_code), 2_000)

    def test_guest_throttle_blocks_burst(self):
        from rest_framework.throttling import SimpleRateThrottle

        with mock.patch.object(
            SimpleRateThrottle,
            "THROTTLE_RATES",
            {"anon": "10000/min", "scratch_guest": "2/hour"},
        ):
            with (
                mock.patch(
                    f"{SCRATCH}.compile_code_in_sandbox",
                    return_value=(True, "", "/tmp/exe"),
                ),
                mock.patch(
                    f"{SCRATCH}.run_code_in_sandbox",
                    return_value=(Submission.VerdictStatus.ACCEPTED, 1, 1, "ok", ""),
                ),
            ):
                first = self.client.post(
                    "/api/v1/scratch/guest/", self.payload, REMOTE_ADDR="198.51.100.3"
                )
                second = self.client.post(
                    "/api/v1/scratch/guest/", self.payload, REMOTE_ADDR="198.51.100.3"
                )
                third = self.client.post(
                    "/api/v1/scratch/guest/", self.payload, REMOTE_ADDR="198.51.100.3"
                )
                other_ip = self.client.post(
                    "/api/v1/scratch/guest/", self.payload, REMOTE_ADDR="198.51.100.4"
                )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        # The scope is per-IP: a different visitor is unaffected.
        self.assertEqual(other_ip.status_code, 200)

    def test_input_size_cap_enforced(self):
        response = self.client.post(
            "/api/v1/scratch/guest/",
            {"language": "python3", "code": "print(1)", "input": "x" * 20_000},
        )
        self.assertEqual(response.status_code, 400)


class GuestScratchModelTest(TestCase):
    def test_str(self):
        run = GuestScratchRun.objects.create(
            ip_hash="a" * 32, language="python3", source_code="print(1)"
        )
        self.assertEqual(str(run), f"GuestScratchRun {run.id} (python3)")
