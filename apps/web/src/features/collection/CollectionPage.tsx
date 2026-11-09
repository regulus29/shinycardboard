import { useSearchParams } from 'react-router-dom';
import { QUERY_PARAM } from '../../config/constants';
import { useOwned, useRequiredCatalog } from '../../data';
import { PlaceholderPage } from '../PlaceholderPage';

/** PLACEHOLDER: phase 2 replaces this file. Reads the omnibox query from `?q=`. */
export default function CollectionPage() {
  const catalog = useRequiredCatalog();
  const owned = useOwned() ?? [];
  const [params] = useSearchParams();
  const query = params.get(QUERY_PARAM);
  const cardCount = Object.keys(catalog.printings).length;
  const copies = owned.reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <PlaceholderPage
      title="Collection"
      subtitle={`${cardCount.toLocaleString()} printings in the catalog, ${copies.toLocaleString()} copies owned`}
      eyebrow="Library"
      illustration={query ? "search" : "cards"}
      message={
        query
          ? `Search results for "${query}" will appear here.`
          : 'Your cards, searchable by anything, will live here. Use the search bar above to get started.'
      }
    />
  );
}
