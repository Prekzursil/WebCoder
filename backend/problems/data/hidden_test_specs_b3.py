"""Hidden-test specs, batch 3 (parked pbinfo rows 1160-1308 + SumaPatrate).

Same shape as hidden_test_specs.py; imported and extended there.
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
    def block(task, inp, out, constraints, samples_, heading, labels):
        lines = [
            "# " + heading, "", task, "",
            "## " + labels[0], "", "```", inp.strip("\n"), "```", "",
            "## " + labels[1], "", "```", out.strip("\n"), "```",
        ]
        if constraints:
            lines += ["", "## " + labels[2], "", constraints]
        for s_in, s_out in samples_:
            lines += [
                "", "### " + labels[3], "",
                "**" + labels[0] + ":**", "", "```", s_in.strip("\n"), "```", "",
                "**" + labels[1] + ":**", "", "```", s_out.strip("\n"), "```",
            ]
        return "\n".join(lines) + "\n"

    en = block(en_task, en_in, en_out, constraints_en, samples, "{TITLE_EN}",
               ("Input", "Output", "Constraints", "Sample"))
    ro = block(ro_task, ro_in, ro_out, constraints_ro, samples, "{TITLE_RO}",
               ("Intrare", "Ieșire", "Restricții", "Exemplu"))
    return en, ro


# DeleteElements (1160 stergeelemente) — remove the slice v[i..j], 1-indexed
_en, _ro = _stmt(
    "An array holds `n` integers. Given positions `i` and `j` with `1 <= i <= j <= n`, remove the elements at positions `i` through `j` (1-indexed) and print the remaining array, separated by spaces.",
    "n\nv[1] v[2] ... v[n]\ni j", "the remaining array",
    "Un vector conține `n` numere întregi. Se dau pozițiile `i` și `j`, `1 <= i <= j <= n`. Eliminați elementele de pe pozițiile `i` până la `j` (numerotare de la 1) și afișați vectorul rămas, separat prin spații.",
    "n\nv[1] v[2] ... v[n]\ni j", "vectorul rămas",
    [("6\n12 7 6 3 8 5\n2 4", "12 8 5")],
    "- 0 < n <= 100; -1000 <= v[k] <= 1000", "- 0 < n <= 100; -1000 <= v[k] <= 1000",
)
_spec(
    match={"title_en": "DeleteElements"},
    title={"en": "Erase a Slice", "ro": "Ștergerea unei secvențe"},
    statement={"en": _en.replace("{TITLE_EN}", "Erase a Slice"),
               "ro": _ro.replace("{TITLE_RO}", "Ștergerea unei secvențe")},
    solution="""import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    v = data[1:1 + n]
    i, j = int(data[1 + n]), int(data[2 + n])
    print(" ".join(v[: i - 1] + v[j:]))

main()
""",
    inputs=["6\n12 7 6 3 8 5\n2 4\n", "3\n1 2 3\n1 3\n", "5\n-1 -2 -3 -4 -5\n1 1\n",
            "4\n9 8 7 6\n4 4\n", "10\n0 1000 -1000 5 5 5 5 5 5 5\n3 8\n",
            "2\n1 2\n1 2\n"],
)

# moderate (1253) — n is the product of two consecutive primes
_en, _ro = _stmt(
    "A natural number is called *moderate* when it equals the product of two prime numbers that are consecutive in the prime sequence (2, 3, 5, 7, 11, 13, 17, ...). Given `n`, print `1` if it is moderate and `0` otherwise.",
    "n", "1 or 0",
    "Un număr natural se numește *moderat* dacă este egal cu produsul a două numere prime consecutive în șirul numerelor prime (2, 3, 5, 7, 11, 13, 17, ...). Se dă `n`. Afișați `1` dacă numărul este moderat și `0` în caz contrar.",
    "n", "1 sau 0",
    [("35", "1"), ("18", "0"), ("55", "0"), ("4", "0")],
    "- 1 <= n <= 1 000 000 000", "- 1 <= n <= 1 000 000 000",
)
_spec(
    match={"title_en": "moderate"},
    title={"en": "Moderate Numbers", "ro": "Numere moderate"},
    statement={"en": _en.replace("{TITLE_EN}", "Moderate Numbers"),
               "ro": _ro.replace("{TITLE_RO}", "Numere moderate")},
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

def next_prime(p):
    q = p + 1
    while not is_prime(q):
        q += 1
    return q

def main():
    n = int(sys.stdin.readline())
    p = 2
    while p * p <= n:
        if n % p == 0:
            q = n // p
            print(1 if q != p and is_prime(q) and next_prime(p) == q else 0)
            return
        p += 1
    print(0)

main()
""",
    inputs=["35\n", "18\n", "55\n", "4\n", "6\n", "15\n", "999999937\n",
            "1000000000\n", "323\n", "2\n"],
    wrong_solution="import sys\n\ndef is_prime(v):\n    return v >= 2 and all(v % d for d in range(2, int(v ** 0.5) + 1))\n\nn = int(sys.stdin.readline())\np = 2\nwhile p * p <= n:\n    if n % p == 0:\n        q = n // p\n        print(1 if is_prime(q) else 0)\n        break\n    p += 1\nelse:\n    print(0)\n",
)

# Snowflakes (1254 fulgidenea) — nine crystals, all four types present
_en, _ro = _stmt(
    "A snowflake cluster is a natural number with exactly nine digits, each digit one of `1`, `2`, `3`, `4`, and every one of the four types appears at least once. Given `n`, print `1` if it encodes a snowflake cluster and `0` otherwise.",
    "n", "1 or 0",
    "O aglomerare de fulgi de nea este un număr natural cu exact nouă cifre, fiecare cifră fiind una dintre `1`, `2`, `3`, `4`, și fiecare dintre cele patru tipuri apare cel puțin o dată. Se dă `n`. Afișați `1` dacă reprezintă o aglomerare de fulgi și `0` în caz contrar.",
    "n", "1 sau 0",
    [("112243413", "1"), ("12314", "0"), ("112253513", "0"), ("112243457", "0"), ("111122223", "0")],
    "- 0 <= n < 1 000 000 000", "- 0 <= n < 1 000 000 000",
)
_spec(
    match={"title_en": "Snowflakes"},
    title={"en": "Snowflake Clusters", "ro": "Fulgi de nea"},
    statement={"en": _en.replace("{TITLE_EN}", "Snowflake Clusters"),
               "ro": _ro.replace("{TITLE_RO}", "Fulgi de nea")},
    solution="""import sys

def main():
    n = sys.stdin.readline().strip()
    digits = set(n)
    if len(n) == 9 and digits == {"1", "2", "3", "4"}:
        print(1)
    else:
        print(0)

main()
""",
    inputs=["112243413\n", "12314\n", "112253513\n", "112243457\n", "111122223\n",
            "123412341\n", "999999999\n", "123456789\n", "444444444\n", "111112222\n"],
    wrong_solution="import sys\nn = sys.stdin.readline().strip()\nprint(1 if set(n) <= {'1', '2', '3', '4'} else 0)\n",
)

# Consecutive (1279) — smallest f with (f-1)*f < n <= f*(f+1)
_en, _ro = _stmt(
    "Given a natural number `n`, print the natural number `f` such that `(f-1)·f < n <= f·(f+1)`.",
    "n", "f",
    "Se dă un număr natural `n`. Afișați numărul natural `f` cu proprietatea că `(f-1)·f < n <= f·(f+1)`.",
    "n", "f",
    [("19", "4")],
    "- 1 <= n <= 10 000", "- 1 <= n <= 10 000",
)
_spec(
    match={"title_en": "Consecutive"},
    title={"en": "Consecutive Product Bounds", "ro": "Produse consecutive"},
    statement={"en": _en.replace("{TITLE_EN}", "Consecutive Product Bounds"),
               "ro": _ro.replace("{TITLE_RO}", "Produse consecutive")},
    solution="""import sys

def main():
    n = int(sys.stdin.readline())
    f = 1
    while f * (f + 1) < n:
        f += 1
    print(f)

main()
""",
    inputs=["19\n", "1\n", "2\n", "12\n", "10000\n", "9999\n", "30\n", "42\n", "7\n", "6\n"],
)

# Plus1 (1286) — replace every "25" with "26"
_en, _ro = _stmt(
    "Given a natural number `n`, replace every (non-overlapping, left to right) occurrence of the digit sequence `25` with `26` and print the resulting number.",
    "n", "the transformed number",
    "Se dă un număr natural `n`. Înlocuiți fiecare apariție (fără suprapunere, de la stânga la dreapta) a secvenței de cifre `25` cu `26` și afișați numărul obținut.",
    "n", "numărul obținut",
    [("202535250", "202635260")],
    "- 10 <= n < 1 000 000 000", "- 10 <= n < 1 000 000 000",
)
_spec(
    match={"title_en": "Plus1"},
    title={"en": "Replace 25 with 26", "ro": "Înlocuirea lui 25 cu 26"},
    statement={"en": _en.replace("{TITLE_EN}", "Replace 25 with 26"),
               "ro": _ro.replace("{TITLE_RO}", "Înlocuirea lui 25 cu 26")},
    solution="""import sys

def main():
    n = sys.stdin.readline().strip()
    print(int(n.replace("25", "26")))

main()
""",
    inputs=["202535250\n", "25\n", "2552\n", "252525\n", "999999999\n",
            "12505\n", "77725777\n", "250000000\n", "121212\n"],
)

# Perfect (1299) — perfect numbers in [a, b], descending
_en, _ro = _stmt(
    "A number is *perfect* when it equals the sum of its proper divisors (e.g. `6 = 1 + 2 + 3`, `28 = 1 + 2 + 4 + 7 + 14`). Given `a <= b`, print every perfect number in `[a, b]` in descending order, separated by spaces. If there are none, print `nu exista`.",
    "a b", "the perfect numbers, or nu exista",
    "Un număr este *perfect* dacă este egal cu suma divizorilor săi proprii (de ex. `6 = 1 + 2 + 3`, `28 = 1 + 2 + 4 + 7 + 14`). Se dau `a <= b`. Afișați toate numerele perfecte din intervalul `[a, b]` în ordine descrescătoare, separate prin spații. Dacă nu există, afișați `nu exista`.",
    "a b", "numerele perfecte, sau nu exista",
    [("5 30", "28 6")],
    "- 1 <= a <= b <= 10 000", "- 1 <= a <= b <= 10 000",
)
_spec(
    match={"title_en": "Perfect"},
    title={"en": "Perfect Numbers in Range", "ro": "Numere perfecte"},
    statement={"en": _en.replace("{TITLE_EN}", "Perfect Numbers in Range"),
               "ro": _ro.replace("{TITLE_RO}", "Numere perfecte")},
    solution="""import sys

def is_perfect(v):
    if v < 2:
        return False
    total = 1
    d = 2
    while d * d <= v:
        if v % d == 0:
            total += d
            if d * d != v:
                total += v // d
        d += 1
    return total == v

def main():
    a, b = map(int, sys.stdin.readline().split())
    hits = [v for v in range(a, b + 1) if is_perfect(v)]
    if hits:
        print(" ".join(map(str, sorted(hits, reverse=True))))
    else:
        print("nu exista")

main()
""",
    inputs=["5 30\n", "1 10000\n", "1 5\n", "496 496\n", "8128 8128\n",
            "29 500\n", "100 10000\n", "6 6\n", "7 27\n"],
)

# SumImpK (1300) — sum of the first k odd elements
_en, _ro = _stmt(
    "Given an array of `n` natural numbers and a number `k`, print the sum of the first `k` odd elements of the array, or `-1` if there are fewer than `k` odd elements.",
    "n\nv[0] v[1] ... v[n-1]\nk", "the sum, or -1",
    "Se dau un vector cu `n` numere naturale și un număr `k`. Afișați suma primelor `k` elemente impare ale vectorului sau `-1` dacă există mai puțin de `k` elemente impare.",
    "n\nv[0] v[1] ... v[n-1]\nk", "suma, sau -1",
    [("8\n2 7 6 8 3 7 5 1\n3", "17")],
    "- 2 < n < 50; 1 < k <= n; elements have at most 4 digits",
    "- 2 < n < 50; 1 < k <= n; elementele au cel mult 4 cifre",
)
_spec(
    match={"title_en": "SumImpK"},
    title={"en": "Sum of the First Odd Elements", "ro": "Suma primelor impare"},
    statement={"en": _en.replace("{TITLE_EN}", "Sum of the First Odd Elements"),
               "ro": _ro.replace("{TITLE_RO}", "Suma primelor impare")},
    solution="""import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    v = list(map(int, data[1:1 + n]))
    k = int(data[1 + n])
    odds = [x for x in v if x % 2 == 1]
    if len(odds) < k:
        print(-1)
    else:
        print(sum(odds[:k]))

main()
""",
    inputs=["8\n2 7 6 8 3 7 5 1\n3\n", "3\n2 4 6\n2\n", "5\n1 3 5 7 9\n5\n",
            "10\n9999 1 2 3 4 5 6 7 8 9\n4\n", "4\n0 0 0 1\n1\n",
            "49\n" + " ".join(str(i % 10) for i in range(49)) + "\n10\n"],
)

# Waves (1303 valuri) — build the wave array
_en, _ro = _stmt(
    "Given `n`, build and print the array with the `2·n` distinct values `1 ... 2n` such that the odd values appear in strictly increasing order, the even values in strictly decreasing order, the first element is odd, and no two adjacent elements share a parity.",
    "n", "the 2·n values, space separated",
    "Se dă `n`. Construiți și afișați vectorul cu cele `2·n` valori distincte `1 ... 2n` astfel încât valorile impare să apară în ordine strict crescătoare, valorile pare în ordine strict descrescătoare, primul element să fie impar și două elemente alăturate să nu aibă aceeași paritate.",
    "n", "cele 2·n valori, separate prin spații",
    [("4", "1 8 3 6 5 4 7 2")],
    "- 2 < n < 50", "- 2 < n < 50",
)
_spec(
    match={"title_en": "Waves"},
    title={"en": "Wave Array", "ro": "Șir în valuri"},
    statement={"en": _en.replace("{TITLE_EN}", "Wave Array"),
               "ro": _ro.replace("{TITLE_RO}", "Șir în valuri")},
    solution="""import sys

def main():
    n = int(sys.stdin.readline())
    out = []
    for i in range(n):
        out.append(str(2 * i + 1))
        out.append(str(2 * (n - i)))
    print(" ".join(out))

main()
""",
    inputs=["4\n", "3\n", "5\n", "49\n", "10\n", "7\n", "20\n", "30\n", "48\n", "11\n"],
    wrong_solution="import sys\nn = int(sys.stdin.readline())\nprint(' '.join(map(str, range(1, 2 * n + 1))))\n",
)

# Move (1305 mutare) — stable partition around the value x
_en, _ro = _stmt(
    "An array of `n` natural numbers contains the value `x` at least once. Rearrange it so every element equal to `x` comes first, followed by all other elements in their original order, and print the result.",
    "n\nv[0] v[1] ... v[n-1]\nx", "the rearranged array",
    "Un vector cu `n` numere naturale conține valoarea `x` cel puțin o dată. Rearanjați vectorul astfel încât toate valorile egale cu `x` să ocupe primele poziții, iar celelalte valori să apară în continuare, în ordinea inițială, și afișați rezultatul.",
    "n\nv[0] v[1] ... v[n-1]\nx", "vectorul rearanjat",
    [("9\n2 1 0 1 7 0 1 4 5\n1", "1 1 1 2 0 7 0 4 5")],
    "- 2 < n < 50; elements have at most 4 digits",
    "- 2 < n < 50; elementele au cel mult 4 cifre",
)
_spec(
    match={"title_en": "Move"},
    title={"en": "Move the Matches Forward", "ro": "Mutarea valorilor"},
    statement={"en": _en.replace("{TITLE_EN}", "Move the Matches Forward"),
               "ro": _ro.replace("{TITLE_RO}", "Mutarea valorilor")},
    solution="""import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    v = data[1:1 + n]
    x = data[1 + n]
    print(" ".join([e for e in v if e == x] + [e for e in v if e != x]))

main()
""",
    inputs=["9\n2 1 0 1 7 0 1 4 5\n1\n", "3\n5 5 5\n5\n", "4\n1 2 3 4\n4\n",
            "5\n7 7 1 7 2\n7\n", "10\n0 9 0 8 0 7 0 6 0 5\n0\n",
            "49\n" + " ".join(str(i % 5) for i in range(49)) + "\n2\n"],
)

# Replacement0 (1308 inlocuire0) — zero everything <= the first element
_en, _ro = _stmt(
    "Given an array of `n` integers, replace every value less than or equal to the first element with `0`, and print the resulting array.",
    "n\nv[0] v[1] ... v[n-1]", "the transformed array",
    "Se dă un vector cu `n` numere întregi. Înlocuiți fiecare valoare mai mică sau egală cu prima valoare din vector cu `0` și afișați vectorul rezultat.",
    "n\nv[0] v[1] ... v[n-1]", "vectorul rezultat",
    [("7\n4 5 0 9 3 4 -2", "0 5 0 9 0 0 0")],
    "- 2 < n < 50; elements have at most 4 digits",
    "- 2 < n < 50; elementele au cel mult 4 cifre",
)
_spec(
    match={"title_en": "Replacement0"},
    title={"en": "Zero the Small Values", "ro": "Înlocuire cu zero"},
    statement={"en": _en.replace("{TITLE_EN}", "Zero the Small Values"),
               "ro": _ro.replace("{TITLE_RO}", "Înlocuire cu zero")},
    solution="""import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    v = list(map(int, data[1:1 + n]))
    first = v[0]
    print(" ".join("0" if x <= first else str(x) for x in v))

main()
""",
    inputs=["7\n4 5 0 9 3 4 -2\n", "3\n1 2 3\n", "4\n-5 -6 -4 -7\n",
            "5\n9 9 9 9 9\n", "10\n0 -1 1 -2 2 -3 3 -4 4 -5\n",
            "49\n" + " ".join(str(((i * 13) % 21) - 10) for i in range(49)) + "\n"],
)

# SumaPătrate (1828) — sum of squares modulo 10 234 573
_en, _ro = _stmt(
    "Given a non-zero natural number `N`, compute `S = 1² + 2² + 3² + ... + N²` modulo `10 234 573`.",
    "N", "S mod 10 234 573",
    "Se dă un număr natural nenul `N`. Calculați `S = 1² + 2² + 3² + ... + N²` modulo `10 234 573`.",
    "N", "S modulo 10 234 573",
    [("4", "30")],
    "- 1 <= N <= 2 000 000 000", "- 1 <= N <= 2 000 000 000",
)
_spec(
    match={"title_en": "SumaPătrate"},
    title={"en": "Sum of Squares", "ro": "SumaPătrate"},
    statement={"en": _en.replace("{TITLE_EN}", "Sum of Squares"),
               "ro": _ro.replace("{TITLE_RO}", "SumaPătrate")},
    solution="""import sys

MOD = 10234573

def main():
    n = int(sys.stdin.readline())
    print(n % MOD * ((n + 1) % MOD) % MOD * ((2 * n + 1) % MOD) % MOD * pow(6, MOD - 2, MOD) % MOD)

main()
""",
    inputs=["4\n", "1\n", "2\n", "10\n", "10234573\n", "2000000000\n",
            "999999999\n", "1000000\n", "123456789\n", "5\n"],
    wrong_solution="import sys\nMOD = 1000000007\nn = int(sys.stdin.readline())\nprint(n % MOD * ((n + 1) % MOD) % MOD * ((2 * n + 1) % MOD) % MOD * pow(6, MOD - 2, MOD) % MOD)\n",
)

# Bookworm (2113, Codeforces 1638) — the imported test suite contradicted
# the statement's own sample (verified out-of-band); regenerated here with
# replace_tests so the bad rows go first.
_en, _ro = _stmt(
    "A multi-volume encyclopedia stands on a shelf, volumes numbered left to right. Volume `i` has sheet thickness `h` (without covers) and every cover is `t` thick. A worm starts at the **first** sheet of volume `i` and gnaws perpendicularly until it reaches the **last** sheet of volume `j`. Print the length of its path in millimeters.",
    "h t i j", "the path length",
    "O enciclopedie în mai multe volume stă pe un raft, volumele numerotate de la stânga la dreapta. Volumul `i` are grosimea filelor `h` (fără coperți), iar fiecare copertă are grosimea `t`. Un vierme pornește de la **prima** filă a volumului `i` și roade perpendicular până ajunge la **ultima** filă a volumului `j`. Afișați lungimea drumului său în milimetri.",
    "h t i j", "lungimea drumului",
    [("10 1 1 2", "2")],
    "- 1 <= h, t <= 100; 1 <= i, j <= 100; i != j",
    "- 1 <= h, t <= 100; 1 <= i, j <= 100; i != j",
)
_spec(
    match={"title_en": "Bookworm"},
    title={"en": "Bookworm", "ro": "Citețul"},
    statement={"en": _en.replace("{TITLE_EN}", "Bookworm"),
               "ro": _ro.replace("{TITLE_RO}", "Citețul")},
    solution="""import sys

def main():
    h, t, i, j = map(int, sys.stdin.readline().split())
    if i > j:
        i, j = j, i
    # from the first sheet of volume i to the last sheet of volume j:
    # the two covers between them, plus the full sheet blocks strictly
    # between (adjacent volumes: just the two covers).
    print((j - i - 1) * h + 2 * t)

main()
""",
    inputs=["10 1 1 2\n", "10 1 2 1\n", "100 100 1 100\n", "3 4 5 6\n",
            "50 2 10 20\n", "1 1 1 3\n", "100 1 50 51\n", "7 9 42 41\n",
            "60 3 1 2\n", "10 10 3 4\n"],
    wrong_solution="import sys\n" + "h, t, i, j = map(int, sys.stdin.readline().split())\n" + "print(abs(j - i) * (h + t))\n",
    replace_tests=True,
)
