import type { Catalog } from '@sc/core';
import { Button, Chip, DOMAIN_ORDER, DomainGlyph, Popover, RARITY_ORDER } from '../../ui';
import { TYPE_ORDER, VARIANT_FILTERS, VARIANT_LABELS } from './constants';
import { fieldValues, toggleFieldValue, type FilterField } from './queryEdit';

interface FilterProps {
  catalog: Catalog;
  query: string;
  onQueryChange: (query: string) => void;
}

interface Option {
  value: string;
  label: string;
  glyph?: (typeof DOMAIN_ORDER)[number];
}

interface Group {
  field: FilterField;
  title: string;
  options: Option[];
}

function buildGroups(catalog: Catalog): Group[] {
  return [
    { field: 'domain', title: 'Domain', options: DOMAIN_ORDER.map((domain) => ({ value: domain.toLowerCase(), label: domain, glyph: domain })) },
    { field: 'type', title: 'Type', options: TYPE_ORDER.map((type) => ({ value: type.toLowerCase(), label: type })) },
    { field: 'rarity', title: 'Rarity', options: RARITY_ORDER.map((rarity) => ({ value: rarity, label: rarity.charAt(0).toUpperCase() + rarity.slice(1) })) },
    { field: 'variant', title: 'Variant', options: VARIANT_FILTERS.map((variant) => ({ value: variant, label: VARIANT_LABELS[variant] ?? variant })) },
    { field: 'set', title: 'Set', options: catalog.sets.map((set) => ({ value: set.setId.toLowerCase(), label: set.setId })) },
  ];
}

/** Number of chip values currently applied through the query text. */
export function activeFilterCount(catalog: Catalog, query: string): number {
  return buildGroups(catalog).reduce((sum, group) => sum + fieldValues(query, group.field).length, 0);
}

/**
 * Quick filter chips. Selected state is read from the query text and clicks rewrite it, so the
 * chips and the omnibox can never disagree.
 */
export function FilterGroups({ catalog, query, onQueryChange }: FilterProps) {
  return (
    <div className="filters__groups" role="group" aria-label="Quick filters">
      {buildGroups(catalog).map((group) => {
        const active = fieldValues(query, group.field);
        return (
          <div key={group.field} className="filters__group" role="group" aria-label={group.title}>
            <span className="filters__title" aria-hidden="true">
              {group.title}
            </span>
            <div className="filters__chips">
              {group.options.map((option) => (
                <Chip key={option.value} selected={active.includes(option.value)} onClick={() => onQueryChange(toggleFieldValue(query, group.field, option.value))}>
                  {option.glyph ? <DomainGlyph domain={option.glyph} size="1rem" /> : null}
                  {option.label}
                </Chip>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Applied filters as a removable chip strip (desktop), so the groups can stay in a popover. */
export function AppliedFilters({ catalog, query, onQueryChange }: FilterProps) {
  const applied = buildGroups(catalog).flatMap((group) =>
    fieldValues(query, group.field).map((value) => ({
      field: group.field,
      value,
      label: group.options.find((option) => option.value === value)?.label ?? value,
      title: group.title,
    })),
  );
  if (applied.length === 0) return null;
  return (
    <ul className="filters__applied" aria-label="Applied filters">
      {applied.map((item) => (
        <li key={`${item.field}:${item.value}`}>
          <Chip selected removeLabel={`Remove ${item.title} filter`} onRemove={() => onQueryChange(toggleFieldValue(query, item.field, item.value))}>
            {item.label}
          </Chip>
        </li>
      ))}
    </ul>
  );
}

/** Desktop: one Filters button opening the chip groups in a popover. */
export function FilterPopover(props: FilterProps) {
  const count = activeFilterCount(props.catalog, props.query);
  return (
    <Popover
      label="Filters"
      className="filters__popover"
      trigger={(api) => (
        <Button variant={count > 0 ? 'primary' : 'secondary'} size="sm" icon="filter" {...api.props}>
          Filters{count > 0 ? ` (${count})` : ''}
        </Button>
      )}
    >
      <FilterGroups {...props} />
    </Popover>
  );
}
