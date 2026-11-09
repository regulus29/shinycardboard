import { useId, type ReactNode } from 'react';

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

/** Titled card used by every settings group. */
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  const headingId = useId();
  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <header className="settings-section__header">
        <h2 id={headingId} className="settings-section__title">
          {title}
        </h2>
        {description ? <p className="settings-section__desc">{description}</p> : null}
      </header>
      <div className="settings-section__body">{children}</div>
    </section>
  );
}

interface SettingsRowProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

/** Label on the left, control on the right; stacks on phones. */
export function SettingsRow({ label, hint, children }: SettingsRowProps) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <p className="settings-row__label">{label}</p>
        {hint ? <p className="settings-row__hint">{hint}</p> : null}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  );
}
