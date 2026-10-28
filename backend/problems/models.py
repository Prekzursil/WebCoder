from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from users.utils import get_sentinel_user


class Tag(models.Model):
    """
    Model for categorizing problems.
    """

    # For multilingual name, using JSONField: {"en": "Arrays", "ro": "Tablouri"}
    name_i18n = models.JSONField(
        _("name (i18n)"),
        help_text=_(
            "Tag name in different languages, e.g., {'en': 'English Name', 'ro': 'Romanian Name'}"
        ),
    )
    slug = models.SlugField(
        _("slug"),
        max_length=100,
        unique=True,
        help_text=_("A short label for the tag, generally used in URLs."),
    )

    def __str__(self):
        # Attempt to return English name if available, otherwise first available, or slug
        if isinstance(self.name_i18n, dict):
            return self.name_i18n.get("en", self.name_i18n.get("ro", self.slug))
        return self.slug

    class Meta:
        verbose_name = _("tag")
        verbose_name_plural = _("tags")


class Problem(models.Model):
    """
    Model representing a programming problem.
    """

    class ProblemStatus(models.TextChoices):
        DRAFT = "DRAFT", _("Draft")
        PENDING_APPROVAL = "PENDING", _("Pending Approval")
        APPROVED = "APPROVED", _("Approved")
        PRIVATE = "PRIVATE", _("Private")  # Rejected or needs revision

    class DifficultyLevel(models.TextChoices):
        EASY = "EASY", _("Easy")
        MEDIUM = "MEDIUM", _("Medium")
        HARD = "HARD", _("Hard")
        # Could also be integer based if preferred

    # For multilingual title & statement, using JSONField
    title_i18n = models.JSONField(
        _("title (i18n)"), help_text=_("Problem title in different languages")
    )
    statement_i18n = models.JSONField(
        _("statement (i18n)"),
        help_text=_(
            "Problem statement in different languages, can contain Markdown/HTML"
        ),
    )

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET(get_sentinel_user),
        null=True,
        blank=True,
        related_name="authored_problems",
        verbose_name=_("author"),
    )
    verifier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET(get_sentinel_user),
        null=True,
        blank=True,
        related_name="verified_problems",
        verbose_name=_("verifier"),
    )
    status = models.CharField(
        _("status"),
        max_length=10,
        choices=ProblemStatus.choices,
        default=ProblemStatus.DRAFT,
    )
    difficulty = models.CharField(
        _("difficulty"),
        max_length=10,
        choices=DifficultyLevel.choices,
        default=DifficultyLevel.MEDIUM,
    )

    class DifficultySource(models.TextChoices):
        """Where the difficulty label came from (competitive roadmap CNT-3).

        SEED problems shipped with the starter pack; AUTHOR was assigned by a
        human at creation time; CALIBRATED was recomputed from real AC rates
        by ``calibrate_difficulty`` once enough attempts exist. RAT-4 ladder
        weights and RAT-7 tag bars consume this to know which labels can be
        trusted before community calibration exists.
        """

        SEED = "SEED", _("Starter pack")
        AUTHOR = "AUTHOR", _("Author-assigned")
        CALIBRATED = "CALIBRATED", _("Calibrated from AC rate")

    difficulty_source = models.CharField(
        _("difficulty source"),
        max_length=12,
        choices=DifficultySource.choices,
        default=DifficultySource.AUTHOR,
        help_text=_("Provenance of the difficulty label (seed/author/calibrated)."),
    )

    # Default time/memory limits in ms/KB. Can be overridden per language if needed via a JSONField.
    default_time_limit_ms = models.IntegerField(
        _("default time limit (ms)"), default=1000
    )
    default_memory_limit_kb = models.IntegerField(
        _("default memory limit (KB)"), default=262144
    )  # 256 MB

    # Per-language limit overrides (competitive roadmap J5): maps a language
    # id to {"time_ms": ..., "memory_kb": ...}; an explicit author override
    # beats the registry's language multipliers (see
    # judge_utils.languages.effective_limits).
    limit_overrides = models.JSONField(
        _("per-language limit overrides"),
        default=dict,
        blank=True,
        help_text=_(
            "Optional map of language id -> {time_ms, memory_kb} overrides."
        ),
    )

    class ScoringMode(models.TextChoices):
        """How test-case results aggregate into the submission score (J6).

        - PARTIAL_PER_TEST (default): sum of passed test points (current).
        - BINARY: all tests pass -> full score, else 0.
        - SUBTASKS: tests grouped by TestCase.subtask; a group's points are
          awarded only when EVERY member passes (the DMOJ rule — matches how
          Romanian olympiad problems are written).
        """

        PARTIAL_PER_TEST = "PARTIAL_PER_TEST", _("Partial (per test)")
        BINARY = "BINARY", _("Binary (all or nothing)")
        SUBTASKS = "SUBTASKS", _("Subtask groups")

    scoring_mode = models.CharField(
        _("scoring mode"),
        max_length=20,
        choices=ScoringMode.choices,
        default=ScoringMode.PARTIAL_PER_TEST,
    )
    # Cached denominator for "score / full_score" display; kept in sync by
    # TestCase save/delete signals (problems/apps.py) so the UI never
    # recomputes per request.
    full_score = models.PositiveIntegerField(
        _("full score"),
        default=0,
        help_text=_("Cached total score across tests/subtasks."),
    )

    class IOMode(models.TextChoices):
        """Input/output convention (competitive roadmap RO-4).

        STDIO: the classic judge — input on stdin, output on stdout.
        FILES: olympiad convention — the program reads <input file> and
        writes <output file> in its working directory (the pbinfo/infoarena
        ``.in``/``.out`` default).
        """

        STDIO = "STDIO", _("Standard input/output")
        FILES = "FILES", _("Files (.in/.out)")

    io_mode = models.CharField(
        _("I/O mode"),
        max_length=6,
        choices=IOMode.choices,
        default=IOMode.STDIO,
    )
    io_input_filename = models.CharField(
        _("input filename (FILES mode)"),
        max_length=64,
        default="input.txt",
        blank=True,
    )
    io_output_filename = models.CharField(
        _("output filename (FILES mode)"),
        max_length=64,
        default="output.txt",
        blank=True,
    )

    # Case-insensitive matching for the text comparison modes (J8): lets
    # "yes"/"YES" style answers match without a custom checker.
    case_insensitive = models.BooleanField(
        _("case-insensitive comparison"),
        default=False,
        help_text=_("Lowercase both outputs before text comparison modes."),
    )

    # JSONField to store list of allowed language identifiers, e.g., ["python3", "cpp17"]
    allowed_languages = models.JSONField(
        _("allowed languages"),
        default=list,
        blank=True,
        help_text=_("List of language identifiers allowed for this problem."),
    )
    # JSONField to store list of custom library identifiers allowed
    custom_libraries_allowed = models.JSONField(
        _("custom libraries allowed"),
        default=list,
        blank=True,
        help_text=_("List of custom library identifiers allowed."),
    )

    # Progressive hints ladder (competitive roadmap EDT-2): ordered text
    # steps revealed one-by-one in the UI — the pedagogical middle ground
    # between silence and a full editorial. Keyed per locale to mirror
    # statement_i18n's RO/EN discipline.
    hints_ro = models.JSONField(
        _("hints (Romanian)"),
        default=list,
        blank=True,
        help_text=_("Ordered Romanian hint steps; each entry is one reveal."),
    )
    hints_en = models.JSONField(
        _("hints (English)"),
        default=list,
        blank=True,
        help_text=_("Ordered English hint steps; each entry is one reveal."),
    )

    creation_date = models.DateTimeField(_("creation date"), auto_now_add=True)
    last_modified_date = models.DateTimeField(_("last modified date"), auto_now=True)

    tags = models.ManyToManyField(Tag, blank=True, verbose_name=_("tags"))

    class ComparisonMode(models.TextChoices):
        EXACT = "EXACT", _("Exact Match")
        STRIP_EXACT = (
            "STRIP_EXACT",
            _("Exact Match (Ignore Leading/Trailing Whitespace)"),
        )
        LINES_STRIP_EXACT = (
            "LINES_STRIP_EXACT",
            _("Line-by-Line Exact Match (Ignore Line Whitespace & Empty Lines)"),
        )
        FLOAT_PRECISE = "FLOAT_PRECISE", _("Floating Point (Precise up to Epsilon)")
        TOKEN = (
            "TOKEN",
            _("Token-based (whitespace-insensitive)"),
        )
        CUSTOM_CHECKER = "CUSTOM_CHECKER", _("Use Custom Checker Program")

    comparison_mode = models.CharField(
        _("output comparison mode"),
        max_length=20,
        choices=ComparisonMode.choices,
        default=ComparisonMode.LINES_STRIP_EXACT,
        help_text=_("How to compare user's output with expected output."),
    )
    float_comparison_epsilon = models.FloatField(
        _("float comparison epsilon"),
        null=True,
        blank=True,
        default=1e-6,
        help_text=_(
            "Epsilon value for floating point comparisons (if mode is FLOAT_PRECISE)."
        ),
    )

    # For custom checker program (optional)
    checker_code = models.TextField(
        _("checker code"),
        blank=True,
        null=True,
        help_text=_(
            "Source code for the custom checker program (if comparison_mode is CUSTOM_CHECKER)."
        ),
    )
    checker_language = models.CharField(
        _("checker language"),
        max_length=50,  # Consistent with submission language length
        blank=True,
        null=True,
        help_text=_("Language of the custom checker (e.g., 'cpp17', 'python3')."),
    )
    verifier_feedback = models.TextField(
        _("verifier feedback"),
        blank=True,
        null=True,
        help_text=_(
            "Feedback from the verifier if the problem status is set to Private or needs revision."
        ),
    )

    def __str__(self):
        if isinstance(self.title_i18n, dict):
            return self.title_i18n.get(
                "en", self.title_i18n.get("ro", f"Problem {self.id}")
            )
        return f"Problem {self.id}"

    class Meta:
        verbose_name = _("problem")
        verbose_name_plural = _("problems")
        ordering = ["-creation_date"]


class TestCase(models.Model):
    """
    Model representing a test case for a problem.
    """

    # Zero-warnings policy: the class name makes pytest's collector think
    # this Django model is a test class (PytestCollectionWarning). The
    # flag is pytest's documented opt-out for non-test "Test*" classes.
    __test__ = False

    problem = models.ForeignKey(
        Problem,
        related_name="test_cases",
        on_delete=models.CASCADE,
        verbose_name=_("problem"),
    )
    input_data = models.TextField(_("input data"))
    expected_output_data = models.TextField(_("expected output data"))
    is_sample = models.BooleanField(
        _("is sample"),
        default=False,
        help_text=_("Is this test case visible to users?"),
    )
    points = models.PositiveIntegerField(
        _("points"),
        default=10,
        help_text=_("Points awarded for passing this test case."),
    )
    # Subtask group key (J6): tests sharing a non-empty key form one group
    # whose points are awarded only when every member passes. All members
    # of a group should carry the same points value.
    subtask = models.CharField(
        _("subtask group"),
        max_length=64,
        blank=True,
        default="",
        help_text=_("Group key; tests in one group pass or fail together."),
    )
    order = models.PositiveIntegerField(
        _("order"), default=0, help_text=_("Order of execution for the test case.")
    )
    # Pretest flag (competitive roadmap CON-8): in a pretest-mode contest the
    # judge runs ONLY tests with this flag while the contest runs; the
    # end-of-contest pass re-judges every contest submission on the full
    # suite. Absent any flagged test the full suite runs (author opt-in).
    is_pretest = models.BooleanField(
        _("pretest"),
        default=False,
        help_text=_("Runs as part of the contest pretest subset."),
    )

    # For large data, consider FileField:
    # input_file = models.FileField(upload_to='test_cases/inputs/', null=True, blank=True)
    # output_file = models.FileField(upload_to='test_cases/outputs/', null=True, blank=True)

    def __str__(self):
        return f"Test Case {self.order} for Problem: {self.problem.id}"

    class Meta:
        verbose_name = _("test case")
        verbose_name_plural = _("test cases")
        ordering = ["problem", "order"]


class ProblemEditorial(models.Model):
    """Per-problem editorial (competitive roadmap EDT-1 / SPEC-GAPS X2).

    Markdown body mirroring the statement's RO/EN discipline, author credit,
    and a publish policy that gates who may read it:

    - ``PUBLIC``    — everyone who can see the problem.
    - ``AFTER_AC``  — only after the requester's own accepted submission on
                      the problem (problem author/verifier/admin bypass —
                      they need it to review the content).
    - ``MANUAL``    — author/verifier/admin only (held back for a contest,
                      or while polishing).
    """

    class PublishPolicy(models.TextChoices):
        PUBLIC = "PUBLIC", _("Public")
        AFTER_AC = "AFTER_AC", _("After solving (first AC)")
        MANUAL = "MANUAL", _("Manual (staff only)")

    problem = models.OneToOneField(
        Problem,
        on_delete=models.CASCADE,
        related_name="editorial",
        verbose_name=_("problem"),
    )
    content_ro = models.TextField(_("editorial content (Romanian)"), blank=True)
    content_en = models.TextField(_("editorial content (English)"), blank=True)
    publish_policy = models.CharField(
        _("publish policy"),
        max_length=10,
        choices=PublishPolicy.choices,
        default=PublishPolicy.AFTER_AC,
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET(get_sentinel_user),
        null=True,
        blank=True,
        related_name="authored_editorials",
        verbose_name=_("author"),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("problem editorial")
        verbose_name_plural = _("problem editorials")

    def __str__(self):
        return f"Editorial for {self.problem_id} ({self.publish_policy})"


class ProblemRating(models.Model):
    """Three-level satisfaction vote on a problem (competitive roadmap UXP-7).

    Gives verifiers a quality signal beyond solve rates: 1 = poor,
    2 = fine, 3 = great. One vote per user, re-voting overwrites.
    """

    RATING_MIN = 1
    RATING_MAX = 3

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="problem_ratings",
        verbose_name=_("user"),
    )
    problem = models.ForeignKey(
        Problem,
        on_delete=models.CASCADE,
        related_name="ratings",
        verbose_name=_("problem"),
    )
    rating = models.PositiveSmallIntegerField(
        _("rating"),
        validators=[MinValueValidator(RATING_MIN), MaxValueValidator(RATING_MAX)],
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("problem rating")
        verbose_name_plural = _("problem ratings")
        constraints = [
            models.UniqueConstraint(
                fields=["user", "problem"], name="unique_user_problem_rating"
            )
        ]

    def __str__(self):
        return f"{self.user_id} rated problem {self.problem_id}: {self.rating}"


class CurriculumNode(models.Model):
    """Versioned curriculum taxonomy (competitive roadmap EDU-9 / RO-1).

    A tree of GRADE → CHAPTER (→ TOPIC) nodes mirroring the Romanian national
    informatics programme, so a new programme edition adds a ``version``
    rather than a migration. Problems reference nodes via M2M; the catalog
    gains a second browse axis beside flat tags — the axis Romanian teachers
    actually navigate by (pbinfo's spine). Round-2 slice D.6: v1 ships
    grades 9–10 only.
    """

    class NodeKind(models.TextChoices):
        GRADE = "GRADE", _("Grade")
        CHAPTER = "CHAPTER", _("Chapter")
        TOPIC = "TOPIC", _("Topic")

    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
        verbose_name=_("parent node"),
    )
    kind = models.CharField(
        _("node kind"), max_length=10, choices=NodeKind.choices
    )
    name_i18n = models.JSONField(
        _("name (i18n)"),
        help_text=_("Node name per locale, e.g. {'en': 'Loops', 'ro': 'Structuri repetitive'}"),
    )
    slug = models.SlugField(
        _("slug"),
        max_length=120,
        unique=True,
        help_text=_("Stable URL identifier, e.g. 'g9-loops'."),
    )
    # A programme edition (e.g. the 2025–2026 public-consultation drafts).
    # The default tree ships version 'v1'.
    version = models.CharField(
        _("taxonomy version"),
        max_length=40,
        default="v1",
        help_text=_("Programme edition this node belongs to."),
    )
    order = models.PositiveIntegerField(
        _("order"), default=0, help_text=_("Sibling order within a parent.")
    )
    problems = models.ManyToManyField(
        Problem,
        blank=True,
        related_name="curriculum_nodes",
        verbose_name=_("problems"),
    )

    class Meta:
        verbose_name = _("curriculum node")
        verbose_name_plural = _("curriculum nodes")
        ordering = ["version", "order", "id"]
        indexes = [models.Index(fields=["version", "kind"])]

    def __str__(self):
        if isinstance(self.name_i18n, dict):
            return f"{self.slug} ({self.name_i18n.get('en', '')})"
        return self.slug


class CommunityEditorial(models.Model):
    """Community-contributed editorial (competitive roadmap EDT-3).

    Unlike the official ``ProblemEditorial`` (one per problem, staff-
    curated), community editorials are author-attributed ROWS — multiple
    per problem, each riding the same approval lifecycle as problems
    (DRAFT/PENDING -> APPROVED/REJECTED) with verifier feedback, and each
    carrying the UGC license the terms grant (CC BY-SA 4.0 text; the
    license rides the serializer, not a per-row choice).

    EDT-4: every row declares its writing language so RO students can
    filter EN commentary out and vice versa.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", _("Draft")
        PENDING = "PENDING", _("Pending review")
        APPROVED = "APPROVED", _("Approved")
        REJECTED = "REJECTED", _("Rejected")

    class Language(models.TextChoices):
        RO = "ro", _("Romanian")
        EN = "en", _("English")

    problem = models.ForeignKey(
        Problem,
        on_delete=models.CASCADE,
        related_name="community_editorials",
        verbose_name=_("problem"),
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET(get_sentinel_user),
        null=True,
        blank=True,
        related_name="community_editorials",
        verbose_name=_("author"),
    )
    title = models.CharField(_("title"), max_length=200)
    body = models.TextField(_("body"), help_text=_("Markdown."))
    lang = models.CharField(
        _("language"),
        max_length=2,
        choices=Language.choices,
        default=Language.EN,
        help_text=_("Writing language (EDT-4 filter axis)."),
    )
    status = models.CharField(
        _("status"), max_length=10, choices=Status.choices, default=Status.DRAFT
    )
    verifier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET(get_sentinel_user),
        null=True,
        blank=True,
        related_name="verified_community_editorials",
        verbose_name=_("verifier"),
    )
    verifier_feedback = models.TextField(_("verifier feedback"), blank=True)
    # Moderation (round-2 SAF-1): hidden rows vanish from public lists but
    # stay auditable for staff.
    is_hidden = models.BooleanField(_("hidden"), default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("community editorial")
        verbose_name_plural = _("community editorials")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["problem", "status"]),
            models.Index(fields=["lang", "status"]),
        ]

    def __str__(self):
        return "%s (%s, %s)" % (self.title, self.problem_id, self.status)


class Article(models.Model):
    """Algorithm article / lecture note (competitive roadmap EDT-6).

    Markdown lecture layer tied to tags: problems cross-link articles that
    share at least one tag ("related reading" strip), seeding the RO
    language algorithm content moat. Same bilingual + approval discipline
    as problems.
    """

    class Status(models.TextChoices):
        DRAFT = "DRAFT", _("Draft")
        PENDING = "PENDING", _("Pending review")
        APPROVED = "APPROVED", _("Approved")
        REJECTED = "REJECTED", _("Rejected")

    title_i18n = models.JSONField(
        _("title (i18n)"), help_text="{'en': ..., 'ro': ...}"
    )
    body_ro = models.TextField(_("body (Romanian, markdown)"), blank=True)
    body_en = models.TextField(_("body (English, markdown)"), blank=True)
    tags = models.ManyToManyField(Tag, blank=True, related_name="articles")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET(get_sentinel_user),
        null=True,
        blank=True,
        related_name="authored_articles",
        verbose_name=_("author"),
    )
    status = models.CharField(
        _("status"), max_length=10, choices=Status.choices, default=Status.DRAFT
    )
    verifier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET(get_sentinel_user),
        null=True,
        blank=True,
        related_name="verified_articles",
        verbose_name=_("verifier"),
    )
    verifier_feedback = models.TextField(_("verifier feedback"), blank=True)
    is_hidden = models.BooleanField(_("hidden"), default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("article")
        verbose_name_plural = _("articles")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status"])]

    def __str__(self):
        if isinstance(self.title_i18n, dict):
            return self.title_i18n.get("en", "Article %s" % self.id)
        return "Article %s" % self.id
