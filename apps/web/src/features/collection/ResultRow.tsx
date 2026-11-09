import { memo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SearchHit } from '@sc/core';
import { paths } from '../../app/paths';
import { CardImage, Checkbox, DomainGlyph, RarityBadge, Stepper } from '../../ui';
import { TABLE } from './constants';
import { collectorInfo, dash, printingNumber, variantLabel } from './format';
import type { OwnedCount } from './grouping';
import { changeOwnedTotal } from './ownedActions';
import type { TileMode } from './ResultTile';
import { gridTemplate, type ColumnDef, type ColumnKey } from './tableColumns';

interface ResultRowProps {
  hit: SearchHit;
  index: number;
  count: OwnedCount | undefined;
  tags: readonly string[];
  mode: TileMode;
  selected: boolean;
  contextSearch: string;
  columns: readonly ColumnDef[];
  onActivate: (index: number, hit: SearchHit) => void;
}

/** One dense table row. The name cell holds the focus target so arrow keys and Enter work like the grid. */
export const ResultRow = memo(function ResultRow({ hit, index, count, tags, mode, selected, contextSearch, columns, onActivate }: ResultRowProps) {
  const { card, printing } = hit;
  const total = count?.total ?? 0;
  const name =
    mode === 'open' ? (
      <Link to={paths.card(printing.printingKey) + contextSearch} className="results__name">
        {card.name}
      </Link>
    ) : (
      <button type="button" className="results__name" aria-pressed={mode === 'select' ? selected : undefined} onClick={() => onActivate(index, hit)}>
        {card.name}
      </button>
    );

  const cells: Record<ColumnKey, ReactNode> = {
    art:
      mode === 'select' ? (
        <Checkbox checked={selected} onCheckedChange={() => onActivate(index, hit)} label={<span className="sr-only">{`Select ${card.name}`}</span>} />
      ) : (
        <span className="results__thumb">
          <CardImage src={printing.imageUrl} alt="" rarity={printing.rarity} />
        </span>
      ),
    name: (
      <>
        {name}
        {columns.some((column) => column.key === 'number') ? null : <span className="results__muted">{printingNumber(printing)}</span>}
      </>
    ),
    number: <span className="results__muted">{printingNumber(printing)}</span>,
    domain: (
      <span className="results__domains">
        {card.domains.length ? card.domains.map((domain) => <DomainGlyph key={domain} domain={domain} size="1.1rem" />) : <span className="results__muted">-</span>}
      </span>
    ),
    type: card.type,
    energy: dash(card.energy),
    might: dash(card.might),
    rarity: <RarityBadge rarity={printing.rarity} />,
    variant: <span className="results__muted">{variantLabel(printing)}</span>,
    finish: <span className="results__muted">{count?.finishes.join(', ') || '-'}</span>,
    condition: <span className="results__muted">{count?.conditions.join(', ') || '-'}</span>,
    tags: <span className="results__muted">{tags.join(', ') || '-'}</span>,
    owned: (
      <Stepper
        size="sm"
        value={total}
        label={`Owned copies of ${card.name} ${printingNumber(printing)}`}
        onChange={(next) => void changeOwnedTotal(printing.printingKey, count, next)}
      />
    ),
  };

  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      className="results__trow"
      style={{ height: TABLE.rowPx, gridTemplateColumns: gridTemplate(columns) }}
      data-result-index={index}
      data-selected={selected || undefined}
    >
      {columns.map((column) => (
        <div key={column.key} role="gridcell" className={column.numeric ? 'results__num' : column.key === 'owned' ? 'results__cell-owned' : column.key === 'name' ? 'results__cell-name' : undefined}>
          {cells[column.key]}
        </div>
      ))}
    </div>
  );
});
