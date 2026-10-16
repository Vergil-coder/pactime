import { useLayoutEffect, useSyncExternalStore } from 'react';
import { getLanguage, setLanguagePreference, subscribeLanguage } from '../shared/i18n';
import type { AppSnapshot } from '../core/types';

export function syncLanguage(snapshot: AppSnapshot): void {
  setLanguagePreference(snapshot.language ?? 'system', snapshot.systemLocale ?? navigator.language);
}
export function useLanguage(): void {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage);
  useLayoutEffect(() => { document.documentElement.lang = language; }, [language]);
}
