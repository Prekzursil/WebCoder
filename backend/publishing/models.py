"""Publishing app (wave F items 62/63/64).

- ``BlogPost`` — per-user blog articles (the Codeforces per-user-blog
  pattern): markdown posts, drafts vs published, bilingual lang tag.
- ``WikiPage`` / ``WikiRevision`` — the RO-first algorithm wiki: any
  authenticated member edits; every edit snapshots a revision; moderators
  revert (the infoarena fully-wiki-editable pattern with history).
- ``WaHelpRequest`` / ``WaHelpAnswer`` — the explain-my-WA queue: a stuck
  solver asks about their wrong-answer submission, helpers answer, the
  asker accepts one answer (feeding contributor honor).
"""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class BlogPost(models.Model):
    """Item 62 — one user's blog article."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", _("Draft")
        PUBLISHED = "PUBLISHED", _("Published")

    class Language(models.TextChoices):
        RO = "ro", _("Romanian")
        EN = "en", _("English")

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blog_posts",
        verbose_name=_("author"),
    )
    title = models.CharField(_("title"), max_length=200)
    slug = models.SlugField(_("slug"), max_length=220, unique=True)
    body = models.TextField(_("body"), help_text=_("Markdown."))
    lang = models.CharField(
        _("language"), max_length=2, choices=Language.choices, default=Language.EN
    )
    status = models.CharField(
        _("status"), max_length=10, choices=Status.choices, default=Status.DRAFT
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("blog post")
        verbose_name_plural = _("blog posts")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]

    def __str__(self):
        return f"{self.title} ({self.author_id}, {self.status})"


class WikiPage(models.Model):
    """Item 63 — one wiki article (RO-first, EN mirror)."""

    slug = models.SlugField(_("slug"), max_length=140, unique=True)
    title_ro = models.CharField(_("title (Romanian)"), max_length=200)
    title_en = models.CharField(_("title (English)"), max_length=200, blank=True)
    body_ro = models.TextField(_("body (Romanian, markdown)"))
    body_en = models.TextField(_("body (English, markdown)"), blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="wiki_edits",
        verbose_name=_("last edited by"),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("wiki page")
        verbose_name_plural = _("wiki pages")
        ordering = ["slug"]

    def __str__(self):
        return f"wiki:{self.slug}"


class WikiRevision(models.Model):
    """Item 63 — an immutable snapshot per wiki edit (history + revert)."""

    page = models.ForeignKey(
        WikiPage, on_delete=models.CASCADE, related_name="revisions"
    )
    title_ro = models.CharField(max_length=200)
    title_en = models.CharField(max_length=200, blank=True)
    body_ro = models.TextField()
    body_en = models.TextField(blank=True)
    editor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="wiki_revisions",
    )
    note = models.CharField(_("change note"), max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("wiki revision")
        verbose_name_plural = _("wiki revisions")
        ordering = ["page", "-created_at"]
        indexes = [models.Index(fields=["page", "-created_at"])]

    def __str__(self):
        return f"revision {self.id} of {self.page_id}"


class WaHelpRequest(models.Model):
    """Item 64 — 'explain my WA': a request for help on a failed
    submission. The asker accepts exactly one answer, closing the request."""

    class Status(models.TextChoices):
        OPEN = "OPEN", _("Open")
        ANSWERED = "ANSWERED", _("Answered")

    submission = models.ForeignKey(
        "submissions.Submission",
        on_delete=models.CASCADE,
        related_name="wa_help_requests",
    )
    asker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="wa_help_requests",
    )
    question = models.TextField(_("question"), max_length=4000)
    status = models.CharField(
        _("status"), max_length=10, choices=Status.choices, default=Status.OPEN
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("WA help request")
        verbose_name_plural = _("WA help requests")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]

    def __str__(self):
        return f"wa-help #{self.id} by {self.asker_id}"


class WaHelpAnswer(models.Model):
    """Item 64 — one helper answer on a WA help request."""

    request = models.ForeignKey(
        WaHelpRequest, on_delete=models.CASCADE, related_name="answers"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="wa_help_answers",
    )
    body = models.TextField(_("body"), max_length=8000)
    is_accepted = models.BooleanField(_("accepted"), default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("WA help answer")
        verbose_name_plural = _("WA help answers")
        ordering = ["created_at"]

    def __str__(self):
        return f"wa-answer {self.id} on {self.request_id}"
