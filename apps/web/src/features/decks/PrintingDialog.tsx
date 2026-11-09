import { useMemo } from 'react';
import { ownedByPrinting, type Card, type OwnedEntry, type Printing } from '@sc/core';
import { Badge, CardImage, Dialog, RarityBadge, cx } from '../../ui';
import { useBuilder } from './builderContext';

interface PrintingDialogProps {
  card: Card | undefined;
  pinnedKey: string | undefined;
  onClose: () => void;
  onPick: (printingKey: string | undefined) => void;
}

/** "2 normal + 1 foil" for the copies owned of one printing. */
function finishMix(owned: OwnedEntry[], printingKey: string): string {
  const by = new Map<string, number>();
  for (const row of owned) {
    if (row.printingKey === printingKey && !row.deleted && row.quantity > 0) by.set(row.finish, (by.get(row.finish) ?? 0) + row.quantity);
  }
  return [...by].map(([finish, n]) => `${n} ${finish}`).join(' + ');
}

function printingLabel(printing: Printing): string {
  const base = `${printing.setId.toUpperCase()} ${String(printing.collectorNumber).padStart(3, '0')}`;
  return printing.variantLabel ? `${base}, ${printing.variantLabel}` : base;
}

/** Choose which printing a slot should use, or leave it on any printing. */
export function PrintingDialog({ card, pinnedKey, onClose, onPick }: PrintingDialogProps) {
  const { catalog, owned } = useBuilder();
  const counts = useMemo(() => ownedByPrinting(owned, catalog), [owned, catalog]);
  const printings = (card?.printingKeys ?? []).map((key) => catalog.printings[key]).filter((p): p is Printing => p !== undefined);
  const choose = (key: string | undefined) => {
    onPick(key);
    onClose();
  };
  return (
    <Dialog open={card !== undefined} onClose={onClose} title={card ? `Printing for ${card.name}` : 'Printing'} description="Pinning applies to all copies of this card in the section and counts only copies of that printing. Leave it on any printing to use whatever you own." size="md">
      <ul className="dk-printings">
        <li>
          <button type="button" className={cx('dk-printing', !pinnedKey && 'is-selected')} aria-pressed={!pinnedKey} onClick={() => choose(undefined)}>
            <span className="dk-printing__text">
              <span className="dk-printing__name">Any printing</span>
              <span className="dk-muted">Uses any owned copy</span>
            </span>
          </button>
        </li>
        {printings.map((printing) => {
          const have = counts.get(printing.printingKey) ?? 0;
          return (
            <li key={printing.printingKey}>
              <button type="button" className={cx('dk-printing', pinnedKey === printing.printingKey && 'is-selected')} aria-pressed={pinnedKey === printing.printingKey} onClick={() => choose(printing.printingKey)}>
                <span className="dk-printing__art">
                  <CardImage src={printing.imageUrl} alt="" rarity={printing.rarity} />
                </span>
                <span className="dk-printing__text">
                  <span className="dk-printing__name">{printingLabel(printing)}</span>
                  <span className="dk-muted">{printing.setLabel}</span>
                  <span className="dk-printing__badges">
                    <RarityBadge rarity={printing.rarity} />
                    <Badge tone={have > 0 ? 'success' : 'neutral'}>{have > 0 ? `${have} owned (${finishMix(owned, printing.printingKey)})` : 'Not owned'}</Badge>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
