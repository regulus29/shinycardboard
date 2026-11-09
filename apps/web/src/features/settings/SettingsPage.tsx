import { PageHeader } from '../../ui';
import { AppearanceSection } from './AppearanceSection';
import { SyncSection } from './SyncSection';
import { DataSection } from './DataSection';
import { StorageSection } from './StorageSection';
import { AboutSection } from './AboutSection';
import './settings.css';

/** Two balanced columns on wide screens, a single stack on narrow ones. */
export default function SettingsPage() {
  return (
    <div className="page settings">
      <PageHeader eyebrow="Preferences" title="Settings" subtitle="Appearance, sync and your data" />
      <div className="settings__columns">
        <div className="settings__stack">
          <AppearanceSection />
          <DataSection />
          <AboutSection />
        </div>
        <div className="settings__stack">
          <SyncSection />
          <StorageSection />
        </div>
      </div>
    </div>
  );
}
