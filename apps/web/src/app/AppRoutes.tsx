import { lazy } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Button, EmptyState } from '../ui';
import { AppShell, CatalogRoute } from './AppShell';
import { CardAliasRedirect } from './CardAliasRedirect';
import { ROUTES } from './paths';

/* Feature pages are code-split. Phase 2 replaces the files; the default export contract stays. */
const CollectionPage = lazy(() => import('../features/collection/CollectionPage'));
const SetsPage = lazy(() => import('../features/collection/SetsPage'));
const CardDetailPage = lazy(() => import('../features/cards/CardDetailPage'));
const DecksPage = lazy(() => import('../features/decks/DecksPage'));
const DeckBuilderPage = lazy(() => import('../features/decks/DeckBuilderPage'));
/** Dev-only design system gallery at /dev/ui; tree-shaken from production builds. */
const UiShowcase = import.meta.env.DEV ? lazy(() => import('../dev/UiShowcase')) : null;
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));

function NotFound() {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon="search"
      title="Page not found"
      description="That address does not match anything in Shiny Cardboard."
      action={
        <Button variant="primary" onClick={() => navigate(ROUTES.collection)}>
          Back to collection
        </Button>
      }
    />
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to={ROUTES.collection} replace />} />
        <Route element={<CatalogRoute />}>
          <Route path={ROUTES.collection} element={<CollectionPage />} />
          <Route path={ROUTES.sets} element={<SetsPage />} />
          <Route
            path={ROUTES.card}
            element={
              <CardAliasRedirect>
                <CardDetailPage />
              </CardAliasRedirect>
            }
          />
          <Route path={ROUTES.decks} element={<DecksPage />} />
          <Route path={ROUTES.deck} element={<DeckBuilderPage />} />
          {UiShowcase ? <Route path="/dev/ui" element={<UiShowcase />} /> : null}
        </Route>
        <Route path={ROUTES.settings} element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
