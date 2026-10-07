import { describe, expect, it } from 'vitest';
import { toHandler } from './toHandler';

describe('toHandler', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(toHandler('My Portfolio')).toBe('my-portfolio');
  });

  it('strips non-alphanumeric characters', () => {
    expect(toHandler('React SPA (v2)!')).toBe('react-spa-v2');
  });

  it('collapses repeated whitespace', () => {
    expect(toHandler('  Hello   World  ')).toBe('hello-world');
  });

  it('trims leading/trailing hyphens', () => {
    expect(toHandler('-leading and trailing-')).toBe('leading-and-trailing');
  });
});
