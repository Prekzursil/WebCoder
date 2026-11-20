"""Coverage chase for the wave-G merge tail: the SSRF validator's
rejection branches, the teacher-exam junk-answer path, its 503 branches,
and the partnership email-validation branch (main's quality gate pins
100% line coverage repo-wide)."""

from django.test import TestCase
from rest_framework.test import APIClient

from analytics.views import _validated_webhook_url
from certificates.teacher import grade_exam, seed_questions
from users.models import User

APPLY = "/api/v1/partnerships/apply/"
EXAM = "/api/v1/certificates/teacher-exam/"


class SsrfValidatorTest(TestCase):
    def test_rejection_branches(self):
        # http scheme
        self.assertIsNone(_validated_webhook_url("http://hooks.example.com/x"))
        # no host
        self.assertIsNone(_validated_webhook_url("https:///path"))
        # embedded credentials
        self.assertIsNone(_validated_webhook_url("https://user:pw@hooks.example.com/x"))
        # unusual port
        self.assertIsNone(_validated_webhook_url("https://hooks.example.com:8443/x"))
        # IP-literal private / loopback / link-local hosts
        self.assertIsNone(_validated_webhook_url("https://10.0.0.5/x"))
        self.assertIsNone(_validated_webhook_url("https://127.0.0.1/x"))
        self.assertIsNone(_validated_webhook_url("https://169.254.1.1/x"))
        # malformed
        self.assertIsNone(_validated_webhook_url("not a url"))
        # accepted: public DNS name over https
        self.assertEqual(
            _validated_webhook_url("https://hooks.example.com/x"),
            "https://hooks.example.com/x",
        )


class TeacherExamJunkAnswersTest(TestCase):
    """teacher.py lines 28/34-35: TypeError and ValueError answer paths."""

    def setUp(self):
        self.teacher = User.objects.create_user(
            username="cjunk", password="pw", role="TEACHER"
        )
        seed_questions()

    def test_non_numeric_answer_valueerror(self):
        result = grade_exam(self.teacher, {"junk": "not-a-number"})
        self.assertEqual(result["correct"], 0)
        self.assertFalse(result["passed"])

    def test_none_answer_typeerror(self):
        from certificates.models import TeacherCertQuestion

        first = TeacherCertQuestion.objects.first()
        result = grade_exam(self.teacher, {first.pk: None})
        self.assertEqual(result["correct"], 0)

    def test_no_questions_error(self):
        from certificates.models import TeacherCertQuestion

        TeacherCertQuestion.objects.update(active=False)
        result = grade_exam(self.teacher, {})
        self.assertEqual(result, {"error": "exam not configured"})


class TeacherExamView503Test(TestCase):
    """teacher_views.py lines 52/66: the not-configured 503 branches."""

    def setUp(self):
        self.teacher = User.objects.create_user(
            username="c503", password="pw", role="TEACHER"
        )
        self.client = APIClient()
        self.client.force_authenticate(self.teacher)

    def test_get_503_without_bank(self):
        self.assertEqual(self.client.get(EXAM).status_code, 503)

    def test_post_503_without_bank(self):
        self.assertEqual(
            self.client.post(EXAM, {"answers": {"1": 0}}, format="json").status_code,
            503,
        )


class PartnershipEmailBranchTest(TestCase):
    """partnerships/views.py lines 72-73: the invalid-email 400."""

    def test_invalid_email_400(self):
        client = APIClient()
        response = client.post(
            APPLY,
            {
                "school_name": "Liceul X",
                "city": "Iași",
                "contact_name": "Prof Y",
                "contact_email": "not-an-email",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("invalid contact email", str(response.data))


class SsrfValidatorTailTest(TestCase):
    """The remaining validator branches (ValueError parse, public IP
    literal accepted, link-local IPv6 rejected)."""

    def test_unparseable_url_valueerror(self):
        # A malformed bracket host makes urlsplit itself raise ValueError.
        self.assertIsNone(_validated_webhook_url("https://[::1"))

    def test_public_ip_literal_accepted(self):
        # Bracketed IPv6 literals are the parseable form.
        self.assertIsNotNone(_validated_webhook_url("https://[2606:4700::6810:85e3]/x"))

    def test_ipv6_loopback_rejected(self):
        self.assertIsNone(_validated_webhook_url("https://[::1]/x"))


class SeedCommandTest(TestCase):
    """call_command coverage for seed_teacher_cert_exam."""

    def test_command_runs(self):
        from django.core.management import call_command
        from io import StringIO

        out = StringIO()
        call_command("seed_teacher_cert_exam", stdout=out)
        self.assertIn("teacher exam bank ready", out.getvalue())


class TeacherExamPostForbiddenTest(TestCase):
    """teacher_views.py line 52: the non-teacher POST guard."""

    def test_student_post_403(self):
        student = User.objects.create_user(username="cstu", password="pw")
        client = APIClient()
        client.force_authenticate(student)
        self.assertEqual(
            client.post(EXAM, {"answers": {"1": 0}}, format="json").status_code,
            403,
        )
