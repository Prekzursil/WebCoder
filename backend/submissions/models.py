from django.db import models
from django.conf import settings # For AUTH_USER_MODEL
from django.utils.translation import gettext_lazy as _
# Assuming 'problems' app and 'Problem' model exist
# from problems.models import Problem # This will cause circular dependency if problems.models imports submissions.models
                                  # Use string reference 'problems.Problem' in ForeignKey instead.

class Submission(models.Model):
    """
    Model representing a user's code submission for a problem.
    """
    class VerdictStatus(models.TextChoices):
        PENDING = 'PENDING', _('Pending')
        COMPILING = 'COMPILING', _('Compiling')
        RUNNING = 'RUNNING', _('Running')
        ACCEPTED = 'AC', _('Accepted')
        WRONG_ANSWER = 'WA', _('Wrong Answer')
        TIME_LIMIT_EXCEEDED = 'TLE', _('Time Limit Exceeded')
        MEMORY_LIMIT_EXCEEDED = 'MLE', _('Memory Limit Exceeded')
        COMPILE_ERROR = 'CE', _('Compile Error')
        RUNTIME_ERROR = 'RE', _('Runtime Error')
        INTERNAL_ERROR = 'IE', _('Internal Error') # For judge system errors
        # Add more specific verdicts as needed, e.g., PARTIAL_POINTS, SKIPPED, etc.

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE, # If user is deleted, their submissions are also deleted.
                                  # Consider models.SET_NULL if submissions should be kept.
        related_name='submissions',
        verbose_name=_("user")
    )
    problem = models.ForeignKey(
        'problems.Problem', # String reference to avoid circular import
        on_delete=models.CASCADE, # If problem is deleted, submissions for it are also deleted.
        related_name='submissions',
        verbose_name=_("problem")
    )
    language = models.CharField(
        _("language"),
        max_length=50, # e.g., "python3.11", "cpp17-gcc9.4", "java11"
        help_text=_("Identifier for the programming language and version/compiler used.")
    )
    code = models.TextField(_("source code"))
    submission_time = models.DateTimeField(_("submission time"), auto_now_add=True)
    
    verdict = models.CharField(
        _("verdict"),
        max_length=10,
        choices=VerdictStatus.choices,
        default=VerdictStatus.PENDING
    )
    # Execution details, filled by the judge
    execution_time_ms = models.IntegerField(_("execution time (ms)"), null=True, blank=True)
    memory_used_kb = models.IntegerField(_("memory used (KB)"), null=True, blank=True)
    
    # Score, if applicable (e.g., for partial scoring problems or contests)
    score = models.FloatField(_("score"), null=True, blank=True) # Float for percentage scores or partial points

    # Detailed feedback from compiler or judge (e.g., error messages, specific test case failed)
    # Could be JSONField if structured feedback is desired
    detailed_feedback = models.TextField(_("detailed feedback"), blank=True)

    # IP address of submission (optional, for auditing/security)
    # ip_address = models.GenericIPAddressField(null=True, blank=True)

    def __str__(self):
        return f"Submission {self.id} by {self.user.username} for Problem {self.problem_id} ({self.verdict})"

    class Meta:
        verbose_name = _("submission")
        verbose_name_plural = _("submissions")
        ordering = ['-submission_time']
        # Indexes can be useful for querying submissions by user, problem, or status
        indexes = [
            models.Index(fields=['user', 'problem']),
            models.Index(fields=['problem', 'submission_time']),
            models.Index(fields=['user', 'submission_time']),
            models.Index(fields=['verdict']),
        ]

class SubmissionTestResult(models.Model):
    """
    Stores the result of a single test case run for a submission.
    """
    submission = models.ForeignKey(
        Submission,
        on_delete=models.CASCADE,
        related_name='test_results',
        verbose_name=_("submission")
    )
    test_case = models.ForeignKey(
        'problems.TestCase', # String reference
        on_delete=models.CASCADE, 
        related_name='submission_results',
        verbose_name=_("test case")
    )
    verdict = models.CharField(
        _("verdict"),
        max_length=10, 
        choices=Submission.VerdictStatus.choices, 
        help_text=_("Verdict for this specific test case.")
    )
    execution_time_ms = models.IntegerField(_("execution time (ms)"), null=True, blank=True)
    memory_used_kb = models.IntegerField(_("memory used (KB)"), null=True, blank=True)
    
    actual_output = models.TextField(_("actual output"), blank=True, null=True)
    error_output = models.TextField(_("error output"), blank=True, null=True)

    def __str__(self):
        return f"Result for Sub {self.submission.id} on TC {self.test_case_id}: {self.verdict}"

    class Meta:
        verbose_name = _("submission test result")
        verbose_name_plural = _("submission test results")
        ordering = ['submission', 'test_case__order'] 
        unique_together = ('submission', 'test_case')
