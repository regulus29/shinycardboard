import { useEffect, useState } from 'react';
import { readDisplayInfo, type DisplayInfo } from '../../app/displayInfo';
import { APP_NAME, APP_VERSION, BUILD_TIME } from '../../config/constants';
import { useCatalog } from '../../data';
import { SettingsSection } from './SettingsSection';

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function AboutSection() {
  const [display, setDisplay] = useState<DisplayInfo | null>(null);
  useEffect(() => setDisplay(readDisplayInfo()), []);
  const { state } = useCatalog();
  const catalogBuilt = state.status === 'ready' ? formatDate(state.catalog.builtAt) : state.status === 'loading' ? 'Loading' : 'Unavailable';
  const rows: [string, string][] = [
    ['App', APP_NAME],
    ['Version', APP_VERSION],
    ['App build', BUILD_TIME ? formatDate(BUILD_TIME) : 'Development'],
    ['Catalog built', catalogBuilt],
    ...(display
      ? ([
          ['Display mode', display.mode],
          ['Window (px)', display.window],
          ['Visual viewport', display.visualViewport],
          ['Screen', display.screen],
          ['App shell', display.shell],
          ['Safe area top / bottom', `${display.safeTop} / ${display.safeBottom}`],
        ] as [string, string][])
      : []),
  ];
  return (
    <SettingsSection title="About">
      <dl className="settings-about">
        {rows.map(([term, detail]) => (
          <div key={term} className="settings-about__row">
            <dt>{term}</dt>
            <dd>{detail}</dd>
          </div>
        ))}
      </dl>
      <p className="settings-row__hint">
        Press <kbd>/</kbd> anywhere to jump to search.
      </p>
    </SettingsSection>
  );
}
