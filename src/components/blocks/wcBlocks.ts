// [judge-fairness wave D] The two site-specific Blockly blocks that make
// generated programs judge-compatible: reading a number / a text line.
// Blockly's built-in blocks have no stdin concept, and the judge's
// contract is stdin/stdout — so these map to the canonical snippets in
// both generators (Python: int(input()) / input(); JS: helper calls whose
// preamble BlockEditor prepends when needed).

/** Structural type both real generators satisfy (contravariance-safe:
 * the handlers we install ignore their arguments entirely). */
interface MinimalGenerator {
  forBlock: Record<string, unknown>;
}

/** ORDER_ATOMIC in every Blockly generator (value-block precedence). */
const ORDER_ATOMIC = 0;

interface MinimalBlockly {
  defineBlocksWithJsonArray: (defs: unknown[]) => void;
}

let registered = false;

/** Judge-compatible stdin reads in generated Python. */
export const WC_PY_NUMBER = 'int(input())';
export const WC_PY_LINE = 'input()';
/** JS counterparts (preamble in BlockEditor defines the helpers). */
export const WC_JS_NUMBER = 'wcReadNumber()';
export const WC_JS_LINE = 'wcReadLine()';

/** Emitted once at the top of generated JS programs (stdin reader). */
export const WC_JS_PREAMBLE = `const wcLines = require('fs').readFileSync(0, 'utf8').split('\\n');
let wcIdx = 0;
function wcReadLine() { return wcLines[wcIdx++] ?? ''; }
function wcReadNumber() { return Number(wcReadLine()); }
`;

/** Register the wc_* block types and their generators (idempotent). */
export function registerBlockTypes(
  Blockly: MinimalBlockly,
  pythonGen: MinimalGenerator,
  jsGen: MinimalGenerator,
) {
  if (registered) return;
  registered = true;

  Blockly.defineBlocksWithJsonArray([
    {
      type: 'wc_input_number',
      message0: '%{BKY_WC_INPUT_NUMBER}',
      output: 'Number',
      colour: '%{BKY_TEXTS_HUE}',
      tooltip: '%{BKY_WC_INPUT_NUMBER_TIP}',
    },
    {
      type: 'wc_input_line',
      message0: '%{BKY_WC_INPUT_LINE}',
      output: 'String',
      colour: '%{BKY_TEXTS_HUE}',
      tooltip: '%{BKY_WC_INPUT_LINE_TIP}',
    },
  ]);

  // Value blocks (they have an output) must return [code, precedence].
  pythonGen.forBlock['wc_input_number'] = () => [WC_PY_NUMBER, ORDER_ATOMIC];
  pythonGen.forBlock['wc_input_line'] = () => [WC_PY_LINE, ORDER_ATOMIC];
  jsGen.forBlock['wc_input_number'] = () => [WC_JS_NUMBER, ORDER_ATOMIC];
  jsGen.forBlock['wc_input_line'] = () => [WC_JS_LINE, ORDER_ATOMIC];
}

/** Reset module state (tests re-import with fresh generators). */
export function _resetRegistration() {
  registered = false;
}
