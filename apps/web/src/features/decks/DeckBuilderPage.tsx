import { useParams } from 'react-router-dom';
import { useDeck } from '../../data';
import { PlaceholderPage } from '../PlaceholderPage';

/** PLACEHOLDER: phase 2 replaces this file. useDeck is undefined while loading, null when missing. */
export default function DeckBuilderPage() {
  const { deckId } = useParams();
  const deck = useDeck(deckId);
  return (
    <PlaceholderPage
      title={deck?.name ?? (deck === null ? 'Deck not found' : 'Deck')}
      eyebrow="Workshop"
      illustration="deck"
      message="The legend-first deck builder will appear here."
    />
  );
}
