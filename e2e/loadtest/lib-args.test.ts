// Item 138 — unit tests for the load-test CLI parsing. The nightly load gate
// passes its flags space-separated (`--users 30`), the form replay.mjs
// documents; a parser that silently fell back to its defaults on that form
// sent the whole drill to a dead API with the wrong password.

import { describe, expect, it } from 'vitest';
import { parseArgs, positiveInt, readFlag } from './lib-args.mjs';

const DEFAULTS = {
  api: 'http://127.0.0.1:8010',
  users: 30,
  submissions: 5,
  problem: 1,
  password: 'BobPass-2026!x',
  prefix: 'load',
};

describe('loadtest args [item 138]', () => {
  it('reads the space-separated form the nightly and the usage block use', () => {
    expect(
      parseArgs(
        [
          'node',
          'replay.mjs',
          '--api',
          'http://127.0.0.1:8000',
          '--users',
          '30',
          '--submissions',
          '2',
          '--problem',
          '12',
          '--prefix',
          'load',
          '--password',
          'LoadPass-2026!x',
        ],
        DEFAULTS,
      ),
    ).toEqual({
      api: 'http://127.0.0.1:8000',
      users: '30',
      submissions: '2',
      problem: '12',
      password: 'LoadPass-2026!x',
      prefix: 'load',
    });
  });

  it('keeps the --name=value form', () => {
    expect(parseArgs(['replay.mjs', '--users=7', '--problem=3'], DEFAULTS)).toMatchObject({
      users: '7',
      problem: '3',
    });
  });

  it('falls back to the default for an absent flag', () => {
    expect(parseArgs(['replay.mjs'], DEFAULTS)).toEqual(DEFAULTS);
  });

  it('does not swallow the next flag as a value, nor read past end of argv', () => {
    expect(readFlag(['--users', '--problem', '3'], 'users', 30)).toBe(30);
    expect(readFlag(['--problem'], 'problem', 1)).toBe(1);
    expect(readFlag(['--users', '--problem', '3'], 'problem', 1)).toBe('3');
  });

  it('does not confuse a flag with another that shares its prefix', () => {
    // `--users=` must not match a (hypothetical) `--users-extra=` token, and
    // the bare `--users` lookup is an exact-token match.
    expect(readFlag(['--users-extra=9'], 'users', 30)).toBe(30);
    expect(readFlag(['--user=9'], 'users', 30)).toBe(30);
  });

  it('accepts an empty --name=value as the empty string (explicit beats default)', () => {
    expect(readFlag(['--api='], 'api', 'http://127.0.0.1:8010')).toBe('');
  });

  it('positiveInt validates the numeric drill parameters', () => {
    expect(positiveInt('12', 'problem')).toBe(12);
    expect(positiveInt(30, 'users')).toBe(30);
    for (const bad of ['', '0', '-1', '2.5', 'abc']) {
      expect(() => positiveInt(bad, 'problem')).toThrow(/--problem must be a positive integer/);
    }
  });
});
