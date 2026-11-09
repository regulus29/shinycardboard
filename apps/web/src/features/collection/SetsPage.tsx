import { useRequiredCatalog } from '../../data';
import { PlaceholderPage } from '../PlaceholderPage';

/** PLACEHOLDER: phase 2 replaces this file with set completion views. */
export default function SetsPage() {
  const catalog = useRequiredCatalog();
  return (
    <PlaceholderPage
      title="Sets"
      subtitle={`${catalog.sets.length} sets in the catalog`}
      eyebrow="Library"
      illustration="sets"
      message="Set completion bars and missing-card views will appear here."
    />
  );
}
