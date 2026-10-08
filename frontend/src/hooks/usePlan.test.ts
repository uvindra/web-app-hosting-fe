import { afterEach, describe, expect, it } from 'vitest';
import { upgradeUrl } from './usePlan';
import type { ApiConfig } from '../config/runtimeConfig';

const original = window.API_CONFIG;
const withBillingUrl = (billingConsoleUrl: string): void => {
  window.API_CONFIG = { ...original, billingConsoleUrl } as ApiConfig;
};

describe('upgradeUrl', () => {
  afterEach(() => {
    window.API_CONFIG = original;
  });
  it('is the configured billing console', () => {
    withBillingUrl('https://console.example.com/billing');
    expect(upgradeUrl()).toBe('https://console.example.com/billing');
  });
  it('is undefined when no billing console is configured', () => {
    withBillingUrl('');
    expect(upgradeUrl()).toBeUndefined();
  });
});
