import { Button, Icon } from '../../ui';
import { applySuggestions, nextStep } from './assistModel';
import { useBuilder } from './builderContext';
import { fillTotal, sharedCopies } from './insightsModel';

/** The single best action right now. Everything else sits below, collapsed. */
export function NextStepCard() {
  const { legend, issues, assist, catalog, rules, edit, openLegendPicker, missing, conflicts } = useBuilder();
  const step = nextStep({
    hasLegend: legend !== undefined,
    issues,
    fillCount: fillTotal(assist.picks),
    championMissing: assist.marker !== undefined,
    missingCopies: missing.reduce((sum, m) => sum + m.missing, 0) + sharedCopies(conflicts),
    catalog,
    rules,
  });

  const run = () => {
    if (step.kind === 'legend') openLegendPicker();
    else if (step.kind === 'fix' && 'edit' in step.fix) edit(step.fix.edit);
    else if (step.kind === 'fill') edit((d) => applySuggestions(d, catalog, assist.picks, rules));
    else if (step.kind === 'champion') assist.browseChampions();
    else if (step.kind === 'buy') assist.setShowBuy(true);
  };

  return (
    <section className="dk-next" aria-labelledby="dk-next-title">
      <p className="dk-next__eyebrow">
        <Icon name={step.kind === 'done' ? 'check' : 'sparkles'} /> Next step
      </p>
      <h2 id="dk-next-title" className="dk-next__title">
        {step.title}
      </h2>
      <p className="dk-muted">{step.detail}</p>
      {step.kind !== 'done' ? (
        <Button onClick={run} fullWidth>
          {step.action}
        </Button>
      ) : null}
    </section>
  );
}
