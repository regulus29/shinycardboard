import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CatalogGate, CatalogProvider, db, saveDeck, setOwnedQuantity } from '../../data';
import { ToastProvider } from '../../ui';
import { resetDb } from '../../test/helpers';
import DeckBuilderPage from './DeckBuilderPage';
import DecksPage from './DecksPage';
import { makeTestCatalog, TEST_CARDS } from './testCatalog';
import { DRAFT_STORAGE_PREFIX } from './constants';

const catalog = makeTestCatalog();
const SAVE_WAIT = { timeout: 4000 };

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <CatalogProvider load={async () => catalog}>
        <MemoryRouter initialEntries={[path]}>
          <CatalogGate>
            <Routes>
              <Route path="/decks" element={<DecksPage />} />
              <Route path="/decks/:deckId" element={<DeckBuilderPage />} />
            </Routes>
          </CatalogGate>
        </MemoryRouter>
      </CatalogProvider>
    </ToastProvider>,
  );
}

async function own(cardKey: string, quantity: number) {
  await setOwnedQuantity({ printingKey: `${cardKey}-std` }, quantity);
}

async function ownFuryPool() {
  for (const card of TEST_CARDS.filter((c) => c.domains.includes('Fury') || c.type === 'Battlefield')) {
    await own(card.cardKey, card.type === 'Rune' ? 12 : 3);
  }
  await own('vi-legend', 1);
}

async function storedDeck(id: string) {
  return db.decks.get(id);
}

beforeEach(async () => {
  localStorage.clear();
  await resetDb();
});

describe('decks page', () => {
  it('shows guidance when there are no decks and creates a deck from a legend', async () => {
    const user = userEvent.setup();
    renderAt('/decks');
    expect(await screen.findByText('Build your first deck')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose a legend' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose a legend' });
    await user.click(within(dialog).getByRole('button', { name: /Vi, Piltover Enforcer/ }));
    await waitFor(async () => expect(await db.decks.count()).toBe(1), SAVE_WAIT);
    const [deck] = await db.decks.toArray();
    expect(deck?.legendKey).toBe('vi-legend');
    expect(deck?.name).toBe('Vi deck');
    expect(await screen.findByLabelText('Deck name')).toHaveValue('Vi deck');
  });

  it('lists decks with validity and filters them by name or tag', async () => {
    await saveDeck({ name: 'Burn', legendKey: 'vi-legend', tags: ['aggro'] });
    await saveDeck({ name: 'Slow', legendKey: 'jinx-legend' });
    const user = userEvent.setup();
    renderAt('/decks');
    expect(await screen.findByRole('link', { name: 'Burn' })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search decks' }), 'aggro');
    expect(screen.queryByRole('link', { name: 'Slow' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Burn' })).toBeInTheDocument();
  });

  it('ranks legends from the collection and starts a deck from one', async () => {
    await ownFuryPool();
    await saveDeck({ name: 'Existing' });
    const user = userEvent.setup();
    renderAt('/decks?tab=discover');
    const panel = await screen.findByRole('region', { name: 'What can I build?' });
    const start = await within(panel).findByRole('button', { name: 'Start from Vi, Piltover Enforcer' });
    await user.click(start);
    await waitFor(async () => expect((await db.decks.toArray()).some((d) => d.legendKey === 'vi-legend')).toBe(true), SAVE_WAIT);
  });

  it('previews and saves an imported deck list', async () => {
    const user = userEvent.setup();
    renderAt('/decks');
    await user.click(await screen.findByRole('button', { name: 'Import' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import a deck' });
    fireEvent.change(within(dialog).getByLabelText('Deck list'), {
      target: { value: 'Legend\n1 Vi, Piltover Enforcer\nChampion\n1 Vi, Destructive\nMain Deck\n3 Fury Unit 1\n2 Not A Real Card' },
    });
    expect(await within(dialog).findByText(/unmatched/)).toBeInTheDocument();
    expect(within(dialog).getByText('Vi, Destructive')).toBeInTheDocument();
    expect(within(within(dialog).getByLabelText('Unmatched lines')).getByText(/Not A Real Card/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save as new deck' }));
    await waitFor(async () => expect(await db.decks.count()).toBe(1), SAVE_WAIT);
    const [deck] = await db.decks.toArray();
    expect(deck?.chosenChampionKey).toBe('vi-champ');
    expect(deck?.main.find((s) => s.cardKey === 'fury-unit-1')?.count).toBe(3);
  });

  it('logs wins and losses from the deck menu and shows the record', async () => {
    await saveDeck({ name: 'Record', legendKey: 'vi-legend' });
    const user = userEvent.setup();
    renderAt('/decks');
    expect(await screen.findByText('No games yet')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Actions for Record' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Log a win' }));
    expect(await screen.findByText('1-0 (100%)')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Actions for Record' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Log a loss' }));
    expect(await screen.findByText('1-1 (50%)')).toBeInTheDocument();
    const undos = await screen.findAllByRole('button', { name: 'Undo' });
    await user.click(undos[undos.length - 1]!);
    expect(await screen.findByText('1-0 (100%)')).toBeInTheDocument();
  });

  it('keeps suggestions off the deck list', async () => {
    await ownFuryPool();
    await saveDeck({ name: 'Existing' });
    renderAt('/decks');
    await screen.findByRole('link', { name: 'Existing' });
    expect(screen.queryByRole('region', { name: 'What can I build?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Start here' })).not.toBeInTheDocument();
  });

  it('deletes a deck and offers undo', async () => {
    await saveDeck({ name: 'Doomed', legendKey: 'vi-legend' });
    const user = userEvent.setup();
    renderAt('/decks');
    await user.click(await screen.findByRole('button', { name: 'Actions for Doomed' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Doomed' })).not.toBeInTheDocument());
    expect((await db.decks.toArray()).every((d) => d.deleted)).toBe(true);
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('link', { name: 'Doomed' })).toBeInTheDocument();
    expect((await db.decks.toArray()).every((d) => !d.deleted)).toBe(true);
  });
});

describe('deck builder', () => {
  async function openBuilder(name = 'Builder test', legendKey: string | undefined = 'vi-legend') {
    const deck = await saveDeck({ name, legendKey });
    const user = userEvent.setup();
    const view = renderAt(`/decks/${deck.id}`);
    await screen.findByLabelText('Deck name');
    return { deck, user, view };
  }

  const tab = (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }));

  it('shows a not found state for a missing deck', async () => {
    renderAt('/decks/nope');
    expect(await screen.findByText('Deck not found')).toBeInTheDocument();
  });

  it('adds cards up to the copy limit and updates the summary', async () => {
    await ownFuryPool();
    const { user, deck, view } = await openBuilder();
    await tab(user, 'Pool');
    const add = () => screen.getByRole('button', { name: /^Add Fury Unit 1/ });
    for (let i = 0; i < 4; i++) await user.click(add());
    expect(screen.getByLabelText('Fury Unit 1 count')).toHaveTextContent('3');
    expect(add()).toHaveAttribute('aria-disabled', 'true');
    expect(add()).toHaveAccessibleName(/Copy limit reached/);
    expect(screen.getByRole('region', { name: 'Deck summary' })).toHaveTextContent('Main 3/40');
    view.unmount();
    await waitFor(async () => expect((await storedDeck(deck.id))?.main).toEqual([{ cardKey: 'fury-unit-1', count: 3 }]), SAVE_WAIT);
  });

  it('removes a card with the stepper in the deck pane', async () => {
    await ownFuryPool();
    const deck = await saveDeck({ name: 'Has cards', legendKey: 'vi-legend', main: [{ cardKey: 'fury-unit-2', count: 2 }] });
    const user = userEvent.setup();
    renderAt(`/decks/${deck.id}`);
    await screen.findByLabelText('Deck name');
    await user.click(await screen.findByRole('button', { name: 'Remove Fury Unit 2' }));
    expect(screen.getByLabelText('Fury Unit 2 count')).toHaveTextContent('1');
    expect(screen.getByRole('region', { name: 'Deck summary' })).toHaveTextContent('Main 1/40');
  });

  it('owned only hides unowned cards and All cards marks them and counts them as missing', async () => {
    await own('fury-unit-1', 1);
    const { user } = await openBuilder();
    await tab(user, 'Pool');
    expect(await screen.findByRole('button', { name: 'Quick add Fury Unit 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quick add Fury Unit 2' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'All cards' }));
    expect(await screen.findByRole('button', { name: 'Quick add Fury Unit 2' })).toBeInTheDocument();
    expect(screen.getAllByText('Not owned').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Add Fury Unit 2' }));
    await tab(user, 'Insights');
    const missing = await screen.findByRole('list', { name: 'Missing cards' });
    expect(within(missing).getByText('Fury Unit 2')).toBeInTheDocument();
  });

  it('applies the search query language on top of the legal pool', async () => {
    await ownFuryPool();
    const { user } = await openBuilder();
    await tab(user, 'Pool');
    await user.type(screen.getByRole('searchbox', { name: 'Search card pool' }), 'cost:3');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Quick add Fury Unit 1' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Quick add Fury Unit 3' })).toBeInTheDocument();
  });

  it('chooses a champion, adds it to the main deck and saves on unmount', async () => {
    await ownFuryPool();
    const { user, deck, view } = await openBuilder();
    await user.selectOptions(screen.getByLabelText('Chosen champion'), 'vi-champ');
    expect(screen.getByRole('region', { name: 'Deck summary' })).toHaveTextContent('Main 1/40');
    view.unmount();
    await waitFor(async () => expect((await storedDeck(deck.id))?.chosenChampionKey).toBe('vi-champ'), SAVE_WAIT);
    expect((await storedDeck(deck.id))?.main).toEqual([{ cardKey: 'vi-champ', count: 1 }]);
  });

  it('fills from the collection', async () => {
    await ownFuryPool();
    const { user, deck, view } = await openBuilder();
    await tab(user, 'Insights');
    await user.click((await screen.findAllByRole('button', { name: /^Fill from my collection/ }))[0] as HTMLElement);
    view.unmount();
    await waitFor(async () => expect((await storedDeck(deck.id))?.main.length).toBeGreaterThan(3), SAVE_WAIT);
    expect((await storedDeck(deck.id))?.runes.reduce((n, s) => n + s.count, 0)).toBe(12);
  });

  it('shows the call to action when no owned champion fits', async () => {
    await own('fury-unit-1', 3);
    await own('fury-unit-2', 3);
    const { user } = await openBuilder();
    await tab(user, 'Insights');
    expect(await screen.findByText('No owned champion fits this legend.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Browse champions' }).length).toBeGreaterThan(0);
  });

  it('shows what becomes illegal before changing the legend', async () => {
    const deck = await saveDeck({ name: 'Switcher', legendKey: 'vi-legend', main: [{ cardKey: 'fury-unit-1', count: 2 }] });
    const user = userEvent.setup();
    const view = renderAt(`/decks/${deck.id}`);
    await screen.findByLabelText('Deck name');
    await user.click(screen.getByRole('button', { name: /Change legend/ }));
    const picker = await screen.findByRole('dialog', { name: 'Change legend' });
    await user.click(within(picker).getByRole('button', { name: /Jinx, Loose Cannon/ }));
    const confirm = await screen.findByRole('dialog', { name: /Switch to Jinx/ });
    expect(within(confirm).getByText(/Fury Unit 1/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Remove illegal cards' }));
    view.unmount();
    await waitFor(async () => expect((await storedDeck(deck.id))?.legendKey).toBe('jinx-legend'), SAVE_WAIT);
    expect((await storedDeck(deck.id))?.main).toEqual([]);
  });

  it('autosaves edits after a pause and shows the saved indicator', async () => {
    const { user, deck } = await openBuilder();
    const name = screen.getByLabelText('Deck name');
    await user.clear(name);
    await user.type(name, 'Renamed');
    await waitFor(async () => expect((await storedDeck(deck.id))?.name).toBe('Renamed'), SAVE_WAIT);
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument(), SAVE_WAIT);
  });

  it('exports the deck list as text', async () => {
    const deck = await saveDeck({ name: 'Export me', legendKey: 'vi-legend', main: [{ cardKey: 'fury-unit-1', count: 3 }] });
    const user = userEvent.setup();
    renderAt(`/decks/${deck.id}`);
    await screen.findByLabelText('Deck name');
    await user.click(screen.getByRole('button', { name: 'Deck actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Export deck list' }));
    const dialog = await screen.findByRole('dialog', { name: 'Export deck list' });
    expect((within(dialog).getByLabelText('Deck list') as HTMLTextAreaElement).value).toContain('3 Fury Unit 1');
  });

  it('does not double count a copy that two decks compete for', async () => {
    await own('fury-unit-1', 3);
    await own('vi-legend', 1);
    const a = await saveDeck({ name: 'Deck A', legendKey: 'vi-legend', main: [{ cardKey: 'fury-unit-1', count: 3 }] });
    await saveDeck({ name: 'Deck B', legendKey: 'vi-legend', main: [{ cardKey: 'fury-unit-1', count: 3 }] });
    const user = userEvent.setup();
    renderAt(`/decks/${a.id}`);
    await screen.findByLabelText('Deck name');
    await tab(user, 'Insights');
    // 3 copies of the unit plus the single legend are each wanted by both decks: 6 + 2 wanted, 3 + 1 owned.
    expect(await screen.findByText(/covers every card, but 4 copies are shared with other decks/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Missing cards' })).not.toBeInTheDocument();
  });

  it('restores a newer unsaved copy left in local storage', async () => {
    const deck = await saveDeck({ name: 'Old name', legendKey: 'vi-legend' });
    localStorage.setItem(DRAFT_STORAGE_PREFIX + deck.id, JSON.stringify({ deck: { ...deck, name: 'Rescued name' }, savedAt: deck.updatedAt + 1000 }));
    renderAt(`/decks/${deck.id}`);
    expect(await screen.findByDisplayValue('Rescued name')).toBeInTheDocument();
  });

  it('lists the unverified rules in the Rules popover', async () => {
    const { user } = await openBuilder();
    await user.click(screen.getByRole('button', { name: /^Rules/ }));
    const popover = await screen.findByRole('dialog', { name: 'Rules and sources' });
    expect(within(popover).getAllByText('unverified').length).toBeGreaterThan(0);
  });
});
