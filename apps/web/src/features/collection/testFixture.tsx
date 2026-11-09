import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { Card, Catalog, CardType, Domain, Printing, Variant } from '@sc/core';
import { CatalogGate, CatalogProvider } from '../../data';
import { ToastProvider } from '../../ui';

/** Shows the router location so tests can assert URL changes. */
export function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function card(cardKey: string, name: string, type: CardType, domains: Domain[], energy: number | null, might: number | null, printingKeys: string[]): Card {
  return { cardKey, name, type, supertype: null, domains, energy, might, power: null, rulesText: `${name} rules text.`, tags: [], keywords: [], printingKeys };
}

function printing(key: string, cardKey: string, setId: string, number: number, variant: Variant, rarity: string): Printing {
  const marker = variant === 'standard' ? '' : 'a';
  const padded = String(number).padStart(3, '0');
  return {
    printingKey: key,
    cardKey,
    setId,
    setLabel: setId === 'OGN' ? 'Origins' : 'Unleashed',
    collectorNumber: number,
    riftboundId: `${setId.toLowerCase()}-${padded}${marker}-100`,
    variant,
    variantLabel: variant === 'standard' ? null : 'Alternate Art',
    rarity,
    imageUrl: `https://cards.test/${key}.png`,
    artist: 'Test Artist',
    sourceId: `${setId.toLowerCase()}-${padded}${marker}-100`,
    tcgplayerId: null,
  };
}

/** Six printings of four cards across two sets: enough to test grouping, sets math and navigation. */
export const FIXTURE_CATALOG: Catalog = {
  builtAt: '2026-01-01T00:00:00Z',
  sets: [
    { setId: 'OGN', label: 'Origins', count: 3 },
    { setId: 'UNL', label: 'Unleashed', count: 3 },
  ],
  cards: {
    vi: card('vi', 'Vi Brawler', 'Unit', ['Fury'], 3, 4, ['ogn-001-100-standard', 'ogn-001a-100-alternate-art']),
    ember: card('ember', 'Ember Caller', 'Spell', ['Fury', 'Chaos'], 2, null, ['ogn-002-100-standard']),
    tide: card('tide', 'Tidal Guardian', 'Unit', ['Calm'], 5, 6, ['unl-029-100-standard', 'unl-029a-100-alternate-art']),
    stone: card('stone', 'Stone Gear', 'Gear', ['Body'], 1, null, ['unl-030-100-standard']),
  },
  printings: {
    'ogn-001-100-standard': printing('ogn-001-100-standard', 'vi', 'OGN', 1, 'standard', 'Common'),
    'ogn-001a-100-alternate-art': printing('ogn-001a-100-alternate-art', 'vi', 'OGN', 1, 'alternate-art', 'Epic'),
    'ogn-002-100-standard': printing('ogn-002-100-standard', 'ember', 'OGN', 2, 'standard', 'Rare'),
    'unl-029-100-standard': printing('unl-029-100-standard', 'tide', 'UNL', 29, 'standard', 'Uncommon'),
    'unl-029a-100-alternate-art': printing('unl-029a-100-alternate-art', 'tide', 'UNL', 29, 'alternate-art', 'Epic'),
    'unl-030-100-standard': printing('unl-030-100-standard', 'stone', 'UNL', 30, 'standard', 'Common'),
  },
};

export const KEYS = {
  vi: 'ogn-001-100-standard',
  viAlt: 'ogn-001a-100-alternate-art',
  ember: 'ogn-002-100-standard',
  tide: 'unl-029-100-standard',
  tideAlt: 'unl-029a-100-alternate-art',
  stone: 'unl-030-100-standard',
} as const;

/** Render with providers that feature components need (toasts, catalog, router) at a given URL. */
export function renderApp(ui: ReactElement, path = '/collection', catalog: Catalog = FIXTURE_CATALOG) {
  return render(
    <ToastProvider>
      <CatalogProvider load={async () => catalog}>
        <MemoryRouter initialEntries={[path]}>
          <CatalogGate>{ui}</CatalogGate>
        </MemoryRouter>
      </CatalogProvider>
    </ToastProvider>,
  );
}

/** Make `matchMedia` answer as a desktop (min-width queries match) or a phone (max-width queries match). */
export function mockViewport(desktop: boolean): void {
  window.matchMedia = ((query: string) =>
    ({
      matches: /min-width/.test(query) ? desktop : /max-width/.test(query) ? !desktop : false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}
