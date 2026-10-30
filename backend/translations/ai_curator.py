"""Pluggable AI curator for translation proposals (i18n wave, owner rule (c)).

A provider-agnostic screening adapter:

    screen(problem_en, proposal) -> CuratorResult(verdict, confidence, notes)

with one shipped implementation, ``OpenAICompatibleCurator``, that talks to
any OpenAI-compatible ``/chat/completions`` endpoint (OpenAI, Azure
gateways, vLLM, Ollama, llama.cpp server, LM Studio, …) — no
vendor lock-in. It is configured ENTIRELY by environment variables and is
OFF unless ``AI_CURATOR_URL`` is set:

    AI_CURATOR_URL            base URL (…/v1); unset = curator OFF
    AI_CURATOR_API_KEY        bearer token (optional for local servers)
    AI_CURATOR_MODEL          model id (required when the URL is set)
    AI_CURATOR_TIMEOUT_S      per-call timeout, default 10s, hard-capped 30s
    AI_CURATOR_AUTO_APPROVE   'true'/'1' to auto-promote high-confidence
                              passes WITHOUT human confirmation (default
                              false — humans stay in the loop)

Policy (owner rule + fail-open semantics):
- Every proposal is screened when the curator is on; a high-confidence
  pass is *marked* AI-approved. It is auto-promoted only when
  AI_CURATOR_AUTO_APPROVE is explicitly true.
- Low confidence, unparsable output, timeouts, HTTP errors, missing
  config → the proposal is flagged for HUMAN review. The adapter NEVER
  rejects and never blocks submission: fail-open to human review.
- All calls are time-bounded (requests timeout) so a hung curator cannot
  hang the propose endpoint.

Env + policy are documented in docs/RUNBOOK.md.
"""

import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Callable, Optional, Protocol

import requests

from webcoder_api.languages import LANGUAGE_NAMES

logger = logging.getLogger(__name__)

#: Hard ceiling for the caller-supplied timeout — a screening call must
#: never approach the HTTP-worker timeout of the propose endpoint.
MAX_TIMEOUT_S = 30.0
DEFAULT_TIMEOUT_S = 10.0

_SYSTEM_PROMPT = (
    "You screen community translations for a competitive-programming judge. "
    "Compare the proposed translation against the English original and judge "
    "whether it is a faithful, fluent translation that keeps the problem's "
    "constraints, input/output format and technical terminology intact. "
    "Respond with ONLY a JSON object: "
    '{"verdict": "approve" | "flag", "confidence": <0.0-1.0>, '
    '"notes": "<one short sentence>"} — flag anything mistranslated, '
    "incomplete, machine-mangled, or missing the input/output sections."
)


@dataclass(frozen=True)
class CuratorResult:
    """One screening outcome.

    verdict: 'approve' (high-confidence quality pass) or 'flag' (needs a
    human) or 'error' (screening itself failed — fail-open to humans).
    """

    verdict: str
    confidence: float
    notes: str


@dataclass(frozen=True)
class CuratorConfig:
    """Everything the adapter needs, resolved from the environment once."""

    url: str
    api_key: str
    model: str
    timeout_s: float
    auto_approve: bool

    @classmethod
    def from_env(cls, environ=None) -> Optional["CuratorConfig"]:
        """Build the config; ``None`` means the curator is OFF (no URL)."""
        env = os.environ if environ is None else environ
        url = (env.get("AI_CURATOR_URL") or "").strip().rstrip("/")
        if not url:
            return None
        try:
            timeout_s = float(env.get("AI_CURATOR_TIMEOUT_S") or DEFAULT_TIMEOUT_S)
        except ValueError:
            timeout_s = DEFAULT_TIMEOUT_S
        timeout_s = max(0.1, min(timeout_s, MAX_TIMEOUT_S))
        return cls(
            url=url,
            api_key=(env.get("AI_CURATOR_API_KEY") or "").strip(),
            model=(env.get("AI_CURATOR_MODEL") or "").strip(),
            timeout_s=timeout_s,
            auto_approve=(env.get("AI_CURATOR_AUTO_APPROVE") or "")
            .strip()
            .lower()
            in ("1", "true", "yes", "on"),
        )


class AICurator(Protocol):
    """The provider-agnostic interface any curator implementation meets."""

    def screen(self, *, problem_en: dict, proposal: dict) -> CuratorResult:  # pragma: no cover - interface
        ...


def _default_transport(url: str, headers: dict, payload: dict, timeout_s: float) -> dict:
    """POST to an OpenAI-compatible /chat/completions endpoint.

    Time-bounded by ``timeout_s`` on connect AND read — a hung curator
    cannot hang the caller. Any failure raises; the curator converts every
    exception into a fail-open 'error' result.
    """
    response = requests.post(
        url,
        headers=headers,
        json=payload,
        timeout=timeout_s,
    )
    response.raise_for_status()
    return response.json()


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def _extract_json(content: str) -> dict:
    """Parse the model reply, tolerating markdown code fences."""
    text = (content or "").strip()
    fenced = _JSON_FENCE_RE.search(text)
    if fenced:
        text = fenced.group(1).strip()
    # Some models wrap prose around the object — take the outermost braces.
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("no JSON object in curator reply")
    # A valid JSON document whose first token is '{' is by definition an
    # object, so no further shape check is needed here.
    return json.loads(text[start : end + 1])


class OpenAICompatibleCurator:
    """Screens proposals through any OpenAI-compatible chat endpoint."""

    def __init__(self, config: CuratorConfig, transport: Callable = _default_transport):
        self._config = config
        self._transport = transport

    @property
    def auto_approve(self) -> bool:
        return self._config.auto_approve

    def _payload(self, problem_en: dict, proposal: dict) -> dict:
        language = proposal.get("language", "")
        language_label = LANGUAGE_NAMES.get(language, {}).get("english", language)
        user_prompt = (
            f"Target language: {language} ({language_label})\n\n"
            f"ENGLISH ORIGINAL\nTitle: {problem_en.get('title', '')}\n"
            f"Statement:\n{problem_en.get('statement', '')}\n\n"
            f"PROPOSED {language.upper()} TRANSLATION\n"
            f"Title: {proposal.get('title', '')}\n"
            f"Statement:\n{proposal.get('statement', '')}\n\n"
            "Is this translation ready to publish? Respond with the JSON object only."
        )
        return {
            "model": self._config.model,
            "temperature": 0,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
        }

    def screen(self, *, problem_en: dict, proposal: dict) -> CuratorResult:
        """One bounded screening call. NEVER raises: every failure mode
        (transport error, timeout, bad JSON, unknown verdict, missing
        model id) degrades to ``verdict='error'`` — fail-open to human
        review, never to rejection."""
        if not self._config.model:
            return CuratorResult(
                "error", 0.0, "AI curator misconfigured: AI_CURATOR_MODEL is not set."
            )
        headers = {"Content-Type": "application/json"}
        if self._config.api_key:
            headers["Authorization"] = f"Bearer {self._config.api_key}"
        try:
            data = self._transport(
                f"{self._config.url}/chat/completions",
                headers,
                self._payload(problem_en, proposal),
                self._config.timeout_s,
            )
            content = data["choices"][0]["message"]["content"]
            parsed = _extract_json(content)
        except Exception as exc:  # noqa: BLE001 — deliberate fail-open catch-all
            logger.warning("AI curator screening failed (fail-open): %s", exc)
            return CuratorResult("error", 0.0, f"AI screening unavailable: {exc}")

        verdict = str(parsed.get("verdict", "")).strip().lower()
        if verdict not in ("approve", "flag"):
            return CuratorResult(
                "error", 0.0, f"AI curator returned an unknown verdict: {verdict!r}"
            )
        try:
            confidence = float(parsed.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(confidence, 1.0))
        notes = str(parsed.get("notes", ""))[:2000]
        return CuratorResult(verdict, confidence, notes)


def curator_from_env(environ=None) -> Optional[OpenAICompatibleCurator]:
    """Resolve the configured curator, or ``None`` when OFF (no URL)."""
    config = CuratorConfig.from_env(environ)
    if config is None:
        return None
    return OpenAICompatibleCurator(config)
