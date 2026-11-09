import { useParams } from 'react-router-dom';
import { useRequiredCatalog } from '../../data';
import { PlaceholderPage } from '../PlaceholderPage';

/** PLACEHOLDER: phase 2 replaces this file. The route param is the printingKey. */
export default function CardDetailPage() {
  const catalog = useRequiredCatalog();
  const { printingKey = '' } = useParams();
  const printing = catalog.printings[printingKey];
  const card = printing ? catalog.cards[printing.cardKey] : undefined;

  return (
    <PlaceholderPage
      title={card?.name ?? 'Card not found'}
      subtitle={printing ? `${printing.setLabel} #${printing.collectorNumber}` : printingKey}
      eyebrow="Card"
      illustration={card ? "cards" : "search"}
      message={
        card
          ? 'Large art, all printings, owned copies, tags and deck usage will appear here.'
          : 'No printing in the catalog matches this address.'
      }
    />
  );
}
