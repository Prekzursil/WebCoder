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
    # ---- Gimnaziu (grades 5-8) — EDU-10 / Wave D --------------------------
    # Trunchi comun under the 2017 framework (OMEN 3393/2017): an
    # under-served segment pbinfo's graded tree doesn't categorize. The
    # chapters are deliberately conservative (first-contact programming),
    # versioned like the liceu tree so programme edits are data changes.
    {
        "slug": "g5", "kind": "GRADE", "order": 5,
        "en": "Grade 5", "ro": "Clasa a V-a",
        "children": [
            {"slug": "g5-first-steps", "kind": "CHAPTER", "order": 1,
             "en": "First steps (read & print)", "ro": "Primii pași (citire și afișare)"},
            {"slug": "g5-arithmetic", "kind": "CHAPTER", "order": 2,
             "en": "Arithmetic", "ro": "Aritmetică"},
        ],
    },
    {
        "slug": "g6", "kind": "GRADE", "order": 6,
        "en": "Grade 6", "ro": "Clasa a VI-a",
        "children": [
            {"slug": "g6-conditionals", "kind": "CHAPTER", "order": 1,
             "en": "Conditionals", "ro": "Structuri condiționale"},
            {"slug": "g6-loops", "kind": "CHAPTER", "order": 2,
             "en": "Loops", "ro": "Structuri repetitive"},
        ],
    },
    {
        "slug": "g7", "kind": "GRADE", "order": 7,
        "en": "Grade 7", "ro": "Clasa a VII-a",
        "children": [
            {"slug": "g7-sequences", "kind": "CHAPTER", "order": 1,
             "en": "Number sequences", "ro": "Secvențe de numere"},
            {"slug": "g7-divisibility", "kind": "CHAPTER", "order": 2,
             "en": "Divisibility", "ro": "Divizibilitate"},
        ],
    },
    {
        "slug": "g8", "kind": "GRADE", "order": 8,
        "en": "Grade 8", "ro": "Clasa a VIII-a",
        "children": [
            {"slug": "g8-arrays", "kind": "CHAPTER", "order": 1,
             "en": "Arrays", "ro": "Tablouri"},
            {"slug": "g8-pre-olympiad", "kind": "CHAPTER", "order": 2,
             "en": "Pre-olympiad drills", "ro": "Pregătire pentru olimpiadă"},
        ],
    },
    # ---- Liceu (grades 9-12; v1 shipped grades 9-10) ----------------------
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
    # ---- Gimnaziu beginner ladder (EDU-10 / Wave D) — VERY_EASY ----------
    {
        "slug": "hello-judge",
        "title_en": "Hello, Judge!", "title_ro": "Salut, evaluator!",
        "difficulty": "VERY_EASY", "grade_group": "gimnaziu",
        "tags": ["implementation"], "chapters": ["g5-first-steps"],
        "statement_en": (
            "Print the exact text `Hello, judge!`\n\n"
            "**Input:** none.\n\n**Output:** one line with the text above.\n"
        ),
        "statement_ro": (
            "Afi\u0219eaz\u0103 exact textul `Salut, evaluator!`\n\n"
            "**Input:** nu exist\u0103.\n\n**Output:** o linie cu textul de mai sus.\n"
        ),
        "hints_en": ["No input to read \u2014 just print.", "Mind the comma and the exclamation mark."],
        "hints_ro": ["Nu ai ce citi \u2014 doar afi\u0219eaz\u0103.", "Aten\u021bie la virgul\u0103 \u0219i semnul exclam\u0103rii."],
        "tests": [_t("", "Hello, judge!\n", sample=True), _t("", "Hello, judge!\n")],
    },
    {
        "slug": "greet-friend",
        "title_en": "Greet a Friend", "title_ro": "Salut\u0103 un prieten",
        "difficulty": "VERY_EASY", "grade_group": "gimnaziu",
        "tags": ["implementation", "strings"], "chapters": ["g5-first-steps"],
        "statement_en": (
            "Read a name and greet them.\n\n"
            "**Input:** one line with a name.\n\n"
            "**Output:** `Hello, <name>!` where `<name>` is the given name.\n"
        ),
        "statement_ro": (
            "Cite\u0219te un nume \u0219i saluteaz\u0103-l.\n\n"
            "**Input:** o linie cu un nume.\n\n"
            "**Output:** `Salut, <nume>!`, unde `<nume>` este numele citit.\n"
        ),
        "hints_en": ["Read the whole line as the name.", "f-strings make this one line."],
        "hints_ro": ["Cite\u0219te toat\u0103 linia ca nume.", "f-string-uri rezolv\u0103 totul \u00eentr-o linie."],
        "tests": [_t("Ana\n", "Salut, Ana!\n", sample=True), _t("Mihai\n", "Salut, Mihai!\n")],
    },
    {
        "slug": "rectangle-area",
        "title_en": "Rectangle Area", "title_ro": "Aria dreptunghiului",
        "difficulty": "VERY_EASY", "grade_group": "gimnaziu",
        "tags": ["math"], "chapters": ["g5-arithmetic"],
        "statement_en": (
            "Read the sides of a rectangle and print its area.\n\n"
            "**Input:** one line with two integers $a$ and $b$ ($1 \\le a, b \\le 1000$).\n\n"
            "**Output:** the area $a \\times b$.\n"
        ),
        "statement_ro": (
            "Cite\u0219te laturile unui dreptunghi \u0219i afi\u0219eaz\u0103 aria lui.\n\n"
            "**Input:** o linie cu dou\u0103 numere \u00eentregi $a$ \u0219i $b$ ($1 \\le a, b \\le 1000$).\n\n"
            "**Output:** aria $a \\times b$.\n"
        ),
        "hints_en": ["Area is side times side.", "print(a * b)"],
        "hints_ro": ["Aria este latur\u0103 ori latur\u0103.", "print(a * b)"],
        "tests": [_t("4 5\n", "20\n", sample=True), _t("1 1\n", "1\n"), _t("1000 1000\n", "1000000\n")],
    },
    {
        "slug": "minutes-to-hours",
        "title_en": "Minutes to Hours", "title_ro": "Minute \u00een ore",
        "difficulty": "VERY_EASY", "grade_group": "gimnaziu",
        "tags": ["math"], "chapters": ["g5-arithmetic"],
        "statement_en": (
            "Convert a number of minutes into hours and minutes.\n\n"
            "**Input:** one integer $n$ ($0 \\le n \\le 10000$).\n\n"
            "**Output:** `H M` \u2014 the whole hours and the leftover minutes, separated by a space.\n"
        ),
        "statement_ro": (
            "Transform\u0103 un num\u0103r de minute \u00een ore \u0219i minute.\n\n"
            "**Input:** un num\u0103r \u00eentreg $n$ ($0 \\le n \\le 10000$).\n\n"
            "**Output:** `H M` \u2014 orele \u00eentregi \u0219i minutele r\u0103mase, separate printr-un spa\u021biu.\n"
        ),
        "hints_en": ["Divide and take the remainder.", "In Python: n // 60 and n % 60."],
        "hints_ro": ["\u00cemparte cu c\u00e2tul \u0219i restul.", "\u00cen Python: n // 60 \u0219i n % 60."],
        "tests": [_t("135\n", "2 15\n", sample=True), _t("60\n", "1 0\n"), _t("59\n", "0 59\n")],
    },
    {
        "slug": "bigger-of-two",
        "title_en": "The Bigger of Two", "title_ro": "Mai mare dintre dou\u0103",
        "difficulty": "VERY_EASY", "grade_group": "gimnaziu",
        "tags": ["implementation"], "chapters": ["g6-conditionals"],
        "statement_en": (
            "Read two integers and print the bigger one (either, if equal).\n\n"
            "**Input:** one line with two integers.\n\n**Output:** the bigger value.\n"
        ),
        "statement_ro": (
            "Cite\u0219te dou\u0103 numere \u00eentregi \u0219i afi\u0219eaz\u0103-l pe cel mai mare (oricare, dac\u0103 sunt egale).\n\n"
            "**Input:** o linie cu dou\u0103 numere \u00eentregi.\n\n**Output:** valoarea mai mare.\n"
        ),
        "hints_en": ["An if is enough.", "max(a, b) also works."],
        "hints_ro": ["Un if este suficient.", "max(a, b) merge \u0219i el."],
        "tests": [_t("3 9\n", "9\n", sample=True), _t("9 3\n", "9\n"), _t("7 7\n", "7\n")],
    },
    {
        "slug": "parity-check",
        "title_en": "Even or Odd", "title_ro": "Par sau impar",
        "difficulty": "VERY_EASY", "grade_group": "gimnaziu",
        "tags": ["math", "implementation"], "chapters": ["g6-conditionals"],
        "statement_en": (
            "Say whether a number is even or odd.\n\n"
            "**Input:** one integer $n$.\n\n"
            "**Output:** `even` or `odd` (lowercase).\n"
        ),
        "statement_ro": (
            "Spune dac\u0103 un num\u0103r este par sau impar.\n\n"
            "**Input:** un num\u0103r \u00eentreg $n$.\n\n"
            "**Output:** `par` sau `impar` (cu litere mici).\n"
        ),
        "hints_en": ["Look at the remainder of the division by 2.", "n % 2 == 0 means even."],
        "hints_ro": ["Uit\u0103-te la restul \u00eemp\u0103r\u021birii la 2.", "n % 2 == 0 \u00eenseamn\u0103 par."],
        "tests": [_t("4\n", "par\n", sample=True), _t("7\n", "impar\n"), _t("0\n", "par\n")],
    },
    {
        "slug": "count-to-n",
        "title_en": "Count to N", "title_ro": "Num\u0103r\u0103m p\u00een\u0103 la N",
        "difficulty": "VERY_EASY", "grade_group": "gimnaziu",
        "tags": ["loops"], "chapters": ["g6-loops"],
        "statement_en": (
            "Print every number from 1 to $n$, one per line.\n\n"
            "**Input:** one integer $n$ ($1 \\le n \\le 100$).\n\n"
            "**Output:** the numbers $1, 2, \\dots, n$, each on its own line.\n"
        ),
        "statement_ro": (
            "Afi\u0219eaz\u0103 toate numerele de la 1 la $n$, c\u00e2te unul pe linie.\n\n"
            "**Input:** un num\u0103r \u00eentreg $n$ ($1 \\le n \\le 100$).\n\n"
            "**Output:** numerele $1, 2, \\dots, n$, fiecare pe propria linie.\n"
        ),
        "hints_en": ["A for loop from 1 to n.", "range(1, n + 1) covers exactly that."],
        "hints_ro": ["Un for de la 1 la n.", "range(1, n + 1) acoper\u0103 exact intervalul."],
        "tests": [_t("3\n", "1\n2\n3\n", sample=True), _t("1\n", "1\n")],
    },
    {
        "slug": "sum-sequence",
        "title_en": "Sum of a Sequence", "title_ro": "Suma unei secven\u021be",
        "difficulty": "VERY_EASY", "grade_group": "gimnaziu",
        "tags": ["loops", "arrays"], "chapters": ["g7-sequences"],
        "statement_en": (
            "Read $n$ numbers and print their sum.\n\n"
            "**Input:** first line: $n$ ($1 \\le n \\le 1000$); second line: $n$ integers.\n\n"
            "**Output:** their sum.\n"
        ),
        "statement_ro": (
            "Cite\u0219te $n$ numere \u0219i afi\u0219eaz\u0103 suma lor.\n\n"
            "**Input:** prima linie: $n$ ($1 \\le n \\le 1000$); a doua linie: $n$ numere \u00eentregi.\n\n"
            "**Output:** suma lor.\n"
        ),
        "hints_en": ["Keep a running total in the loop.", "sum(numbers) does it in one step."],
        "hints_ro": ["P\u0103streaz\u0103 o sum\u0103 parcurg\u00e2nd numerele.", "sum(numere) rezolv\u0103 \u00eentr-un pas."],
        "tests": [_t("4\n1 2 3 4\n", "10\n", sample=True), _t("1\n-5\n", "-5\n")],
    },
    {
        "slug": "divisors-of-n",
        "title_en": "The Divisors of N", "title_ro": "Divizorii lui N",
        "difficulty": "VERY_EASY", "grade_group": "gimnaziu",
        "tags": ["loops", "number-theory"], "chapters": ["g7-divisibility"],
        "statement_en": (
            "Print every divisor of $n$ in increasing order.\n\n"
            "**Input:** one integer $n$ ($1 \\le n \\le 1000$).\n\n"
            "**Output:** the divisors, one per line.\n"
        ),
        "statement_ro": (
            "Afi\u0219eaz\u0103 to\u021bi divizorii lui $n$ \u00een ordine cresc\u0103toare.\n\n"
            "**Input:** un num\u0103r \u00eentreg $n$ ($1 \\le n \\le 1000$).\n\n"
            "**Output:** divizorii, c\u00e2te unul pe linie.\n"
        ),
        "hints_en": ["Try every d from 1 to n.", "d divides n exactly when n % d == 0."],
        "hints_ro": ["\u00cencearc\u0103 fiecare d de la 1 la n.", "d divide n exact c\u00e2nd n % d == 0."],
        "tests": [_t("6\n", "1\n2\n3\n6\n", sample=True), _t("1\n", "1\n")],
    },
    {
        "slug": "max-in-array",
        "title_en": "The Biggest Number", "title_ro": "Cel mai mare num\u0103r",
        "difficulty": "VERY_EASY", "grade_group": "gimnaziu",
        "tags": ["arrays"], "chapters": ["g8-arrays"],
        "statement_en": (
            "Find the biggest number in a list.\n\n"
            "**Input:** first line: $n$ ($1 \\le n \\le 1000$); second line: $n$ integers.\n\n"
            "**Output:** the largest of them.\n"
        ),
        "statement_ro": (
            "G\u0103se\u0219te cel mai mare num\u0103r dintr-o list\u0103.\n\n"
            "**Input:** prima linie: $n$ ($1 \\le n \\le 1000$); a doua linie: $n$ numere \u00eentregi.\n\n"
            "**Output:** cel mai mare dintre ele.\n"
        ),
        "hints_en": ["Remember the best value seen so far.", "max(numbers) \u2014 but know how to loop it too."],
        "hints_ro": ["\u021aine minte cea mai bun\u0103 valoare v\u0103zut\u0103.", "max(numere) \u2014 dar \u0219tii s\u0103 parcurgi \u0219i manual."],
        "tests": [_t("5\n3 8 2 9 4\n", "9\n", sample=True), _t("1\n-7\n", "-7\n")],
    },
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
