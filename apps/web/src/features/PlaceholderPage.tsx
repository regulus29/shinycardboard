import type { ReactNode } from 'react';
import { EmptyState, PageHeader, type IllustrationKind } from '../ui';

interface PlaceholderPageProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  illustration: IllustrationKind;
  /** What this page will become, shown under the illustration. */
  message: string;
  children?: ReactNode;
}

/** Shared scaffold for phase 1 stand-ins. Phase 2 pages replace these entirely. */
export function PlaceholderPage({ eyebrow, title, subtitle, illustration, message, children }: PlaceholderPageProps) {
  return (
    <div className="page">
      <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
      {children}
      <EmptyState illustration={illustration} title="Coming soon" description={message} />
    </div>
  );
}
