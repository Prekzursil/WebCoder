// Complexity hints (owner spec, wave D): a light static read of the
// GENERATED program that flags the classic beginner-programming traps —
// nested loops (the O(n²) surprise) and a `while True` with no exit.
//
// Pure string analysis, so it is unit-testable without loading Blockly,
// and honest about what it is: a HINT, never a verdict — the judge still
// measures the real execution time. Works on both generators' output
// because both emit conventionally-indented loops.

export type ComplexityHintKey = 'nested-loops' | 'no-exit-forever';

const LOOP_HEADER = /^\s*(?:for\s|while\s)/;
const FOREVER_HEADER = /^\s*while\s+True\s*:/;
const EXIT_STATEMENT = /\b(?:break|exit\s*\()/;

function indentWidth(line: string): number {
  return line.match(/^ */)?.[0].length ?? 0;
}

/** Analyze generated source; returns the hint keys it triggers. */
export function analyzeComplexity(code: string): ComplexityHintKey[] {
  const hints: ComplexityHintKey[] = [];
  const lines = code.split('\n');
  // Indentation widths of loop headers still enclosing the current line.
  const loopStack: number[] = [];
  let foreverWithoutExit = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const indent = indentWidth(line);
    while (loopStack.length > 0 && indent <= loopStack[loopStack.length - 1]) {
      loopStack.pop();
    }
    if (!LOOP_HEADER.test(line)) continue;
    if (loopStack.length >= 1 && !hints.includes('nested-loops')) {
      hints.push('nested-loops');
    }
    loopStack.push(indent);
    if (FOREVER_HEADER.test(line)) {
      const hasExitInBody = lines.slice(i + 1).some((later) => {
        const laterIndent = indentWidth(later);
        return laterIndent > indent && EXIT_STATEMENT.test(later);
      });
      if (!hasExitInBody) foreverWithoutExit = true;
    }
  }
  if (foreverWithoutExit) hints.push('no-exit-forever');
  return hints;
}

/** The localized message for one hint key (caller passes the t function). */
export function hintMessage(
  key: ComplexityHintKey,
  t: (k: string, fallback: string) => string,
): string {
  if (key === 'nested-loops') {
    return t(
      'blocks_hint_nested_loops',
      'Nested loops: if each loop runs n times, the body runs n² times — for n = 10⁵ that is 10¹⁰ steps and will time out. Is there a single-pass approach?',
    );
  }
  return t(
    'blocks_hint_no_exit',
    'This loop never stops: a “repeat forever” with nothing that exits it will run until the time limit. Add a condition or a stop.',
  );
}
