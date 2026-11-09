import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { db, saveDeck, setOwnedQuantity } from '../../data';
import { resetDb } from '../../test/helpers';
import { KEYS, LocationProbe, mockViewport, renderApp } from '../collection/testFixture';
import CardDetailPage from './CardDetailPage';

function renderDetail(path: string) {
  return renderApp(
    <>
      <Routes>
        <Route path="/card/:printingKey" element={<CardDetailPage />} />
        <Route path="/collection" element={<p>Collection list</p>} />
      </Routes>
      <LocationProbe />
    </>,
    path,
  );
}

const rowId = (finish: string, condition: string) => `${KEYS.vi}|${finish}|${condition}`;

beforeEach(async () => {
  mockViewport(true);
  await resetDb();
});

describe('CardDetailPage', () => {
  it('shows the card, its stats, rules text and every printing with owned badges', async () => {
    await setOwnedQuantity({ printingKey: KEYS.viAlt }, 2);
    renderDetail(`/card/${KEYS.vi}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Vi Brawler' })).toBeInTheDocument();
    expect(screen.getByText('Vi Brawler rules text.')).toBeInTheDocument();
    expect(screen.getByText('Energy')).toBeInTheDocument();
    const alt = await screen.findByRole('link', { name: /Alternate Art, 2 owned/ });
    expect(alt).toHaveAttribute('href', `/card/${KEYS.viAlt}`);
  });

  it('writes owned rows from the editor: first copy, new finish and condition, quantity, notes, removal', async () => {
    const user = userEvent.setup({ delay: null });
    renderDetail(`/card/${KEYS.vi}`);
    await user.click(await screen.findByRole('button', { name: 'Add one copy' }));
    await waitFor(async () => expect((await db.owned.get(rowId('normal', 'NM')))?.quantity).toBe(1));

    const rowGroup = await screen.findByRole('group', { name: 'Quantity of Vi Brawler (Normal NM)' });
    await user.click(within(rowGroup).getByRole('button', { name: 'Increase' }));
    await waitFor(async () => expect((await db.owned.get(rowId('normal', 'NM')))?.quantity).toBe(2));

    await user.click(screen.getByRole('button', { name: 'Add finish or condition' }));
    await user.selectOptions(screen.getByLabelText('Finish'), 'foil');
    await user.selectOptions(screen.getByLabelText('Condition'), 'LP');
    await user.click(within(screen.getByRole('group', { name: 'Quantity to add' })).getByRole('button', { name: 'Increase' }));
    await user.click(screen.getByRole('button', { name: 'Add row' }));
    await waitFor(async () => expect((await db.owned.get(rowId('foil', 'LP')))?.quantity).toBe(2));

    const notes = await screen.findByRole('textbox', { name: 'Notes for Foil LP' });
    await user.type(notes, 'signed');
    await user.tab();
    await waitFor(async () => expect((await db.owned.get(rowId('foil', 'LP')))?.notes).toBe('signed'));
    expect((await db.owned.get(rowId('foil', 'LP')))?.quantity).toBe(2);

    await user.click(screen.getByRole('button', { name: 'Remove Foil LP copies' }));
    await waitFor(async () => expect((await db.owned.get(rowId('foil', 'LP')))?.deleted).toBe(true));
    expect((await db.owned.get(rowId('normal', 'NM')))?.quantity).toBe(2);
  });

  it('adds and removes tags with suggestions from existing tags, and saves a note', async () => {
    const user = userEvent.setup({ delay: null });
    await db.taggings.put({ id: 'tide', cardKey: 'tide', tags: ['control'], updatedAt: 1 });
    renderDetail(`/card/${KEYS.vi}`);
    const field = await screen.findByRole('textbox', { name: 'Add tag' });
    await user.type(field, 'aggro{Enter}');
    await waitFor(async () => expect((await db.taggings.get('vi'))?.tags).toEqual(['aggro']));

    await user.click(await screen.findByRole('button', { name: /control/ }));
    await waitFor(async () => expect((await db.taggings.get('vi'))?.tags).toEqual(['aggro', 'control']));

    await user.click(screen.getByRole('button', { name: 'Remove tag aggro' }));
    await waitFor(async () => expect((await db.taggings.get('vi'))?.tags).toEqual(['control']));

    await user.type(screen.getByRole('textbox', { name: 'Note' }), 'Great opener');
    await user.tab();
    await waitFor(async () => expect((await db.taggings.get('vi'))?.note).toBe('Great opener'));
  });

  it('lists decks that use the card with counts', async () => {
    await saveDeck({ name: 'Fury tempo', main: [{ cardKey: 'vi', count: 3 }] });
    renderDetail(`/card/${KEYS.vi}`);
    const link = await screen.findByRole('link', { name: /Fury tempo/ });
    expect(link).toHaveTextContent('x3');
    expect(link.getAttribute('href')).toMatch(/^\/decks\//);
  });

  it('steps through the list the user came from and keeps its query', async () => {
    const user = userEvent.setup({ delay: null });
    renderDetail(`/card/${KEYS.ember}?q=fury&sort=name`);
    await screen.findByRole('heading', { level: 1, name: 'Ember Caller' });
    expect(await screen.findByText(/1 of 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous card' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next card' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain(`/card/${KEYS.vi}`));
    expect(screen.getByTestId('location').textContent).toContain('q=fury');
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain(`/card/${KEYS.ember}`));
  });

  it('goes back to the collection when opened directly', async () => {
    const user = userEvent.setup({ delay: null });
    renderDetail(`/card/${KEYS.vi}?q=vi`);
    await user.click(await screen.findByRole('button', { name: 'Back to results' }));
    expect(await screen.findByText('Collection list')).toBeInTheDocument();
  });

  it('explains an unknown card', async () => {
    renderDetail('/card/not-a-real-key');
    expect(await screen.findByText('Card not found')).toBeInTheDocument();
  });
});
