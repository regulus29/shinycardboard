/** Win and loss record helpers for a deck. */
import type { Deck } from '@sc/core';

export type GameResult = 'wins' | 'losses';

export function gamesPlayed(deck: Pick<Deck, 'wins' | 'losses'>): number {
  return (deck.wins ?? 0) + (deck.losses ?? 0);
}

/** Win share as a whole percent, or undefined when no games are logged. */
export function winPercent(deck: Pick<Deck, 'wins' | 'losses'>): number | undefined {
  const games = gamesPlayed(deck);
  return games === 0 ? undefined : Math.round(((deck.wins ?? 0) / games) * 100);
}

/** "5-2 (71%)" or a plain note when nothing is logged yet. */
export function recordLabel(deck: Pick<Deck, 'wins' | 'losses'>): string {
  const percent = winPercent(deck);
  return percent === undefined ? 'No games yet' : `${deck.wins ?? 0}-${deck.losses ?? 0} (${percent}%)`;
}
