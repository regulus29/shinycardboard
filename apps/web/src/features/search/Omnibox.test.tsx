import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '../../data';
import { OMNIBOX_INPUT_ID } from '../../config/constants';
import { resetDb } from '../../test/helpers';
import { LocationProbe, mockViewport, renderApp } from '../collection/testFixture';
import { applySuggestion, queryLocation } from './omniboxModel';
import { Omnibox } from './Omnibox';

const location = () => screen.getByTestId('location').textContent;
const box = async () => (await screen.findByRole('combobox', { name: 'Search cards' })) as HTMLInputElement;

function renderOmnibox(path = '/collection') {
  return renderApp(
    <>
      <Omnibox />
      <LocationProbe />
    </>,
    path,
  );
}

beforeEach(async () => {
  mockViewport(false);
  await resetDb();
});

describe('omnibox model', () => {
  it('keeps other collection params when only the query changes', () => {
    expect(queryLocation({ pathname: '/collection', search: '?q=a&sort=name' }, 'vi')).toEqual({ pathname: '/collection', search: '?q=vi&sort=name', replace: true });
    expect(queryLocation({ pathname: '/card/x', search: '?q=a&sort=name' }, 'vi')).toEqual({ pathname: '/collection', search: '?q=vi', replace: false });
    expect(queryLocation({ pathname: '/collection', search: '?q=a' }, '  ').search).toBe('');
  });

  it('completes the last token and leaves field prefixes open', () => {
    expect(applySuggestion('fury un', { start: 5, text: 'unit' })).toBe('fury unit ');
    expect(applySuggestion('do', { start: 0, text: 'domain:' })).toBe('domain:');
  });
});

describe('Omnibox', () => {
  it('uses the shared input id and shows the query from the URL', async () => {
    renderOmnibox('/collection?q=vi');
    const input = await box();
    expect(input.id).toBe(OMNIBOX_INPUT_ID);
    expect(input.value).toBe('vi');
  });

  it('debounces typing into the URL with replace semantics', async () => {
    const user = userEvent.setup({ delay: null });
    renderOmnibox();
    await user.type(await box(), 'fury');
    expect(location()).toBe('/collection');
    await waitFor(() => expect(location()).toBe('/collection?q=fury'));
  });

  it('submits immediately on Enter; Escape never wipes the committed query', async () => {
    const user = userEvent.setup({ delay: null });
    renderOmnibox();
    const input = await box();
    await user.type(input, 'unleashed 29{Enter}');
    expect(location()).toBe('/collection?q=unleashed+29');
    await user.type(input, ' extra');
    await user.keyboard('{Escape}');
    expect(input.value).toBe('unleashed 29');
    await user.keyboard('{Escape}');
    expect(input).not.toHaveFocus();
    expect(location()).toBe('/collection?q=unleashed+29');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(location()).toBe('/collection'));
  });

  it('follows navigation that did not come from typing', async () => {
    const user = userEvent.setup({ delay: null });
    renderOmnibox('/collection?q=vi');
    const input = await box();
    await user.clear(input);
    await user.type(input, 'tide{Enter}');
    expect(input.value).toBe('tide');
  });

  it('offers suggestions with combobox semantics and accepts one with the keyboard', async () => {
    const user = userEvent.setup({ delay: null });
    renderOmnibox();
    const input = await box();
    await user.type(input, 'domain:');
    const list = await screen.findByRole('listbox', { name: 'Search suggestions' });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', list.id);
    const options = within(list).getAllByRole('option');
    expect(options.length).toBeGreaterThan(1);

    await user.keyboard('{ArrowDown}');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[0]?.id);
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    expect(input.value).toBe(`${options[0]?.querySelector('.omnibox__option-text')?.textContent} `);
    expect(input.value).toMatch(/^domain:\w+ $/);
  });

  it('shows parse warnings as a hint without blocking the search', async () => {
    const user = userEvent.setup({ delay: null });
    renderOmnibox('/collection?q=zzzzfield:what');
    await user.click(await box());
    expect(await screen.findByText(/Unknown field/)).toBeInTheDocument();
  });

  it('opens the syntax help from the panel and runs an example', async () => {
    const user = userEvent.setup({ delay: null });
    renderOmnibox();
    await user.click(await box());
    await user.click(await screen.findByRole('button', { name: 'Syntax help' }));
    const dialog = await screen.findByRole('dialog', { name: 'Search syntax' });
    await user.click(within(dialog).getByRole('button', { name: /owned:yes/ }));
    expect(location()).toBe('/collection?q=owned%3Ayes');
  });

  it('saves the current search by name', async () => {
    const user = userEvent.setup({ delay: null });
    renderOmnibox('/collection?q=fury+unit');
    await user.click(await box());
    await user.click(await screen.findByRole('button', { name: 'Saved searches' }));
    await user.click(await screen.findByRole('button', { name: 'Save current search' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save search' });
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Fury units');
    await user.click(within(dialog).getByRole('button', { name: 'Save search' }));
    await waitFor(async () => expect((await db.savedSearches.toArray()).map((s) => [s.name, s.query])).toEqual([['Fury units', 'fury unit']]));
  });

  it('renames and deletes saved searches from the manager', async () => {
    const user = userEvent.setup({ delay: null });
    await db.savedSearches.put({ id: 's1', name: 'Old', query: 'vi', updatedAt: 1 });
    renderOmnibox();
    await user.click(await box());
    await user.click(await screen.findByRole('button', { name: 'Saved searches' }));
    const dialog = await screen.findByRole('dialog', { name: 'Saved searches' });
    await user.click(await within(dialog).findByRole('button', { name: 'Rename Old' }));
    const field = within(dialog).getByRole('textbox', { name: 'New name for Old' });
    await user.clear(field);
    await user.type(field, 'New{Enter}');
    await waitFor(async () => expect((await db.savedSearches.get('s1'))?.name).toBe('New'));
    await user.click(await within(dialog).findByRole('button', { name: 'Delete New' }));
    await waitFor(async () => expect((await db.savedSearches.get('s1'))?.deleted).toBe(true));
  });
});
