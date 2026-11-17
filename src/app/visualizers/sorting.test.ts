import { describe, expect, it } from 'vitest';
import { binarySearchFrames, sortFrames } from './sorting';

// [wave E item 32] The visualizer engines: pure frame generators.

describe('sortFrames', () => {
  it('bubble-sorts to a sorted final frame', () => {
    const frames = sortFrames([3, 1, 2], 'bubble');
    const last = frames[frames.length - 1];
    expect(last.array).toEqual([1, 2, 3]);
    expect(last.note).toBe('sorted');
    expect(last.sortedUpTo).toBe(3);
    // Compare frames carry indices and swap flags.
    const compare = frames.find((f) => f.compared !== null);
    expect(compare).toBeTruthy();
  });

  it('insertion and selection also end sorted', () => {
    for (const algo of ['insertion', 'selection'] as const) {
      const frames = sortFrames([5, 2, 9, 1], algo);
      expect(frames[frames.length - 1].array).toEqual([1, 2, 5, 9]);
    }
  });

  it('already-sorted bubble input short-circuits', () => {
    const frames = sortFrames([1, 2, 3], 'bubble');
    // start + one pass of compares + the fixed marker + final sorted.
    expect(frames.length).toBeLessThan(8);
    expect(frames[frames.length - 1].array).toEqual([1, 2, 3]);
  });
});

describe('binarySearchFrames', () => {
  it('finds a present target with a found verdict', () => {
    const frames = binarySearchFrames([9, 3, 7], 7);
    const last = frames[frames.length - 1];
    expect(last.verdict).toBe('found');
    expect(last.array).toEqual([3, 7, 9]); // sorted copy
    expect(last.array[last.mid as number]).toBe(7);
  });

  it('reports an absent target', () => {
    const frames = binarySearchFrames([1, 3, 5], 4);
    expect(frames[frames.length - 1].verdict).toBe('absent');
  });
});
