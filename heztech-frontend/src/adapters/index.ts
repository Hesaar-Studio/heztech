import type { HezTechAdapters } from './types';
import { createElectronBridgeAdapters } from './electron-bridge';

/**
 * Resolve adapters from window injection, active Electron preload, or explicit override.
 * When running in standard web preview without Electron, all default to null (honest disconnected state).
 */
export function getAdapters(override?: Partial<HezTechAdapters>): HezTechAdapters {
  let injected = typeof window !== 'undefined' ? window.__HEZTECH_ADAPTERS__ : undefined;

  // If running inside Electron environment with window.heztech / window.hesatech / window.electronAPI
  if (!injected && typeof window !== 'undefined') {
    const electronApi = window.heztech || window.hesatech || window.electronAPI || window.jarvis;
    if (electronApi) {
      injected = createElectronBridgeAdapters(electronApi);
      window.__HEZTECH_ADAPTERS__ = injected;
    }
  }

  return {
    chat: override?.chat ?? injected?.chat ?? null,
    agents: override?.agents ?? injected?.agents ?? null,
    system: override?.system ?? injected?.system ?? null,
    missions: override?.missions ?? injected?.missions ?? null,
  };
}

export * from './types';
export * from './electron-bridge';
