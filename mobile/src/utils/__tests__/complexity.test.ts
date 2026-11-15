// Complexity hints — mobile port of the web's analyzer; same contract:
// flags nested loops and exit-less `while True`, silent on clean code.
import { analyzeComplexity, hintMessage } from '../complexity';

const t = (_key: string, fallback: string) => fallback;

describe('analyzeComplexity', () => {
  it('returns no hints for flat clean code', () => {
    expect(analyzeComplexity('n = int(input())\nprint(n % 10)')).toEqual([]);
  });

  it('flags nested loops', () => {
    const code = ['for i in range(n):', '    for j in range(n):', '        pass'].join('\n');
    expect(analyzeComplexity(code)).toEqual(['nested-loops']);
  });

  it('flags a while True without an exit', () => {
    const code = ['while True:', '    print(1)'].join('\n');
    expect(analyzeComplexity(code)).toEqual(['no-exit-forever']);
  });

  it('accepts a while True that breaks', () => {
    const code = ['while True:', '    if x:', '        break'].join('\n');
    expect(analyzeComplexity(code)).toEqual([]);
  });

  it('flags both when both traps appear (order stable)', () => {
    const code = ['while True:', '    for i in range(n):', '        print(i)'].join('\n');
    expect(analyzeComplexity(code)).toEqual(['nested-loops', 'no-exit-forever']);
  });

  it('pops the loop stack when indentation dedents past headers', () => {
    // The outer for ends before the inner while: NOT nested.
    const code = ['for i in range(n):', '    print(i)', 'while x > 0:', '    x -= 1'].join('\n');
    expect(analyzeComplexity(code)).toEqual([]);
  });

  it('skips blank lines and empty input', () => {
    expect(analyzeComplexity('')).toEqual([]);
    expect(analyzeComplexity('\n\n  \n')).toEqual([]);
  });
});

describe('hintMessage', () => {
  it('localizes each hint through the caller t', () => {
    expect(hintMessage('nested-loops', t)).toContain('Nested loops');
    expect(hintMessage('no-exit-forever', t)).toContain('never stops');
  });
});
