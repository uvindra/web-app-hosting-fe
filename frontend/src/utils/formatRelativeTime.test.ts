import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './formatRelativeTime';

describe('formatRelativeTime', () => {
  it('returns "" for an invalid date', () => {
    expect(formatRelativeTime('not-a-date')).toBe('');
  });

  it('returns "Just now" for under a minute', () => {
    expect(formatRelativeTime(new Date(Date.now() - 10_000).toISOString())).toBe('Just now');
  });

  it('formats minutes', () => {
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5 min ago');
  });

  it('formats hours, pluralizing above 1', () => {
    expect(formatRelativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3 hours ago');
    expect(formatRelativeTime(new Date(Date.now() - 1 * 3_600_000).toISOString())).toBe('1 hour ago');
  });

  it('formats days, pluralizing above 1', () => {
    expect(formatRelativeTime(new Date(Date.now() - 5 * 86_400_000).toISOString())).toBe('5 days ago');
    expect(formatRelativeTime(new Date(Date.now() - 1 * 86_400_000).toISOString())).toBe('1 day ago');
  });
});
