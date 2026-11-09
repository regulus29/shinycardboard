import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { resolvePrintingKey, useRequiredCatalog } from '../data';
import { paths } from './paths';

/** Redirects /card/<retired key> to the current key so old links and bookmarks keep working. */
export function CardAliasRedirect({ children }: { children: ReactNode }) {
  const catalog = useRequiredCatalog();
  const { printingKey = '' } = useParams();
  const current = resolvePrintingKey(catalog, printingKey);
  if (current && current !== printingKey) return <Navigate to={paths.card(current)} replace />;
  return <>{children}</>;
}
