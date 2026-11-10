import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

if (typeof window !== 'undefined' && !window.localStorage) {
  let store: Record<string, string> = {};
  (window as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
}

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
    window.localStorage.setItem('heztech-locale', 'en');
  }
  delete (window as any).__HEZTECH_ADAPTERS__;
  delete (window as any).hesatech;
});

afterEach(cleanup);
