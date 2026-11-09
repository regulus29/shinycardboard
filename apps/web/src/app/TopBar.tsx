import { Link } from 'react-router-dom';
import { APP_NAME, LIGHT_SCHEME_QUERY } from '../config/constants';
import { IconButton, type IconName } from '../ui';
import { SyncIndicator } from '../sync';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useSettings, type ThemePreference } from '../settings/settingsStore';
import { BrandMark } from './BrandMark';
import { OmniboxSlot } from './OmniboxSlot';
import { ROUTES } from './paths';

const THEME_CYCLE: ThemePreference[] = ['dark', 'light', 'system'];
const THEME_ICON: Record<ThemePreference, IconName> = { dark: 'moon', light: 'sun', system: 'monitor' };
const THEME_LABEL: Record<ThemePreference, string> = { dark: 'Dark', light: 'Light', system: 'System' };

/** Top bar: brand (phones), omnibox slot, theme cycle button and sync status. */
export function TopBar() {
  const [settings, update] = useSettings();
  // Subscribing keeps the visible state honest when the OS theme flips while "System" is chosen.
  const systemLight = useMediaQuery(LIGHT_SCHEME_QUERY);
  const current = settings.theme;
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length]!;
  const shown = current === 'system' ? (systemLight ? 'light' : 'dark') : current;

  return (
    <header className="topbar">
      <Link to={ROUTES.collection} className="topbar__brand" aria-label={`${APP_NAME} home`}>
        <BrandMark size={30} />
      </Link>
      <div className="topbar__omnibox">
        <OmniboxSlot />
      </div>
      <div className="topbar__actions">
        <SyncIndicator />
        <IconButton
          icon={THEME_ICON[current]}
          label={`Theme: ${THEME_LABEL[current]}${current === 'system' ? ` (${shown})` : ''}. Switch to ${THEME_LABEL[next]}`}
          onClick={() => update({ theme: next })}
        />
      </div>
    </header>
  );
}
