import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** Small caps label above the title, usually the section name. */
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned controls (buttons, view toggles). */
  actions?: ReactNode;
}

/** Standard page title block. Uses the `.page__*` classes from styles/base.css. */
export function PageHeader({ eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="page__header">
      <div className="page__heading">
        {eyebrow ? <p className="page__eyebrow">{eyebrow}</p> : null}
        <h1 className="page__title">{title}</h1>
        {subtitle ? <p className="page__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page__actions">{actions}</div> : null}
    </div>
  );
}
