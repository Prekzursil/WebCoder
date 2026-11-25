// [wave E item 32] Algorithm visualizer engines — pure step generators
// so the UI stays dumb and the logic is unit-testable.
//
// Every engine returns a list of frames; the player just walks them.

export interface SortFrame {
  array: number[];
  compared: [number, number] | null;
  swapped: boolean;
  sortedUpTo: number | null;
  note: string;
}

export type SortAlgorithm = 'bubble' | 'insertion' | 'selection';

export function sortFrames(input: number[], algorithm: SortAlgorithm): SortFrame[] {
  const a = [...input];
  const frames: SortFrame[] = [
    { array: [...a], compared: null, swapped: false, sortedUpTo: null, note: 'start' },
  ];
  if (algorithm === 'bubble') {
    for (let end = a.length - 1; end > 0; end -= 1) {
      let swapped = false;
      for (let i = 0; i < end; i += 1) {
        const outOfOrder = a[i] > a[i + 1];
        frames.push({
          array: [...a],
          compared: [i, i + 1],
          swapped: outOfOrder,
          sortedUpTo: end + 1 <= a.length ? end + 1 : null,
          note: `compare ${a[i]} vs ${a[i + 1]}`,
        });
        if (outOfOrder) {
          [a[i], a[i + 1]] = [a[i + 1], a[i]];
          swapped = true;
          frames.push({
            array: [...a],
            compared: [i, i + 1],
            swapped: true,
            sortedUpTo: null,
            note: 'swap',
          });
        }
      }
      frames.push({
        array: [...a],
        compared: null,
        swapped: false,
        sortedUpTo: end,
        note: `position ${end} fixed`,
      });
      if (!swapped) break;
    }
  } else if (algorithm === 'selection') {
    for (let i = 0; i < a.length - 1; i += 1) {
      let min = i;
      for (let j = i + 1; j < a.length; j += 1) {
        frames.push({
          array: [...a],
          compared: [min, j],
          swapped: false,
          sortedUpTo: i,
          note: `min so far: ${a[min]}`,
        });
        if (a[j] < a[min]) min = j;
      }
      if (min !== i) {
        [a[i], a[min]] = [a[min], a[i]];
        frames.push({
          array: [...a],
          compared: [i, min],
          swapped: true,
          sortedUpTo: i + 1,
          note: 'swap min into place',
        });
      }
    }
  } else {
    for (let i = 1; i < a.length; i += 1) {
      const key = a[i];
      let j = i - 1;
      frames.push({
        array: [...a],
        compared: [i, i],
        swapped: false,
        sortedUpTo: i,
        note: `lift ${key}`,
      });
      while (j >= 0 && a[j] > key) {
        a[j + 1] = a[j];
        frames.push({
          array: [...a],
          compared: [j, j + 1],
          swapped: true,
          sortedUpTo: i + 1,
          note: 'shift right',
        });
        j -= 1;
      }
      a[j + 1] = key;
      frames.push({
        array: [...a],
        compared: [j + 1, j + 1],
        swapped: false,
        sortedUpTo: i + 1,
        note: 'drop key',
      });
    }
  }
  frames.push({
    array: [...a],
    compared: null,
    swapped: false,
    sortedUpTo: a.length,
    note: 'sorted',
  });
  return frames;
}

export interface SearchFrame {
  lo: number;
  hi: number;
  mid: number | null;
  array: number[];
  verdict: 'probe' | 'found' | 'absent';
  note: string;
}

export function binarySearchFrames(input: number[], target: number): SearchFrame[] {
  const a = [...input].sort((x, y) => x - y);
  const frames: SearchFrame[] = [];
  let lo = 0;
  let hi = a.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (a[mid] === target) {
      frames.push({ lo, hi, mid, array: a, verdict: 'found', note: `a[${mid}]=${target}` });
      return frames;
    }
    frames.push({
      lo,
      hi,
      mid,
      array: a,
      verdict: 'probe',
      note: `a[${mid}]=${a[mid]} ${a[mid] < target ? '<' : '>'} ${target}`,
    });
    if (a[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  frames.push({ lo, hi, mid: null, array: a, verdict: 'absent', note: 'not present' });
  return frames;
}
