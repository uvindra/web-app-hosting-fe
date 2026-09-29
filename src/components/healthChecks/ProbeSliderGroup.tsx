import type { JSX } from 'react';
import { Grid } from '@wso2/oxygen-ui';
import PresetSlider from './PresetSlider';
import { FAILURE, FREQUENCY, INITIAL_DELAY, SUCCESS, TIMEOUT } from './probeFormState';

export interface ProbeSliderValues {
  failureThreshold: number;
  successThreshold: number;
  initialDelaySeconds: number;
  periodSeconds: number;
  timeoutSeconds: number;
}

interface ProbeSliderGroupProps {
  values: ProbeSliderValues;
  showSuccess: boolean;
  viewMode?: boolean;
  onChange?: (field: keyof ProbeSliderValues, value: number) => void;
}

const DESC = {
  failure: 'Number of retries before the probe is considered failed. The container is restarted once this threshold is reached.',
  success: 'Minimum consecutive successes for the probe to be considered successful after having failed once.',
  delay: 'Seconds to wait before the first probe after the container starts.',
  frequency: 'How often the probe runs against the container.',
  timeout: 'Seconds after which the probe times out. A timeout counts as a failure.',
};

/** The timing and threshold sliders shared by the read-only probe display and the probe form. */
export default function ProbeSliderGroup({ values, showSuccess, viewMode, onChange }: ProbeSliderGroupProps): JSX.Element {
  const desc = viewMode ? undefined : DESC;
  const cell = { xs: 12, md: 6, lg: 4 } as const;
  return (
    <Grid container spacing={4}>
      <Grid size={cell}>
        <PresetSlider label="Failure threshold" value={values.failureThreshold} {...FAILURE} viewMode={viewMode} description={desc?.failure} onChange={(v) => onChange?.('failureThreshold', v)} />
      </Grid>
      {showSuccess && (
        <Grid size={cell}>
          <PresetSlider label="Success threshold after first failure" value={values.successThreshold} {...SUCCESS} viewMode={viewMode} description={desc?.success} onChange={(v) => onChange?.('successThreshold', v)} />
        </Grid>
      )}
      <Grid size={cell}>
        <PresetSlider label="Delay before initial probe" unit="s" value={values.initialDelaySeconds} {...INITIAL_DELAY} viewMode={viewMode} description={desc?.delay} onChange={(v) => onChange?.('initialDelaySeconds', v)} />
      </Grid>
      <Grid size={cell}>
        <PresetSlider label="Probe frequency" unit="s" value={values.periodSeconds} {...FREQUENCY} viewMode={viewMode} description={desc?.frequency} onChange={(v) => onChange?.('periodSeconds', v)} />
      </Grid>
      <Grid size={cell}>
        <PresetSlider label="Timeout" unit="s" value={values.timeoutSeconds} {...TIMEOUT} viewMode={viewMode} description={desc?.timeout} onChange={(v) => onChange?.('timeoutSeconds', v)} />
      </Grid>
    </Grid>
  );
}
