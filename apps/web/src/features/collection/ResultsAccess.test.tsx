import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../../data';
import { resetDb } from '../../test/helpers';
import { resetSettingsCache } from '../../settings/settingsStore';
import { Omnibox } from '../search/Omnibox';
import CollectionPage from './CollectionPage';
import { LocationProbe, mockViewport, renderApp } from './testFixture';

const location = () => screen.getByTestId('location').textContent ?? '';

function renderPage(path = '/collection') {
  return renderApp(
    <>
      <Omnibox />
      <CollectionPage />
      <LocationProbe />
    </>,
    path,
  );
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  resetSettingsCache();
  mockViewport(true);
  await resetDb();
});

describe('selection reconciliation', () => {
  it('drops selected cards that leave the results and reports the exact visible count', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage('/collection?sort=name');
    await user.click(await screen.findByRole('button', { name: 'Select' }));
    const boxes = await screen.findAllByRole('checkbox');
    await user.click(boxes[0]!);
    await user.click(boxes[4]!);
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('2 selected');

    const input = screen.getByRole('combobox', { name: 'Search cards' });
    await user.clear(input);
    await user.type(input, 'domain:calm{Enter}');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent('0 selected'));
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toHaveTextContent(/no longer match/);
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeDisabled();
  });
});

describe('keyboard access to results', () => {
  it('has one tab stop, moves with arrows, jumps with Home and End, and adjusts with plus and minus', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage('/collection?sort=name');
    await screen.findByRole('grid', { name: 'Cards' });
    const targets = () => Array.from(document.querySelectorAll<HTMLElement>('.ui-tile__main'));
    await waitFor(() => expect(targets()).toHaveLength(6));
    expect(targets().filter((el) => el.tabIndex === 0)).toHaveLength(1);
    expect(document.querySelectorAll('.results .ui-stepper button[tabindex="0"]')).toHaveLength(0);

    targets()[0]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(targets()[1]).toHaveFocus();
    await waitFor(() => expect(targets()[1]!.tabIndex).toBe(0));
    expect(targets()[0]!.tabIndex).toBe(-1);
    await user.keyboard('{End}');
    expect(targets()[5]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(targets()[0]).toHaveFocus();

    await user.keyboard('++-');
    await waitFor(async () => expect((await db.owned.toArray()).filter((r) => !r.deleted).map((r) => r.quantity)).toEqual([1]));
    expect(await screen.findByText(/: [0-9]+ owned/)).toBeInTheDocument();
  });

  it('announces result count changes and warnings in a polite live region', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();
    await screen.findAllByRole('link', { name: /Vi Brawler/ });
    const live = () =>
      Array.from(document.querySelectorAll('[aria-live="polite"]'))
        .map((el) => el.textContent)
        .join(' | ');
    await waitFor(() => expect(live()).toContain('6 printings.'));
    const input = screen.getByRole('combobox', { name: 'Search cards' });
    await user.clear(input);
    await user.type(input, 'energy>=abc{Enter}');
    await waitFor(() => expect(live()).toContain('Expected a number'));
    expect(screen.getAllByText(/Expected a number/).length).toBeGreaterThan(0);
  });
});

describe('phone layout', () => {
  it('collapses controls into a Filters and sort sheet with a count bar', async () => {
    mockViewport(false);
    const user = userEvent.setup({ delay: null });
    renderPage();
    const open = await screen.findByRole('button', { name: /Filters and sort/ });
    expect(screen.queryByRole('region', { name: 'Collection summary' })).not.toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('.collection__oneline')).toBeInTheDocument());
    expect(screen.queryByRole('radio', { name: 'Owned' })).not.toBeInTheDocument();
    await user.click(open);
    const sheet = await screen.findByRole('dialog', { name: 'Filters and sort' });
    await user.click(within(sheet).getByRole('radio', { name: 'Owned' }));
    await user.click(within(sheet).getByRole('button', { name: 'Fury' }));
    expect(location()).toContain('scope=owned');
    expect(location()).toContain('domain%3Afury');
    await user.keyboard('{Escape}');
    expect(await screen.findByRole('button', { name: /Filters and sort/ })).toHaveTextContent('2');
  });
});
