import type { Catalog, LegendReadiness } from '@sc/core';
import { Dialog } from '../../ui';
import { LegendPicker } from './LegendPicker';
import { useStartDeck } from './useStartDeck';

interface NewDeckDialogProps {
  open: boolean;
  onClose: () => void;
  catalog: Catalog;
  readiness: LegendReadiness[];
}

/** Step one of a new deck: pick the legend. Creating the deck opens the builder. */
export function NewDeckDialog({ open, onClose, catalog, readiness }: NewDeckDialogProps) {
  const start = useStartDeck();
  return (
    <Dialog open={open} onClose={onClose} title="Choose a legend" description="Every deck is built around one legend. Readiness shows how much of a full deck your collection covers." size="lg">
      <LegendPicker
        catalog={catalog}
        readiness={readiness}
        onPick={(key) => {
          onClose();
          void start(key);
        }}
      />
    </Dialog>
  );
}
