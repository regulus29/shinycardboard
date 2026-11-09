import { Badge, Button, Icon, useToast } from '../../ui';
import { applySuggestions } from './assistModel';
import { useBuilder } from './builderContext';
import { copyText } from './clipboard';
import { BUYABLE_PREVIEW_LIMIT, SECTION_LABELS } from './constants';
import { acquireList, fillTotal } from './insightsModel';

/** Every suggestion from the collection and the buy list. The next step card above shows only the best one. */
export function AssistPanel() {
  const { catalog, rules, edit, legend, assist } = useBuilder();
  const toast = useToast();
  const { picks, marker, buy, showBuy, setShowBuy, browseChampions } = assist;
  const nameOf = (key: string) => catalog.cards[key]?.name ?? key;

  const copyBuy = async () => {
    const ok = await copyText(acquireList(buy, catalog));
    toast.show({ title: ok ? 'Buy list copied' : 'Could not copy', tone: ok ? 'success' : 'danger' });
  };

  return (
    <details className="dk-panel dk-fold" open={showBuy || undefined}>
      <summary className="dk-fold__summary">
        <span className="dk-panel__title">All suggestions</span>
        <span className="dk-muted">{picks.length > 0 ? `${fillTotal(picks)} cards from your collection` : 'nothing to fill'}</span>
      </summary>
      <div className="dk-fold__body">
        {picks.length > 0 ? (
          <Button size="sm" icon="sparkles" onClick={() => edit((d) => applySuggestions(d, catalog, picks, rules))}>
            Fill from my collection ({fillTotal(picks)})
          </Button>
        ) : null}
        {!legend ? <p className="dk-muted">Choose a legend to get suggestions from your collection.</p> : null}
        {marker ? (
          <div className="dk-callout dk-callout--action" role="status">
            <Icon name="alert" />
            <div>
              <strong>No owned champion fits this legend.</strong>
              <p className="dk-muted">{marker.reason}</p>
              <div className="dk-actions">
                <Button size="sm" variant="secondary" onClick={browseChampions}>
                  Browse champions
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setShowBuy(true)}>
                  See the cheapest to buy
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {legend && picks.length === 0 && !marker ? <p className="dk-muted">Nothing more to add from your collection.</p> : null}
        {picks.length > 0 ? (
          <ul className="dk-suggest" aria-label="Suggestions from your collection">
            {picks.map((s) => (
              <li key={`${s.section}-${s.cardKey}`} className="dk-suggest__item">
                <div className="dk-suggest__text">
                  <span className="dk-suggest__name">
                    {s.count} x {nameOf(s.cardKey)} {s.role === 'chosen-champion' ? <Badge tone="accent">Champion</Badge> : null}
                  </span>
                  <span className="dk-muted">
                    {SECTION_LABELS[s.section]}: {s.reason}
                  </span>
                </div>
                <Button variant="secondary" size="sm" aria-label={`Add ${s.count} ${nameOf(s.cardKey)}`} onClick={() => edit((d) => applySuggestions(d, catalog, [s], rules))}>
                  Add
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="dk-buy">
          <h3 className="dk-subhead">What to buy to finish</h3>
          {!showBuy ? (
            <Button variant="secondary" size="sm" icon="bookmark" disabled={!legend} onClick={() => setShowBuy(true)}>
              Show what to buy
            </Button>
          ) : buy.length === 0 ? (
            <p className="dk-muted">Your collection can already finish this deck.</p>
          ) : (
            <>
              <ul className="dk-suggest" aria-label="Cards to buy">
                {buy.slice(0, BUYABLE_PREVIEW_LIMIT).map((s) => (
                  <li key={`${s.section}-${s.cardKey}`} className="dk-suggest__item">
                    <div className="dk-suggest__text">
                      <span className="dk-suggest__name">
                        {s.count} x {nameOf(s.cardKey)}
                      </span>
                      <span className="dk-muted">{s.reason}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <Button variant="secondary" size="sm" icon="copy" onClick={() => void copyBuy()}>
                Copy buy list
              </Button>
              <p className="dk-muted">Ordered by rarity, no prices.</p>
            </>
          )}
        </div>
      </div>
    </details>
  );
}
