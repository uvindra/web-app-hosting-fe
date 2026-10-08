import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AcrylicOrangeTheme, OxygenUIThemeProvider } from '@wso2/oxygen-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfigEditor from './ConfigEditor';

vi.mock('../../api/configs', () => ({ createConfig: vi.fn(), updateConfig: vi.fn(), deleteConfig: vi.fn(), fetchConfigs: vi.fn() }));

const track = { webAppId: 'site', trackId: 'site' };
// Longer than React's nested-update limit (50) and full of '/', where characters went missing.
const TEXT = "window.configs = { apiUrl: 'https://x.example.com/api/v1/items', authUrl: 'https://idp.example.com/oauth2/token' };";

const setActEnvironment = (on: boolean): void => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = on;
};

/**
 * Types one character per `input` event, back to back without yielding to the scheduler, like the
 * browser does when keystrokes arrive faster than React's non-urgent work can run (Chrome runs
 * queued input first). Called outside `act()` so React schedules work as it does live.
 */
function typeFast(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setValue) throw new Error('no value setter');
  for (const ch of text) {
    setValue.call(el, el.value + ch);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));

describe('ConfigEditor typing', () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setActEnvironment(true);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // Same wrappers as main.tsx (StrictMode + the oxygen theme), so MUI behaves as in the app.
    act(() =>
      root.render(
        <StrictMode>
          <OxygenUIThemeProvider themes={[{ key: 'acrylicOrange', label: 'Acrylic Orange', theme: AcrylicOrangeTheme }]} initialTheme="acrylicOrange">
            <QueryClientProvider client={new QueryClient()}>
              <ConfigEditor track={track} environment="development" isSpa onBack={() => {}} onSaved={() => {}} />
            </QueryClientProvider>
          </OxygenUIThemeProvider>
        </StrictMode>,
      ),
    );
  });

  afterEach(() => {
    setActEnvironment(true);
    act(() => root.unmount());
    container.remove();
    consoleError.mockRestore();
  });

  /** The input/textarea a MUI label points at. */
  const byLabel = <T extends HTMLInputElement | HTMLTextAreaElement>(label: string): T => {
    const el = [...container.querySelectorAll('label')].find((l) => l.textContent?.replace('*', '').trim() === label);
    const input = el?.htmlFor ? document.getElementById(el.htmlFor) : null;
    if (!input) throw new Error(`no field labelled ${label}`);
    return input as T;
  };
  const updateDepthErrors = (): unknown[][] => consoleError.mock.calls.filter((args: unknown[]) => args.some((a) => String(a).includes('Maximum update depth')));

  it('keeps every character typed into a file config content', async () => {
    const fileRadio = container.querySelector<HTMLInputElement>('input[type="radio"][value="file"]');
    if (!fileRadio) throw new Error('no File radio');
    act(() => fileRadio.click());
    const content = byLabel<HTMLTextAreaElement>('Content');
    setActEnvironment(false);
    typeFast(content, TEXT);
    await settle();
    expect(content.value).toBe(TEXT);
    expect(updateDepthErrors()).toEqual([]);
  });

  it('keeps every character typed into env var key and value inputs', async () => {
    setActEnvironment(false);
    const value = byLabel<HTMLInputElement>('Value');
    typeFast(value, TEXT);
    await settle();
    expect(value.value).toBe(TEXT);

    const keyText = 'API_BASE_URL_'.repeat(6);
    const key = byLabel<HTMLInputElement>('Key');
    typeFast(key, keyText);
    await settle();
    expect(key.value).toBe(keyText);
    expect(updateDepthErrors()).toEqual([]);
  });
});
