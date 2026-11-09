import { AssistPanel } from './AssistPanel';
import { MissingPanel } from './MissingPanel';
import { NextStepCard } from './NextStepCard';
import { SampleHandPanel } from './SampleHandPanel';
import { StatsPanel } from './StatsPanel';
import { ValidationPanel } from './ValidationPanel';

/** Next step first, then validation, stats, missing cards, collapsed suggestions and the sample hand. */
export function InsightsPane() {
  return (
    <section className="dk-insights" aria-label="Insights">
      <NextStepCard />
      <ValidationPanel />
      <StatsPanel />
      <MissingPanel />
      <AssistPanel />
      <SampleHandPanel />
    </section>
  );
}
