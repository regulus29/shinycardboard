import { useState } from 'react';
import { Badge, Button, CardImage, EmptyState, IconButton, SegmentedControl, Select, cx } from '../../ui';
import { CARD_ORDER_OPTIONS, SECTION_LABELS, SECTION_ORDER, type CardOrder } from './constants';
import { useBuilder } from './builderContext';
import { adjustCard, checkAdd, countOf, groupByType, removeCard, setPin, slotsOf, toRows, totalCount, type DeckRow } from './deckModel';
import { artUrl } from './LegendArt';
import { PrintingDialog } from './PrintingDialog';
import { QtyControl } from './QtyControl';
import { SectionSwitch } from './SectionSwitch';

type View = 'list' | 'grid';

function OwnedNote({ owned, needed }: { owned: number; needed: number }) {
  const short = owned < needed;
  return (
    <span className={cx('dk-owned', short ? 'is-short' : 'is-ok')} aria-label={`${owned} of ${needed} owned`} title={short ? `Own ${owned} of ${needed}` : `Own ${owned}`}>
      {owned}/{needed}
    </span>
  );
}

interface RowProps {
  row: DeckRow;
  view: View;
  onPin: (row: DeckRow) => void;
}

/** One card: thumbnail, name, cost, owned/needed, printing pin and stepper on a single line. */
function DeckRowItem({ row, view, onPin }: RowProps) {
  const { catalog, rules, deck, edit, section, ownedCounts } = useBuilder();
  const { card } = row;
  const name = card?.name ?? row.cardKey;
  const needed = SECTION_ORDER.reduce((sum, id) => sum + countOf(deck, id, row.cardKey), 0);
  const owned = ownedCounts[row.cardKey] ?? 0;
  const check = card ? checkAdd(deck, catalog, card, section, rules) : ({ ok: false, reason: 'Unknown card' } as const);
  const pinned = row.printingKey ? catalog.printings[row.printingKey] : undefined;
  const add = () => card && edit((d) => adjustCard(d, catalog, card, section, 1, rules));
  const remove = () => (card ? edit((d) => adjustCard(d, catalog, card, section, -1, rules)) : edit((d) => removeCard(d, section, row.cardKey)));
  const pinLabel = pinned ? `${pinned.setId.toUpperCase()} ${pinned.collectorNumber}${pinned.variantLabel ? ` ${pinned.variantLabel}` : ''}` : 'any printing';
  return (
    <li className={cx('dk-row', view === 'grid' && 'dk-row--grid', owned < needed && 'is-short')}>
      <div className="dk-row__thumb">
        <CardImage src={artUrl(catalog, card, row.printingKey)} alt="" rarity={pinned?.rarity} />
        {view === 'grid' ? <span className="dk-row__count">x{row.count}</span> : null}
      </div>
      <span className="dk-row__name" title={name}>
        {name}
      </span>
      {card?.energy != null ? (
        <span className="dk-energy" aria-label={`Energy ${card.energy}`}>
          {card.energy}
        </span>
      ) : (
        <span />
      )}
      <OwnedNote owned={owned} needed={needed} />
      {card ? <IconButton icon="layers" size="sm" variant="ghost" active={Boolean(pinned)} label={`Printing for ${name}: ${pinLabel}`} onClick={() => onPin(row)} /> : <span />}
      <QtyControl name={name} count={row.count} check={check} onAdd={add} onRemove={remove} />
    </li>
  );
}

/** The deck list for the active section, grouped by type with per row steppers. */
export function DeckPane({ withSections = false }: { withSections?: boolean }) {
  const { catalog, rules, deck, edit, section, setSection, legend } = useBuilder();
  const [order, setOrder] = useState<CardOrder>('energy');
  const [view, setView] = useState<View>('list');
  const [pinRow, setPinRow] = useState<DeckRow | undefined>();
  const rows = toRows(slotsOf(deck, section), catalog);
  const groups = groupByType(rows, order, rules);
  const total = totalCount(slotsOf(deck, section));
  const pinCard = pinRow ? catalog.cards[pinRow.cardKey] : undefined;

  return (
    <section className="dk-deckpane" aria-label="Deck">
      {withSections ? <SectionSwitch /> : null}
      <div className="dk-deckpane__bar">
        <h2 className="dk-deckpane__title">
          {SECTION_LABELS[section]} <span className="dk-muted">{total} {total === 1 ? 'card' : 'cards'}</span>
        </h2>
        <Select label="Sort deck" hideLabel size="sm" value={order} onValueChange={setOrder} options={CARD_ORDER_OPTIONS.map((o) => ({ ...o, label: `Sort: ${o.label}` }))} />
        <SegmentedControl<View>
          label="Deck layout"
          size="sm"
          iconOnly
          value={view}
          onValueChange={setView}
          options={[
            { value: 'list', label: 'Compact list', icon: 'list' },
            { value: 'grid', label: 'Art grid', icon: 'grid' },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          illustration="deck"
          title={`No cards in ${SECTION_LABELS[section].toLowerCase()} yet`}
          description={legend ? 'Add cards from the pool, or let the assistant fill from your collection.' : 'Choose a legend first, then add cards from the pool.'}
          action={
            section !== 'main' ? (
              <Button variant="secondary" size="sm" onClick={() => setSection('main')}>
                Back to main deck
              </Button>
            ) : undefined
          }
        />
      ) : (
        groups.map((group) => (
          <div key={group.type} className="dk-group">
            <h3 className="dk-group__title">
              {group.type === 'Unknown' ? 'Unknown cards' : group.type}
              <Badge>{group.total}</Badge>
            </h3>
            <ul className={cx('dk-rows', view === 'grid' && 'dk-rows--grid')}>
              {group.rows.map((row) => (
                <DeckRowItem key={row.cardKey} row={row} view={view} onPin={setPinRow} />
              ))}
            </ul>
          </div>
        ))
      )}
      <PrintingDialog
        card={pinCard}
        pinnedKey={pinRow?.printingKey}
        onClose={() => setPinRow(undefined)}
        onPick={(printingKey) => pinRow && edit((d) => setPin(d, section, pinRow.cardKey, printingKey))}
      />
    </section>
  );
}
