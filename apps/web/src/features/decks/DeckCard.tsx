import type { Catalog } from '@sc/core';
import { paths } from '../../app/paths';
import { Badge, CardTile, IconButton, Menu } from '../../ui';
import { percent } from './insightsModel';
import type { DeckSummary } from './listModel';
import { recordLabel, type GameResult } from './recordModel';

interface DeckCardProps {
  summary: DeckSummary;
  catalog: Catalog;
  onLogGame: (result: GameResult) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** A deck shown like a collection card: the legend art, then validity, completion and win record. */
export function DeckCard({ summary, catalog, onLogGame, onDuplicate, onDelete }: DeckCardProps) {
  const { deck, legend, completion } = summary;
  const printing = legend ? catalog.printings[legend.printingKeys[0] ?? ''] : undefined;
  return (
    <li className="dk-deckcard">
      <CardTile
        card={{ name: deck.name, domains: legend?.domains ?? [] }}
        printing={{ imageUrl: printing?.imageUrl ?? '', rarity: printing?.rarity ?? 'common', variantLabel: printing?.variantLabel ?? '' }}
        subtitle={legend ? legend.name : 'No legend chosen'}
        to={paths.deck(deck.id)}
        footer={
          <div className="dk-deckcard__foot">
            <span className="dk-deckcard__status">
              <Badge tone={summary.tone}>{summary.validityLabel}</Badge>
              <span className="dk-deckcard__percent">{percent(completion.percent)}% complete</span>
            </span>
            <span className="dk-deckcard__record">{recordLabel(deck)}</span>
          </div>
        }
      />
      <Menu
        label={`Actions for ${deck.name}`}
        align="end"
        trigger={(api) => <IconButton icon="more" label={`Actions for ${deck.name}`} variant="ghost" size="sm" className="dk-deckcard__menu" {...api.props} />}
        items={[
          { label: 'Log a win', icon: 'check', onSelect: () => onLogGame('wins') },
          { label: 'Log a loss', icon: 'minus', onSelect: () => onLogGame('losses') },
          { label: 'Duplicate', icon: 'copy', onSelect: onDuplicate },
          { label: 'Delete', icon: 'trash', danger: true, onSelect: onDelete },
        ]}
      />
    </li>
  );
}
