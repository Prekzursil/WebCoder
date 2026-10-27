from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Thread(models.Model):
    """A forum discussion thread (SPEC-GAPS D-B9).

    ``problem`` null = global thread. Moderation states: ``is_pinned``
    (bubbled to the top by Meta ordering), ``is_locked`` (no new posts),
    ``is_hidden`` (soft-removed from non-moderator views; never hard-
    deleted, keeping the audit trail).
    """

    title = models.CharField(_("title"), max_length=255)
    problem = models.ForeignKey(
        "problems.Problem",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="threads",
        verbose_name=_("problem"),
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="threads",
        verbose_name=_("author"),
    )
    is_pinned = models.BooleanField(_("pinned"), default=False)
    is_locked = models.BooleanField(_("locked"), default=False)
    is_hidden = models.BooleanField(_("hidden"), default=False)
    # COM-6 (competitive roadmap): admin news posts — surfaced as a home
    # panel; ordinary threads stay ordinary.
    is_announcement = models.BooleanField(_("announcement"), default=False)
    post_count = models.PositiveIntegerField(
        _("post count"), default=0
    )  # denormalized
    last_activity = models.DateTimeField(
        _("last activity"), default=timezone.now
    )  # bumped per post via F()
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("thread")
        verbose_name_plural = _("threads")
        ordering = ["-is_pinned", "-last_activity"]
        indexes = [
            models.Index(fields=["problem", "-last_activity"]),
            models.Index(fields=["-last_activity"]),
        ]

    def __str__(self):
        return f"Thread({self.id}: {self.title})"


class Post(models.Model):
    """A single reply inside a thread. Markdown source, rendered
    client-side. ``parent`` gives one-level quote-replies (Codeforces
    style). Hidden posts keep ``hidden_reason`` for the audit trail."""

    thread = models.ForeignKey(
        Thread,
        on_delete=models.CASCADE,
        related_name="posts",
        verbose_name=_("thread"),
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="forum_posts",
        verbose_name=_("author"),
    )
    content = models.TextField(_("content"))
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="replies",
        verbose_name=_("parent post"),
    )
    is_hidden = models.BooleanField(_("hidden"), default=False)
    hidden_reason = models.CharField(_("hidden reason"), max_length=200, blank=True)
    is_edited = models.BooleanField(_("edited"), default=False)
    upvotes = models.IntegerField(
        _("upvotes"), default=0
    )  # denormalized net score (Sum of votes)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        verbose_name = _("post")
        verbose_name_plural = _("posts")
        ordering = ["created_at"]
        indexes = [models.Index(fields=["thread", "created_at"])]

    def __str__(self):
        return f"Post({self.id} in thread {self.thread_id})"


class PostVote(models.Model):
    """A user's vote on a post; one per (user, post)."""

    class Value(models.IntegerChoices):
        UP = 1, _("up")
        DOWN = -1, _("down")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="post_votes",
        verbose_name=_("user"),
    )
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name="votes",
        verbose_name=_("post"),
    )
    value = models.SmallIntegerField(_("value"), choices=Value.choices)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("post vote")
        verbose_name_plural = _("post votes")
        unique_together = ("user", "post")

    def __str__(self):
        return f"Vote({self.user_id} on post {self.post_id}: {self.value})"


class Report(models.Model):
    """A user report against a post, for the moderation queue."""

    class Reason(models.TextChoices):
        SPAM = "SPAM", _("Spam")
        ABUSE = "ABUSE", _("Abuse")
        OFF_TOPIC = "OFF_TOPIC", _("Off topic")
        OTHER = "OTHER", _("Other")

    class Status(models.TextChoices):
        OPEN = "OPEN", _("Open")
        RESOLVED = "RESOLVED", _("Resolved")
        DISMISSED = "DISMISSED", _("Dismissed")

    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name="reports",
        verbose_name=_("post"),
    )
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="filed_reports",
        verbose_name=_("reporter"),
    )
    reason = models.CharField(_("reason"), max_length=16, choices=Reason.choices)
    details = models.TextField(_("details"), blank=True)
    status = models.CharField(
        _("status"), max_length=16, choices=Status.choices, default=Status.OPEN
    )
    resolution_note = models.TextField(_("resolution note"), blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="resolved_reports",
        verbose_name=_("resolved by"),
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("report")
        verbose_name_plural = _("reports")
        ordering = ["-created_at"]
        unique_together = ("reporter", "post")

    def __str__(self):
        return f"Report({self.id}: {self.reason} on post {self.post_id})"
