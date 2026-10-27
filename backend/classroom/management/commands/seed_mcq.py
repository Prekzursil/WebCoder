"""Seed the MCQ bank pilot (EDU-8, round-2 CNT/D.5 slice).

30 bilingual grade-9 items in ONE chapter ("Elementary algorithms") — the
content pilot the roadmap requires before per-class statistics earn their
keep. Idempotent: keyed by (grade, question en), re-running updates rather
than duplicating.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from problems.models import CurriculumNode
from users.models import User

from ...models import MCQItem

#: (question_en, question_ro, [variants_en], [variants_ro], correct)
ITEMS = [
    (
        "What is an algorithm?",
        "Ce este un algoritm?",
        [
            "A finite, well-defined sequence of steps solving a problem",
            "Any program written in C++",
            "A programming language construct",
            "A type of computer memory",
        ],
        [
            "Un șir finit și bine definit de pași care rezolvă o problemă",
            "Orice program scris în C++",
            "O construcție a unui limbaj de programare",
            "Un tip de memorie a calculatorului",
        ],
        0,
    ),
    (
        "Which property means each step has a single, unambiguous meaning?",
        "Care proprietate înseamnă că fiecare pas are o singură semnificație?",
        ["Finiteness", "Determinism/clarity", "Generality", "Efficiency"],
        ["Finitudine", "Determinism/claritate", "Generalitate", "Eficiență"],
        1,
    ),
    (
        "Which of these is NOT a characteristic of an algorithm?",
        "Care NU este o caracteristică a unui algoritm?",
        ["Finiteness", "Effectiveness", "Ambiguity", "Input"],
        ["Finitudine", "Efectivitate", "Ambiguitate", "Date de intrare"],
        2,
    ),
    (
        "A variable in a program stores…",
        "O variabilă într-un program stochează…",
        [
            "The program's source code",
            "A value that can change during execution",
            "Only constant numbers",
            "The name of the compiler",
        ],
        [
            "Codul sursă al programului",
            "O valoare care poate să se schimbe în timpul execuției",
            "Doar numere constante",
            "Numele compilatorului",
        ],
        1,
    ),
    (
        "Which data type holds whole numbers in most languages?",
        "Ce tip de date reține numere întregi în majoritatea limbajelor?",
        ["float", "int", "char", "bool"],
        ["float", "int", "char", "bool"],
        1,
    ),
    (
        "What does the modulo operator (a % b) compute?",
        "Ce calculează operatorul modulo (a % b)?",
        [
            "The quotient of a divided by b",
            "The remainder of a divided by b",
            "The power a to the b",
            "The average of a and b",
        ],
        [
            "Câtul împărțirii lui a la b",
            "Restul împărțirii lui a la b",
            "Ridicarea lui a la puterea b",
            "Media dintre a și b",
        ],
        1,
    ),
    (
        "7 % 3 equals…",
        "7 % 3 este egal cu…",
        ["2", "2.33", "1", "3"],
        ["2", "2,33", "1", "3"],
        0,
    ),
    (
        "How many times does `for i in range(3)` run its body?",
        "De câte ori rulează corpul `for i in range(3)`?",
        ["2", "3", "4", "Infinite"],
        ["2", "3", "4", "La infinit"],
        1,
    ),
    (
        "The `while` loop repeats as long as…",
        "Buclă `while` se repetă atât timp cât…",
        [
            "Its condition is true",
            "Its condition is false",
            "The program runs",
            "A counter is positive",
        ],
        [
            "Condiția sa este adevărată",
            "Condiția sa este falsă",
            "Programul rulează",
            "Un contor este pozitiv",
        ],
        0,
    ),
    (
        "An infinite loop is caused by…",
        "O buclă infinită este cauzată de…",
        [
            "A condition that never becomes false",
            "Using too many variables",
            "Missing comments",
            "Integer division",
        ],
        [
            "O condiție care nu devine niciodată falsă",
            "Folosirea a prea multe variabile",
            "Lipsa comentariilor",
            "Împărțirea întreagă",
        ],
        0,
    ),
    (
        "What is the value of x after `x = 5; x = x * 2 + 1;`?",
        "Cât este x după `x = 5; x = x * 2 + 1;`?",
        ["10", "11", "16", "12"],
        ["10", "11", "16", "12"],
        1,
    ),
    (
        "`if (a > b)` executes its body when…",
        "`if (a > b)` execută corpul când…",
        ["a is greater than b", "a equals b", "b is greater", "always"],
        [
            "a este mai mare decât b",
            "a este egal cu b",
            "b este mai mare",
            "întotdeauna",
        ],
        0,
    ),
    (
        "The `else` branch runs when…",
        "Ramura `else` se execută când…",
        [
            "The if condition is false",
            "The if condition is true",
            "The program compiles",
            "A loop finishes",
        ],
        [
            "Condiția if este falsă",
            "Condiția if este adevărată",
            "Programul se compilează",
            "O buclă se termină",
        ],
        0,
    ),
    (
        "Which operator means 'equal to' in a comparison?",
        "Ce operator înseamnă „egal cu” într-o comparație?",
        ["=", "==", "!=", "<="],
        ["=", "==", "!=", "<="],
        1,
    ),
    (
        "Logical AND (&& / and) is true when…",
        "Și logic (&& / and) este adevărat când…",
        [
            "Both operands are true",
            "At least one operand is true",
            "Neither operand is true",
            "The first operand is true",
        ],
        [
            "Ambii operanzi sunt adevărați",
            "Cel puțin un operand este adevărat",
            "Niciun operand nu este adevărat",
            "Primul operand este adevărat",
        ],
        0,
    ),
    (
        "Logical OR (|| / or) is true when…",
        "Sau logic (|| / or) este adevărat când…",
        [
            "Both operands are true",
            "At least one operand is true",
            "Neither operand is true",
            "Both operands are equal",
        ],
        [
            "Ambii operanzi sunt adevărați",
            "Cel puțin un operand este adevărat",
            "Niciun operand nu este adevărat",
            "Ambii operanzi sunt egali",
        ],
        1,
    ),
    (
        "The swap of two variables usually needs…",
        "Interschimbarea a două variabile necesită de obicei…",
        [
            "No extra variable",
            "One auxiliary variable",
            "Two auxiliary variables",
            "A loop",
        ],
        [
            "Nicio variabilă suplimentară",
            "O variabilă auxiliară",
            "Două variabile auxiliare",
            "O buclă",
        ],
        1,
    ),
    (
        "Which control structure chooses between two paths?",
        "Ce structură de control alege între două variante?",
        ["Sequence", "Alternative (if/else)", "Loop", "Function call"],
        [
            "Secvențială",
            "Alternativă (if/else)",
            "Repetitivă",
            "Apel de funcție",
        ],
        1,
    ),
    (
        "Reading 100 numbers then printing their sum is a typical use of…",
        "Citirea a 100 de numere și afișarea sumei este un caz tipic pentru…",
        ["A loop", "Only if/else", "A single assignment", "Recursion only"],
        [
            "O structură repetitivă",
            "Doar if/else",
            "O singură atribuire",
            "Doar recursivitate",
        ],
        0,
    ),
    (
        "An array (vector) is used to store…",
        "Un vector (tablou) este folosit pentru a stoca…",
        [
            "A single value",
            "Many values of the same type under one name",
            "Only characters",
            "The program itself",
        ],
        [
            "O singură valoare",
            "Mai multe valori de același tip sub un singur nume",
            "Doar caractere",
            "Programul însuși",
        ],
        1,
    ),
    (
        "v[0] refers to…",
        "v[0] se referă la…",
        [
            "The first element of v",
            "The last element of v",
            "An empty element",
            "The size of v",
        ],
        [
            "Primul element al lui v",
            "Ultimul element al lui v",
            "Un element gol",
            "Dimensiunea lui v",
        ],
        0,
    ),
    (
        "The maximum of a list is found by…",
        "Maximul unei liste se determină…",
        [
            "Comparing each element with the current best",
            "Adding all elements",
            "Sorting only",
            "Counting elements",
        ],
        [
            "Comparând fiecare element cu maximul curent",
            "Adunând toate elementele",
            "Doar sortând",
            "Numărând elementele",
        ],
        0,
    ),
    (
        "Linear (sequential) search examines…",
        "Căutarea liniară examinează…",
        [
            "Every element until a match",
            "Only the middle",
            "Half the list",
            "Sorted pairs",
        ],
        [
            "Fiecare element până la găsirea potrivirii",
            "Doar mijlocul",
            "Jumătate din listă",
            "Perechi sortate",
        ],
        0,
    ),
    (
        "Binary search requires the data to be…",
        "Căutarea binară cere ca datele să fie…",
        ["Sorted", "Unsorted", "Unique", "Numeric only"],
        ["Sortate", "Nesortate", "Unice", "Doar numerice"],
        0,
    ),
    (
        "A trace of an algorithm means…",
        "Execuția pas cu pas (trace) a unui algoritm înseamnă…",
        [
            "Following the values step by step on paper",
            "Compiling it",
            "Deleting variables",
            "Writing pseudocode only",
        ],
        [
            "Urmărirea valorilor pas cu pas pe hârtie",
            "Compilarea lui",
            "Ștergerea variabilelor",
            "Doar scrierea de pseudocod",
        ],
        0,
    ),
    (
        "Pseudocode is…",
        "Pseudocodul este…",
        [
            "A language-independent description of an algorithm",
            "A compiled program",
            "A type of loop",
            "Machine code",
        ],
        [
            "O descriere a algoritmului independentă de limbaj",
            "Un program compilat",
            "Un tip de buclă",
            "Cod mașină",
        ],
        0,
    ),
    (
        "A flowchart represents algorithms using…",
        "Schema logică reprezintă algoritmi folosind…",
        [
            "Boxes and arrows",
            "Only text",
            "Tables of memory",
            "File systems",
        ],
        [
            "Blocuri și săgeți",
            "Doar text",
            "Tabele de memorie",
            "Sisteme de fișiere",
        ],
        0,
    ),
    (
        "Which structure repeats a block a known number of times?",
        "Ce structură repetă un bloc de un număr cunoscut de ori?",
        ["The counted FOR loop", "if/else", "A plain assignment", "A comment"],
        [
            "Bucla FOR cu contor",
            "if/else",
            "O atribuire simplă",
            "Un comentariu",
        ],
        0,
    ),
    (
        "Testing an algorithm with edge values (e.g. 0 or 1 element) checks…",
        "Testarea cu valori limită (ex. 0 sau 1 element) verifică…",
        [
            "Boundary behaviour",
            "Only average cases",
            "Compiler speed",
            "Variable names",
        ],
        [
            "Comportamentul la limite",
            "Doar cazurile medii",
            "Viteza compilatorului",
            "Numele variabilelor",
        ],
        0,
    ),
    (
        "Dividing two integers in C++ with `/` produces…",
        "Împărțirea a două numere întregi în C++ cu `/` produce…",
        [
            "The integer quotient",
            "The exact real quotient",
            "The remainder",
            "A compiler error",
        ],
        [
            "Câtul întreg",
            "Câtul real exact",
            "Restul",
            "O eroare de compilare",
        ],
        0,
    ),
]

GRADE = 9
CHAPTER_SLUG = "g9-elementary-algorithms"


class Command(BaseCommand):
    help = "Seed the EDU-8 MCQ bank pilot (30 bilingual grade-9 items)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--author",
            default="admin",
            help="Username credited as author (default: admin).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        chapter = CurriculumNode.objects.filter(slug=CHAPTER_SLUG).first()
        if chapter is None:
            chapter = CurriculumNode.objects.create(
                kind=CurriculumNode.NodeKind.CHAPTER,
                name_i18n={
                    "en": "Elementary algorithms",
                    "ro": "Algoritmi elementari",
                },
                slug=CHAPTER_SLUG,
                version="v1",
                order=10,
            )
        author = User.objects.filter(username=options["author"]).first()
        created = updated = 0
        for question_en, question_ro, variants_en, variants_ro, correct in ITEMS:
            obj, was_created = MCQItem.objects.update_or_create(
                grade=GRADE,
                question_i18n__en=question_en,
                defaults={
                    "question_i18n": {"en": question_en, "ro": question_ro},
                    "variants_en": variants_en,
                    "variants_ro": variants_ro,
                    "correct_index": correct,
                    "chapter": chapter,
                    "discipline": "Informatics",
                    "author": author,
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"MCQ seed: {created} created, {updated} updated "
                f"(grade {GRADE}, chapter {CHAPTER_SLUG})"
            )
        )
