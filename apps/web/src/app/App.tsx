import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { CatalogProvider } from '../data';
import { SyncProvider } from '../sync';
import { ToastProvider } from '../ui';
import { useApplySettings } from '../settings/settingsStore';
import { AppRoutes } from './AppRoutes';
import { ErrorBoundary } from './ErrorBoundary';
import { StorageErrorToasts } from './StorageErrorToasts';
import { StorageGate } from './StorageGate';
import { UpdatePrompt } from './UpdatePrompt';
import { MigrationNotice } from './MigrationNotice';
import { DataLossNotice } from './DataLossNotice';

function Themed({ children }: { children: ReactNode }) {
  useApplySettings();
  return <>{children}</>;
}

/** Router basename derived from Vite's base so subpath deployments work. */
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Provider stack, outermost first: error boundary, theme, toasts, storage gate, catalog, router, sync. */
export function App() {
  return (
    <ErrorBoundary scope="app">
      <Themed>
        <ToastProvider>
          <StorageErrorToasts />
          <UpdatePrompt />
          <StorageGate>
            <DataLossNotice />
            <CatalogProvider>
              <BrowserRouter basename={BASENAME}>
                <SyncProvider>
                  <MigrationNotice />
                  <AppRoutes />
                </SyncProvider>
              </BrowserRouter>
            </CatalogProvider>
          </StorageGate>
        </ToastProvider>
      </Themed>
    </ErrorBoundary>
  );
}
