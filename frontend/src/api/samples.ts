import type { Sample } from '../types/sample';
import { MOCK_SAMPLES } from '../mock-data/samples';

const NETWORK_DELAY_MS = 200;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchSamples(): Promise<Sample[]> {
  await delay(NETWORK_DELAY_MS);
  return MOCK_SAMPLES;
}
