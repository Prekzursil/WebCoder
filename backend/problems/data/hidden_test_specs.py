"""Hidden-test specifications for thin-import problems (2026-11-20 sweep).

Each entry: match (exact EN title at import time, or source-URL suffix),
bilingual replacement title/statement (the parked Bac "subprogram" rows
rewritten as equivalent whole-program tasks — same exercise, our own
wording), a python3 reference solution, generated inputs (edge + scale),
and an optional known-wrong solution for verdict-flip validation.

pbinfo's own test data is proprietary and was never imported; these
suites are original, derived only from the published statements.
"""

SPECS = []


def _spec(*, match, title, statement, solution, inputs, wrong_solution=None, replace_tests=False):
    entry = {
        "match": match,
        "title": title,
        "statement": statement,
        "solution": solution,
        "inputs": inputs,
        "replace_tests": replace_tests,
    }
    if wrong_solution:
        entry["wrong_solution"] = wrong_solution
    SPECS.append(entry)


def _stmt(en_task, en_in, en_out, ro_task, ro_in, ro_out, samples, constraints_en="", constraints_ro=""):
    """Bilingual statement builder with pbinfo-style samples."""

    def block(task, inp, out, constraints, samples_, heading, io_labels):
        lines = [f"# {heading}", "", task, "", "## " + io_labels[0], "", "```", inp.strip("\n"), "```", "", "## " + io_labels[1], "", "```", out.strip("\n"), "```"]
        if constraints:
            lines += ["", "## " + io_labels[2], "", constraints]
        for s_in, s_out in samples_:
            lines += ["", "### " + io_labels[3], "", "**" + io_labels[0] + ":**", "", "```", s_in.strip("\n"), "```", "", "**" + io_labels[1] + ":**", "", "```", s_out.strip("\n"), "```"]
        return "\n".join(lines) + "\n"

    en = block(en_task, en_in, en_out, constraints_en, samples, "{TITLE_EN}", ("Input", "Output", "Constraints", "Sample"))
    ro = block(ro_task, ro_in, ro_out, constraints_ro, samples, "{TITLE_RO}", ("Intrare", "Ieșire", "Restricții", "Exemplu"))
    return en, ro


# ---------------------------------------------------------------------------
# 911 interval4 — smallest non-prime x > n with exactly one prime in [n, x]
# ---------------------------------------------------------------------------
_en, _ro = _stmt(
    "Given a natural number `n`, find the smallest natural number `x` with `n < x` such that `x` is **not** prime and the closed interval `[n, x]` contains exactly one prime number.",
    "n", "x",
    "Se dă un număr natural `n`. Determinați cel mai mic număr natural `x`, `n < x`, cu proprietatea că `x` **nu** este prim și în intervalul închis `[n, x]` există exact un număr prim.",
    "n", "x",
    [("8", "12")],
    "- 3 ≤ n ≤ 1 000 000", "- 3 ≤ n ≤ 1 000 000",
)
_spec(
    match={"title_en": "Interval4"},
    title={"en": "Exactly One Prime", "ro": "Un singur număr prim"},
    statement={"en": _en.replace("{TITLE_EN}", "Exactly One Prime"), "ro": _ro.replace("{TITLE_RO}", "Un singur număr prim")},
    solution="""import sys

def is_prime(v):
    if v < 2:
        return False
    i = 2
    while i * i <= v:
        if v % i == 0:
            return False
        i += 1
    return True

def main():
    n = int(sys.stdin.readline())
    count = 1 if is_prime(n) else 0
    x = n + 1
    while True:
        if is_prime(x):
            count += 1
        elif count == 1:
            print(x)
            return
        x += 1

main()
""",
    inputs=["8\n", "3\n", "4\n", "1000\n", "999983\n", "29\n", "999999\n", "121\n", "90\n", "5\n"],
    wrong_solution="import sys\nprint(int(sys.stdin.readline()) + 2)\n",
)

# ---------------------------------------------------------------------------
# 914 resturi1 — count v in [1, n] with v%x==r and v%y==r
# ---------------------------------------------------------------------------
_en, _ro = _stmt(
    "Given four natural numbers `n x y r` with `r < x < y < n`, count the values `v` in `[1, n]` whose remainders on division by both `x` and `y` equal `r`.",
    "n x y r", "count",
    "Se dau patru numere naturale `n x y r`, `r < x < y < n`. Determinați câte valori `v` din intervalul `[1, n]` au restul împărțirii atât la `x`, cât și la `y`, egal cu `r`.",
    "n x y r", "numărul de valori",
    [("200 5 14 2", "3")],
    "- 1 ≤ r < x < y < n ≤ 1 000 000 000", "- 1 ≤ r < x < y < n ≤ 1 000 000 000",
)
_spec(
    match={"title_en": "Leftovers1"},
    title={"en": "Double Remainders", "ro": "Resturi duble"},
    statement={"en": _en.replace("{TITLE_EN}", "Double Remainders"), "ro": _ro.replace("{TITLE_RO}", "Resturi duble")},
    solution="""import sys
from math import gcd

def main():
    n, x, y, r = map(int, sys.stdin.readline().split())
    lcm = x * y // gcd(x, y)
    print((n - r) // lcm + 1)

main()
""",
    inputs=["200 5 14 2\n", "10 2 3 1\n", "1000000000 3 7 2\n", "987654321 11 13 5\n", "1000000 999 1000 1\n", "50 4 6 2\n", "999999999 2 5 1\n", "123456789 3 4 1\n"],
)

# ---------------------------------------------------------------------------
# 924 identice4 — numbers in [a, b] whose digits are all identical
# ---------------------------------------------------------------------------
_en, _ro = _stmt(
    "Given two natural numbers `a ≤ b`, print all numbers in `[a, b]` whose digits are all identical (e.g. `777`, `1`, `1111`), separated by single spaces. If there are none, print `nu exista`.",
    "a b", "the numbers, space separated (or nu exista)",
    "Se dau două numere naturale `a ≤ b`. Afișați toate numerele din intervalul `[a, b]` ale căror cifre sunt toate identice (de ex. `777`, `1`, `1111`), separate prin câte un spațiu. Dacă nu există astfel de numere, afișați `nu exista`.",
    "a b", "numerele, separate prin spații (sau nu exista)",
    [("700 1500", "777 888 999 1111")],
    "- 10 ≤ a ≤ b ≤ 1 000 000", "- 10 ≤ a ≤ b ≤ 1 000 000",
)
_spec(
    match={"title_en": "Identical4"},
    title={"en": "Identical Digits", "ro": "Cifre identice"},
    statement={"en": _en.replace("{TITLE_EN}", "Identical Digits"), "ro": _ro.replace("{TITLE_RO}", "Cifre identice")},
    solution="""import sys

def main():
    a, b = map(int, sys.stdin.readline().split())
    found = []
    for digit in range(1, 10):
        value = digit
        while value <= b:
            if value >= a:
                found.append(value)
            value = value * 10 + digit
    if found:
        print(" ".join(map(str, sorted(found))))
    else:
        print("nu exista")

main()
""",
    inputs=["700 1500\n", "10 99\n", "12 21\n", "1000000 1000000\n", "11 11\n", "98 102\n", "555555 555559\n", "100 549\n", "999998 1000000\n", "3300 3400\n"],
    wrong_solution="import sys\na, b = map(int, sys.stdin.readline().split())\nprint(a, b)\n",
)

# ---------------------------------------------------------------------------
# 929 cifreimpare — remove the odd digits from n
# ---------------------------------------------------------------------------
_en, _ro = _stmt(
    "Given a natural number `n`, print the number obtained by deleting all of its odd digits. If no digit remains (or all digits were odd), print `-1`.",
    "n", "the trimmed number, or -1",
    "Se dă un număr natural `n`. Afișați numărul obținut prin eliminarea tuturor cifrelor impare ale lui `n`. Dacă nu rămâne nicio cifră (toate cifrele erau impare), afișați `-1`.",
    "n", "numărul obținut, sau -1",
    [("23541", "24"), ("28", "-1")],
    "- 1 ≤ n ≤ 1 000 000 000", "- 1 ≤ n ≤ 1 000 000 000",
)
_spec(
    match={"title_en": "Odd numbers"},
    title={"en": "Remove the Odd Digits", "ro": "Eliminarea cifrelor impare"},
    statement={"en": _en.replace("{TITLE_EN}", "Remove the Odd Digits"), "ro": _ro.replace("{TITLE_RO}", "Eliminarea cifrelor impare")},
    solution="""import sys

def main():
    n = sys.stdin.readline().strip()
    kept = [c for c in n if c in "02468"]
    if kept:
        print(int("".join(kept)))
    else:
        print(-1)

main()
""",
    inputs=["23541\n", "28\n", "13579\n", "24680\n", "1000000000\n", "9\n", "123456789\n", "999999998\n", "1024\n"],
)

# ---------------------------------------------------------------------------
# 932 duplicare1 — duplicate every even digit of n
# ---------------------------------------------------------------------------
_en, _ro = _stmt(
    "Given a natural number `n`, print the number obtained by duplicating every **even** digit of `n`. If `n` has no even digit, print `-1`.",
    "n", "the expanded number, or -1",
    "Se dă un număr natural `n`. Afișați numărul obținut prin duplicarea fiecărei cifre **pare** a lui `n`. Dacă `n` nu are nicio cifră pară, afișați `-1`.",
    "n", "numărul obținut, sau -1",
    [("2380", "2238800")],
    "- 1 ≤ n ≤ 10 000", "- 1 ≤ n ≤ 10 000",
)
_spec(
    match={"title_en": "Duplication1"},
    title={"en": "Duplicate the Even Digits", "ro": "Duplicarea cifrelor pare"},
    statement={"en": _en.replace("{TITLE_EN}", "Duplicate the Even Digits"), "ro": _ro.replace("{TITLE_RO}", "Duplicarea cifrelor pare")},
    solution="""import sys

def main():
    n = sys.stdin.readline().strip()
    out = []
    has_even = False
    for c in n:
        if c in "02468":
            out.append(c + c)
            has_even = True
        else:
            out.append(c)
    if has_even:
        print(int("".join(out)))
    else:
        print(-1)

main()
""",
    inputs=["2380\n", "13579\n", "2468\n", "10000\n", "9999\n", "12\n", "8888\n", "97531\n", "20507\n"],
)

# ---------------------------------------------------------------------------
# 935 divimpar — the largest odd common divisor of a and b
# ---------------------------------------------------------------------------
_en, _ro = _stmt(
    "Given two natural numbers `a` and `b`, print their greatest common divisor that is **odd**.",
    "a b", "the largest odd common divisor",
    "Se dau două numere naturale `a` și `b`. Afișați cel mai mare divizor comun al lor care este **impar**.",
    "a b", "cel mai mare divizor comun impar",
    [("30 60", "15")],
    "- 1 ≤ a, b ≤ 100 000", "- 1 ≤ a, b ≤ 100 000",
)
_spec(
    match={"title_en": "Odd Div"},
    title={"en": "Largest Odd Common Divisor", "ro": "Cel mai mare divizor comun impar"},
    statement={"en": _en.replace("{TITLE_EN}", "Largest Odd Common Divisor"), "ro": _ro.replace("{TITLE_RO}", "Cel mai mare divizor comun impar")},
    solution="""import sys
from math import gcd

def main():
    a, b = map(int, sys.stdin.readline().split())
    g = gcd(a, b)
    while g % 2 == 0:
        g //= 2
    print(g)

main()
""",
    inputs=["30 60\n", "7 13\n", "64 128\n", "100000 100000\n", "1 99999\n", "81 27\n", "12 18\n", "999983 999979\n", "48 36\n", "10000 9999\n"],
)

# ---------------------------------------------------------------------------
# 938 fiboimpar — the n-th odd Fibonacci term
# ---------------------------------------------------------------------------
_en, _ro = _stmt(
    "The Fibonacci sequence is defined by `f(1) = f(2) = 1` and `f(i) = f(i-1) + f(i-2)`. Given `n`, print the `n`-th **odd** term of the sequence.",
    "n", "the n-th odd Fibonacci term",
    "Șirul lui Fibonacci este definit prin `f(1) = f(2) = 1` și `f(i) = f(i-1) + f(i-2)`. Se dă `n`. Afișați al `n`-lea termen **impar** al șirului.",
    "n", "al n-lea termen impar",
    [("6", "21")],
    "- 1 ≤ n ≤ 30", "- 1 ≤ n ≤ 30",
)
_spec(
    match={"title_en": "FiboOdd"},
    title={"en": "Odd Fibonacci Terms", "ro": "Termeni impari Fibonacci"},
    statement={"en": _en.replace("{TITLE_EN}", "Odd Fibonacci Terms"), "ro": _ro.replace("{TITLE_RO}", "Termeni impari Fibonacci")},
    solution="""import sys

def main():
    n = int(sys.stdin.readline())
    a, b = 1, 1
    count = 0
    while True:
        if a % 2 == 1:
            count += 1
            if count == n:
                print(a)
                return
        a, b = b, a + b

main()
""",
    inputs=["6\n", "1\n", "2\n", "3\n", "30\n", "10\n", "20\n", "25\n", "15\n", "5\n"],
)

# ---------------------------------------------------------------------------
# 940 nrprime2 — how many digits of n are prime
# ---------------------------------------------------------------------------
_en, _ro = _stmt(
    "Given a natural number `n`, print how many of its digits are prime (`2`, `3`, `5`, `7`).",
    "n", "the count of prime digits",
    "Se dă un număr natural `n`. Afișați câte dintre cifrele sale sunt prime (`2`, `3`, `5`, `7`).",
    "n", "numărul cifrelor prime",
    [("1233405", "4")],
    "- 0 ≤ n ≤ 1 000 000 000", "- 0 ≤ n ≤ 1 000 000 000",
)
_spec(
    match={"title_en": "NoPrime2"},
    title={"en": "Prime Digit Count", "ro": "Cifre prime"},
    statement={"en": _en.replace("{TITLE_EN}", "Prime Digit Count"), "ro": _ro.replace("{TITLE_RO}", "Cifre prime")},
    solution="""import sys

def main():
    n = sys.stdin.readline().strip()
    print(sum(1 for c in n if c in "2357"))

main()
""",
    inputs=["1233405\n", "0\n", "24680\n", "999999999\n", "1000000000\n", "7\n", "13579\n", "222222222\n", "1023456789\n"],
)

# ---------------------------------------------------------------------------
# 944 triplete1 — all (x, y, z) with x<y<z and x·y + y·z = n
# ---------------------------------------------------------------------------
_en, _ro = _stmt(
    "Given a natural number `n`, print every triplet of natural numbers `(x, y, z)` with `x < y < z` and `x·y + y·z = n`, one per line, formatted `(x,y,z)`, ordered by `x` then `y`.",
    "n", "the triplets, one per line",
    "Se dă un număr natural `n`. Afișați toate tripletele de numere naturale `(x, y, z)` cu `x < y < z` și `x·y + y·z = n`, câte unul pe linie, în formatul `(x,y,z)`, ordonate după `x`, apoi după `y`.",
    "n", "tripletele, câte unul pe linie",
    [("8", "(0,1,8)\n(0,2,4)\n(1,2,3)")],
    "- 2 ≤ n ≤ 10 000", "- 2 ≤ n ≤ 10 000",
)
_spec(
    match={"title_en": "Triplets1"},
    title={"en": "Triplet Sums", "ro": "Triplete"},
    statement={"en": _en.replace("{TITLE_EN}", "Triplet Sums"), "ro": _ro.replace("{TITLE_RO}", "Triplete")},
    solution="""import sys

def main():
    n = int(sys.stdin.readline())
    lines = []
    for y in range(1, n + 1):
        rem = n - y * (y + 1)
        if rem < 0:
            break
        # z > y and x = n//y - z in [0, y-1]
        if n % y:
            continue
        total = n // y
        for x in range(0, min(y, total)):
            z = total - x
            if z > y:
                lines.append(f"({x},{y},{z})")
    print("\\n".join(lines) if lines else "")

main()
""",
    inputs=["8\n", "2\n", "10000\n", "100\n", "9999\n", "36\n", "720\n", "1\n", "5000\n", "12\n"],
    wrong_solution="import sys\nn = int(sys.stdin.readline())\nprint('(0,1,%d)' % n)\n",
)

# ---------------------------------------------------------------------------
# 963 fradical — maximal x with x²·y = n
# ---------------------------------------------------------------------------
_en, _ro = _stmt(
    "Given a natural number `n`, find natural numbers `x` and `y` such that `x² · y = n` with `x` as large as possible. Print `x` and `y` separated by a space.",
    "n", "x y",
    "Se dă un număr natural `n`. Determinați numerele naturale `x` și `y` astfel încât `x² · y = n`, cu `x` maxim posibil. Afișați `x` și `y` separați printr-un spațiu.",
    "n", "x y",
    [("15000", "50 6")],
    "- 1 ≤ n ≤ 1 000 000 000", "- 1 ≤ n ≤ 1 000 000 000",
)
_spec(
    match={"title_en": "Radical"},
    title={"en": "Maximal Square Factor", "ro": "Factor pătrat maximal"},
    statement={"en": _en.replace("{TITLE_EN}", "Maximal Square Factor"), "ro": _ro.replace("{TITLE_RO}", "Factor pătrat maximal")},
    solution="""import sys

def main():
    n = int(sys.stdin.readline())
    x = 1
    rest = n
    d = 2
    while d * d <= rest:
        e = 0
        while rest % d == 0:
            rest //= d
            e += 1
        x *= d ** (e // 2)
        d += 1
    # y keeps every prime power not absorbed into x^2 (incl. the leftover
    # single powers of divided-out primes and the trailing prime `rest`).
    print(x, n // (x * x))

main()
""",
    inputs=["15000\n", "1\n", "4\n", "999999937\n", "1000000000\n", "72\n", "2\n", "360\n", "1024\n", "999999999\n"],
)

# ---------------------------------------------------------------------------
# 964 finserare — insert |digit differences| between adjacent digits
# ---------------------------------------------------------------------------
_en, _ro = _stmt(
    "Given a natural number `n`, print the number obtained by inserting, between every two adjacent digits of `n`, the absolute value of their difference.",
    "n", "the expanded number",
    "Se dă un număr natural `n`. Afișați numărul obținut prin inserarea, între oricare două cifre alăturate ale lui `n`, a valorii absolute a diferenței acestora.",
    "n", "numărul obținut",
    [("7255", "7523505")],
    "- 10 ≤ n ≤ 99 999", "- 10 ≤ n ≤ 99 999",
)
_spec(
    match={"title_en": "Finishing"},
    title={"en": "Digit Difference Insertion", "ro": "Inserarea diferențelor"},
    statement={"en": _en.replace("{TITLE_EN}", "Digit Difference Insertion"), "ro": _ro.replace("{TITLE_RO}", "Inserarea diferențelor")},
    solution="""import sys

def main():
    n = sys.stdin.readline().strip()
    out = [n[0]]
    for a, b in zip(n, n[1:]):
        out.append(str(abs(int(a) - int(b))))
        out.append(b)
    print(int("".join(out)))

main()
""",
    inputs=["7255\n", "10\n", "99\n", "11111\n", "99999\n", "12345\n", "90\n", "54321\n", "10000\n", "24680\n"],
)

# Batches 2 and 3 live in sibling modules (statement rewrites for the
# remaining parked rows + SumaPătrate) so each file stays reviewable.
from problems.data.hidden_test_specs_b2 import SPECS as _SPECS_B2  # noqa: E402
from problems.data.hidden_test_specs_b3 import SPECS as _SPECS_B3  # noqa: E402

SPECS.extend(_SPECS_B2)
SPECS.extend(_SPECS_B3)
