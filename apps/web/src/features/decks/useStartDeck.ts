import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRequiredCatalog, saveDeck } from '../../data';
import { paths } from '../../app/paths';
import { defaultDeckName } from './listModel';

/** Create a deck around a legend and open it in the builder. */
export function useStartDeck(): (legendKey: string) => Promise<void> {
  const catalog = useRequiredCatalog();
  const navigate = useNavigate();
  return useCallback(
    async (legendKey: string) => {
      const legend = catalog.cards[legendKey];
      const deck = await saveDeck({ name: legend ? defaultDeckName(legend) : undefined, legendKey });
      navigate(paths.deck(deck.id));
    },
    [catalog, navigate],
  );
}
