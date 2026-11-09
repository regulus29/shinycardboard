import { useDecks } from '../../data';
import { PlaceholderPage } from '../PlaceholderPage';

/** PLACEHOLDER: phase 2 replaces this file with the deck list. */
export default function DecksPage() {
  const decks = useDecks() ?? [];
  return (
    <PlaceholderPage
      title="Decks"
      subtitle={decks.length === 1 ? '1 deck' : `${decks.length} decks`}
      eyebrow="Workshop"
      illustration="deck"
      message="Build legend-first decks with live validation from your collection."
    />
  );
}
