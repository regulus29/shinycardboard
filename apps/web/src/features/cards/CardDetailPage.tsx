import { useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { paths } from '../../app/paths';
import { Badge, Button, DomainBadge, EmptyState, RarityBadge, Skeleton } from '../../ui';
import { useDecks, useOwned, useRequiredCatalog } from '../../data';
import { isModalOpen } from '../../ui/useModalLock';
import { dash, printingNumber, variantLabel } from '../collection/format';
import { countOwned } from '../collection/grouping';
import { SCROLL_CONTAINER_ID } from '../collection/constants';
import { listContextSearch, readParams } from '../collection/params';
import { useCollectionResults } from '../collection/useCollectionResults';
import { deckUsage, neighborsOf } from './cardUsage';
import { CardArt } from './CardArt';
import { OwnedEditor } from './OwnedEditor';
import { PrintingStrip } from './PrintingStrip';
import { RulesText } from './RulesText';
import { TagEditor } from './TagEditor';
import './cards.css';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Card detail: art, rules, printings, owned copies editor, tags and deck usage. Route param is the printingKey. */
export default function CardDetailPage() {
  const catalog = useRequiredCatalog();
  const { printingKey = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [search] = useSearchParams();
  const params = readParams(search);
  const contextSearch = useMemo(() => listContextSearch(search), [search]);
  const printing = catalog.printings[printingKey];
  const card = printing ? catalog.cards[printing.cardKey] : undefined;
  const results = useCollectionResults(params);
  const owned = useOwned();
  const decks = useDecks();
  const counts = useMemo(() => countOwned(owned ?? []), [owned]);
  const neighbors = useMemo(() => (results ? neighborsOf(results.flat, printingKey) : null), [results, printingKey]);

  // The shell keeps one scroll container across routes; start each card at the top.
  useEffect(() => {
    document.getElementById(SCROLL_CONTAINER_ID)?.scrollTo({ top: 0 });
  }, [printingKey]);

  const goto = (key: string | null) => key && navigate(paths.card(key) + contextSearch, { replace: true });
  const hasHistory = location.key !== 'default';
  const back = () => (hasHistory ? navigate(-1) : navigate(paths.collection(params.query)));

  // Left and right arrows step through the list the user came from.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target) || isModalOpen()) return;
      if (event.key === 'ArrowLeft') goto(neighbors?.previous ?? null);
      else if (event.key === 'ArrowRight') goto(neighbors?.next ?? null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neighbors, contextSearch]);

  if (!printing || !card) {
    return (
      <div className="page">
        <EmptyState
          illustration="search"
          title="Card not found"
          description="No printing in the catalog matches this address. It may have been renamed or removed."
          action={
            <Button variant="primary" onClick={() => navigate(paths.collection())}>
              Back to collection
            </Button>
          }
        />
      </div>
    );
  }

  const usage = decks ? deckUsage(decks, card.cardKey) : null;
  const ownedHere = counts.get(printingKey);
  const stats = [
    { label: 'Energy', value: dash(card.energy) },
    { label: 'Might', value: dash(card.might) },
    { label: 'Power', value: dash(card.power) },
  ].filter((stat) => stat.value !== '-');

  return (
    <div className="page detail">
      <nav className="detail__nav" aria-label="Card navigation">
        <Button variant="ghost" size="sm" icon="layers" onClick={back}>
          Back to results
        </Button>
        <div className="detail__pager">
          {neighbors ? (
            <span className="detail__position" aria-live="polite">
              {neighbors.index + 1} of {neighbors.total.toLocaleString()}
            </span>
          ) : null}
          <Button variant="secondary" size="sm" aria-label="Previous card" disabled={!neighbors?.previous} onClick={() => goto(neighbors?.previous ?? null)}>
            Previous
          </Button>
          <Button variant="secondary" size="sm" aria-label="Next card" disabled={!neighbors?.next} onClick={() => goto(neighbors?.next ?? null)}>
            Next
          </Button>
        </div>
      </nav>

      <div className="detail__layout">
        <div className="detail__art">
          <CardArt src={printing.imageUrl} alt={card.name} rarity={printing.rarity} foil={(ownedHere?.foil ?? 0) > 0} />
        </div>

        <div className="detail__main">
          <header className="detail__header">
            <p className="page__eyebrow">
              {printing.setLabel} - {printingNumber(printing)}
            </p>
            <h1 className="detail__title">{card.name}</h1>
            <div className="detail__badges">
              <RarityBadge rarity={printing.rarity} />
              {printing.variant !== 'standard' ? <Badge tone="accent">{variantLabel(printing)}</Badge> : null}
              {card.domains.map((domain) => (
                <DomainBadge key={domain} domain={domain} />
              ))}
              <Badge>{[card.supertype, card.type].filter(Boolean).join(' ')}</Badge>
            </div>
          </header>

          {stats.length > 0 ? (
            <dl className="detail__stats">
              {stats.map((stat) => (
                <div key={stat.label} className="detail__stat">
                  <dt>{stat.label}</dt>
                  <dd>{stat.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {card.rulesText ? <div className="detail__rules">
              <RulesText text={card.rulesText} />
            </div> : null}
          {card.keywords.length > 0 ? (
            <ul className="detail__keywords" aria-label="Keywords">
              {card.keywords.map((keyword) => (
                <li key={keyword}>
                  <Badge tone="info">{keyword}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
          {printing.artist ? <p className="detail__artist">Illustrated by {printing.artist}</p> : null}

          <PrintingStrip catalog={catalog} printingKeys={card.printingKeys} currentKey={printingKey} counts={counts} contextSearch={contextSearch} />
          <OwnedEditor key={printingKey} printingKey={printingKey} cardName={card.name} />
          <TagEditor key={card.cardKey} cardKey={card.cardKey} />

          <section className="detail-section" aria-labelledby="decks-heading">
            <header className="detail-section__header">
              <h2 id="decks-heading" className="detail-section__title">
                Used in decks
              </h2>
            </header>
            {usage === null ? (
              <Skeleton height="2.5rem" />
            ) : usage.length === 0 ? (
              <p className="detail-section__empty">Not in any deck yet.</p>
            ) : (
              <ul className="deck-usage">
                {usage.map((entry) => (
                  <li key={entry.deckId}>
                    <Link to={paths.deck(entry.deckId)} className="deck-usage__link">
                      <span>{entry.name}</span>
                      <Badge>x{entry.count}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
