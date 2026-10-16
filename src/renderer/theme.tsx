import { storageKeys } from '../shared/compatibility';
import { desktopBridge } from './bridge';
import { t } from '../shared/i18n';
import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

export type ThemeMode = 'light' | 'dark' | 'system';
const key = storageKeys.appearance;
const validMode = (value: string | null): ThemeMode => value === 'light' || value === 'dark' ? value : 'system';
const ThemeContext = createContext<{ mode: ThemeMode; setMode: (value: ThemeMode) => void }>({ mode: 'system', setMode: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, updateMode] = useState<ThemeMode>(() => {
    try { return validMode(localStorage.getItem(key)); } catch { return 'system'; }
  });
  useLayoutEffect(() => {
    void desktopBridge?.setAppearance?.(mode).catch(() => {});
    const system = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = mode === 'system' ? system.matches ? 'dark' : 'light' : mode; };
    apply(); system.addEventListener('change', apply);
    return () => system.removeEventListener('change', apply);
  }, [mode]);
  useEffect(() => {
    const receive = (event: StorageEvent) => { if (event.key === key || event.key === null) updateMode(validMode(event.newValue)); };
    window.addEventListener('storage', receive);
    return () => window.removeEventListener('storage', receive);
  }, []);
  function setMode(value: ThemeMode) {
    updateMode(value);
    try { localStorage.setItem(key, value); } catch { /* Keep the selection for this session if storage is unavailable. */ }
  }
  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}

export function ThemeControl({ labels = false }: { labels?: boolean }) {
  const { mode, setMode } = useContext(ThemeContext);
  return <div className={`theme-control ${labels ? 'with-labels' : ''}`} role="group" aria-label={t("外观主题")}>
    {([{ value: 'light', label: t("浅色"), Icon: Sun }, { value: 'dark', label: t("深色"), Icon: Moon }, { value: 'system', label: t("跟随系统"), Icon: Monitor }] as const).map(({ value, label, Icon }) =>
      <button key={value} type="button" aria-label={t("{0}主题", { 0: label })} aria-pressed={mode === value} title={label} onClick={() => setMode(value)}><Icon size={16} />{labels && <span>{label}</span>}</button>
    )}
  </div>;
}
