# Block Programming on WebCoder — Blockly AND Scratch

> Owner directive (2026-10-30): the platform ships **both** block engines —
> Blockly *and* Scratch — not one or the other. Blockly is the structured
> bridge to typed code; Scratch is the familiarity layer (the Scratch cat,
> the stage, say/answer) for the youngest learners. This document is the
> complete guide to both: architecture, judge integration, authoring,
> learning, teaching, testing, security, troubleshooting and worked
> examples. It is written so a new contributor can extend the system
> without reading the code first.

---

## 1. What shipped, in one paragraph

A problem can be a **block problem**. The creator picks a block *engine*
per problem:

- **Blockly** (`block_config.engine: 'blockly'`, the default) — a Blockly
  editor with a WebCoder-curated toolbox (input/control/logic/math/text/
  **lists**/**variables**/**functions**). Learners snap blocks; Blockly's
  official generators produce **real Python 3 or JavaScript (Node 20)**;
  that generated source is submitted and judged through the **normal
  pipeline** — identical limits, identical pipeline, identical verdicts.
- **Scratch** (`block_config.engine: 'scratch'`) — a real Scratch editing
  experience on site: **scratch-vm + scratch-blocks + scratch-render**
  (the same libraries Scratch's own GUI uses), with the Scratch cat, a
  live stage, ask/answer input and say output. Learners edit a project;
  the **project JSON (sb3)** is submitted as the pseudo-language
  `scratch`, and the judge **transpiles it to Python**
  (`backend/problems/scratch_transpiler.py`) and judges that through the
  normal pipeline under **python3's language-fair limits**.

Both engines are on the free playground at **`/blocks`** (engine switcher
at the top). Both localize fully (RO/EN block labels + UI chrome via the
ten-locale i18n catalogs).

---

## 2. Architecture

### 2.1 The two editors (frontend)

```
src/components/blocks/
├── BlockEditor.tsx      Blockly layer (PR #252, extended in this wave)
├── wcBlocks.ts          the two site blocks (read number / read line) +
│                        their Python/JS generator snippets
├── complexity.ts        complexity-hint analyzer (pure, tested)
└── ScratchEditor.tsx    Scratch layer (scratch-vm/blocks/render/storage)
```

**BlockEditor** lazy-imports `blockly` (`next/dynamic`, `ssr: false` —
SSR never loads it), registers the two site blocks, applies the official
RO or EN message pack plus the site-block messages, injects a workspace
with the problem's toolbox (or the default beginner toolbox), previews
the generated code, and **analyzes the generated code for complexity
hints** (§7). Generation goes through Blockly's own `pythonGenerator` /
`javascriptGenerator` — we do not maintain a generator.

**ScratchEditor** lazy-imports the Scratch stack:

- `scratch-vm` — the VM (block representation, threads, green flag);
- `scratch-blocks` — the Scratch block editor (vertical blocks, Scratch
  look-and-feel). Imported via its self-contained dist bundle
  (`scratch-blocks/dist/vertical.js`): the package's `browser` field
  points at a shim built with webpack inline-loader syntax that
  Turbopack cannot resolve — the dist bundle is the same module,
  loader-free (§14 covers upgrade notes);
- `scratch-render` — the WebGL stage;
- `scratch-storage` — asset loading, with the **default assets (the cat
  costume + backdrop) bundled locally** under `public/scratch-assets/`
  so the starter project loads with zero external requests;
- `scratch-l10n` — official RO block labels
  (`scratch-l10n/editor/blocks/ro.json` applied onto `Blockly.Msg`,
  exactly how scratch-gui localizes).

Wiring (same as scratch-gui, minimized):

1. `storage` created; bundled assets pre-registered in
   `storage.builtinHelper` under their md5 ids;
2. `vm.attachStorage(storage)`; `vm.attachRenderer(new ScratchRender(canvas))`
   (renderer init is fault-tolerant: no WebGL ⇒ blank stage, but editing
   and export keep working — grading never needs the renderer);
3. `vm.start()`; `workspace.addChangeListener(vm.blockListener)` — the
   workspace is the editor, the VM holds the truth;
4. `vm.on('workspaceUpdate', ({xml}) => Blockly.Xml.clearWorkspaceAndLoadFromXml(...))`
   — how a loaded project paints its blocks into the workspace;
5. `vm.loadProject(JSON.parse(starter))` then `vm.emitWorkspaceUpdate()`;
6. **export**: `vm.on('PROJECT_CHANGED', () => onProjectChange(vm.toJSON()))`
   — `vm.toJSON()` is scratch-vm's official sb3 serializer;
7. **run**: the green-flag button calls `vm.greenFlag()` (the local
   stage); `say`/`think` blocks also stream into a **console strip**
   under the stage (`vm.runtime.on('SAY')`), mirroring what the judge
   will compare.

**Scratch block media** (block icons) are served from
`public/scratch-blocks-media/` (copied from `node_modules/scratch-blocks/media/`;
re-copy when upgrading scratch-blocks).

### 2.2 The judge integration (backend)

```
problem.block_config                     (JSON column, problems/models.py)
   engine: 'blockly' → generator + toolbox + starter (Blockly XML)
   engine: 'scratch' → scratch_project (sb3 JSON) + scratch_blocks (opcodes)

Submission.language
   registry ids (python3, cpp17, …)  → judged directly
   'scratch' (pseudo-language)       → transpiled then judged as python3
```

**Blockly submissions** carry the *generated source*; `language` is the
generator (`python3` / `nodejs20`). Nothing special exists in the judge
for them — by design.

**Scratch submissions** carry the *sb3 project JSON*; `language` is
`scratch`. Three enforcement points (the same defense-in-depth pattern
as the wave-C library policy and wave-E template integrity):

1. **Submit-time validation** (`submissions/serializers.py`):
   the problem must be `engine: 'scratch'`; the project must parse, use
   only mapped opcodes **and** only the problem's curated allowlist
   (`validate_project`). Violations → HTTP 400 naming the block.
2. **Judge-time re-validation + transpile** (`submissions/tasks.py`):
   the exact submitted bytes are re-validated and transpiled
   (`transpile(submission.code)`); a failure lands as **COMPILE_ERROR**
   with the reason (a client that skipped the API still cannot judge).
3. **Execution**: the transpiled Python is compiled/run under the
   registry's `python3` spec; effective limits resolve through
   `judged_language('scratch') == 'python3'` — i.e. **python3's J5
   multipliers (3× time, 1.5× memory)**, with `Problem.limit_overrides['scratch']`
   still able to override either axis. See
   `submissions/judge_utils/languages.py` (`SCRATCH_LANGUAGE_ID`,
   `SCRATCH_JUDGED_AS`, `judged_language`).

### 2.3 Which judging path shipped and why (decision record)

The owner requirement allowed two Scratch judging paths: headless
scratch-vm execution inside the sandboxed judge, **or** transpiling the
project to Python via a defined mapping, with the choice documented.
**The transpiling path shipped.** Reasons:

1. **Determinism.** scratch-vm is a 30-frames-per-second soft-realtime
   VM designed around a browser stage; its thread scheduling is
   frame-quantized. A judge must measure *CPU time against a limit* —
   frame-stepped execution makes TLE semantics fuzzy and verdicts
   machine-dependent. The transpiler's output is ordinary Python under
   the ordinary, deterministic judge.
2. **Language-fair limits compose.** The whole point of the wave's item A
   is per-language normalization. A transpiled Scratch program *is* a
   CPython program, so it inherits python3's multipliers for free. A
   headless scratch-vm would have needed its own calibration with no
   external judge practice to cite.
3. **Sandbox posture.** The judge-runner container is network-isolated
   with a read-only rootfs; running scratch-vm there would mean baking a
   ~250 MB-unpacked node dependency tree (scratch-vm pulls scratch-render,
   scratch-storage, scratch-audio, …) into the hardened image — a large
   supply-chain and image-size cost for a less deterministic outcome.
   The transpiler is ~600 lines of pure Python inside the existing
   worker.
4. **The learner-visible behavior is preserved.** `ask`/`answer` map to
   stdin lines; `say`/`think` map to stdout lines with Scratch's exact
   number rendering (§5.4). What the learner watched on the stage is
   what the judge compares.

The headless path remains a documented future option: if Scratch problems
ever need stage-dependent semantics (sprite positions, pen, collisions),
a scratch-vm lane in the judge image is the escape hatch — the
submission format (sb3 JSON) would not change.

---

## 3. Authoring guide (creators)

### 3.1 Creating a Blockly problem

1. Create a problem as usual; under **Block programming** check the box.
2. Engine **Blockly**; pick the generator (**Python 3** or **JavaScript**).
3. Optionally paste a **Toolbox XML** — the curated block set. Omit it to
   get the default beginner toolbox (logic, loops, math, text, input,
   **lists**, variables, **functions**). Copy a category subset to
   curate, e.g. a variables+math-only problem:

   ```xml
   <xml xmlns="https://developers.google.com/blockly/xml">
     <category name="Input" colour="%{BKY_TEXTS_HUE}">
       <block type="wc_input_number"></block>
     </category>
     <category name="Math" colour="%{BKY_MATH_HUE}">
       <block type="math_number"></block>
       <block type="math_arithmetic"></block>
       <block type="math_modulo"></block>
     </category>
     <category name="Variables" colour="%{BKY_VARIABLES_HUE}" custom="VARIABLE"></category>
   </xml>
   ```

   Site blocks: `wc_input_number` (read an integer) and `wc_input_line`
   (read a text line) — generated Python `int(input())` / `input()`; JS
   `wcReadNumber()` / `wcReadLine()` with a one-shot stdin-reader
   preamble the editor prepends automatically.
4. Optionally paste **Starter workspace XML** (pre-placed blocks).
5. Set `allowed_languages` to the generator(s) you accept. The generated
   code is judged exactly like typed code — including the language-fair
   limits shown on the problem page.

### 3.2 Creating a Scratch problem

1. Create a problem; check **Block programming**; engine **Scratch**.
2. **Allowed languages**: tick **Scratch (blocks)** (the pseudo-language;
   its effective limits — python3's multipliers — are shown on the
   checkbox like every other language).
3. Optionally paste a **starter Scratch project** (sb3 `project.json`).
   Default: the Scratch cat with `when flag clicked → say "Hello!"`.
   **Declare the variables you want learners to use in the starter** —
   v1 offers the palette's variable blocks for pre-declared variables
   (there is no "make a variable" modal in the curated editor; this is
   the curated-set philosophy, not an oversight — see §9 roadmap).
4. Optionally list **allowed Scratch blocks** (comma-separated opcodes).
   The universe is the judged-mappable set (`KNOWN_OPCODES` in
   `backend/problems/scratch_transpiler.py`):

   | Category | Opcodes |
   |---|---|
   | Events | `event_whenflagclicked` |
   | Control | `control_repeat`, `control_repeat_until`, `control_whileUntil`, `control_forever`, `control_if`, `control_if_else`, `control_stop` |
   | Looks | `looks_say`, `looks_sayforsecs`, `looks_think` |
   | Sensing | `sensing_askandwait`, `sensing_answer` |
   | Operators | `operator_add/subtract/multiply/divide/mod`, `operator_lt/gt/equals`, `operator_and/or/not`, `operator_mathop` (abs/floor/ceiling/sqrt/sin/cos/tan/round) |
   | Variables | `data_variable`, `data_setvariableto`, `data_changevariableby` |

   Leave it empty for the full curated set. `control_wait` (no judged
   semantics) and `operator_random` (nondeterministic) are never offered.

5. **Testcases** are ordinary stdin/stdout pairs: each `ask` consumes one
   input line; each `say`/`think` emits one output line.

### 3.3 Scratch project packaging (how to produce the starter JSON)

The starter is the sb3 **project.json** document (NOT the zipped .sb3).
Ways to produce one:

- **From this site**: open `/blocks`, switch the engine to **Scratch**,
  build the starter (add variables first — they appear in the palette),
  then take the exported JSON from your browser's network tab
  (`POST /api/v1/submissions/submit/` payload when submitting to any
  scratch problem) — or ask an admin to fetch it from the submission.
- **From the Scratch editor** (scratch.mit.edu): build the project,
  File → Save to your computer (`.sb3`), then unzip and use `project.json`.
  Costumes other than the bundled cat/backdrop will load in the learner's
  editor **from the official asset CDN** (needs internet on the learner
  side); the judge itself never fetches assets (blocks only).

Assets referenced by md5 that exist under `public/scratch-assets/` load
locally with no network. The bundled pair:
`bcf454acf82e4504149f7ffe07081dbc.svg` (the cat),
`cd21514d0531fdffb22204e0ec5ed84a.svg` (the default backdrop).

### 3.4 What the creator UI enforces

`block_config` is validated at authoring time (`problems/serializers.py`):
engine ∈ {blockly, scratch}; Blockly keys (`generator`/`toolbox`/`starter`)
vs Scratch keys (`scratch_project`/`scratch_blocks`) must not mix;
`scratch_blocks` entries must be judged-mappable opcodes; sizes are
capped (XML 100 KB, project JSON 500 KB).

---

## 4. Learner guide

- **Blockly**: pick blocks from the categories, connect them, press
  *Show generated code* to see the real Python/JavaScript you built —
  then submit. It is judged like any submission; the problem page shows
  the effective time/memory for your language. Watch the ⚠ hint chips:
  they appear when the generated code has nested loops (an n² surprise)
  or a loop that never stops.
- **Scratch**: drag blocks from the palette (the Scratch cat is your
  sprite). Use `ask and wait` to read input, `say` to print, variables
  and operators to compute. Press the **green flag** to run on the
  stage — `say` lines also appear in the console strip, which is exactly
  what the judge compares. Submit sends your project; it is translated
  to Python behind the curtain and judged with Python's time limits.

Both playgrounds are free at `/blocks` — no submission spent.

---

## 5. The Scratch→Python mapping (precise)

Implemented in `backend/problems/scratch_transpiler.py` (~100% line
coverage in `backend/problems/test_scratch_transpiler.py`, including
executing the generated code). Everything outside the mapping raises a
`TranspileError` naming the opcode — never a silently-wrong translation.

### 5.1 Program shape

- Scripts start at `when green flag clicked` hats. Multiple flag scripts
  run **sequentially in stage order** (top-to-bottom, left-to-right —
  Scratch's own ordering). Documented deviation: Scratch runs them as
  parallel threads; the console problems this layer targets are
  ask→compute→say scripts that are independent by construction.
- `stop all` → `sys.exit(0)`; `stop this script`/`other scripts` → `pass`
  (sequential execution makes them equivalent).
- Variables form one namespace (stage globals + sprite locals merged);
  every declared variable is initialized to `0` (Scratch's default).
  Variable names are sanitized (`1st value` → `v_1st_value`) and kept
  collision-free (`print` → `print_2`).

### 5.2 Statements

| Scratch | Python |
|---|---|
| `set var to X` | `var = X` |
| `change var by X` | `var = _wc_add(var, X)` |
| `ask Q and wait` | `_ = _wc_fmt(Q); _answer = input()` (the question is evaluated but never printed — it is a stage bubble) |
| `say M` / `think M` | `print(_wc_fmt(M))` |
| `say M for N secs` | `print(_wc_fmt(M))` — duration ignored (stage timing), documented |
| `repeat N {…}` | `for _wc_i in range(int(_wc_num(N))):` |
| `repeat until C {…}` | `while not C:` |
| `while C {…}` / `until C {…}` | `while C:` / `while not C:` |
| `forever {…}` | `while True:` (pair with `stop all`) |
| `if C {…}` / `if C {…} else {…}` | `if C:` / `if … else:` |

### 5.3 Expressions

Arithmetic is wrapped in `_wc_num` (Scratch treats non-numeric values as
0 in arithmetic); comparisons use `_wc_lt/_wc_gt/_wc_eq` (numbers compare
numerically, everything else case-insensitively — Scratch's rules);
`and/or/not` map directly; `answer` reads `_answer`.

### 5.4 Semantic deltas compensated in the generated preamble

| Scratch behavior | Helper |
|---|---|
| `1/0 = Infinity`, `0/0 = NaN` | `_wc_div` |
| `x mod 0 = NaN`; `mod` sign follows the divisor | `_wc_mod` |
| `round(2.5) = 3`, `round(-2.5) = -3` (halves away from zero) | `_wc_round` (Python's round is banker's) |
| `sin/cos/tan` in **degrees** | `_wc_sin/_wc_cos/_wc_tan` |
| `sqrt(-1) = NaN` | `_wc_sqrt` |
| `say 3.0` prints `3`; `say true` prints `true` | `_wc_fmt` (also `Infinity`/`NaN` by name) |

---

## 6. Teacher guide

Block problems slot into classes/teme like any problem. Suggested ladder
for the gimnaziu cohort:

1. **Scratch, VERY_EASY**: echo problems — ask/say only (the ask spec's
   `sensing_askandwait` + `sensing_answer`).
2. **Scratch**: sum of two numbers (variables + `operator_add`), last
   digit (`operator_mod`), counting loops (`control_repeat`).
3. **Blockly (Python generator)**: same problems re-solved with blocks
   whose generated code they can *read* — the bridge lesson.
4. **Blockly → typed**: the learner re-submits the same problem in typed
   Python; the generated-code preview makes the mapping visible.

The curated block sets are the pedagogical control: a digit-extraction
problem can allow only math/variables blocks, withholding string/text
blocks exactly like the wave-C `py-no-string-ops` feature ban does for
typed Python.

---

## 7. Complexity hints

`src/components/blocks/complexity.ts` reads the **generated** code and
surfaces advisory chips under the Blockly editor:

- `nested-loops` — a loop directly inside a loop: "if each loop runs n
  times, the body runs n² times — for n = 10⁵ that is 10¹⁰ steps and
  will time out".
- `no-exit-forever` — a `while True` with no `break`/`exit` in its body.

It is indentation-based, works for both generators' output, and is a
**hint, never a verdict** — the judge still measures real time. (Pure
function; unit-tested in `complexity.test.ts`.)

---

## 8. Testing strategy

| Layer | What | Where |
|---|---|---|
| Transpiler | full mapping + semantic helpers, **generated code is executed and its stdout asserted** | `backend/problems/test_scratch_transpiler.py` (93 tests) |
| Submit gate | 400 paths: not a scratch problem, disallowed block, unmapped block, bad JSON | `backend/submissions/test_scratch_judge.py` |
| Judge hook | transpiled code compiled under `python3`; transpile failure ⇒ COMPILE_ERROR; effective limits (python3 multipliers; `scratch` override wins) | `backend/submissions/test_scratch_judge.py` |
| Authoring | `block_config` engine validation, opcode allowlist validation, `effective_limits` scratch row | `backend/submissions/test_scratch_judge.py` |
| Frontend units | toolbox construction/curation, variable extraction, default project, complexity analyzer | `src/components/blocks/*.test.ts` |
| E2E (mock) | playground Scratch tab; scratch problem renders editor; submit POST payload is the project JSON under `language: 'scratch'`; a 400 surfaces its message | `e2e/scratch.spec.ts` (+ Blockly: `e2e/blocks.spec.ts`) |
| E2E (live) | a real Scratch submission judged AC and a planted-WA judged WA — see the wave's live acceptance record | live stack, per-wave |

The i18n parity sweep (`src/i18n.parity.test.ts`) guarantees every new
UI string exists in all ten locales — the engines' RO/EN labels are
first-class, not afterthoughts.

---

## 9. Security notes

- Scratch submissions are **data, not code**, until our own deterministic
  transpiler turns them into Python. No learner-supplied text is ever
   `eval`'d; the transpiler emits a fixed AST-shaped subset (identifiers
  are sanitized and collision-checked against builtins).
- The three-gate defense (submit 400 → judge re-validation → registry
  execution) mirrors waves C/E: a hostile client skipping the API still
  cannot judge a project the API would reject.
- The Scratch editor loads third-party libraries (LLK's, BSD-3/GPL-class
  Scratch licenses — the packages' `TRADEMARK` files govern the Scratch
  name/cat usage: we use them for the educational compatibility the
  trademark policy explicitly permits, and we do not imply endorsement).
  Default assets are bundled locally; a creator-uploaded project's other
  costumes load from the official asset CDN **client-side only**.
- Judge side is unchanged: scratch programs run inside the same
  hardened, network-isolated judge-runner as everything else.

Known v1 limitations (deliberate, documented): no variable-creation modal
(creator pre-declares variables in the starter); no custom blocks
(procedures), lists, or motion/pen semantics in Scratch problems (the
opcode allowlist is the contract — unmapped opcodes are rejected with a
clear message); `say for seconds` ignores its duration.

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Scratch editor shows "failed to load" | The lazy chunk or a bundled asset failed — check the network tab for `/scratch-assets/*.svg` and `/scratch-blocks-media/`; a blank stage alone is fine (no WebGL). |
| Stage blank but blocks work | WebGL unavailable; renderer init is skipped by design (§2.1 step 2). Judging is unaffected. |
| 400 "blocks with no judged mapping" | The project uses an opcode outside §3.2's table (e.g. motion or join) — remove it or extend the transpiler (next section). |
| 400 "uses blocks this problem does not allow" | The opcode is mapped but not in this problem's `scratch_blocks`. |
| COMPILE_ERROR "could not be translated" | The judge's re-validation failed on the exact bytes — same reasons as the 400s (defense in depth). |
| Cat costume missing | Asset md5 not under `public/scratch-assets/` and CDN unreachable; the bundled default never needs the CDN. |
| Blockly "Show generated code" empty | No blocks run at top level — every Blockly program starts from placed blocks. |

---

## 11. Worked examples

### 11.1 Blockly — "Last digit" (generator python3)

Default starter (`variables_set n ← wc_input_number` → `print(math_modulo(n,10))`)
generates:

```python
n = int(input())
print(n % 10)
```

Submitted as `language: python3` — judged normally (testcase `42` → `2`).

### 11.2 Scratch — "Echo"

Problem: `engine: scratch`, allowlist
`event_whenflagclicked, sensing_askandwait, sensing_answer, looks_say`;
testcase input `hello`, expected output `hello`. The learner's project
(one flag script):

```json
{
  "targets": [
    { "isStage": true, "name": "Stage", "variables": {}, "blocks": {},
      "costumes": [{ "name": "backdrop1", "md5ext": "cd21514d0531fdffb22204e0ec5ed84a.svg", "dataFormat": "svg" }] },
    { "isStage": false, "name": "Sprite1", "variables": {}, "blocks": {
        "hat":  { "opcode": "event_whenflagclicked", "next": "ask", "topLevel": true, "fields": {}, "inputs": {}, "x": 60, "y": 60 },
        "ask":  { "opcode": "sensing_askandwait", "next": "say", "parent": "hat",
                  "inputs": { "QUESTION": [1, [10, "line?"] ] }, "fields": {} },
        "say":  { "opcode": "looks_say", "parent": "ask", "next": null,
                  "inputs": { "MESSAGE": [1, "ans"] }, "fields": {} },
        "ans":  { "opcode": "sensing_answer", "fields": {} }
      },
      "costumes": [{ "name": "cat1", "md5ext": "bcf454acf82e4504149f7ffe07081dbc.svg", "dataFormat": "svg" }] }
  ]
}
```

Submitted as `language: scratch`; the judge transpiles (abridged):

```python
_ = _wc_fmt("line?")
_answer = input()
print(_wc_fmt(_answer))
```

Input `hello` → output `hello` → **AC**. (Planted-WA acceptance: a project
that says `"goodbye"` instead → **WA**.)

### 11.3 Scratch — "Sum of two numbers"

Two `ask` blocks, `set total to (answer) + (answer)`, `say total`:

```python
_ = _wc_fmt("a?")
_answer = input()
total = _wc_num(_answer)
_ = _wc_fmt("b?")
_answer = input()
total = (_wc_num(total) + _wc_num(_answer))
print(_wc_fmt(total))
```

`3` + `4` prints `7` — and `say (7/2)` would print `3.5`, while
`say (7/2*2)` prints `7`, matching Scratch's rendering exactly.

---

## 12. Screenshots (described)

1. **The /blocks playground** — engine switcher (Blockly | Scratch) top
   left; Blockly workspace with the beginner toolbox (categories:
   Logic, Loops, Math, Text, Input, Lists, Variables, Functions); the
   generated-Python preview pane below; the "Run on the judge" panel
   with a stdin box.
2. **The playground, Scratch engine** — split view: scratch-blocks
   workspace (Scratch-shaped palette: Events, Control, Looks, Sensing,
   Operators, Variables) on the left; on the right the green-flag/stop
   toolbar, the white 4:3 stage with the orange Scratch cat, and the
   console strip that just printed `Hello!`.
3. **A scratch problem page** — the statement card; the submit card
   titled "Solve with Scratch" with the same split editor; the
   effective-limits line showing `scratch: 3000 ms / 384 MB`
   (python3 multipliers); the verdict panel after judging.
4. **Complexity hints** — a Blockly workspace with two nested repeat
   blocks; under the editor a ⚠ chip: "Nested loops: … n² … will time
   out."
5. **Creator form** — "Block programming (Blockly / Scratch)" checked;
   the engine dropdown offering both; the Scratch arm showing the
   starter-project JSON box and the allowed-blocks opcode box; the
   languages grid with "Scratch (blocks)" ticked showing
   `(3000 ms / 384 MB)`.

---

## 13. Internationalization

- **UI chrome** (`Solve with Scratch`, category names, hints, buttons):
  the site's ten-locale catalogs (`src/locales/*.json`, keys `sbx_*`,
  `blocks_*`, `problem_form_*`); the parity test pins completeness.
- **Blockly block labels**: official Blockly message packs (`blockly/msg/ro`,
  `blockly/msg/en`) + the two site-block messages (`WC_BLOCK_MESSAGES_RO/EN`
  in `BlockEditor.tsx`).
- **Scratch block labels**: official scratch-l10n `editor/blocks/ro.json`
  applied to `Blockly.Msg` (the scratch-gui mechanism); EN is baked into
  scratch-blocks. The category headers localize through the site catalog.

---

## 14. Extending the system

**Add a Blockly category/block**: add the block types to
`DEFAULT_TOOLBOX_XML` (or a problem's toolbox XML) — the official
generators already know the standard blocks. For new *site* blocks,
follow `wcBlocks.ts`: JSON definition + generator snippets for BOTH
Python and JavaScript, register them in `registerBlockTypes`, and test
the generated code contract headlessly (see `BlockEditor.test.ts`).

**Add a Scratch opcode** (e.g. `operator_join`): extend
`STATEMENT_OPCODES`/`REPORTER_OPCODES` + the emitter branch in
`scratch_transpiler.py`, add the opcode to `OPCODE_CATEGORIES` in
`ScratchEditor.tsx` (palette), and cover the mapping with a test that
**executes** the generated code (`test_scratch_transpiler.py` is the
pattern). Keep the contract: opcodes without an honest mapping are
rejected, never approximated.

**Upgrade the Scratch stack**: bump the pinned versions (they are pinned
to the scratch-gui-5.3-compatible set), re-run
`cp -r node_modules/scratch-blocks/media public/scratch-blocks-media/`,
and re-verify the wiring glue (§2.1) — scratch-vm's `blockListener` /
`emitWorkspaceUpdate` / `toJSON` API is the surface we depend on.
