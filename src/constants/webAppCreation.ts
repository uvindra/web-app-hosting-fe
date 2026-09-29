export interface CreationStep {
  progress: number;
  text: string;
}

// Fixed client-side progress — there's no backend job to poll yet (see the plan's "stub until
// backend is ready" decision). Mirrors ipaas's IntegrationCreationLoader pattern.
export const CREATION_STEPS: CreationStep[] = [
  { progress: 10, text: 'Starting web app creation…' },
  { progress: 35, text: 'Creating web app component…' },
  { progress: 65, text: 'Configuring build settings…' },
  { progress: 85, text: 'Finalizing setup…' },
];

export const CREATION_STEP_INTERVAL = 1200; // milliseconds between each step
