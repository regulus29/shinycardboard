import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Skeleton } from '../ui';
import { CatalogGate } from '../data';
import { SHORT_VIEWPORT_QUERY } from '../config/constants';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useSettings } from '../settings/settingsStore';
import { ErrorBoundary } from './ErrorBoundary';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';
import { useGlobalShortcuts } from './useGlobalShortcuts';
import './shell.css';

function PageFallback() {
  return (
    <div className="page" role="status">
      <span className="sr-only">Loading page</span>
      <Skeleton height="2rem" width="14rem" />
      <Skeleton height="1rem" width="22rem" style={{ marginTop: '0.75rem' }} />
      <Skeleton height="45vh" style={{ marginTop: '2rem' }} />
    </div>
  );
}

/** Layout route: sidebar (desktop), top bar, scrollable main, tab bar (phone). */
export function AppShell() {
  const [settings, update] = useSettings();
  const location = useLocation();
  const shortViewport = useMediaQuery(SHORT_VIEWPORT_QUERY);
  const rail = settings.sidebarCollapsed || shortViewport;
  useGlobalShortcuts();

  return (
    <div className={`shell${rail ? ' is-collapsed' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar collapsed={rail} forced={shortViewport} onToggle={() => update({ sidebarCollapsed: !settings.sidebarCollapsed })} />
      <TopBar />
      <main id="main" className="shell__main" tabIndex={-1}>
        <ErrorBoundary resetKey={location.key}>
          <Suspense fallback={<PageFallback />}>
            <div key={location.pathname} className="route-fade">
              <Outlet />
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
      <TabBar />
    </div>
  );
}

/** Layout route for pages that need the card catalog: shows loading and retryable error states. */
export function CatalogRoute() {
  return (
    <CatalogGate>
      <Outlet />
    </CatalogGate>
  );
}
