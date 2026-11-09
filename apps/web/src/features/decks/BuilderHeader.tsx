import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { paths } from '../../app/paths';
import { Badge, Button, Chip, Drawer, Icon, IconButton, Menu, Select, TextField } from '../../ui';
import type { SaveStatus } from './autosave';
import { useBuilder } from './builderContext';
import { CHAMPION_SELECT_ID, FOCUS_CHAMPION_EVENT, MAX_DECK_NAME_LENGTH, MAX_TAGS_PER_DECK, MAX_TAG_LENGTH, SECTION_SHORT } from './constants';
import { championChoices, chooseChampion, effectiveChampion, withValidChampion } from './deckModel';
import { addTagTo } from './deckPatch';
import { validity } from './insightsModel';
import { DomainRow } from './LegendArt';
import { RulesPopover } from './RulesPopover';

const SAVE_TEXT: Record<SaveStatus, string> = {
  idle: 'Saved',
  pending: 'Unsaved changes',
  saving: 'Saving...',
  saved: 'Saved',
  error: 'Save failed',
};

export function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  return (
    <span className={`dk-save is-${status}`} role="status" aria-live="polite">
      <Icon name={status === 'error' ? 'alert' : status === 'saving' || status === 'pending' ? 'sync' : 'check'} />
      <span className="dk-save__text">{SAVE_TEXT[status]}</span>
      {status === 'error' ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </span>
  );
}

/** "Main 40/40 | Runes 12/12 | BF 3/3" for the pinned bar and the header. */
export function countsText(completion: { sections: { section: string; count: number; target: number }[] }, withLegend = true): string {
  const short: Record<string, string> = { legend: 'Legend', ...SECTION_SHORT, battlefields: 'BF' };
  return completion.sections
    .filter((s) => (s.section !== 'sideboard' || s.count > 0) && (withLegend || s.section !== 'legend'))
    .map((s) => `${short[s.section] ?? s.section} ${s.count}/${s.target || s.count}`)
    .join(' | ');
}

function TagEditor() {
  const { deck, edit } = useBuilder();
  const [draft, setDraft] = useState('');
  const tags = deck.tags ?? [];
  const commit = () => {
    edit((d) => ({ ...d, tags: addTagTo(d.tags ?? [], draft, MAX_TAGS_PER_DECK, MAX_TAG_LENGTH) }));
    setDraft('');
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    commit();
  };
  return (
    <div className="dk-tags">
      <TextField label="Add a tag" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKey} onBlur={() => draft.trim() && commit()} placeholder="aggro, budget, event" maxLength={MAX_TAG_LENGTH} />
      <div className="dk-tags__list">
        {tags.map((tag) => (
          <Chip key={tag} removeLabel={`Remove tag ${tag}`} onRemove={() => edit((d) => ({ ...d, tags: (d.tags ?? []).filter((t) => t !== tag) }))}>
            {tag}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function NotesAndTags() {
  const { deck, edit } = useBuilder();
  return (
    <div className="dk-header__details">
      <label className="dk-label" htmlFor="dk-notes">
        Notes
      </label>
      <textarea id="dk-notes" className="dk-textarea" rows={3} value={deck.notes ?? ''} onChange={(event) => edit((d) => ({ ...d, notes: event.target.value }))} placeholder="Game plan, sideboard plans, upgrades to buy" />
      <TagEditor />
    </div>
  );
}

/** Chosen champion control. Shows the champion the rules will use even when none was picked explicitly. */
function ChampionSelect() {
  const { deck, edit, legend, catalog, rules } = useBuilder();
  const sane = withValidChampion(deck, catalog, rules);
  const effective = effectiveChampion(deck, catalog, rules);
  const chosen = catalog.cards[sane.chosenChampionKey ?? ''];
  const choices = championChoices(legend, catalog, chosen, rules);
  const implicit = !sane.chosenChampionKey && effective !== undefined;
  const options = [
    { value: '', label: choices.length || !legend ? 'Chosen champion: none' : 'No champion found' },
    ...choices.map((card) => ({ value: card.cardKey, label: implicit && card.cardKey === effective?.cardKey ? `${card.name} (from main deck)` : card.name })),
  ];
  return (
    <div className="dk-champion">
      <Select
        id={CHAMPION_SELECT_ID}
        label="Chosen champion"
        hideLabel
        size="sm"
        disabled={!legend}
        value={sane.chosenChampionKey ?? effective?.cardKey ?? ''}
        onValueChange={(key) => edit((d) => chooseChampion(d, catalog, key ? catalog.cards[key] : undefined, rules))}
        options={options}
      />
    </div>
  );
}

interface BuilderHeaderProps {
  status: SaveStatus;
  phone: boolean;
  onRetry: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
  /** Two pane layout: opens the insights drawer. */
  onOpenInsights?: () => void;
}

/** Name, legend, champion, details and actions. On phones the extras move into a sheet. */
export function BuilderHeader({ status, phone, onRetry, onDuplicate, onExport, onDelete, onOpenInsights }: BuilderHeaderProps) {
  const b = useBuilder();
  const { deck, edit, legend, issues, completion } = b;
  const [details, setDetails] = useState(false);
  const [name, setName] = useState(deck.name);
  const state = validity(issues);

  useEffect(() => setName(deck.name), [deck.name]);

  useEffect(() => {
    const reveal = () => {
      if (phone) setDetails(true);
      window.setTimeout(() => document.getElementById(CHAMPION_SELECT_ID)?.focus(), 50);
    };
    window.addEventListener(FOCUS_CHAMPION_EVENT, reveal);
    return () => window.removeEventListener(FOCUS_CHAMPION_EVENT, reveal);
  }, [phone]);

  return (
    <header className="dk-header">
      <div className="dk-header__top">
        <Link to={paths.decks()} className="dk-back" aria-label="Back to decks">
          <Icon name="chevron-left" />
        </Link>
        <div className="dk-header__name">
          <TextField
            label="Deck name"
            hideLabel
            value={name}
            maxLength={MAX_DECK_NAME_LENGTH}
            onChange={(event) => {
              setName(event.target.value);
              edit((d) => ({ ...d, name: event.target.value }));
            }}
            placeholder="Deck name"
          />
        </div>
        <SaveIndicator status={status} onRetry={onRetry} />
        <Menu
          label="Deck actions"
          align="end"
          trigger={(api) => <IconButton icon="more" label="Deck actions" variant="ghost" {...api.props} />}
          items={[
            { label: 'Duplicate deck', icon: 'copy', onSelect: onDuplicate },
            { label: 'Export deck list', icon: 'download', onSelect: onExport },
            { label: 'Delete deck', icon: 'trash', danger: true, onSelect: onDelete },
          ]}
        />
      </div>
      <div className="dk-header__meta">
        <Button variant="secondary" size="sm" className="dk-legend-btn" onClick={b.openLegendPicker} aria-label={`Legend: ${legend ? legend.name : 'none'}. Change legend`}>
          <span className="dk-legend-btn__label">Legend</span>
          <span className="dk-legend-btn__name">{legend ? legend.name : 'Choose a legend'}</span>
        </Button>
        {legend && !phone ? <DomainRow domains={legend.domains} /> : null}
        {phone ? (
          <Button variant="ghost" size="sm" icon="settings" aria-expanded={details} onClick={() => setDetails(true)}>
            Details
          </Button>
        ) : (
          <>
            <ChampionSelect />
            <Badge tone={state.tone}>{state.label}</Badge>
            <span className="dk-header__counts">{countsText(completion)}</span>
            <span className="dk-header__spacer" />
            {onOpenInsights ? (
              <Button variant="secondary" size="sm" icon="sparkles" onClick={onOpenInsights}>
                Insights
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" icon="edit" aria-expanded={details} onClick={() => setDetails((v) => !v)}>
              Notes and tags
            </Button>
            <RulesPopover />
          </>
        )}
      </div>
      {!phone && details ? <NotesAndTags /> : null}
      {phone ? (
        <Drawer open={details} onClose={() => setDetails(false)} title="Deck details" description="Champion, notes, tags and rules.">
          <div className="dk-sheet">
            <div>
              <label className="dk-label" htmlFor={CHAMPION_SELECT_ID}>
                Chosen champion
              </label>
              <ChampionSelect />
            </div>
            <NotesAndTags />
            <RulesPopover />
          </div>
        </Drawer>
      ) : null}
    </header>
  );
}
