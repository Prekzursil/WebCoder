"""Output comparison for the judge.

Modes (Problem.ComparisonMode): EXACT, STRIP_EXACT, LINES_STRIP_EXACT,
FLOAT_PRECISE, TOKEN (J8) and CUSTOM_CHECKER (handled by checkers.py).

``compare_outputs_detailed`` (J8) additionally returns a first-mismatch
hint so a WA test result can say "differs at line N" — the debuggability
win SPEC-GAPS J8 asks for. ``compare_outputs`` stays a bool wrapper for
existing callers.
"""

from problems.models import Problem  # For Problem.ComparisonMode


def _maybe_lower(text: str, case_insensitive: bool) -> str:
    return text.lower() if case_insensitive else text


def _normalize_lines(text: str) -> list[str]:
    return [line.strip() for line in text.replace("\r\n", "\n").split("\n")]


def _strip_trailing_empty(lines: list[str]) -> list[str]:
    while lines and lines[-1] == "":
        lines.pop()
    return lines


def _tokenize_lines(text: str) -> list[str]:
    """Token normalization (J8): whitespace-insensitive per line — each line
    collapses to single-space-joined tokens, then the existing line rules
    (strip, trailing-empty removal) apply."""
    return [" ".join(line.split()) for line in text.replace("\r\n", "\n").split("\n")]


def _first_mismatch_hint(gen_lines: list[str], exp_lines: list[str]) -> str | None:
    """Human hint for the first differing line (1-based), or None on match
    modulo trailing empties (handled by callers after normalization)."""
    for index, (gen_line, exp_line) in enumerate(zip(gen_lines, exp_lines), start=1):
        if gen_line != exp_line:
            return f"outputs differ at line {index}"
    if len(gen_lines) != len(exp_lines):
        return f"expected {len(exp_lines)} line(s), got {len(gen_lines)}"
    return None


def compare_outputs_detailed(
    generated_output: str,
    expected_output: str,
    comparison_mode: str,
    float_epsilon: float | None = 1e-6,
    case_insensitive: bool = False,
) -> tuple[bool, str | None]:
    """Compare outputs; returns (matches, mismatch hint or None)."""
    generated_output = _maybe_lower(generated_output, case_insensitive)
    expected_output = _maybe_lower(expected_output, case_insensitive)

    if comparison_mode == Problem.ComparisonMode.EXACT:
        ok = generated_output == expected_output
        return ok, None if ok else "outputs differ (exact comparison)"

    if comparison_mode == Problem.ComparisonMode.STRIP_EXACT:
        ok = generated_output.strip() == expected_output.strip()
        return ok, None if ok else "outputs differ (stripped comparison)"

    if comparison_mode == Problem.ComparisonMode.TOKEN:
        gen_lines = _strip_trailing_empty(_tokenize_lines(generated_output))
        exp_lines = _strip_trailing_empty(_tokenize_lines(expected_output))
        hint = _first_mismatch_hint(gen_lines, exp_lines)
        return hint is None, hint

    if comparison_mode == Problem.ComparisonMode.LINES_STRIP_EXACT:
        gen_lines = _strip_trailing_empty(_normalize_lines(generated_output))
        exp_lines = _strip_trailing_empty(_normalize_lines(expected_output))
        hint = _first_mismatch_hint(gen_lines, exp_lines)
        return hint is None, hint

    if comparison_mode == Problem.ComparisonMode.FLOAT_PRECISE:
        if float_epsilon is None:
            float_epsilon = 1e-6
        try:
            gen_lines = _strip_trailing_empty(_normalize_lines(generated_output))
            exp_lines = _strip_trailing_empty(_normalize_lines(expected_output))
            if len(gen_lines) != len(exp_lines):
                return (
                    False,
                    f"expected {len(exp_lines)} line(s), got {len(gen_lines)}",
                )
            for line_index, (gen_line, exp_line) in enumerate(
                zip(gen_lines, exp_lines), start=1
            ):
                gen_tokens = gen_line.split()
                exp_tokens = exp_line.split()
                if len(gen_tokens) != len(exp_tokens):
                    return (
                        False,
                        f"outputs differ at line {line_index} (token count)",
                    )
                for gen_token, exp_token in zip(gen_tokens, exp_tokens):
                    try:
                        gen_float = float(gen_token)
                        exp_float = float(exp_token)
                        if not (
                            abs(gen_float - exp_float)
                            <= float_epsilon * max(1.0, abs(exp_float), abs(gen_float))
                        ):
                            return (
                                False,
                                f"outputs differ at line {line_index} (value)",
                            )
                    except ValueError:
                        if gen_token != exp_token:
                            return (
                                False,
                                f"outputs differ at line {line_index} (token)",
                            )
            return True, None
        except Exception as exc:  # defensive: malformed utf-8 etc.
            print(f"Error during FLOAT_PRECISE comparison: {exc}")
            return False, "comparison error (float mode)"

    # Unknown mode: default to line-strip semantics (historical behaviour).
    print(
        f"Warning: Unknown or unhandled comparison mode '{comparison_mode}'. "
        "Defaulting to 'LINES_STRIP_EXACT'."
    )
    gen_lines = _strip_trailing_empty(_normalize_lines(generated_output))
    exp_lines = _strip_trailing_empty(_normalize_lines(expected_output))
    hint = _first_mismatch_hint(gen_lines, exp_lines)
    return hint is None, hint


def compare_outputs(
    generated_output: str,
    expected_output: str,
    comparison_mode: str,
    float_epsilon: float | None = 1e-6,
    case_insensitive: bool = False,
) -> bool:
    """Bool-only comparison (J8 keeps this as a thin wrapper)."""
    ok, _ = compare_outputs_detailed(
        generated_output,
        expected_output,
        comparison_mode,
        float_epsilon,
        case_insensitive,
    )
    return ok
