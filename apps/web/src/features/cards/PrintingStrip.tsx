import { Link } from 'react-router-dom';
import type { Catalog } from '@sc/core';
import { paths } from '../../app/paths';
import { CardImage, cx } from '../../ui';
import { printingNumber, variantLabel } from '../collection/format';
import type { OwnedCount } from '../collection/grouping';

interface PrintingStripProps {
  catalog: Catalog;
  printingKeys: readonly string[];
  currentKey: string;
  counts: Map<string, OwnedCount>;
  /** Query string carried to the other printings so list context (prev/next) survives. */
  contextSearch: string;
}

/** Thumbnail switcher for every printing of a card, with owned counts. */
export function PrintingStrip({ catalog, printingKeys, currentKey, counts, contextSearch }: PrintingStripProps) {
  const printings = printingKeys.map((key) => catalog.printings[key]).filter((printing) => printing !== undefined);
  return (
    <section className="detail-section" aria-labelledby="printings-heading">
      <header className="detail-section__header">
        <h2 id="printings-heading" className="detail-section__title">
          Printings
        </h2>
        <span className="detail-section__meta">{printings.length}</span>
      </header>
      <ul className="printing-strip">
        {printings.map((printing) => {
          const owned = counts.get(printing.printingKey)?.total ?? 0;
          const current = printing.printingKey === currentKey;
          return (
            <li key={printing.printingKey}>
              <Link
                to={paths.card(printing.printingKey) + contextSearch}
                replace
                className={cx('printing-strip__item', current && 'is-current')}
                aria-current={current ? 'true' : undefined}
                aria-label={`${printingNumber(printing)} ${variantLabel(printing)}, ${owned} owned`}
              >
                <span className="printing-strip__thumb">
                  <CardImage src={printing.imageUrl} alt="" rarity={printing.rarity} />
                  {owned > 0 ? <span className="printing-strip__owned">{owned}</span> : null}
                </span>
                <span className="printing-strip__label">{variantLabel(printing)}</span>
                <span className="printing-strip__number">{printingNumber(printing)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
