"""Bilingual starter-pack data (competitive roadmap ONB-1 / X4, CNT-1).

A curated pack of ~19 classic practice problems with RO/EN statements,
progressive hints, real test data, tags and curriculum mapping — the seed
corpus that makes a fresh deployment non-empty and doubles as the stable
fixture corpus for e2e (SPEC-GAPS Q13) and the /start onboarding trio.

The pack is intentionally fixture-grade (each problem has 2–4 tests, the
first one a visible sample); the ≥150-problem public-launch bar is the
content workstream tracked as CNT-1, fed by real authoring.
"""

# fmt: off

TAGS = [
    {"slug": "implementation",   "en": "Implementation",    "ro": "Implementare"},
    {"slug": "loops",            "en": "Loops",             "ro": "Structuri repetitive"},
    {"slug": "arrays",           "en": "Arrays",            "ro": "Tablouri"},
    {"slug": "sorting",          "en": "Sorting",           "ro": "Sortare"},
    {"slug": "binary-search",    "en": "Binary search",     "ro": "Căutare binară"},
    {"slug": "strings",          "en": "Strings",           "ro": "Șiruri de caractere"},
    {"slug": "math",             "en": "Math",              "ro": "Matematică"},
    {"slug": "recursion",        "en": "Recursion",         "ro": "Recursivitate"},
    {"slug": "number-theory",    "en": "Number theory",     "ro": "Teoria numerelor"},
]

# Curriculum taxonomy v1 (EDU-9, round-2 slice D.6: grades 9–10 first,
# mirroring the national informatics programme's chapter names).
CURRICULUM = [
    {
        "slug": "g9", "kind": "GRADE", "order": 10,
        "en": "Grade 9", "ro": "Clasa a IX-a",
        "children": [
            {"slug": "g9-elementary", "kind": "CHAPTER", "order": 1,
             "en": "Elementary algorithms", "ro": "Algoritmi elementari"},
            {"slug": "g9-loops", "kind": "CHAPTER", "order": 2,
             "en": "Loops", "ro": "Structuri repetitive"},
            {"slug": "g9-arrays", "kind": "CHAPTER", "order": 3,
             "en": "Arrays", "ro": "Tablouri"},
            {"slug": "g9-sorting", "kind": "CHAPTER", "order": 4,
             "en": "Sorting", "ro": "Sortare"},
            {"slug": "g9-binary-search", "kind": "CHAPTER", "order": 5,
             "en": "Binary search", "ro": "Căutare binară"},
        ],
    },
    {
        "slug": "g10", "kind": "GRADE", "order": 20,
        "en": "Grade 10", "ro": "Clasa a X-a",
        "children": [
            {"slug": "g10-strings", "kind": "CHAPTER", "order": 1,
             "en": "Strings", "ro": "Șiruri de caractere"},
            {"slug": "g10-recursion", "kind": "CHAPTER", "order": 2,
             "en": "Recursion", "ro": "Recursivitate"},
            {"slug": "g10-number-theory", "kind": "CHAPTER", "order": 3,
             "en": "Number theory", "ro": "Teoria numerelor"},
        ],
    },
]


def _t(inp, out, sample=False, points=10):
    return {"input": inp, "expected": out, "sample": sample, "points": points}


PROBLEMS = [
    # ---- Grade 9 · Elementary algorithms --------------------------------
    {
        "slug": "sum-a-b",
        "title_en": "Sum of Two Numbers", "title_ro": "Suma a două numere",
        "difficulty": "EASY",
        "tags": ["implementation", "math"], "chapters": ["g9-elementary"],
        "statement_en": (
            "Read two integers $a$ and $b$ and print their sum.\n\n"
            "**Input:** A single line with two integers $a$ and $b$ "
            "($-10^9 \\le a, b \\le 10^9$), separated by a space.\n\n"
            "**Output:** A single line: the value of $a + b$.\n"
        ),
        "statement_ro": (
            "Citește două numere întregi $a$ și $b$ și afișează suma lor.\n\n"
            "**Input:** O singură linie cu două numere întregi $a$ și $b$ "
            "($-10^9 \\le a, b \\le 10^9$), separate printr-un spațiu.\n\n"
            "**Output:** O singură linie: valoarea lui $a + b$.\n"
        ),
        "hints_en": ["Read both numbers from one line.", "In Python: print(a + b)."],
        "hints_ro": ["Citește ambele numere de pe o linie.", "În Python: print(a + b)."],
        "tests": [_t("3 4\n", "7\n", sample=True), _t("-5 5\n", "0\n"), _t("1000000000 1000000000\n", "2000000000\n")],
    },
    {
        "slug": "max-of-three",
        "title_en": "Maximum of Three Numbers", "title_ro": "Maximul a trei numere",
        "difficulty": "EASY",
        "tags": ["implementation"], "chapters": ["g9-elementary"],
        "statement_en": (
            "Read three integers and print the largest of them.\n\n"
            "**Input:** One line with three integers $a$, $b$, $c$ "
            "($-10^9 \\le a, b, c \\le 10^9$).\n\n"
            "**Output:** The maximum value.\n"
        ),
        "statement_ro": (
            "Citește trei numere întregi și afișează cel mai mare dintre ele.\n\n"
            "**Input:** O linie cu trei numere întregi $a$, $b$, $c$ "
            "($-10^9 \\le a, b, c \\le 10^9$).\n\n"
            "**Output:** Valoarea maximă.\n"
        ),
        "hints_en": ["Use the built-in max() function.", "Or compare each pair with if."],
        "hints_ro": ["Folosește funcția max().", "Sau compară perechi cu if."],
        "tests": [_t("3 7 5\n", "7\n", sample=True), _t("-1 -5 -3\n", "-1\n"), _t("10 10 2\n", "10\n")],
    },
    {
        "slug": "sum-of-digits",
        "title_en": "Sum of Digits", "title_ro": "Suma cifrelor",
        "difficulty": "EASY",
        "tags": ["implementation", "loops"], "chapters": ["g9-elementary"],
        "statement_en": (
            "Read a non-negative integer $n$ and print the sum of its decimal digits.\n\n"
            "**Input:** A single integer $n$ ($0 \\le n \\le 10^{18}$).\n\n"
            "**Output:** The sum of the digits of $n$.\n"
        ),
        "statement_ro": (
            "Citește un număr întreg nenegativ $n$ și afișează suma cifrelor sale zecimale.\n\n"
            "**Input:** Un singur număr întreg $n$ ($0 \\le n \\le 10^{18}$).\n\n"
            "**Output:** Suma cifrelor lui $n$.\n"
        ),
        "hints_en": ["A number is a string of digits — you can iterate it.", "int(digit) converts each character."],
        "hints_ro": ["Un număr e un șir de cifre — poți parcurge caracterele.", "int(cifra) convertește fiecare caracter."],
        "tests": [_t("12345\n", "15\n", sample=True), _t("0\n", "0\n"), _t("999999999999999999\n", "162\n")],
    },
    # ---- Grade 9 · Loops --------------------------------------------------
    {
        "slug": "sum-1-to-n",
        "title_en": "Sum 1..N", "title_ro": "Suma 1..N",
        "difficulty": "EASY",
        "tags": ["loops", "math"], "chapters": ["g9-loops"],
        "statement_en": (
            "Read $n$ and print the sum $1 + 2 + \\dots + n$.\n\n"
            "**Input:** A single integer $n$ ($1 \\le n \\le 10^6$).\n\n"
            "**Output:** The sum of the first $n$ positive integers.\n"
        ),
        "statement_ro": (
            "Citește $n$ și afișează suma $1 + 2 + \\dots + n$.\n\n"
            "**Input:** Un singur număr întreg $n$ ($1 \\le n \\le 10^6$).\n\n"
            "**Output:** Suma primelor $n$ numere naturale nenule.\n"
        ),
        "hints_en": ["A loop from 1 to n works.", "Gauss: n * (n + 1) // 2 — no loop needed."],
        "hints_ro": ["Un ciclu de la 1 la n funcționează.", "Gauss: n * (n + 1) // 2 — fără ciclu."],
        "tests": [_t("5\n", "15\n", sample=True), _t("1\n", "1\n"), _t("1000000\n", "500000500000\n")],
    },
    {
        "slug": "factorial-n",
        "title_en": "Factorial", "title_ro": "Factorial",
        "difficulty": "EASY",
        "tags": ["loops", "math"], "chapters": ["g9-loops"],
        "statement_en": (
            "Read $n$ and print $n!$ (the product $1 \\cdot 2 \\dots n$; by convention $0! = 1$).\n\n"
            "**Input:** A single integer $n$ ($0 \\le n \\le 15$).\n\n"
            "**Output:** The value of $n!$.\n"
        ),
        "statement_ro": (
            "Citește $n$ și afișează $n!$ (produsul $1 \\cdot 2 \\dots n$; prin convenție $0! = 1$).\n\n"
            "**Input:** Un singur număr întreg $n$ ($0 \\le n \\le 15$).\n\n"
            "**Output:** Valoarea lui $n!$.\n"
        ),
        "hints_en": ["Start the product at 1, multiply in a loop.", "Remember the 0! = 1 special case."],
        "hints_ro": ["Pornește produsul de la 1 și multiplică în ciclu.", "Nu uita cazul special 0! = 1."],
        "tests": [_t("5\n", "120\n", sample=True), _t("0\n", "1\n"), _t("10\n", "3628800\n")],
    },
    {
        "slug": "fibonacci-n",
        "title_en": "Fibonacci Number", "title_ro": "Numărul lui Fibonacci",
        "difficulty": "EASY",
        "tags": ["loops", "recursion"], "chapters": ["g9-loops"],
        "statement_en": (
            "The Fibonacci sequence is defined by $F_0 = 0$, $F_1 = 1$ and "
            "$F_n = F_{n-1} + F_{n-2}$. Read $n$ and print $F_n$.\n\n"
            "**Input:** A single integer $n$ ($0 \\le n \\le 30$).\n\n"
            "**Output:** The value of $F_n$.\n"
        ),
        "statement_ro": (
            "Șirul lui Fibonacci este definit prin $F_0 = 0$, $F_1 = 1$ și "
            "$F_n = F_{n-1} + F_{n-2}$. Citește $n$ și afișează $F_n$.\n\n"
            "**Input:** Un singur număr întreg $n$ ($0 \\le n \\le 30$).\n\n"
            "**Output:** Valoarea lui $F_n$.\n"
        ),
        "hints_en": ["Keep the last two values and update them in a loop.", "Naive recursion is too slow for n = 30? It works — but the loop is safer."],
        "hints_ro": ["Păstrează ultimele două valori și actualizează-le în ciclu.", "Recursivitatea naivă e riscantă; ciclul e sigur."],
        "tests": [_t("10\n", "55\n", sample=True), _t("0\n", "0\n"), _t("1\n", "1\n"), _t("30\n", "832040\n")],
    },
    {
        "slug": "count-divisors",
        "title_en": "Count Divisors", "title_ro": "Numărul divizorilor",
        "difficulty": "EASY",
        "tags": ["loops", "number-theory"], "chapters": ["g9-loops"],
        "statement_en": (
            "Read $n$ and print how many positive divisors it has.\n\n"
            "**Input:** A single integer $n$ ($1 \\le n \\le 10^9$).\n\n"
            "**Output:** The number of divisors of $n$.\n"
        ),
        "statement_ro": (
            "Citește $n$ și afișează câți divizori pozitivi are.\n\n"
            "**Input:** Un singur număr întreg $n$ ($1 \\le n \\le 10^9$).\n\n"
            "**Output:** Numărul divizorilor lui $n$.\n"
        ),
        "hints_en": ["Try every candidate d from 1 to n — too slow for 10^9?", "Iterate d up to sqrt(n): each d found gives a pair (d, n/d)."],
        "hints_ro": ["Încearcă fiecare d de la 1 la n — prea lent pentru 10^9?", "Parcurge d până la sqrt(n): fiecare d găsit dă o pereche (d, n/d)."],
        "tests": [_t("12\n", "6\n", sample=True), _t("1\n", "1\n"), _t("997\n", "2\n"), _t("1000000000\n", "100\n")],
    },
    # ---- Grade 9 · Arrays -------------------------------------------------
    {
        "slug": "array-max",
        "title_en": "Maximum in Array", "title_ro": "Maximul unui tablou",
        "difficulty": "EASY",
        "tags": ["arrays"], "chapters": ["g9-arrays"],
        "statement_en": (
            "Read an array of $n$ integers and print its maximum.\n\n"
            "**Input:** The first line contains $n$ ($1 \\le n \\le 10^5$). "
            "The second line contains $n$ integers $a_i$ ($-10^9 \\le a_i \\le 10^9$).\n\n"
            "**Output:** The maximum element.\n"
        ),
        "statement_ro": (
            "Citește un tablou cu $n$ numere întregi și afișează maximul.\n\n"
            "**Input:** Prima linie conține $n$ ($1 \\le n \\le 10^5$). "
            "A doua linie conține $n$ numere întregi $a_i$ ($-10^9 \\le a_i \\le 10^9$).\n\n"
            "**Output:** Elementul maxim.\n"
        ),
        "hints_en": ["Read the second line, split it into ints.", "max() over the list."],
        "hints_ro": ["Citește a doua linie și separă valorile în întregi.", "max() pe listă."],
        "tests": [_t("5\n3 7 1 9 4\n", "9\n", sample=True), _t("1\n-5\n", "-5\n"), _t("3\n-1 -2 -3\n", "-1\n")],
    },
    {
        "slug": "array-sum",
        "title_en": "Sum of Array", "title_ro": "Suma elementelor unui tablou",
        "difficulty": "EASY",
        "tags": ["arrays"], "chapters": ["g9-arrays"],
        "statement_en": (
            "Read an array of $n$ integers and print their sum.\n\n"
            "**Input:** First line: $n$ ($1 \\le n \\le 10^5$). Second line: "
            "$n$ integers $a_i$ ($-10^9 \\le a_i \\le 10^9$).\n\n"
            "**Output:** The sum $a_1 + a_2 + \\dots + a_n$.\n"
        ),
        "statement_ro": (
            "Citește un tablou cu $n$ numere întregi și afișează suma lor.\n\n"
            "**Input:** Prima linie: $n$ ($1 \\le n \\le 10^5$). A doua linie: "
            "$n$ numere întregi $a_i$ ($-10^9 \\le a_i \\le 10^9$).\n\n"
            "**Output:** Suma $a_1 + a_2 + \\dots + a_n$.\n"
        ),
        "hints_en": ["sum() over the parsed list.", "Watch for the 64-bit range of the answer."],
        "hints_ro": ["sum() pe lista parsată.", "Atenție la intervalul de 64 de biți ai răspunsului."],
        "tests": [_t("4\n1 2 3 4\n", "10\n", sample=True), _t("2\n-1000000000 1000000000\n", "0\n"), _t("1\n7\n", "7\n")],
    },
    {
        "slug": "array-reverse",
        "title_en": "Reverse Array", "title_ro": "Afișarea inversă a unui tablou",
        "difficulty": "EASY",
        "tags": ["arrays"], "chapters": ["g9-arrays"],
        "statement_en": (
            "Read an array of $n$ integers and print them in reverse order, "
            "on one line separated by spaces.\n\n"
            "**Input:** First line: $n$ ($1 \\le n \\le 10^5$). Second line: $n$ integers.\n\n"
            "**Output:** The $n$ integers in reverse order, space-separated.\n"
        ),
        "statement_ro": (
            "Citește un tablou cu $n$ numere întregi și afișează-le în ordine inversă, "
            "pe o linie separate prin spații.\n\n"
            "**Input:** Prima linie: $n$ ($1 \\le n \\le 10^5$). A doua linie: $n$ numere întregi.\n\n"
            "**Output:** Cele $n$ numere în ordine inversă, separate prin spații.\n"
        ),
        "hints_en": ["Slicing: values[::-1].", "Print with ' '.join(map(str, ...))."],
        "hints_ro": ["Slicing: values[::-1].", "Afișează cu ' '.join(map(str, ...))."],
        "tests": [_t("4\n1 2 3 4\n", "4 3 2 1\n", sample=True), _t("1\n42\n", "42\n"), _t("3\n-7 0 7\n", "7 0 -7\n")],
    },
    {
        "slug": "count-occurrences",
        "title_en": "Count Occurrences", "title_ro": "Numărarea aparițiilor",
        "difficulty": "EASY",
        "tags": ["arrays"], "chapters": ["g9-arrays"],
        "statement_en": (
            "Read an array and a value $x$; print how many times $x$ appears in the array.\n\n"
            "**Input:** First line: $n$ ($1 \\le n \\le 10^5$). Second line: "
            "$n$ integers. Third line: the value $x$.\n\n"
            "**Output:** The number of occurrences of $x$.\n"
        ),
        "statement_ro": (
            "Citește un tablou și o valoare $x$; afișează de câte ori apare $x$ în tablou.\n\n"
            "**Input:** Prima linie: $n$ ($1 \\le n \\le 10^5$). A doua linie: "
            "$n$ numere întregi. A treia linie: valoarea $x$.\n\n"
            "**Output:** Numărul aparițiilor lui $x$.\n"
        ),
        "hints_en": ["list.count(x) does it in one call.", "A simple loop with a counter works too."],
        "hints_ro": ["list.count(x) rezolvă într-un apel.", "Un ciclu simplu cu un contor funcționează la fel."],
        "tests": [_t("6\n1 2 2 3 2 5\n2\n", "3\n", sample=True), _t("3\n7 8 9\n4\n", "0\n"), _t("1\n5\n5\n", "1\n")],
    },
    # ---- Grade 9 · Sorting ------------------------------------------------
    {
        "slug": "sort-three",
        "title_en": "Sort Three Values", "title_ro": "Sortarea a trei valori",
        "difficulty": "EASY",
        "tags": ["sorting"], "chapters": ["g9-sorting"],
        "statement_en": (
            "Read three integers and print them in ascending order on one line.\n\n"
            "**Input:** One line with three integers.\n\n"
            "**Output:** The three integers in ascending order, space-separated.\n"
        ),
        "statement_ro": (
            "Citește trei numere întregi și afișează-le în ordine crescătoare, pe o linie.\n\n"
            "**Input:** O linie cu trei numere întregi.\n\n"
            "**Output:** Cele trei numere în ordine crescătoare, separate prin spații.\n"
        ),
        "hints_en": ["sorted() returns a new sorted list.", "Print with ' '.join(map(str, ...))."],
        "hints_ro": ["sorted() returnează o listă sortată.", "Afișează cu ' '.join(map(str, ...))."],
        "tests": [_t("3 1 2\n", "1 2 3\n", sample=True), _t("9 9 1\n", "1 9 9\n"), _t("-3 -10 0\n", "-10 -3 0\n")],
    },
    {
        "slug": "array-sort",
        "title_en": "Sort an Array", "title_ro": "Sortarea unui tablou",
        "difficulty": "EASY",
        "tags": ["sorting", "arrays"], "chapters": ["g9-sorting"],
        "statement_en": (
            "Read $n$ integers and print them in ascending order on one line.\n\n"
            "**Input:** First line: $n$ ($1 \\le n \\le 10^5$). Second line: $n$ integers.\n\n"
            "**Output:** The $n$ integers sorted ascending, space-separated.\n"
        ),
        "statement_ro": (
            "Citește $n$ numere întregi și afișează-le în ordine crescătoare, pe o linie.\n\n"
            "**Input:** Prima linie: $n$ ($1 \\le n \\le 10^5$). A doua linie: $n$ numere întregi.\n\n"
            "**Output:** Cele $n$ numere sortate crescător, separate prin spații.\n"
        ),
        "hints_en": ["sorted(values) — do not write bubble sort by hand.", "Print the joined result."],
        "hints_ro": ["sorted(values) — nu scrie bubble sort manual.", "Afișează rezultatul unit cu spații."],
        "tests": [_t("5\n5 3 9 1 3\n", "1 3 3 5 9\n", sample=True), _t("1\n8\n", "8\n"), _t("4\n0 -2 2 -1\n", "-2 -1 0 2\n")],
    },
    # ---- Grade 9 · Binary search ------------------------------------------
    {
        "slug": "binary-search",
        "title_en": "Binary Search Position", "title_ro": "Poziția prin căutare binară",
        "difficulty": "MEDIUM",
        "tags": ["binary-search", "arrays"], "chapters": ["g9-binary-search"],
        "statement_en": (
            "Given a sorted array of $n$ distinct integers and $q$ queries, "
            "print for each query value its 0-based position in the array, "
            "or $-1$ if it is not present.\n\n"
            "**Input:** First line: $n$ ($1 \\le n \\le 10^5$). Second line: "
            "$n$ distinct integers in ascending order. Third line: $q$ "
            "($1 \\le q \\le 10^5$). Fourth line: $q$ query values.\n\n"
            "**Output:** $q$ lines, each the position of the query or $-1$.\n"
        ),
        "statement_ro": (
            "Se dă un tablou sortat cu $n$ numere întregi distincte și $q$ "
            "întrebări; afișează pentru fiecare valoare căutată poziția ei "
            "(indexarea de la 0) sau $-1$ dacă nu există.\n\n"
            "**Input:** Prima linie: $n$ ($1 \\le n \\le 10^5$). A doua linie: "
            "$n$ valori distincte în ordine crescătoare. A treia linie: $q$ "
            "($1 \\le q \\le 10^5$). A patra linie: $q$ valori căutate.\n\n"
            "**Output:** $q$ linii, fiecare cu poziția căutată sau $-1$.\n"
        ),
        "hints_en": [
            "Linear scan is O(n·q) — too slow; the array is sorted.",
            "Keep lo/hi bounds and halve; Python's bisect module implements it.",
        ],
        "hints_ro": [
            "Parcurgerea liniară e O(n·q) — prea lent; tabloul e sortat.",
            "Menține limite lo/hi și înjumătățește; modulul bisect din Python o implementează.",
        ],
        "tests": [
            _t("5\n1 3 5 7 9\n3\n5 9 2\n", "2\n4\n-1\n", sample=True),
            _t("1\n42\n2\n42 41\n", "0\n-1\n"),
            _t("4\n-9 -3 0 8\n4\n-9 8 -3 0\n", "0\n3\n1\n2\n"),
        ],
    },
    # ---- Grade 10 · Strings -----------------------------------------------
    {
        "slug": "vowel-count",
        "title_en": "Vowel Count", "title_ro": "Numărul vocalelor",
        "difficulty": "EASY",
        "tags": ["strings"], "chapters": ["g10-strings"],
        "statement_en": (
            "Read a line of text and print how many vowels "
            "(`a e i o u`, case-insensitive) it contains.\n\n"
            "**Input:** A single line of text (at most 1000 characters).\n\n"
            "**Output:** The number of vowels.\n"
        ),
        "statement_ro": (
            "Citește o linie de text și afișează câte vocale conține "
            "(`a e i o u`, indiferent de majuscule).\n\n"
            "**Input:** O singură linie de text (cel mult 1000 de caractere).\n\n"
            "**Output:** Numărul vocalelor.\n"
        ),
        "hints_en": ["Lowercase the text first.", "sum(1 for c in text if c in 'aeiou')"],
        "hints_ro": ["Transformă textul în minuscule.", "sum(1 for c in text if c in 'aeiou')"],
        "tests": [_t("Hello World\n", "3\n", sample=True), _t("XYZ\n", "0\n"), _t("AEIOU aeiou\n", "10\n")],
    },
    {
        "slug": "palindrome-string",
        "title_en": "Palindrome String", "title_ro": "Palindrom",
        "difficulty": "EASY",
        "tags": ["strings"], "chapters": ["g10-strings"],
        "statement_en": (
            "Read a word and print `DA` if it is a palindrome "
            "(reads the same reversed) or `NU` otherwise. Comparison is "
            "case-sensitive on the exact characters.\n\n"
            "**Input:** A single word (at most 1000 characters).\n\n"
            "**Output:** `DA` or `NU`.\n"
        ),
        "statement_ro": (
            "Citește un cuvânt și afișează `DA` dacă este palindrom "
            "(citit egal în ambele sensuri) sau `NU` altfel. Comparția este "
            "sensibilă la majuscule, pe caracterele exacte.\n\n"
            "**Input:** Un singur cuvânt (cel mult 1000 de caractere).\n\n"
            "**Output:** `DA` sau `NU`.\n"
        ),
        "hints_en": ["s == s[::-1] is the whole check.", "Strip the trailing newline before comparing."],
        "hints_ro": ["s == s[::-1] este toată verificarea.", "Elimină caracterul de final de linie înainte de comparare."],
        "tests": [_t("racecar\n", "DA\n", sample=True), _t("ana\n", "DA\n"), _t("informatica\n", "NU\n")],
    },
    # ---- Grade 10 · Recursion ----------------------------------------------
    {
        "slug": "tower-of-hanoi-moves",
        "title_en": "Tower of Hanoi Move Count", "title_ro": "Numărul de mutări (Turnul din Hanoi)",
        "difficulty": "MEDIUM",
        "tags": ["recursion", "math"], "chapters": ["g10-recursion"],
        "statement_en": (
            "The Tower of Hanoi with $n$ disks needs exactly $2^n - 1$ moves "
            "in the optimal solution. Read $n$ and print the move count.\n\n"
            "**Input:** A single integer $n$ ($1 \\le n \\le 40$).\n\n"
            "**Output:** The number of moves, $2^n - 1$.\n"
        ),
        "statement_ro": (
            "Turnul din Hanoi cu $n$ discuri necesită exact $2^n - 1$ mutări "
            "în soluția optimă. Citește $n$ și afișează numărul de mutări.\n\n"
            "**Input:** Un singur număr întreg $n$ ($1 \\le n \\le 40$).\n\n"
            "**Output:** Numărul de mutări, $2^n - 1$.\n"
        ),
        "hints_en": ["moves(n) = 2 * moves(n-1) + 1.", "Or simply print(2**n - 1)."],
        "hints_ro": ["mutari(n) = 2 * mutari(n-1) + 1.", "Sau pur și simplu print(2**n - 1)."],
        "tests": [_t("3\n", "7\n", sample=True), _t("1\n", "1\n"), _t("40\n", "1099511627775\n")],
    },
    # ---- Grade 10 · Number theory -------------------------------------------
    {
        "slug": "gcd-euclid",
        "title_en": "GCD (Euclid)", "title_ro": "CMMDC (Euclid)",
        "difficulty": "EASY",
        "tags": ["number-theory", "recursion"], "chapters": ["g10-number-theory"],
        "statement_en": (
            "Read two positive integers and print their greatest common divisor.\n\n"
            "**Input:** One line with two integers $a$ and $b$ ($1 \\le a, b \\le 10^9$).\n\n"
            "**Output:** $\\gcd(a, b)$.\n"
        ),
        "statement_ro": (
            "Citește două numere naturale și afișează cel mai mare divizor comun.\n\n"
            "**Input:** O linie cu două numere $a$ și $b$ ($1 \\le a, b \\le 10^9$).\n\n"
            "**Output:** $\\gcd(a, b)$.\n"
        ),
        "hints_en": ["Euclid: gcd(a, b) = gcd(b, a mod b) until b = 0.", "Python has math.gcd."],
        "hints_ro": ["Euclid: gcd(a, b) = gcd(b, a mod b) până la b = 0.", "Python are math.gcd."],
        "tests": [_t("48 36\n", "12\n", sample=True), _t("17 5\n", "1\n"), _t("1000000000 999999999\n", "1\n")],
    },
    {
        "slug": "prime-check",
        "title_en": "Prime Check", "title_ro": "Verificarea numerelor prime",
        "difficulty": "MEDIUM",
        "tags": ["number-theory"], "chapters": ["g10-number-theory"],
        "statement_en": (
            "Read an integer $n$ and print `DA` if it is prime, `NU` otherwise.\n\n"
            "**Input:** A single integer $n$ ($1 \\le n \\le 10^9$).\n\n"
            "**Output:** `DA` if $n$ is prime, else `NU`.\n"
        ),
        "statement_ro": (
            "Citește un număr întreg $n$ și afișează `DA` dacă este prim, `NU` altfel.\n\n"
            "**Input:** Un singur număr întreg $n$ ($1 \\le n \\le 10^9$).\n\n"
            "**Output:** `DA` dacă $n$ e prim, altfel `NU`.\n"
        ),
        "hints_en": [
            "1 is not prime; 2 is the only even prime.",
            "Trial division up to sqrt(n) is fast enough for 10^9.",
        ],
        "hints_ro": [
            "1 nu e prim; 2 este singurul număr prim par.",
            "Împărțirea de probă până la sqrt(n) e suficient de rapidă pentru 10^9.",
        ],
        "tests": [_t("13\n", "DA\n", sample=True), _t("1\n", "NU\n"), _t("1000000007\n", "DA\n"), _t("999999999\n", "NU\n")],
    },
]

# Editorials ship with a few seed problems so the AFTER_AC gate has fixtures.
EDITORIALS = {
    "sum-a-b": {
        "content_en": "Read the two integers and print their sum. Any language does this in one expression.",
        "content_ro": "Citește cele două numere și afișează suma. Orice limbaj rezolvă într-o expresie.",
    },
    "binary-search": {
        "content_en": (
            "Because the array is sorted, keep a window [lo, hi] and halve it per query: "
            "compare the middle element with the target and drop the impossible half. "
            "O(log n) per query."
        ),
        "content_ro": (
            "Fiindcă tabloul este sortat, menține o fereastră [lo, hi] și înjumătățește-o "
            "per interogare: compară elementul din mijloc cu ținta și renunță la jumătatea "
            "imposibilă. O(log n) per interogare."
        ),
    },
    "gcd-euclid": {
        "content_en": "Euclid's algorithm: gcd(a, b) = gcd(b, a mod b); stop at b = 0. O(log min(a, b)).",
        "content_ro": "Algoritmul lui Euclid: gcd(a, b) = gcd(b, a mod b); oprire la b = 0. O(log min(a, b)).",
    },
}

# fmt: on
