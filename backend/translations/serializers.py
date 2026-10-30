"""Serializers for the community-translation pipeline."""

from rest_framework import serializers

from problems.models import Problem
from webcoder_api.languages import LANGUAGE_NAMES, TRANSLATABLE_LANGUAGES

from .models import TranslationProposal


class TranslationProposalSerializer(serializers.ModelSerializer):
    """Read shape used by the curation queue and the contributor's 'mine' list."""

    contributor_username = serializers.CharField(
        source="contributor.username", read_only=True
    )
    reviewer_username = serializers.CharField(
        source="reviewer.username", read_only=True, default=None
    )
    problem_id = serializers.IntegerField(source="problem.id", read_only=True)
    problem_title_en = serializers.SerializerMethodField()
    language_name = serializers.SerializerMethodField()

    class Meta:
        model = TranslationProposal
        fields = [
            "id",
            "problem_id",
            "problem_title_en",
            "language",
            "language_name",
            "title",
            "statement",
            "status",
            "contributor",
            "contributor_username",
            "reviewer",
            "reviewer_username",
            "review_note",
            "reviewed_at",
            "ai_verdict",
            "ai_confidence",
            "ai_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_problem_title_en(self, obj) -> str:
        titles = obj.problem.title_i18n if isinstance(obj.problem.title_i18n, dict) else {}
        return titles.get("en") or titles.get("ro") or f"Problem {obj.problem_id}"

    def get_language_name(self, obj) -> str:
        return LANGUAGE_NAMES.get(obj.language, {}).get("english", obj.language)


class TranslationProposalCreateSerializer(serializers.Serializer):
    """POST body for proposing a translation (authenticated + throttled)."""

    problem = serializers.PrimaryKeyRelatedField(
        queryset=Problem.objects.filter(status=Problem.ProblemStatus.APPROVED),
        help_text="Only published (APPROVED) problems accept community translations.",
    )
    language = serializers.ChoiceField(
        choices=TRANSLATABLE_LANGUAGES,
        help_text="Target language — English is the mandatory authoring source and cannot be proposed.",
    )
    title = serializers.CharField(max_length=255, trim_whitespace=True)
    statement = serializers.CharField(trim_whitespace=True)


class TranslationReviewSerializer(serializers.Serializer):
    """POST body for the reject decision (approve takes no body)."""

    note = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=2000
    )


class LanguageCatalogEntrySerializer(serializers.Serializer):
    """One entry of the translatable-language catalog (propose form picker)."""

    code = serializers.CharField()
    endonym = serializers.CharField()
    english = serializers.CharField()


def language_catalog():
    return [
        {"code": code, **LANGUAGE_NAMES[code]} for code in TRANSLATABLE_LANGUAGES
    ]
