import { useMemo, useState } from 'react';
import type { Catalog, LegendReadiness } from '@sc/core';
import { Badge, EmptyState, ProgressBar, SearchField, SegmentedControl, cx } from '../../ui';
import type { LegendSort } from './constants';
import { DomainRow, LegendArt } from './LegendArt';
import { filterLegends, legendOptions, readinessLine, type LegendOption } from './listModel';
import { percent } from './insightsModel';

function LegendTile({ option, catalog, selected, onPick }: { option: LegendOption; catalog: Catalog; selected: boolean; onPick: () => void }) {
  const { legend, readiness } = option;
  return (
    <li>
      <button type="button" className={cx('dk-legend-tile', selected && 'is-selected')} onClick={onPick} aria-pressed={selected}>
        <LegendArt catalog={catalog} legend={legend} />
        <span className="dk-legend-tile__body">
          <span className="dk-legend-tile__name">{legend.name}</span>
          <DomainRow domains={legend.domains} />
          {readiness ? (
            <>
              <ProgressBar value={percent(readiness.completeness)} label={`${legend.name} readiness`} size="sm" tone={readiness.shortBy === 0 ? 'success' : 'accent'} />
              <span className="dk-legend-tile__line">{readinessLine(readiness)}</span>
              <span className="dk-legend-tile__badges">
                <Badge tone={readiness.championAvailable ? 'success' : 'neutral'}>{readiness.championAvailable ? 'Champion owned' : 'No champion'}</Badge>
                <Badge tone={readiness.signatureOwned > 0 ? 'info' : 'neutral'}>Signature {readiness.signatureOwned}</Badge>
              </span>
            </>
          ) : null}
        </span>
      </button>
    </li>
  );
}

interface LegendPickerProps {
  catalog: Catalog;
  readiness: LegendReadiness[];
  selectedKey?: string;
  onPick: (legendKey: string) => void;
}

/** Searchable grid of every legend with how ready the collection is for each. */
export function LegendPicker({ catalog, readiness, selectedKey, onPick }: LegendPickerProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<LegendSort>('ready');
  const options = useMemo(() => legendOptions(catalog, readiness), [catalog, readiness]);
  const shown = useMemo(() => filterLegends(options, search, sort), [options, search, sort]);
  return (
    <div className="dk-legend-picker">
      <div className="dk-legend-picker__bar">
        <SearchField label="Search legends" value={search} onValueChange={setSearch} placeholder="Search by name, domain or champion" />
        <SegmentedControl
          label="Sort legends"
          value={sort}
          onValueChange={setSort}
          options={[
            { value: 'ready', label: 'Most ready' },
            { value: 'name', label: 'Name' },
          ]}
          size="sm"
        />
      </div>
      {shown.length === 0 ? (
        <EmptyState icon="search" title="No legends match" description="Try a champion name or a domain such as Fury." />
      ) : (
        <ul className="dk-legend-grid">
          {shown.map((option) => (
            <LegendTile key={option.legend.cardKey} option={option} catalog={catalog} selected={option.legend.cardKey === selectedKey} onPick={() => onPick(option.legend.cardKey)} />
          ))}
        </ul>
      )}
    </div>
  );
}
