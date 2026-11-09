import { Link } from 'react-router-dom';
import type { Catalog } from '@sc/core';
import { paths } from '../../app/paths';
import { Badge, IconButton, Menu, ProgressBar } from '../../ui';
import { DomainRow, LegendArt } from './LegendArt';
import { percent } from './insightsModel';
import type { DeckSummary } from './listModel';
import { relativeTime } from './time';

interface DeckCardProps {
  summary: DeckSummary;
  catalog: Catalog;
  now: number;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** One deck in the list: legend banner, validity, completion and counts. */
export function DeckCard({ summary, catalog, now, onDuplicate, onDelete }: DeckCardProps) {
  const { deck, legend, completion, counts } = summary;
  const tags = deck.tags ?? [];
  return (
    <li className="dk-deckcard">
      <Link className="dk-deckcard__link" to={paths.deck(deck.id)} aria-label={`Open ${deck.name}`}>
        <LegendArt catalog={catalog} legend={legend} className="dk-deckcard__art" />
        <span className="dk-deckcard__body">
          <span className="dk-deckcard__name">{deck.name}</span>
          <span className="dk-deckcard__legend">{legend ? legend.name : 'No legend chosen'}</span>
          <span className="dk-deckcard__row">
            <DomainRow domains={legend?.domains ?? []} />
            <Badge tone={summary.tone}>{summary.validityLabel}</Badge>
          </span>
          <ProgressBar value={percent(completion.percent)} label={`${deck.name} completion`} tone={completion.ready ? 'success' : 'accent'} size="sm" />
          <span className="dk-deckcard__counts">
            {percent(completion.percent)}% complete | Main {counts.main} | Runes {counts.runes} | Battlefields {counts.battlefields}
            {counts.sideboard ? ` | Side ${counts.sideboard}` : ''}
          </span>
          {tags.length ? (
            <span className="dk-deckcard__tags">
              {tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </span>
          ) : null}
          <span className="dk-deckcard__time">Edited {relativeTime(deck.updatedAt, now)}</span>
        </span>
      </Link>
      <Menu
        label={`Actions for ${deck.name}`}
        align="end"
        trigger={(api) => <IconButton icon="more" label={`Actions for ${deck.name}`} variant="ghost" size="sm" className="dk-deckcard__menu" {...api.props} />}
        items={[
          { label: 'Duplicate', icon: 'copy', onSelect: onDuplicate },
          { label: 'Delete', icon: 'trash', danger: true, onSelect: onDelete },
        ]}
      />
    </li>
  );
}
