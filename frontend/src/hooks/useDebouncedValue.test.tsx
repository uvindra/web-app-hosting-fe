import { act, type JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('only settles on the last value once it stops changing', () => {
    const seen: string[] = [];
    function Probe({ value }: { value: string }): JSX.Element {
      const debounced = useDebouncedValue(value, 500);
      seen.push(debounced);
      return <span>{debounced}</span>;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe value="h" />));
    for (const v of ['ht', 'htt', 'https://github.com/a/b']) {
      act(() => root.render(<Probe value={v} />));
      act(() => vi.advanceTimersByTime(100));
    }
    expect(seen.at(-1)).toBe('h');
    act(() => vi.advanceTimersByTime(500));
    expect(seen.at(-1)).toBe('https://github.com/a/b');
    expect(new Set(seen)).toEqual(new Set(['h', 'https://github.com/a/b']));
    act(() => root.unmount());
  });
});
