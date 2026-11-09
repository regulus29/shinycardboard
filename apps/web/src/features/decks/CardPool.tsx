import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { CardType, Domain } from '@sc/core';
import { Badge, Button, CardImage, Chip, DomainBadge, EmptyState, Icon, Popover, SearchField, SegmentedControl, Select, cx } from '../../ui';
import { CARD_ORDER_OPTIONS, ENERGY_BUCKET_MAX, ENERGY_BUCKETS, POOL_PAGE_SIZE, type CardOrder, type PoolScope } from './constants';
import { useBuilder } from './builderContext';
import { adjustCard, checkAdd, countOf } from './deckModel';
import { PinnedCards } from './PinnedCards';
import { buildPool, hasActiveFilters, NO_FILTERS, typesForSection, type PoolEntry, type PoolFilters } from './poolModel';
import { QtyControl } from './QtyControl';
import { SectionSwitch } from './SectionSwitch';

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function PoolTile({ entry }: { entry: PoolEntry }) {
  const { catalog, rules, deck, edit, section } = useBuilder();
  const { card, printing, owned } = entry;
  const inDeck = countOf(deck, section, card.cardKey);
  const check = checkAdd(deck, catalog, card, section, rules);
  const add = () => edit((d) => adjustCard(d, catalog, card, section, 1, rules));
  const remove = () => edit((d) => adjustCard(d, catalog, card, section, -1, rules));
  return (
    <li className={cx('dk-pool-card', owned === 0 && 'is-unowned', inDeck > 0 && 'is-in-deck')}>
      <button type="button" tabIndex={-1} className="dk-pool-card__art" onClick={add} aria-disabled={!check.ok || undefined} aria-label={`Quick add ${card.name}`} title={check.ok ? 'Add one copy' : check.reason}>
        <CardImage src={printing.imageUrl} alt="" rarity={printing.rarity} />
        {inDeck > 0 ? <span className="dk-pool-card__deck">{inDeck} in deck</span> : null}
        {owned === 0 ? <span className="dk-pool-card__missing">Not owned</span> : <span className="dk-pool-card__owned">{owned} owned</span>}
      </button>
      <div className="dk-pool-card__meta">
        <span className="dk-pool-card__name" title={card.name}>
          {card.name}
        </span>
        <span className="dk-pool-card__sub">
          {card.energy !== null ? <span className="dk-energy" aria-label={`Energy ${card.energy}`}>{card.energy}</span> : null}
          <span>{card.type}</span>
          {card.domains.filter((d) => d !== 'Colorless').map((d) => (
            <DomainBadge key={d} domain={d} compact />
          ))}
        </span>
      </div>
      <QtyControl name={card.name} count={inDeck} check={check} onAdd={add} onRemove={remove} />
    </li>
  );
}

/** Search and browse the cards that are legal for this legend in the active section. */
export function CardPool({ withSections = false }: { withSections?: boolean }) {
  const b = useBuilder();
  const { catalog, rules, legal, legend, section, pool, setPool, ownedCounts, searchContext, missing } = b;
  const [order, setOrder] = useState<CardOrder>('energy');
  const [visible, setVisible] = useState(POOL_PAGE_SIZE);
  const query = useDeferredValue(pool.query);

  const entries = useMemo(
    () => buildPool({ catalog, legal, section, query, context: searchContext, ownedByCard: ownedCounts, scope: pool.scope, filters: pool.filters, order, rules }),
    [catalog, legal, section, query, searchContext, ownedCounts, pool.scope, pool.filters, order, rules],
  );

  useEffect(() => setVisible(POOL_PAGE_SIZE), [section, query, pool.scope, pool.filters, order]);

  const identity: Domain[] = (legend?.domains ?? []).filter((d) => d !== rules.classification.colorlessDomain);
  const types = typesForSection(section, rules);
  const showEnergy = section === 'main' || section === 'sideboard';
  const setFilters = (change: Partial<PoolFilters>) => setPool({ filters: { ...pool.filters, ...change } });
  const activeCount = pool.filters.types.length + pool.filters.energies.length + pool.filters.domains.length + (pool.filters.championsOnly ? 1 : 0);
  const missingTotal = missing.reduce((sum, m) => sum + m.missing, 0);

  return (
    <section className="dk-pool" aria-label="Card pool">
      <PinnedCards />
      {withSections ? <SectionSwitch /> : null}
      <div className="dk-pool__controls">
        <SearchField label="Search card pool" value={pool.query} onValueChange={(query) => setPool({ query })} placeholder="Search, e.g. cost:2 tank" />
      </div>
      <div className="dk-pool__controls dk-pool__controls--row">
        <SegmentedControl<PoolScope>
          label="Pool scope"
          value={pool.scope}
          onValueChange={(scope) => setPool({ scope })}
          options={[
            { value: 'owned', label: 'Owned only' },
            { value: 'all', label: 'All cards' },
          ]}
          size="sm"
        />
        <Popover
          label="Pool filters"
          role="dialog"
          className="dk-filters"
          trigger={(api) => (
            <Button variant="secondary" size="sm" icon="filter" {...api.props}>
              Filters{activeCount > 0 ? ` (${activeCount})` : ''}
            </Button>
          )}
        >
          <div className="dk-filters__body">
            {types.length > 1 ? (
              <div className="dk-chips" role="group" aria-label="Card type">
                {types.map((type: CardType) => (
                  <Chip key={type} selected={pool.filters.types.includes(type)} onClick={() => setFilters({ types: toggle(pool.filters.types, type) })}>
                    {type}
                  </Chip>
                ))}
              </div>
            ) : null}
            <div className="dk-chips" role="group" aria-label="Domain">
              {identity.map((domain) => (
                <Chip key={domain} selected={pool.filters.domains.includes(domain)} onClick={() => setFilters({ domains: toggle(pool.filters.domains, domain) })}>
                  {domain}
                </Chip>
              ))}
              {section === 'main' ? (
                <Chip selected={pool.filters.championsOnly} onClick={() => setFilters({ championsOnly: !pool.filters.championsOnly })}>
                  Champions
                </Chip>
              ) : null}
            </div>
            {showEnergy ? (
              <div className="dk-chips" role="group" aria-label="Energy cost">
                <span className="dk-chips__label">Cost</span>
                {ENERGY_BUCKETS.map((energy) => (
                  <Chip key={energy} selected={pool.filters.energies.includes(energy)} onClick={() => setFilters({ energies: toggle(pool.filters.energies, energy) })}>
                    {energy === ENERGY_BUCKET_MAX ? `${energy}+` : String(energy)}
                  </Chip>
                ))}
              </div>
            ) : null}
            <Button variant="ghost" size="sm" disabled={activeCount === 0} onClick={() => setPool({ filters: NO_FILTERS })}>
              Clear filters
            </Button>
          </div>
        </Popover>
        <Select label="Sort pool by" hideLabel size="sm" value={order} onValueChange={setOrder} options={CARD_ORDER_OPTIONS.map((o) => ({ ...o, label: `Sort: ${o.label}` }))} />
      </div>
      {hasActiveFilters(pool.filters) ? (
        <div className="dk-chips" aria-label="Active filters">
          {pool.filters.championsOnly ? <Chip selected onRemove={() => setFilters({ championsOnly: false })} removeLabel="Remove champions filter">Champions</Chip> : null}
          {pool.filters.types.map((t) => (
            <Chip key={t} selected onRemove={() => setFilters({ types: pool.filters.types.filter((x) => x !== t) })} removeLabel={`Remove ${t} filter`}>
              {t}
            </Chip>
          ))}
        </div>
      ) : null}
      <div className="dk-pool__status">
        <p className="dk-muted" aria-live="polite">
          {entries.length} {entries.length === 1 ? 'card' : 'cards'}
          {pool.scope === 'all' && missingTotal > 0 ? `, ${missingTotal} missing from your collection in this deck` : ''}
        </p>
      </div>
      {!legend ? (
        <div className="dk-callout">
          <Icon name="info" />
          <span>
            Pick a legend to narrow this pool to legal cards.{' '}
            <Button variant="ghost" size="sm" onClick={b.openLegendPicker}>
              Choose legend
            </Button>
          </span>
        </div>
      ) : null}
      {entries.length === 0 ? (
        <EmptyState
          icon="search"
          title={pool.scope === 'owned' ? 'No owned cards match' : 'No cards match'}
          description={pool.scope === 'owned' ? 'Switch to All cards to see what you could add or buy.' : 'Loosen the search or clear the filters.'}
          action={
            pool.scope === 'owned' ? (
              <Button variant="secondary" onClick={() => setPool({ scope: 'all' })}>
                Show all cards
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="dk-pool__grid">
            {entries.slice(0, visible).map((entry) => (
              <PoolTile key={entry.card.cardKey} entry={entry} />
            ))}
          </ul>
          {entries.length > visible ? (
            <Button variant="secondary" className="dk-more" onClick={() => setVisible((n) => n + POOL_PAGE_SIZE)}>
              Show more ({entries.length - visible} left)
            </Button>
          ) : null}
        </>
      )}
      {pool.scope === 'all' ? (
        <p className="dk-muted">
          <Badge>Not owned</Badge> cards count as missing and appear in Missing cards.
        </p>
      ) : null}
    </section>
  );
}
