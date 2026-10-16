import { t, getLanguage } from '../shared/i18n';
export function duration(seconds: number): string {
  const minutes = Math.max(0, Math.ceil(seconds / 60));
  if (!minutes) return t("0分钟");
  if (minutes < 60) return t("{0}分钟", { 0: minutes });
  const remainder = minutes % 60;
  return t("{0}小时{1}", { 0: Math.floor(minutes / 60), 1: remainder ? t("{0}分", { 0: remainder }) : '' });
}
export const time = (timestamp: number): string => new Date(timestamp).toLocaleTimeString(getLanguage(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const date = (timestamp: number): string => new Date(timestamp).toLocaleDateString(getLanguage());
export const historyDate = (day: string): string => { const [year, month, dayOfMonth] = day.split('-').map(Number); return date(new Date(year, month - 1, dayOfMonth).getTime()); };
export const timer = (seconds: number): string => { const s = Math.max(0, Math.ceil(seconds)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
