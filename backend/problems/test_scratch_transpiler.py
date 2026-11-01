"""Wave D engine 2 — Scratch transpiler tests.

Every test transpiles a real sb3-shaped project and, wherever behaviour
matters, EXECUTES the generated program (``exec`` with captured stdout)
so the mapping is proven at the semantics level, not just the syntax
level. The fixture builder keeps each case a one-screen Scratch program.
"""

from __future__ import annotations

import contextlib
import io
import json
import sys

import pytest

from .scratch_transpiler import (
    KNOWN_OPCODES,
    TranspileError,
    transpile,
    transpile_project,
    validate_project,
)


def _flag(blocks: dict, variables: dict | None = None) -> dict:
    """A minimal one-sprite project with the given block graph."""
    sprite_blocks = {}
    for block_id, block in blocks.items():
        sprite_blocks[block_id] = block
    sprite_blocks["hat"] = {
        "opcode": "event_whenflagclicked",
        "next": "first",
        "parent": None,
        "inputs": {},
        "fields": {},
        "topLevel": True,
        "shadow": False,
        "x": 40,
        "y": 40,
    }
    project = {
        "targets": [
            {
                "isStage": True,
                "name": "Stage",
                "variables": {},
                "blocks": {},
            },
            {
                "isStage": False,
                "name": "Sprite1",
                "variables": variables or {},
                "blocks": sprite_blocks,
            },
        ],
        "monitors": [],
        "extensions": [],
        "meta": {"semver": "3.0.0"},
    }
    return project


def _say(message_input) -> dict:
    return {
        "opcode": "looks_say",
        "next": None,
        "parent": "hat",
        "inputs": {"MESSAGE": message_input},
        "fields": {},
        "topLevel": False,
        "shadow": False,
    }


def _set_var(var_name: str, value_input) -> dict:
    return {
        "opcode": "data_setvariableto",
        "next": None,
        "parent": "hat",
        "inputs": {"VALUE": value_input},
        "fields": {"VARIABLE": [var_name, f"var-{var_name}"]},
        "topLevel": False,
        "shadow": False,
    }


def _var_reporter(var_name: str) -> dict:
    return {
        "opcode": "data_variable",
        "next": None,
        "parent": None,
        "inputs": {},
        "fields": {"VARIABLE": [var_name, f"var-{var_name}"]},
        "topLevel": False,
        "shadow": False,
    }


def _op(opcode: str, inputs: dict, fields: dict | None = None) -> dict:
    return {
        "opcode": opcode,
        "next": None,
        "parent": None,
        "inputs": inputs,
        "fields": fields or {},
        "topLevel": False,
        "shadow": False,
    }


def _run(source: str, stdin_text: str = "") -> str:
    """Execute generated code and return captured stdout."""
    out = io.StringIO()
    old_stdin = sys.stdin
    sys.stdin = io.StringIO(stdin_text)
    try:
        with contextlib.redirect_stdout(out):
            try:
                exec(source, {"__name__": "__main__"})  # noqa: S102
            except SystemExit:
                pass
    finally:
        sys.stdin = old_stdin
    return out.getvalue()


class TestSayAndVariables:
    def test_say_literal_number(self):
        project = _flag({"first": _say([1, [4, "42"]])})
        out = _run(transpile_project(project))
        assert out == "42\n"

    def test_say_text_literal(self):
        project = _flag({"first": _say([1, [3, "hello"]])})
        out = _run(transpile_project(project))
        assert out == "hello\n"

    def test_say_boolean_literal(self):
        project = _flag({"first": _say([1, [6, "true"]])})
        out = _run(transpile_project(project))
        assert out == "true\n"

    def test_say_for_seconds_ignores_duration(self):
        say = _say([1, [3, "hi"]])
        say["opcode"] = "looks_sayforsecs"
        say["inputs"]["SECS"] = [1, [4, "2"]]
        project = _flag({"first": say})
        out = _run(transpile_project(project))
        assert out == "hi\n"

    def test_think_prints_like_say(self):
        say = _say([1, [3, "hm"]])
        say["opcode"] = "looks_think"
        project = _flag({"first": say})
        out = _run(transpile_project(project))
        assert out == "hm\n"

    def test_say_missing_message_prints_empty(self):
        project = _flag({"first": _say(None)})
        project["targets"][1]["blocks"]["first"]["inputs"] = {}
        out = _run(transpile_project(project))
        assert out == "\n"

    def test_set_variable_then_say(self):
        blocks = {
            "first": {**_set_var("n", [1, [4, "7"]]), "next": "second"},
            "second": {**_say(None), "inputs": {"MESSAGE": [1, "rep"]}},
            "rep": _var_reporter("n"),
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == "7\n"

    def test_declared_variables_initialised_to_zero(self):
        blocks = {
            "first": {**_set_var("n", [1, [4, "5"]]), "next": "second"},
            "second": {**_say(None), "inputs": {"MESSAGE": [1, "rep2"]}},
            "rep2": _var_reporter("total"),
        }
        variables = {"var-total": ["total", 0]}
        out = _run(transpile_project(_flag(blocks, variables)))
        assert out == "0\n"

    def test_change_variable_by(self):
        blocks = {
            "first": {
                **_set_var("n", [1, [4, "2"]]),
                "next": "second",
            },
            "second": {
                "opcode": "data_changevariableby",
                "next": "third",
                "parent": "first",
                "inputs": {"VALUE": [1, [4, "3"]]},
                "fields": {"VARIABLE": ["n", "var-n"]},
                "topLevel": False,
                "shadow": False,
            },
            "third": {**_say(None), "inputs": {"MESSAGE": [1, "rep"]}},
            "rep": _var_reporter("n"),
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == "5\n"

    def test_change_variable_non_numeric_current_value(self):
        blocks = {
            "first": {
                **_set_var("n", [1, [3, "abc"]]),
                "next": "second",
            },
            "second": {
                "opcode": "data_changevariableby",
                "next": "third",
                "parent": "first",
                "inputs": {"VALUE": [1, [4, "4"]]},
                "fields": {"VARIABLE": ["n", "var-n"]},
                "topLevel": False,
                "shadow": False,
            },
            "third": {**_say(None), "inputs": {"MESSAGE": [1, "rep"]}},
            "rep": _var_reporter("n"),
        }
        out = _run(transpile_project(_flag(blocks)))
        # "abc" counts as 0, so 0 + 4 = 4 (Scratch behaviour).
        assert out == "4\n"

    def test_variable_name_sanitised_and_prefixed(self):
        blocks = {
            "first": {
                **_set_var("1st value", [1, [4, "9"]]),
                "next": "second",
            },
            "second": {**_say(None), "inputs": {"MESSAGE": [1, "rep"]}},
            "rep": _var_reporter("1st value"),
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == "9\n"

    def test_set_variable_missing_field_raises(self):
        block = _set_var("n", [1, [4, "1"]])
        block["fields"] = {}
        project = _flag({"first": block})
        with pytest.raises(TranspileError, match="variable field"):
            transpile_project(project)


class TestAskAnswer:
    def test_ask_then_answer(self):
        blocks = {
            "first": {
                "opcode": "sensing_askandwait",
                "next": "second",
                "parent": "hat",
                "inputs": {"QUESTION": [1, [3, "n?"]]},
                "fields": {},
                "topLevel": False,
                "shadow": False,
            },
            "second": {
                "opcode": "looks_say",
                "next": None,
                "parent": "first",
                "inputs": {"MESSAGE": [1, "ans"]},
                "fields": {},
                "topLevel": False,
                "shadow": False,
            },
            "ans": _op("sensing_answer", {}),
        }
        out = _run(transpile_project(_flag(blocks)), stdin_text="hello\n")
        assert out == "hello\n"

    def test_ask_with_reporter_question(self):
        blocks = {
            "first": {**_set_var("q", [1, [3, "give n"]]), "next": "ask"},
            "ask": {
                "opcode": "sensing_askandwait",
                "next": "second",
                "parent": "first",
                "inputs": {"QUESTION": [1, "rep"]},
                "fields": {},
                "topLevel": False,
                "shadow": False,
            },
            "second": _say([1, [4, "1"]]),
            "rep": _var_reporter("q"),
        }
        out = _run(transpile_project(_flag(blocks)), stdin_text="5\n")
        # The question is evaluated but never printed; only the say runs.
        assert out == "1\n"

    def test_answer_before_any_ask_is_empty(self):
        blocks = {"first": _say([1, "ans"])}
        blocks["ans"] = _op("sensing_answer", {})
        out = _run(transpile_project(_flag(blocks)))
        assert out == "\n"


class _Num:
    """Shorthand for a math-number literal input."""

    def __init__(self, value):
        self.value = [1, [4, str(value)]]


def _binary(opcode: str, left, right) -> dict:
    return _op(
        opcode,
        {"NUM1": [1, [4, str(left)]], "NUM2": [1, [4, str(right)]]},
    )


class TestOperators:
    @pytest.mark.parametrize(
        "opcode,left,right,expected",
        [
            ("operator_add", 2, 3, "5"),
            ("operator_subtract", 10, 4, "6"),
            ("operator_multiply", 6, 7, "42"),
            ("operator_divide", 7, 2, "3.5"),
        ],
    )
    def test_arithmetic(self, opcode, left, right, expected):
        blocks = {"first": _say([1, "expr"]), "expr": _binary(opcode, left, right)}
        out = _run(transpile_project(_flag(blocks)))
        assert out == expected + "\n"

    def test_division_by_zero_is_infinity(self):
        blocks = {"first": _say([1, "expr"]), "expr": _binary("operator_divide", 1, 0)}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "Infinity\n"

    def test_division_zero_by_zero_is_nan(self):
        blocks = {"first": _say([1, "expr"]), "expr": _binary("operator_divide", 0, 0)}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "NaN\n" or "nan" in out

    def test_mod_signed_like_scratch(self):
        blocks = {"first": _say([1, "expr"]), "expr": _binary("operator_mod", -7, 3)}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "2\n"

    def test_mod_zero_is_nan(self):
        blocks = {"first": _say([1, "expr"]), "expr": _binary("operator_mod", 5, 0)}
        out = _run(transpile_project(_flag(blocks)))
        assert "NaN" in out

    def test_say_whole_float_prints_without_decimal(self):
        expr = _op(
            "operator_divide",
            {"NUM1": [1, [4, "9"]], "NUM2": [1, [4, "3"]]},
        )
        blocks = {"first": _say([1, "expr"]), "expr": expr}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "3\n"

    def test_nested_arithmetic(self):
        inner = _binary("operator_add", 1, 2)
        inner_id = "inner"
        outer = _op(
            "operator_multiply",
            {"NUM1": [1, inner_id], "NUM2": [1, [4, "10"]]},
        )
        blocks = {
            "first": _say([1, "expr"]),
            "expr": outer,
            inner_id: inner,
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == "30\n"


def _compare(opcode: str, left, right) -> dict:
    return _op(
        opcode,
        {"OPERAND1": [1, [4, str(left)]], "OPERAND2": [1, [4, str(right)]]},
    )


class TestComparisons:
    def _boolean_say(self, condition_id, blocks):
        blocks["first"] = {
            "opcode": "looks_say",
            "next": None,
            "parent": "hat",
            "inputs": {"MESSAGE": [2, condition_id]},
            "fields": {},
            "topLevel": False,
            "shadow": False,
        }
        return _flag(blocks)

    def test_lt_true(self):
        blocks = {"cond": _compare("operator_lt", 1, 2)}
        out = _run(transpile_project(self._boolean_say("cond", blocks)))
        assert out == "true\n"

    def test_gt_true(self):
        blocks = {"cond": _compare("operator_gt", 3, 2)}
        out = _run(transpile_project(self._boolean_say("cond", blocks)))
        assert out == "true\n"

    def test_equals_numeric(self):
        blocks = {"cond": _compare("operator_equals", 2, 2)}
        out = _run(transpile_project(self._boolean_say("cond", blocks)))
        assert out == "true\n"

    def test_equals_case_insensitive_strings(self):
        # Use literals through text compare: "A" == "a" in Scratch.
        cond = _op(
            "operator_equals",
            {"OPERAND1": [1, [3, "A"]], "OPERAND2": [1, [3, "a"]]},
        )
        blocks = {"cond": cond}
        out = _run(transpile_project(self._boolean_say("cond", blocks)))
        assert out == "true\n"

    def test_string_lt_case_insensitive(self):
        cond = _op(
            "operator_lt",
            {"OPERAND1": [1, [3, "apple"]], "OPERAND2": [1, [3, "BANANA"]]},
        )
        blocks = {"cond": cond}
        out = _run(transpile_project(self._boolean_say("cond", blocks)))
        assert out == "true\n"

    def test_missing_boolean_input_is_false(self):
        blocks = {"cond": _op("operator_lt", {})}
        out = _run(transpile_project(self._boolean_say("cond", blocks)))
        assert out == "false\n"


class TestLogic:
    def _say_bool(self, expr_id, blocks):
        blocks["first"] = _say([2, expr_id])
        return _flag(blocks)

    def test_and(self):
        a = _compare("operator_lt", 1, 2)
        b = _compare("operator_gt", 3, 2)
        expr = _op("operator_and", {"OPERAND1": [2, "a"], "OPERAND2": [2, "b"]})
        blocks = {"first": _say([2, "expr"]), "expr": expr, "a": a, "b": b}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "true\n"

    def test_or(self):
        a = _compare("operator_lt", 9, 2)
        b = _compare("operator_gt", 3, 2)
        expr = _op("operator_or", {"OPERAND1": [2, "a"], "OPERAND2": [2, "b"]})
        blocks = {"first": _say([2, "expr"]), "expr": expr, "a": a, "b": b}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "true\n"

    def test_not(self):
        a = _compare("operator_lt", 9, 2)
        expr = _op("operator_not", {"OPERAND": [2, "a"]})
        blocks = {"first": _say([2, "expr"]), "expr": expr, "a": a}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "true\n"

    def test_boolean_literal_operand(self):
        expr = _op("operator_not", {"OPERAND": [1, [6, "true"]]})
        blocks = {"first": _say([2, "expr"]), "expr": expr}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "false\n"


class TestMathOps:
    @pytest.mark.parametrize(
        "op,value,expected",
        [
            ("abs", -5, "5"),
            ("floor", 2.7, "2"),
            ("ceiling", 2.1, "3"),
            ("sqrt", 16, "4"),
            ("round", 2.5, "3"),
        ],
    )
    def test_mathop(self, op, value, expected):
        expr = _op(
            "operator_mathop",
            {"NUM": [1, [4, str(value)]]},
            {"OPERATOR": [op]},
        )
        blocks = {"first": _say([1, "expr"]), "expr": expr}
        out = _run(transpile_project(_flag(blocks)))
        assert out == expected + "\n"

    def test_round_half_away_from_zero(self):
        expr = _op(
            "operator_mathop",
            {"NUM": [1, [4, "-2.5"]]},
            {"OPERATOR": ["round"]},
        )
        blocks = {"first": _say([1, "expr"]), "expr": expr}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "-3\n"

    def test_trig_in_degrees(self):
        expr = _op(
            "operator_mathop",
            {"NUM": [1, [4, "90"]]},
            {"OPERATOR": ["sin"]},
        )
        blocks = {"first": _say([1, "expr"]), "expr": expr}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "1\n"

    def test_cos_degrees(self):
        expr = _op(
            "operator_mathop",
            {"NUM": [1, [4, "0"]]},
            {"OPERATOR": ["cos"]},
        )
        blocks = {"first": _say([1, "expr"]), "expr": expr}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "1\n"

    def test_sqrt_negative_is_nan(self):
        expr = _op(
            "operator_mathop",
            {"NUM": [1, [4, "-1"]]},
            {"OPERATOR": ["sqrt"]},
        )
        blocks = {"first": _say([1, "expr"]), "expr": expr}
        out = _run(transpile_project(_flag(blocks)))
        assert "NaN" in out

    def test_unknown_mathop_raises(self):
        expr = _op(
            "operator_mathop",
            {"NUM": [1, [4, "1"]]},
            {"OPERATOR": ["ln"]},
        )
        blocks = {"first": _say([1, "expr"]), "expr": expr}
        with pytest.raises(TranspileError, match="mathop 'ln'"):
            transpile_project(_flag(blocks))

    def test_mathop_missing_field_raises(self):
        expr = _op("operator_mathop", {"NUM": [1, [4, "1"]]})
        blocks = {"first": _say([1, "expr"]), "expr": expr}
        with pytest.raises(TranspileError, match="OPERATOR"):
            transpile_project(_flag(blocks))


class TestControl:
    def _if_block(self, cond_id, substack_first, else_first=None):
        inputs = {"CONDITION": [2, cond_id], "SUBSTACK": [2, substack_first]}
        opcode = "control_if"
        if else_first is not None:
            opcode = "control_if_else"
            inputs["SUBSTACK2"] = [2, else_first]
        return _op(opcode, inputs)

    def test_if_taken(self):
        cond = _compare("operator_lt", 1, 2)
        blocks = {
            "first": self._if_block("cond", "inner"),
            "inner": _say([1, [3, "yes"]]),
            "cond": cond,
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == "yes\n"

    def test_if_not_taken(self):
        cond = _compare("operator_gt", 1, 2)
        blocks = {
            "first": self._if_block("cond", "inner"),
            "inner": _say([1, [3, "yes"]]),
            "cond": cond,
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == ""

    def test_if_else(self):
        cond = _compare("operator_gt", 1, 2)
        blocks = {
            "first": self._if_block("cond", "inner", "other"),
            "inner": _say([1, [3, "yes"]]),
            "other": _say([1, [3, "no"]]),
            "cond": cond,
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == "no\n"

    def test_if_empty_substack(self):
        cond = _compare("operator_lt", 1, 2)
        blocks = {
            "first": self._if_block("cond", None),
            "cond": cond,
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == ""

    def test_repeat(self):
        # say "x" three times
        blocks = {
            "first": _op(
                "control_repeat",
                {"TIMES": [1, [4, "3"]], "SUBSTACK": [2, "inner"]},
            ),
            "inner": _say([1, [3, "x"]]),
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == "x\nx\nx\n"

    def test_repeat_zero_times(self):
        blocks = {
            "first": _op(
                "control_repeat",
                {"TIMES": [1, [4, "0"]], "SUBSTACK": [2, "inner"]},
            ),
            "inner": _say([1, [3, "x"]]),
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == ""

    def test_repeat_until(self):
        # count = 0; repeat until count = 3 { change count by 1 }; say count
        blocks = {
            "first": {**_set_var("count", [1, [4, "0"]]), "next": "until"},
            "until": _op(
                "control_repeat_until",
                {
                    "CONDITION": [2, "done"],
                    "SUBSTACK": [2, "bump"],
                },
            ),
            "bump": {
                "opcode": "data_changevariableby",
                "next": None,
                "parent": "until",
                "inputs": {"VALUE": [1, [4, "1"]]},
                "fields": {"VARIABLE": ["count", "var-count"]},
                "topLevel": False,
                "shadow": False,
            },
            "done": _op(
                "operator_equals",
                {
                    "OPERAND1": [1, "cv"],
                    "OPERAND2": [1, [4, "3"]],
                },
            ),
            "cv": _var_reporter("count"),
            "tail": _say([1, "cv2"]),
            "cv2": _var_reporter("count"),
        }
        blocks["until"]["next"] = "tail"
        blocks["tail"]["parent"] = "until"
        out = _run(transpile_project(_flag(blocks)))
        assert out == "3\n"

    def test_while_until_while_mode(self):
        blocks = {
            "first": {**_set_var("n", [1, [4, "0"]]), "next": "loop"},
            "loop": _op(
                "control_whileUntil",
                {
                    "CONDITION": [2, "cond"],
                    "SUBSTACK": [2, "bump"],
                },
                {"CONDITION_MODE": ["WHILE"]},
            ),
            "cond": _op(
                "operator_lt",
                {"OPERAND1": [1, "cv"], "OPERAND2": [1, [4, "2"]]},
            ),
            "bump": {
                "opcode": "data_changevariableby",
                "next": None,
                "parent": "loop",
                "inputs": {"VALUE": [1, [4, "1"]]},
                "fields": {"VARIABLE": ["n", "var-n"]},
                "topLevel": False,
                "shadow": False,
            },
            "cv": _var_reporter("n"),
            "tail": _say([1, "cv2"]),
            "cv2": _var_reporter("n"),
        }
        blocks["loop"]["next"] = "tail"
        blocks["tail"]["parent"] = "loop"
        out = _run(transpile_project(_flag(blocks)))
        assert out == "2\n"

    def test_while_until_until_mode(self):
        # (a dead _compare literal was removed here; until-loop fixture follows)  # always false → until runs once?
        # repeat-until with always-false condition would loop forever; use
        # "until 5 < 2" (never true) is unsafe. Instead: until NOT(true)=false
        # → use a comparison that is TRUE so the until body never runs.
        blocks = {
            "first": _op(
                "control_whileUntil",
                {"CONDITION": [2, "cond"], "SUBSTACK": [2, "inner"]},
                {"CONDITION_MODE": ["UNTIL"]},
            ),
            "cond": _compare("operator_lt", 1, 2),
            "inner": _say([1, [3, "ran"]]),
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == ""

    def test_forever_with_stop_all(self):
        blocks = {
            "first": _op("control_forever", {"SUBSTACK": [2, "inner"]}),
            "inner": {
                "opcode": "control_stop",
                "next": None,
                "parent": "first",
                "inputs": {},
                "fields": {"STOP_MODE": ["all"]},
                "topLevel": False,
                "shadow": False,
            },
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == ""

    def test_stop_this_script_is_pass(self):
        blocks = {
            "first": {
                "opcode": "control_stop",
                "next": "second",
                "parent": "hat",
                "inputs": {},
                "fields": {"STOP_MODE": ["this script"]},
                "topLevel": False,
                "shadow": False,
            },
            "second": _say([1, [3, "after"]]),
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == "after\n"

    def test_forever_empty_substack_is_infinite_loop_syntax(self):
        # forever with no body would hang; the transpile output must still
        # be valid Python (while True: pass). Compile-check only.
        blocks = {"first": _op("control_forever", {"SUBSTACK": [2, "inner"]})}
        blocks["inner"] = _say([1, [3, "once"]])
        blocks["first"]["inputs"] = {}  # empty substack
        source = transpile_project(_flag(blocks))
        compile(source, "<generated>", "exec")

    def test_stop_missing_field_raises(self):
        blocks = {
            "first": {
                "opcode": "control_stop",
                "next": None,
                "parent": "hat",
                "inputs": {},
                "fields": {},
                "topLevel": False,
                "shadow": False,
            },
        }
        with pytest.raises(TranspileError, match="STOP_MODE"):
            transpile_project(_flag(blocks))


class TestScriptStructure:
    def test_two_flag_scripts_run_in_stage_order(self):
        # Script at y=40 says "first"; script at y=200 says "second".
        blocks = {
            "first": {**_say([1, [3, "first"]]), "parent": "hat"},
        }
        project = _flag(blocks)
        sprite = project["targets"][1]
        sprite["blocks"]["hat"]["next"] = "first"
        sprite["blocks"]["hat2"] = {
            "opcode": "event_whenflagclicked",
            "next": "second",
            "parent": None,
            "inputs": {},
            "fields": {},
            "topLevel": True,
            "shadow": False,
            "x": 40,
            "y": 200,
        }
        sprite["blocks"]["second"] = {
            "opcode": "looks_say",
            "next": None,
            "parent": "hat2",
            "inputs": {"MESSAGE": [1, [3, "second"]]},
            "fields": {},
            "topLevel": False,
            "shadow": False,
        }
        out = _run(transpile_project(project))
        assert out == "first\nsecond\n"

    def test_top_level_reporter_without_hat_is_ignored(self):
        blocks = {"first": _say([1, [3, "hi"]])}
        project = _flag(blocks)
        project["targets"][1]["blocks"]["loose"] = _var_reporter("n")
        project["targets"][1]["blocks"]["loose"]["topLevel"] = True
        out = _run(transpile_project(project))
        assert out == "hi\n"

    def test_no_flag_script_raises(self):
        project = {
            "targets": [
                {"isStage": True, "name": "Stage", "variables": {}, "blocks": {}},
                {
                    "isStage": False,
                    "name": "Sprite1",
                    "variables": {},
                    "blocks": {"loose": {**_var_reporter("n"), "topLevel": True}},
                },
            ]
        }
        with pytest.raises(TranspileError, match="green flag"):
            transpile_project(project)

    def test_missing_block_reference_raises(self):
        blocks = {"first": _say([1, "ghost"])}
        with pytest.raises(TranspileError, match="missing block 'ghost'"):
            transpile_project(_flag(blocks))

    def test_statement_chain_too_long_raises(self):
        blocks = {"first": _say([1, [3, "x"]])}
        blocks["first"]["next"] = "first"  # self-loop
        with pytest.raises(TranspileError, match="10000"):
            transpile_project(_flag(blocks))

    def test_hat_inside_chain_raises(self):
        blocks = {
            "first": {
                "opcode": "event_whenflagclicked",
                "next": None,
                "parent": "hat",
                "inputs": {},
                "fields": {},
                "topLevel": False,
                "shadow": False,
            }
        }
        with pytest.raises(TranspileError, match="hat block inside"):
            transpile_project(_flag(blocks))

    def test_unsupported_statement_opcode_raises(self):
        blocks = {
            "first": {
                "opcode": "motion_movesteps",
                "next": None,
                "parent": "hat",
                "inputs": {},
                "fields": {},
                "topLevel": False,
                "shadow": False,
            }
        }
        with pytest.raises(TranspileError, match="motion_movesteps"):
            transpile_project(_flag(blocks))

    def test_unsupported_reporter_opcode_raises(self):
        blocks = {
            "first": _say([1, "expr"]),
            "expr": _op("operator_join", {}),
        }
        with pytest.raises(TranspileError, match="operator_join"):
            transpile_project(_flag(blocks))

    def test_unsupported_literal_typecode_raises(self):
        blocks = {"first": _say([1, [7, "weird"]])}
        with pytest.raises(TranspileError, match="typecode 7"):
            transpile_project(_flag(blocks))

    def test_non_numeric_math_literal_raises(self):
        blocks = {"first": _say([1, [4, "abc"]])}
        with pytest.raises(TranspileError, match="non-numeric"):
            transpile_project(_flag(blocks))

    def test_bad_input_payload_raises(self):
        blocks = {"first": _say([1, 42])}
        with pytest.raises(TranspileError, match="payload"):
            transpile_project(_flag(blocks))

    def test_empty_input_payload_is_empty_string(self):
        blocks = {"first": _say([1, None])}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "\n"

    def test_short_input_entry_is_empty_string(self):
        blocks = {"first": _say([])}
        blocks["first"]["inputs"] = {"MESSAGE": [1]}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "\n"


class TestTranspileEntryPoint:
    def test_transpile_json_string(self):
        project = _flag({"first": _say([1, [4, "5"]])})
        source = transpile(json.dumps(project))
        assert "print(_wc_fmt(5))" in source

    def test_transpile_invalid_json(self):
        with pytest.raises(TranspileError, match="invalid project JSON"):
            transpile("{not json")

    def test_transpile_non_object(self):
        with pytest.raises(TranspileError, match="JSON object"):
            transpile("[1, 2]")

    def test_no_targets_raises(self):
        with pytest.raises(TranspileError, match="no targets"):
            transpile('{"targets": []}')

    def test_malformed_target_raises(self):
        with pytest.raises(TranspileError, match="malformed"):
            transpile('{"targets": [{"isStage": true}]}')

    def test_generated_source_compiles(self):
        project = _flag({"first": _say([1, [4, "5"]])})
        compile(transpile_project(project), "<gen>", "exec")


class TestValidateProject:
    def test_valid_project_has_no_errors(self):
        project = _flag({"first": _say([1, [4, "5"]])})
        assert validate_project(json.dumps(project)) == []

    def test_invalid_json(self):
        # Static message (no exception text in API responses — CodeQL).
        assert validate_project("{nope") == [
            "invalid project JSON: expected a JSON object with a "
            "'targets' array of sprites"
        ]

    def test_non_object(self):
        assert validate_project("[]") == ["project must be a JSON object"]

    def test_unsupported_opcode_flagged(self):
        blocks = {
            "first": {
                "opcode": "motion_turnright",
                "next": None,
                "parent": "hat",
                "inputs": {},
                "fields": {},
                "topLevel": False,
                "shadow": False,
            }
        }
        errors = validate_project(json.dumps(_flag(blocks)))
        assert any("no judged mapping" in e for e in errors)

    def test_block_outside_problem_allowlist_flagged(self):
        project = _flag({"first": _say([1, [4, "5"]])})
        # Allowlist excludes looks_say.
        errors = validate_project(
            json.dumps(project), allowed_opcodes=["event_whenflagclicked"]
        )
        assert any("does not allow" in e and "looks_say" in e for e in errors)

    def test_missing_flag_script_flagged(self):
        project = {
            "targets": [
                {"isStage": True, "name": "Stage", "variables": {}, "blocks": {}},
                {
                    "isStage": False,
                    "name": "Sprite1",
                    "variables": {},
                    "blocks": {"loose": {**_var_reporter("n"), "topLevel": True}},
                },
            ]
        }
        errors = validate_project(json.dumps(project))
        assert any("green flag" in e for e in errors)

    def test_malformed_targets_reported(self):
        assert validate_project('{"targets": [7]}') != []


class TestKnownOpcodesCatalog:
    def test_catalog_contains_core_blocks(self):
        assert "event_whenflagclicked" in KNOWN_OPCODES
        assert "looks_say" in KNOWN_OPCODES
        assert "operator_add" in KNOWN_OPCODES
        assert "control_repeat" in KNOWN_OPCODES
        assert "sensing_askandwait" in KNOWN_OPCODES

    def test_motion_blocks_not_in_catalog(self):
        assert "motion_movesteps" not in KNOWN_OPCODES


class TestRobustness:
    def test_variable_named_like_builtin_is_renamed(self):
        # A Scratch variable called "print" must not shadow the builtin in
        # the generated program: it gets renamed with a numeric suffix.
        blocks = {
            "first": {**_set_var("print", [1, [4, "3"]]), "next": "second"},
            "second": {**_say(None), "inputs": {"MESSAGE": [1, "rep"]}},
            "rep": _var_reporter("print"),
        }
        out = _run(transpile_project(_flag(blocks)))
        assert out == "3\n"

    def test_duplicate_variable_names_get_unique_idents(self):
        variables = {
            "stage-n": ["n", 0],
            "sprite-n": ["n", 0],
        }
        blocks = {
            "first": {
                **_set_var("n", [1, [4, "1"]]),
                "next": "second",
            },
            "second": {**_say(None), "inputs": {"MESSAGE": [1, "rep"]}},
            "rep": _var_reporter("n"),
        }
        project = _flag(blocks, variables)
        # Reference the sprite copy via its own id: same display name,
        # different identity — the transpiler must keep them apart.
        project["targets"][1]["blocks"]["rep"]["fields"]["VARIABLE"] = [
            "n",
            "sprite-n",
        ]
        source = transpile_project(project)
        assert "n_2 = 0" in source
        assert "n = 0" in source

    def test_malformed_variable_entry_skipped(self):
        variables = {"bad": "not-a-list", "good": ["n", 0], "empty": []}
        blocks = {
            "first": {**_set_var("n", [1, [4, "2"]]), "next": "second"},
            "second": {**_say(None), "inputs": {"MESSAGE": [1, "rep"]}},
            "rep": _var_reporter("n"),
        }
        out = _run(transpile_project(_flag(blocks, variables)))
        assert out == "2\n"

    def test_malformed_block_entry_ignored(self):
        blocks = {"first": _say([1, [3, "hi"]])}
        project = _flag(blocks)
        project["targets"][1]["blocks"]["garbage"] = ["not", "a", "block"]
        out = _run(transpile_project(project))
        assert out == "hi\n"

    def test_opcodeless_block_dict_ignored_by_collector(self):
        blocks = {"first": _say([1, [3, "hi"]])}
        project = _flag(blocks)
        project["targets"][1]["blocks"]["weird"] = {"topLevel": False}
        assert validate_project(json.dumps(project)) == []

    def test_boolean_input_short_entry_is_false(self):
        blocks = {
            "first": _op("control_if", {"CONDITION": [2], "SUBSTACK": [2, "x"]}),
            "x": _say([1, [3, "ran"]]),
        }
        # CONDITION entry lacks a target → the if body never runs.
        out = _run(transpile_project(_flag(blocks)))
        assert out == ""


class TestTranspileMessageHelper:
    def test_static_message_from_args(self):
        from .scratch_transpiler import TranspileError, _transpile_message

        assert _transpile_message(TranspileError("bad block 'x'")) == "bad block 'x'"

    def test_fallback_without_args(self):
        from .scratch_transpiler import TranspileError, _transpile_message

        assert _transpile_message(TranspileError()) == (
            "the Scratch project could not be translated"
        )


class TestRealSb3TextTypecode:
    """Real Scratch editors emit text literals as [10, "..."] (scratch-vm
    serialization/sb3.js: TEXT_PRIMITIVE = 10) — the shape the judge must
    accept for every real editor submission."""

    def test_say_text_shadow_typecode_10(self):
        blocks = {"first": _say([1, [10, "Hello!"]])}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "Hello!\n"

    def test_ask_question_typecode_10(self):
        blocks = {
            "first": {
                "opcode": "sensing_askandwait",
                "next": "second",
                "parent": "hat",
                "inputs": {"QUESTION": [1, [10, "n?"]]},
                "fields": {},
                "topLevel": False,
                "shadow": False,
            },
            "second": _say([1, "ans"]),
            "ans": _op("sensing_answer", {}),
        }
        out = _run(transpile_project(_flag(blocks)), stdin_text="42\n")
        assert out == "42\n"

    def test_mathop_operand_typecode_10_is_text_coerced(self):
        expr = _op("operator_mathop", {"NUM": [1, [10, "9"]]}, {"OPERATOR": ["sqrt"]})
        blocks = {"first": _say([1, "expr"]), "expr": expr}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "3\n"

    def test_legacy_typecode_3_still_accepted(self):
        blocks = {"first": _say([1, [3, "old"]])}
        out = _run(transpile_project(_flag(blocks)))
        assert out == "old\n"
