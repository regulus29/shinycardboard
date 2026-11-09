import { memo } from 'react';
import type { SearchHit } from '@sc/core';
import { paths } from '../../app/paths';
import { Checkbox, CardTile, Stepper } from '../../ui';
import { collectorInfo, printingNumber, variantLabel } from './format';
import type { OwnedCount } from './grouping';
import { changeOwnedTotal } from './ownedActions';

export type TileMode = 'open' | 'select' | 'quickAdd';

interface ResultTileProps {
  hit: SearchHit;
  index: number;
  count: OwnedCount | undefined;
  mode: TileMode;
  selected: boolean;
  /** Dim cards the user does not own (only once they own something, so a new collection is not all gray). */
  dimUnowned: boolean;
  contextSearch: string;
  onActivate: (index: number, hit: SearchHit) => void;
}

/** One grid cell. Memoized so a stepper click re-renders only the tile whose count changed. */
export const ResultTile = memo(function ResultTile({ hit, index, count, mode, selected, dimUnowned, contextSearch, onActivate }: ResultTileProps) {
  const { printing, card } = hit;
  const total = count?.total ?? 0;
  const subtitle = (
    <>
      {printingNumber(printing)}
      {printing.variant !== 'standard' ? ` - ${variantLabel(printing)}` : ''}
      {collectorInfo(count) ? <span className="results__collector">{` - ${collectorInfo(count)}`}</span> : null}
    </>
  );
  const footer =
    mode === 'select' ? (
      <Checkbox checked={selected} onCheckedChange={() => onActivate(index, hit)} label={`Select ${card.name}`} />
    ) : (
      <Stepper
        size="sm"
        value={total}
        label={`Owned copies of ${card.name} ${printingNumber(printing)}`}
        onChange={(next) => void changeOwnedTotal(printing.printingKey, count, next)}
      />
    );
  const interactive = mode === 'open' ? { to: paths.card(printing.printingKey) + contextSearch } : { onClick: () => onActivate(index, hit) };

  return (
    <div className="results__cell" role="gridcell" data-result-index={index}>
      <CardTile
        card={card}
        printing={printing}
        owned={total}
        foil={(count?.foil ?? 0) > 0}
        dimmed={dimUnowned && total === 0}
        selected={selected}
        subtitle={subtitle}
        footer={footer}
        {...interactive}
      />
    </div>
  );
});
