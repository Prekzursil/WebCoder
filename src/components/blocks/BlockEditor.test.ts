// [judge-fairness wave D] Block generation tests: Blockly runs HEADLESS
// (no DOM needed for workspace XML -> code), so the generation contract
// is tested directly — the exact code a block problem will submit.

import { describe, expect, it, beforeEach } from 'vitest';
import * as Blockly from 'blockly';
import { pythonGenerator } from 'blockly/python';
import { javascriptGenerator } from 'blockly/javascript';
import {
  DEFAULT_STARTER_XML,
  DEFAULT_TOOLBOX_XML,
  localizeToolbox,
} from './BlockEditor';
import { registerBlockTypes, WC_JS_PREAMBLE, _resetRegistration } from './wcBlocks';

type Registerable = Parameters<typeof registerBlockTypes>[1];

beforeEach(() => {
  _resetRegistration();
  registerBlockTypes(
    Blockly,
    pythonGenerator as unknown as Registerable,
    javascriptGenerator as unknown as Registerable
  );
});

function pyFromXml(xml: string): string {
  const ws = new Blockly.Workspace();
  Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), ws);
  return pythonGenerator.workspaceToCode(ws);
}

function jsFromXml(xml: string): string {
  const ws = new Blockly.Workspace();
  Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), ws);
  const js = javascriptGenerator.workspaceToCode(ws);
  return js.includes('wcRead') ? `${WC_JS_PREAMBLE}\n${js}` : js;
}

describe('BlockEditor generation (headless Blockly)', () => {
  it('the starter workspace generates judge-runnable Python', () => {
    const code = pyFromXml(DEFAULT_STARTER_XML);
    // reads a number, prints n % 10 — executable as-is on the judge.
    expect(code).toContain('int(input())');
    expect(code).toContain('% 10');
    expect(code).toContain('print(');
  });

  it('the starter workspace generates JS with the stdin preamble', () => {
    const code = jsFromXml(DEFAULT_STARTER_XML);
    expect(code).toContain('readFileSync(0');
    expect(code).toContain('wcReadNumber()');
    // preamble defined exactly once.
    expect(code.split('function wcReadNumber').length - 1).toBe(1);
  });

  it('a text-line program maps input()/wcReadLine', () => {
    const xml = `
<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="text_print" x="20" y="20">
    <value name="TEXT">
      <block type="wc_input_line"></block>
    </value>
  </block>
</xml>`;
    expect(pyFromXml(xml)).toContain('input()');
    expect(jsFromXml(xml)).toContain('wcReadLine()');
  });

  it('the default toolbox contains the site input blocks', () => {
    expect(DEFAULT_TOOLBOX_XML).toContain('wc_input_number');
    expect(DEFAULT_TOOLBOX_XML).toContain('wc_input_line');
  });

  it('localizeToolbox swaps category labels', () => {
    const ro = localizeToolbox(DEFAULT_TOOLBOX_XML, {
      logic: 'Logică',
      loops: 'Bucle',
      math: 'Matematică',
      text: 'Text',
      input: 'Intrare',
      variables: 'Variabile',
    });
    expect(ro).toContain('name="Logică"');
    expect(ro).not.toContain('%(logic)s');
  });
});
