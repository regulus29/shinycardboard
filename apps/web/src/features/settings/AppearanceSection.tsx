import { SegmentedControl, type SegmentedOption } from '../../ui';
import { useSettings, type DefaultView, type Density, type ThemePreference } from '../../settings/settingsStore';
import { SettingsRow, SettingsSection } from './SettingsSection';

const THEME_OPTIONS: SegmentedOption<ThemePreference>[] = [
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

const DENSITY_OPTIONS: SegmentedOption<Density>[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];

const VIEW_OPTIONS: SegmentedOption<DefaultView>[] = [
  { value: 'grid', label: 'Grid', icon: 'grid' },
  { value: 'list', label: 'List', icon: 'list' },
];

export function AppearanceSection() {
  const [settings, update] = useSettings();
  return (
    <SettingsSection title="Appearance" description="Saved on this device only.">
      <SettingsRow label="Theme" hint="System follows your device setting.">
        <SegmentedControl label="Theme" options={THEME_OPTIONS} value={settings.theme} onValueChange={(theme) => update({ theme })} />
      </SettingsRow>
      <SettingsRow label="Density" hint="Compact fits more on screen.">
        <SegmentedControl
          label="Density"
          options={DENSITY_OPTIONS}
          value={settings.density}
          onValueChange={(density) => update({ density })}
        />
      </SettingsRow>
      <SettingsRow label="Default collection view" hint="How card lists open.">
        <SegmentedControl
          label="Default collection view"
          options={VIEW_OPTIONS}
          value={settings.defaultView}
          onValueChange={(defaultView) => update({ defaultView })}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
