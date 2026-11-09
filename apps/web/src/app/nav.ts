import type { IconName } from '../ui';
import { ROUTES } from './paths';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

/** Primary destinations shown in the sidebar and the phone tab bar. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: ROUTES.collection, label: 'Collection', icon: 'grid' },
  { to: ROUTES.sets, label: 'Sets', icon: 'layers' },
  { to: ROUTES.decks, label: 'Decks', icon: 'deck' },
  { to: ROUTES.settings, label: 'Settings', icon: 'settings' },
];
