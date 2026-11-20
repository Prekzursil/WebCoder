"""Hidden-test specs, batch 2 (parked pbinfo rows 966–1125).

Same shape as hidden_test_specs.py; imported and extended there. The
_stmt/_spec helpers are duplicated per batch so each module stands alone
for review.
"""

SPECS = []


def _spec(
    *,
    match,
    title,
    statement,
    solution,
    inputs,
    wrong_solution=None,
    replace_tests=False,
):
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


def _stmt(
    en_task,
    en_in,
    en_out,
    ro_task,
    ro_in,
    ro_out,
    samples,
    constraints_en="",
    constraints_ro="",
):
    def block(task, inp, out, constraints, samples_, heading, labels):
        lines = [
            f"# {heading}",
            "",
            task,
            "",
            "## " + labels[0],
            "",
            "```",
            inp.strip("\n"),
            "```",
            "",
            "## " + labels[1],
            "",
            "```",
            out.strip("\n"),
            "```",
        ]
        if constraints:
            lines += ["", "## " + labels[2], "", constraints]
        for s_in, s_out in samples_:
            lines += [
                "",
                "### " + labels[3],
                "",
                "**" + labels[0] + ":**",
                "",
                "```",
                s_in.strip("\n"),
                "```",
                "",
                "**" + labels[1] + ":**",
                "",
                "```",
                s_out.strip("\n"),
                "```",
            ]
        return "\n".join(lines) + "\n"

    en = block(
        en_task,
        en_in,
        en_out,
        constraints_en,
        samples,
        "{TITLE_EN}",
        ("Input", "Output", "Constraints", "Sample"),
    )
    ro = block(
        ro_task,
        ro_in,
        ro_out,
        constraints_ro,
        samples,
        "{TITLE_RO}",
        ("Intrare", "Ieșire", "Restricții", "Exemplu"),
    )
    return en, ro


# 966 prescurtat — expand abbreviated institution names
_en, _ro = _stmt(
    "A line of text contains uppercase words separated by single spaces. A word ending in `.` is an abbreviation of exactly one of the words `COLEGIUL`, `LICEUL`, `NATIONAL`, `TEORETIC` when the part before the `.` is a non-empty prefix of that word. Expand every such abbreviation to the full word and print the resulting text.",
    "the text",
    "the expanded text",
    "O linie de text conține cuvinte cu majuscule separate prin câte un spațiu. Un cuvânt terminat cu `.` este o prescurtare a exact unuia dintre cuvintele `COLEGIUL`, `LICEUL`, `NATIONAL`, `TEORETIC` dacă partea dinaintea punctului este un prefix nevid al acelui cuvânt. Înlocuiți fiecare astfel de prescurtare cu cuvântul complet și afișați textul rezultat.",
    "textul",
    "textul extins",
    [("COLEG. NAT. DE INFORMATICA", "COLEGIUL NATIONAL DE INFORMATICA")],
    "- the text has at most 50 characters; the expanded text at most 100",
    "- textul are cel mult 50 de caractere; textul extins cel mult 100",
)
_spec(
    match={"title_en": "SHORT"},
    title={"en": "Expand the Abbreviations", "ro": "Prescurtări"},
    statement={
        "en": _en.replace("{TITLE_EN}", "Expand the Abbreviations"),
        "ro": _ro.replace("{TITLE_RO}", "Prescurtări"),
    },
    solution="""import sys

WORDS = ("COLEGIUL", "LICEUL", "NATIONAL", "TEORETIC")

def expand(token):
    if not token.endswith("."):
        return token
    stem = token[:-1]
    matches = [w for w in WORDS if stem and w.startswith(stem) and stem != w]
    return matches[0] if len(matches) == 1 else token

def main():
    text = sys.stdin.readline().strip()
    print(" ".join(expand(t) for t in text.split(" ")))

main()
""",
    inputs=[
        "COLEG. NAT. DE INFORMATICA\n",
        "LICEUL TEORETIC\n",
        "T. DE MUNTE\n",
        "COLEGIUM.\n",
        "LIC. TEOR. DE ARTE\n",
        "NAT.\n",
        "COLEGIUL LICEUL\n",
        "C. L. N. T.\n",
    ],
)

# 995 b-egal — are all odd digits of n equal?
_en, _ro = _stmt(
    "Given a natural number `n` that has at least one odd digit, print `1` if all the odd digits of `n` are equal to each other, and `0` otherwise.",
    "n",
    "1 or 0",
    "Se dă un număr natural `n` care are cel puțin o cifră impară. Afișați `1` dacă toate cifrele impare ale lui `n` sunt egale între ele și `0` în caz contrar.",
    "n",
    "1 sau 0",
    [("7727470", "1"), ("7921470", "0")],
    "- 10 ≤ n ≤ 1 000 000 000",
    "- 10 ≤ n ≤ 1 000 000 000",
)
_spec(
    match={"title_en": "B_Equal"},
    title={"en": "Equal Odd Digits", "ro": "Cifre impare egale"},
    statement={
        "en": _en.replace("{TITLE_EN}", "Equal Odd Digits"),
        "ro": _ro.replace("{TITLE_RO}", "Cifre impare egale"),
    },
    solution="""import sys

def main():
    n = sys.stdin.readline().strip()
    odds = {c for c in n if c in "13579"}
    print(1 if len(odds) == 1 else 0)

main()
""",
    inputs=[
        "7727470\n",
        "7921470\n",
        "7240\n",
        "13579\n",
        "1111111111\n",
        "1000000000\n",
        "2468013579\n",
        "9071371\n",
        "13531\n",
    ],
    wrong_solution="import sys\nprint(1)\n",
)

# 1006 impare-bac — every odd digit steps down to the largest smaller even digit
_en, _ro = _stmt(
    "Given a natural number `n`, replace every odd digit with the largest even digit strictly smaller than it (`1`→`0`, `3`→`2`, `5`→`4`, `7`→`6`, `9`→`8`) and print the resulting value (leading zeros vanish — the result is printed as a number).",
    "n",
    "the transformed number",
    "Se dă un număr natural `n`. Înlocuiți fiecare cifră impară cu cea mai mare cifră pară strict mai mică decât ea (`1`→`0`, `3`→`2`, `5`→`4`, `7`→`6`, `9`→`8`) și afișați valoarea obținută (zerourile de la început dispar — rezultatul se afișează ca număr).",
    "n",
    "numărul obținut",
    [("235690", "224680"), ("15690", "4680")],
    "- 1 ≤ n ≤ 1 000 000 000",
    "- 1 ≤ n ≤ 1 000 000 000",
)
_spec(
    match={"title_en": "Impare_Bac"},
    title={"en": "Odd Digits Step Down", "ro": "Cifre impare în minus"},
    statement={
        "en": _en.replace("{TITLE_EN}", "Odd Digits Step Down"),
        "ro": _ro.replace("{TITLE_RO}", "Cifre impare în minus"),
    },
    solution="""import sys

def main():
    n = sys.stdin.readline().strip()
    out = []
    for c in n:
        if c in "13579":
            out.append(str(int(c) - 1))
        else:
            out.append(c)
    print(int("".join(out)))

main()
""",
    inputs=[
        "235690\n",
        "15690\n",
        "999999999\n",
        "1000000000\n",
        "13579\n",
        "2468\n",
        "111111111\n",
        "97531\n",
        "5050505\n",
    ],
)

# 1009 eliminarecifre — remove every occurrence of a digit
_en, _ro = _stmt(
    "Given a natural number `n` and a digit `c`, print the number obtained by deleting every occurrence of the digit `c` from `n`. If nothing remains, or only zeros remain, print `0`.",
    "n c",
    "the trimmed number",
    "Se dau un număr natural `n` și o cifră `c`. Afișați numărul obținut prin eliminarea tuturor aparițiilor cifrei `c` din `n`. Dacă nu rămâne nicio cifră sau rămân doar zerouri, afișați `0`.",
    "n c",
    "numărul obținut",
    [("2524722 2", "547")],
    "- n has at most 9 digits; 0 ≤ c ≤ 9",
    "- n are cel mult 9 cifre; 0 ≤ c ≤ 9",
)
_spec(
    match={"title_en": "Remove Digits"},
    title={"en": "Remove a Digit", "ro": "Eliminarea unei cifre"},
    statement={
        "en": _en.replace("{TITLE_EN}", "Remove a Digit"),
        "ro": _ro.replace("{TITLE_RO}", "Eliminarea unei cifre"),
    },
    solution="""import sys

def main():
    parts = sys.stdin.readline().split()
    n, c = parts[0], parts[1]
    kept = [d for d in n if d != c]
    if kept:
        print(int("".join(kept)))
    else:
        print(0)

main()
""",
    inputs=[
        "2524722 2\n",
        "100 1\n",
        "77777 7\n",
        "123456789 0\n",
        "1020304 0\n",
        "999999999 9\n",
        "1000000000 1\n",
        "5 3\n",
        "202020 2\n",
    ],
)

# 1043 interval — elements inside the closed interval of the endpoints
_en, _ro = _stmt(
    "An array has `n` natural numbers under 1000. Count how many elements belong to the closed interval determined by the first and the last element of the array.",
    "n\na[0] a[1] ... a[n-1]",
    "the count",
    "Un vector conține `n` numere naturale mai mici decât 1000. Afișați câte elemente aparțin intervalului închis determinat de primul și de ultimul element al vectorului.",
    "n\na[0] a[1] ... a[n-1]",
    "numărul de elemente",
    [("6\n63 273 9 83 93 123", "4")],
    "- 0 < n ≤ 100; elements < 1000",
    "- 0 < n ≤ 100; elemente < 1000",
)
_spec(
    match={"title_en": "Interval"},
    title={"en": "Within the Endpoints", "ro": "Între capete"},
    statement={
        "en": _en.replace("{TITLE_EN}", "Within the Endpoints"),
        "ro": _ro.replace("{TITLE_RO}", "Între capete"),
    },
    solution="""import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    a = list(map(int, data[1:1 + n]))
    lo, hi = min(a[0], a[-1]), max(a[0], a[-1])
    print(sum(1 for v in a if lo <= v <= hi))

main()
""",
    inputs=[
        "6\n63 273 9 83 93 123\n",
        "1\n7\n",
        "5\n5 4 3 2 1\n",
        "3\n999 0 500\n",
        "4\n10 10 10 10\n",
        "7\n3 100 200 50 150 250 3\n",
        "100\n" + " ".join(str(i % 1000) for i in range(100)) + "\n",
    ],
)

# 1046 count — elements at least equal to the arithmetic mean
_en, _ro = _stmt(
    "An array has `n` real numbers smaller than 1000. Count how many elements are greater than or equal to the arithmetic mean of all the elements.",
    "n\na[0] a[1] ... a[n-1]",
    "the count",
    "Un vector conține `n` numere reale mai mici decât 1000. Afișați câte elemente sunt mai mari sau cel puțin egale cu media aritmetică a tuturor elementelor.",
    "n\na[0] a[1] ... a[n-1]",
    "numărul de elemente",
    [("6\n12 7.5 6.5 3 8.5 7.5", "4")],
    "- 0 < n ≤ 100; elements < 1000 (real numbers)",
    "- 0 < n ≤ 100; elemente < 1000 (numere reale)",
)
_spec(
    match={"title_en": "Count"},
    title={"en": "At Least the Average", "ro": "Cel puțin media"},
    statement={
        "en": _en.replace("{TITLE_EN}", "At Least the Average"),
        "ro": _ro.replace("{TITLE_RO}", "Cel puțin media"),
    },
    solution="""import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    a = list(map(float, data[1:1 + n]))
    mean = sum(a) / n
    print(sum(1 for v in a if v >= mean))

main()
""",
    inputs=[
        "6\n12 7.5 6.5 3 8.5 7.5\n",
        "1\n999.999\n",
        "2\n1 2\n",
        "4\n0.1 0.2 0.3 0.4\n",
        "3\n5 5 5\n",
        "5\n2.5 2.5 2.5 2.5 2.5\n",
        "100\n" + " ".join(str(1000 - i) for i in range(100)) + "\n",
    ],
)

# 1091 zerofact — trailing zeros of n!
_en, _ro = _stmt(
    "Given a natural number `n`, print the number of trailing zeros of `n!`.",
    "n",
    "the number of trailing zeros",
    "Se dă un număr natural `n`. Afișați numărul zerourilor de la finalul numărului `n!`.",
    "n",
    "numărul zerourilor de la final",
    [("12", "2")],
    "- 0 < n < 1 000 000 000",
    "- 0 < n < 1 000 000 000",
)
_spec(
    match={"title_en": "ZeroFact"},
    title={"en": "Trailing Zeros of n!", "ro": "Zerourile lui n!"},
    statement={
        "en": _en.replace("{TITLE_EN}", "Trailing Zeros of n!"),
        "ro": _ro.replace("{TITLE_RO}", "Zerourile lui n!"),
    },
    solution="""import sys

def main():
    n = int(sys.stdin.readline())
    count = 0
    p = 5
    while p <= n:
        count += n // p
        p *= 5
    print(count)

main()
""",
    inputs=[
        "12\n",
        "1\n",
        "5\n",
        "25\n",
        "100\n",
        "1000000000\n",
        "999999999\n",
        "124\n",
        "625\n",
        "4\n",
    ],
)

# 1108 shift — circular left shift
_en, _ro = _stmt(
    "Given an array of `n` integers, print it after a circular shift of all elements one position to the left (the first element moves to the end).",
    "n\nx[0] x[1] ... x[n-1]",
    "the shifted array, space separated",
    "Se dă un vector cu `n` numere întregi. Afișați vectorul după o permutare circulară cu o poziție spre stânga a tuturor elementelor (primul element ajunge la final).",
    "n\nx[0] x[1] ... x[n-1]",
    "vectorul permutat, separat prin spații",
    [("6\n12 7 6 3 8 5", "7 6 3 8 5 12")],
    "- 0 < n ≤ 100; |x[i]| < 10^8",
    "- 0 < n ≤ 100; |x[i]| < 10^8",
)
_spec(
    match={"title_en": "Shift"},
    title={"en": "Circular Shift Left", "ro": "Permutare circulară la stânga"},
    statement={
        "en": _en.replace("{TITLE_EN}", "Circular Shift Left"),
        "ro": _ro.replace("{TITLE_RO}", "Permutare circulară la stânga"),
    },
    solution="""import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    x = data[1:1 + n]
    print(" ".join(x[1:] + x[:1]))

main()
""",
    inputs=[
        "6\n12 7 6 3 8 5\n",
        "1\n42\n",
        "2\n-5 5\n",
        "5\n10000000 -10000000 0 1 -1\n",
        "3\n7 7 7\n",
        "99\n" + " ".join(str(i) for i in range(99)) + "\n",
    ],
)

# 1117 vectormaxminsum — min, max and sum
_en, _ro = _stmt(
    "Given an array of `n` integers, print its minimum, its maximum and the sum of its elements, separated by single spaces.",
    "n\nx[0] x[1] ... x[n-1]",
    "min max sum",
    "Se dă un vector cu `n` numere întregi. Afișați minimul, maximul și suma elementelor sale, separate prin câte un spațiu.",
    "n\nx[0] x[1] ... x[n-1]",
    "min max sumă",
    [("6\n12 7 6 3 8 5", "3 12 41")],
    "- 0 < n ≤ 100; |x[i]| < 10^8",
    "- 0 < n ≤ 100; |x[i]| < 10^8",
)
_spec(
    match={"title_en": "VectorMaxMinSum"},
    title={"en": "Min, Max, Sum", "ro": "Minim, maxim, sumă"},
    statement={
        "en": _en.replace("{TITLE_EN}", "Min, Max, Sum"),
        "ro": _ro.replace("{TITLE_RO}", "Minim, maxim, sumă"),
    },
    solution="""import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    x = list(map(int, data[1:1 + n]))
    print(min(x), max(x), sum(x))

main()
""",
    inputs=[
        "6\n12 7 6 3 8 5\n",
        "1\n-8\n",
        "4\n-100000000 100000000 0 0\n",
        "2\n5 5\n",
        "100\n" + " ".join(str((i * 37) % 201 - 100) for i in range(100)) + "\n",
    ],
)

# 1125 crearenumar — the number formed by the even digits
_en, _ro = _stmt(
    "Given `n` digits (each a value 0–9), print the number formed by the even digits in their original order, or `-1` if there is no even digit.",
    "n\na[0] a[1] ... a[n-1]",
    "the number, or -1",
    "Se dau `n` cifre (fiecare o valoare 0–9). Afișați numărul format din cifrele pare, în ordinea inițială, sau `-1` dacă nu există nicio cifră pară.",
    "n\na[0] a[1] ... a[n-1]",
    "numărul, sau -1",
    [("6\n2 3 5 6 4 1", "264")],
    "- 1 ≤ n ≤ 9; 0 ≤ a[i] ≤ 9",
    "- 1 ≤ n ≤ 9; 0 ≤ a[i] ≤ 9",
)
_spec(
    match={"title_en": "CreateNumber"},
    title={"en": "Number from the Even Digits", "ro": "Număr din cifrele pare"},
    statement={
        "en": _en.replace("{TITLE_EN}", "Number from the Even Digits"),
        "ro": _ro.replace("{TITLE_RO}", "Număr din cifrele pare"),
    },
    solution="""import sys

def main():
    data = sys.stdin.read().split()
    digits = data[1:1 + int(data[0])]
    evens = [d for d in digits if d in ("0", "2", "4", "6", "8")]
    if evens:
        print(int("".join(evens)))
    else:
        print(-1)

main()
""",
    inputs=[
        "6\n2 3 5 6 4 1\n",
        "3\n1 3 5\n",
        "1\n0\n",
        "9\n1 2 3 4 5 6 7 8 9\n",
        "5\n9 7 5 3 1\n",
        "2\n8 8\n",
        "4\n0 0 0 1\n",
        "7\n2 2 2 2 2 2 2\n",
    ],
)
