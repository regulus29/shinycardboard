import { useEffect, useMemo, useState } from 'react';
import { buildableLegends } from '@sc/core';
import { Button, Dialog } from '../../ui';
import { useBuilder } from './builderContext';
import { SECTION_LABELS } from './constants';
import { applyLegendChange, legendChangeImpact } from './deckModel';
import { LegendPicker } from './LegendPicker';

interface LegendChangeDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Pick another legend. When cards would become illegal the user sees them first and chooses what happens. */
export function LegendChangeDialog({ open, onClose }: LegendChangeDialogProps) {
  const { catalog, rules, deck, edit, owned } = useBuilder();
  const [pending, setPending] = useState<string | undefined>();
  const readiness = useMemo(() => (open ? buildableLegends(catalog, owned) : []), [open, catalog, owned]);
  const impact = pending ? legendChangeImpact(deck, pending, catalog, rules) : undefined;
  const pendingName = pending ? catalog.cards[pending]?.name : undefined;

  useEffect(() => {
    if (!open) setPending(undefined);
  }, [open]);

  const apply = (dropIllegal: boolean) => {
    if (pending) edit((d) => applyLegendChange(d, pending, catalog, dropIllegal, rules));
    onClose();
  };

  const pick = (key: string) => {
    if (key === deck.legendKey) return onClose();
    const result = legendChangeImpact(deck, key, catalog, rules);
    if (result.illegal.length === 0 && !result.championInvalid) {
      edit((d) => applyLegendChange(d, key, catalog, false, rules));
      return onClose();
    }
    setPending(key);
  };

  if (pending && impact) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={`Switch to ${pendingName ?? 'this legend'}?`}
        description="Some cards in this deck do not fit the new legend."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(undefined)}>
              Back
            </Button>
            <Button variant="secondary" onClick={() => apply(false)}>
              Keep and flag them
            </Button>
            <Button onClick={() => apply(true)}>Remove illegal cards</Button>
          </>
        }
      >
        <ul className="dk-list dk-list--scroll" aria-label="Cards that become illegal">
          {impact.illegal.map((entry) => (
            <li key={`${entry.section}-${entry.cardKey}`}>
              {entry.count} {entry.name} <span className="dk-muted">{SECTION_LABELS[entry.section]}</span>
            </li>
          ))}
        </ul>
        {impact.championInvalid ? <p className="dk-muted">The chosen champion {impact.championName} is not a champion of the new legend and will be cleared.</p> : null}
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title="Change legend" description="Legal cards are re-checked against the new legend." size="lg">
      <LegendPicker catalog={catalog} readiness={readiness} selectedKey={deck.legendKey} onPick={pick} />
    </Dialog>
  );
}
