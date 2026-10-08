import { describe, expect, it } from 'vitest';
import { webAppSummary } from './webAppSummary';
import type { WebAppStatus } from '../types/webApp';

const apps = (...statuses: WebAppStatus[]) => statuses.map((status) => ({ status }));

describe('webAppSummary', () => {
  it('says 0 web applications for an empty project', () => {
    expect(webAppSummary([])).toBe('0 web applications');
  });

  it('uses the singular for one web app', () => {
    expect(webAppSummary(apps('active'))).toBe('1 web application · 1 deployed');
  });

  it('counts only deployed web apps as deployed', () => {
    expect(webAppSummary(apps('active', 'not-deployed'))).toBe('2 web applications · 1 deployed');
  });

  it('counts deploying and failed deployments as deployed', () => {
    expect(webAppSummary(apps('deploying', 'failed', 'not-deployed', 'not-deployed'))).toBe('4 web applications · 2 deployed');
  });

  it('reports none deployed', () => {
    expect(webAppSummary(apps('not-deployed', 'not-deployed'))).toBe('2 web applications · 0 deployed');
  });
});
