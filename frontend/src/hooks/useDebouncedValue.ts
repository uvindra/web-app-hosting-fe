import { useEffect, useState } from 'react';

/** `value`, but only once it has stopped changing for `delayMs` (e.g. to avoid a request per keystroke). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  // A timer is an external system: sync the debounced copy when it fires.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
