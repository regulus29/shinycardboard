import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Catalog, Printing } from '@sc/core';
import { db, setOwnedQuantity } from '../../data';
import { resetDb } from '../../test/helpers';
import { resetSettingsCache } from '../../settings/settingsStore';
import { Omnibox } from '../search/Omnibox';
import CollectionPage from './CollectionPage';
import SetsPage from './SetsPage';
import { FIXTURE_CATALOG, KEYS, LocationProbe, mockViewport, renderApp } from './testFixture';

const location = () => screen.getByTestId('location').textContent ?? '';

function renderPage(path = '/collection', catalog?: Catalog) {
  return renderApp(
    <>
      <Omnibox />
      <CollectionPage />
      <LocationProbe />
    </>,
    path,
    catalog,
  );
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  resetSettingsCache();
  mockViewport(true);
  await resetDb();
});

describe('CollectionPage', () => {
  it('renders results, the stats hero and an empty-collection guide', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Collection' })).toBeInTheDocument();
    expect(await screen.findAllByRole('link', { name: 'Vi Brawler' })).toHaveLength(2);
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Collection summary' })).toHaveTextContent('Your collection is empty');
  });

  it('keeps filter chips and the omnibox in agreement through the query text', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Filters' }));
    const fury = await screen.findByRole('button', { name: 'Fury' });
    await user.click(fury);
    expect(location()).toContain('q=domain%3Afury');
    expect(screen.getByRole('combobox', { name: 'Search cards' })).toHaveValue('domain:fury');
    expect(fury).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.getAllByRole('link', { name: /Vi Brawler|Ember Caller/ })).toHaveLength(3));
    expect(screen.queryByRole('link', { name: 'Tidal Guardian' })).not.toBeInTheDocument();

    // Typing the same filter by hand selects the chip.
    const input = screen.getByRole('combobox', { name: 'Search cards' });
    await user.clear(input);
    await user.type(input, 'type:spell{Enter}');
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Applied filters' })).getByText('Spell')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Spell' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: 'Fury' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(screen.getByRole('list', { name: 'Applied filters' })).getByText('Spell')).toBeInTheDocument();
  });

  it('adjusts owned copies from the tile stepper', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    const stepper = await screen.findByRole('group', { name: /Owned copies of Ember Caller/ });
    await user.click(within(stepper).getByRole('button', { name: 'Increase' }));
    await user.click(within(stepper).getByRole('button', { name: 'Increase' }));
    await waitFor(async () => expect((await db.owned.get(`${KEYS.ember}|normal|NM`))?.quantity).toBe(2));
    await waitFor(() => expect(within(stepper).getByRole('status')).toHaveTextContent('2'));
    await user.click(within(stepper).getByRole('button', { name: 'Decrease' }));
    await waitFor(async () => expect((await db.owned.get(`${KEYS.ember}|normal|NM`))?.quantity).toBe(1));
  });

  it('quick add mode adds one copy per tap', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await user.click(await screen.findByRole('switch', { name: 'Quick add' }));
    const tile = (await screen.findAllByRole('button', { name: /Tidal Guardian/ }))[0]!;
    await user.click(tile);
    await user.click(tile);
    await waitFor(async () => expect((await db.owned.get(`${KEYS.tide}|normal|NM`))?.quantity).toBe(2));
    expect(screen.getByText(/Added Tidal Guardian/)).toBeInTheDocument();
  });

  it('scopes to owned and to missing printings', async () => {
    await setOwnedQuantity({ printingKey: KEYS.vi }, 1);
    const user = userEvent.setup({ delay: null });
    renderPage();
    await screen.findAllByRole('link', { name: /Vi Brawler/ });
    await user.click(screen.getByRole('radio', { name: 'Owned' }));
    await waitFor(() => expect(screen.getAllByRole('link', { name: /Vi Brawler/ })).toHaveLength(1));
    expect(location()).toContain('scope=owned');
    await user.click(screen.getByRole('radio', { name: 'Missing from sets' }));
    await waitFor(() => expect(screen.getAllByRole('link')).not.toHaveLength(0));
    expect(screen.queryAllByRole('link', { name: /^Vi Brawler$/ })).toHaveLength(1);
  });

  it('selects tiles with shift ranges and bulk tags their cards once', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage('/collection?sort=name');
    await user.click(await screen.findByRole('button', { name: 'Select' }));
    const boxes = await screen.findAllByRole('checkbox');
    await user.click(boxes[0]!);
    await user.keyboard('{Shift>}');
    await user.click(boxes[3]!);
    await user.keyboard('{/Shift}');
    expect(await screen.findByText('selected')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('4 selected');

    await user.type(screen.getByRole('combobox', { name: 'Tag for selected cards' }), 'Aggro Pack');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await waitFor(async () => {
      const rows = (await db.taggings.toArray()).filter((row) => !row.deleted);
      expect(rows.every((row) => row.tags.includes('Aggro Pack'))).toBe(true);
      expect(rows.map((row) => row.cardKey).sort()).toEqual(['ember', 'stone', 'tide']);
    });
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('0 selected');
  });

  it('shows parser warnings in the no-results state', async () => {
    renderPage('/collection?q=nonsensefield%3A9');
    expect(await screen.findByText('No cards match')).toBeInTheDocument();
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Clear search and filters' }));
    await waitFor(() => expect(location()).toBe('/collection'));
  });

  it('groups results with headers and switches to the table view', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage('/collection?group=set&view=table');
    expect(await screen.findByRole('grid', { name: 'Cards' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Origins/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Unleashed/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Name' }));
    expect(location()).toContain('sort=name');
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('opens the tags panel, filters by a tag and renames and deletes it', async () => {
    const user = userEvent.setup({ delay: null });
    await db.taggings.bulkPut([{ id: 'vi', cardKey: 'vi', tags: ['aggro'], updatedAt: 1 }, { id: 'tide', cardKey: 'tide', tags: ['aggro', 'slow'], updatedAt: 1 }]);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Tags' }));
    const drawer = await screen.findByRole('dialog', { name: 'Tags' });
    expect(await within(drawer).findByText('aggro')).toBeInTheDocument();

    await user.click(within(drawer).getByRole('button', { name: 'Rename slow' }));
    const field = within(drawer).getByRole('textbox', { name: 'New name for slow' });
    await user.clear(field);
    await user.type(field, 'late{Enter}');
    await waitFor(async () => expect((await db.taggings.get('tide'))?.tags).toEqual(['aggro', 'late']));

    await user.click(await within(drawer).findByRole('button', { name: 'Delete late' }));
    await user.click(await screen.findByRole('button', { name: 'Delete tag' }));
    await waitFor(async () => expect((await db.taggings.get('tide'))?.tags).toEqual(['aggro']));

    await user.click(await within(drawer).findByRole('button', { name: /^aggro/, pressed: false }));
    await waitFor(() => expect(location()).toContain('q=tag%3Aaggro'));
  });

  it('renders only a window of a large result set', async () => {
    const printings: Record<string, Printing> = {};
    const cards: Catalog['cards'] = {};
    for (let i = 0; i < 900; i++) {
      const key = `ogn-${String(i).padStart(3, '0')}-900-standard`;
      cards[`c${i}`] = { ...FIXTURE_CATALOG.cards.vi!, cardKey: `c${i}`, name: `Card ${i}`, printingKeys: [key] };
      printings[key] = { ...FIXTURE_CATALOG.printings[KEYS.vi]!, printingKey: key, cardKey: `c${i}`, collectorNumber: i };
    }
    const big: Catalog = { ...FIXTURE_CATALOG, cards, printings };
    renderPage('/collection', big);
    await screen.findByRole('heading', { level: 1, name: 'Collection' });
    await waitFor(() => expect(document.querySelectorAll('[data-result-index]').length).toBeGreaterThan(0));
    const rendered = document.querySelectorAll('[data-result-index]').length;
    expect(rendered).toBeLessThan(200);
    expect(screen.getByText('900')).toBeInTheDocument();
  });
});

describe('ImportDialog', () => {
  const csv = (rows: string[]) => ['printingKey,quantity,finish,condition', ...rows].join('\n');

  async function openImport(user: ReturnType<typeof userEvent.setup>) {
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Import' }));
    return screen.findByRole('dialog', { name: 'Import collection' });
  }

  it('previews pasted text and adds to the collection', async () => {
    const user = userEvent.setup({ delay: null });
    await setOwnedQuantity({ printingKey: KEYS.vi }, 1);
    const dialog = await openImport(user);
    await user.click(within(dialog).getByRole('textbox'));
    await user.paste(csv([`${KEYS.vi},2,normal,NM`, `${KEYS.stone},1,foil,NM`, 'bogus-key,1,normal,NM']) + '\n,,,\n');
    await user.click(within(dialog).getByRole('button', { name: 'Preview' }));
    const preview = await within(dialog).findByRole('region', { name: 'Import preview' });
    expect(preview).toHaveTextContent('Shiny Cardboard CSV');
    expect(within(preview).getAllByRole('row').length).toBeGreaterThan(1);
    await user.click(within(dialog).getByRole('radio', { name: 'Errors' }));

    await user.click(within(dialog).getByRole('button', { name: /^Import/ }));
    await waitFor(async () => expect((await db.owned.get(`${KEYS.vi}|normal|NM`))?.quantity).toBe(3));
    expect((await db.owned.get(`${KEYS.stone}|foil|NM`))?.quantity).toBe(1);
    expect(await screen.findByText('Import complete')).toBeInTheDocument();
  });

  it('replace asks for confirmation with the removal count and tombstones the rest', async () => {
    const user = userEvent.setup({ delay: null });
    await setOwnedQuantity({ printingKey: KEYS.vi }, 1);
    await setOwnedQuantity({ printingKey: KEYS.tide }, 2);
    const dialog = await openImport(user);
    await user.click(within(dialog).getByRole('textbox'));
    await user.paste(csv([`${KEYS.stone},3,normal,NM`]));
    await user.click(within(dialog).getByRole('button', { name: 'Preview' }));
    await user.click(await within(dialog).findByRole('radio', { name: 'Replace collection' }));
    await user.click(within(dialog).getByRole('button', { name: /Review replace/ }));

    const confirm = await screen.findByRole('dialog', { name: 'Replace your collection?' });
    expect(confirm).toHaveTextContent('2 owned rows will be removed');
    await user.click(within(confirm).getByRole('button', { name: 'Replace collection' }));
    await waitFor(async () => expect((await db.owned.get(`${KEYS.vi}|normal|NM`))?.deleted).toBe(true));
    expect((await db.owned.get(`${KEYS.tide}|normal|NM`))?.deleted).toBe(true);
    expect((await db.owned.get(`${KEYS.stone}|normal|NM`))?.quantity).toBe(3);
  });

  it('points JSON backups at Settings instead of importing them', async () => {
    const user = userEvent.setup({ delay: null });
    const dialog = await openImport(user);
    await user.click(within(dialog).getByRole('textbox'));
    await user.paste('{"owned":[]}');
    expect(await within(dialog).findByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Preview' })).toBeDisabled();
  });
});

describe('SetsPage', () => {
  it('shows completion per set, toggles standard-only and links into the collection', async () => {
    const user = userEvent.setup({ delay: null });
    await setOwnedQuantity({ printingKey: KEYS.vi }, 1);
    await setOwnedQuantity({ printingKey: KEYS.ember }, 1);
    renderApp(<SetsPage />, '/sets');
    const origins = await screen.findByRole('heading', { name: 'Origins' });
    const card = origins.closest('li')!;
    await waitFor(() => expect(within(card).getByText('Complete')).toBeInTheDocument());
    expect(within(card).getByRole('link', { name: 'Owned' })).toHaveAttribute('href', '/collection?q=set%3AOGN&scope=owned');

    await user.click(screen.getByRole('switch', { name: 'Standard printings only' }));
    await waitFor(() => expect(within(card).queryByText('Complete')).not.toBeInTheDocument());
    expect(within(card).getByRole('link', { name: /1 printing missing/ })).toBeInTheDocument();
  });
});
