/** Test stand-in for the `virtual:pwa-register/react` module (not available under vitest). */
export const pwaState = { needRefresh: false, offlineReady: false, update: () => Promise.resolve() };

export function useRegisterSW() {
  return {
    needRefresh: [pwaState.needRefresh, () => undefined] as const,
    offlineReady: [pwaState.offlineReady, () => undefined] as const,
    updateServiceWorker: () => pwaState.update(),
  };
}
