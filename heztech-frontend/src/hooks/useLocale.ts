import { useSyncExternalStore } from 'react';
import type { Locale, Direction } from '@/types';
import { t } from '@/i18n/labels';
const key = 'heztech-locale';
function snapshot(): Locale { try { return window.localStorage.getItem(key) === 'en' ? 'en' : 'fa'; } catch { return 'fa'; } }
function subscribe(callback: () => void) { window.addEventListener('heztech-locale', callback); window.addEventListener('storage', callback); return () => { window.removeEventListener('heztech-locale', callback); window.removeEventListener('storage', callback); }; }
function setLocale(value: Locale) { window.localStorage.setItem(key, value); window.dispatchEvent(new Event('heztech-locale')); }
export function useLocale() { const locale = useSyncExternalStore(subscribe, snapshot); const dir: Direction = locale === 'fa' ? 'rtl' : 'ltr'; document.documentElement.lang = locale; document.documentElement.dir = dir; return { locale, dir, labels: t(locale), setLocale }; }
