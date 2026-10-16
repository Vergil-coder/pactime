import { english, type MessageKey } from './messages';

export type Language = 'zh-CN' | 'en';
export type LanguagePreference = Language | 'system';
export const languagePreferences: readonly LanguagePreference[] = ['system', 'zh-CN', 'en'];
export function validLanguagePreference(value: unknown): LanguagePreference {
  return languagePreferences.includes(value as LanguagePreference) ? value as LanguagePreference : 'system';
}
export function resolveLanguage(preference: LanguagePreference, systemLocale: string): Language {
  return preference === 'system' ? /^zh(?:[-_]|$)/i.test(systemLocale) ? 'zh-CN' : 'en' : preference;
}
let systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
let preference: LanguagePreference = 'system';
const listeners = new Set<() => void>();
export const getLanguage = (): Language => resolveLanguage(preference, systemLocale);
export const getLanguagePreference = (): LanguagePreference => preference;
export function setLanguagePreference(value: LanguagePreference, locale = systemLocale): void {
  const previous = getLanguage();
  preference = value; systemLocale = locale;
  if (getLanguage() !== previous) for (const listener of listeners) listener();
}
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  const singular = `${key}_one` as MessageKey;
  const template = getLanguage() === 'en' ? (values.count === 1 && Object.hasOwn(english, singular) ? english[singular] : english[key]) : key;
  return template.replace(/\{(\d+)\}/g, (placeholder, id: string) => String(values[id] ?? placeholder));
}

// Stored events and adapter diagnostics stay in their original canonical form.
// Translate them only at display boundaries, leaving names and paths untouched.
const nestedValues: Partial<Record<MessageKey, readonly number[]>> = {
  '每日 {0} 分钟；{1}。': [1],
  '{0}\n\n原有数据没有被清空。请检查数据文件和访问权限。': [0],
  '修改未保存：{0}': [0],
  '监测暂不可用：{0}{1}': [0, 1],
  '无法读取 {0} 的程序路径，当前不能可靠计时或关闭。{1}': [1],
  '本地保存失败：{0}。重启前请处理存储问题。': [0],
  '关闭失败：{0}{1}': [0, 1],
  'Windows 操作失败：{0}{1}': [0, 1],
  '无法关闭进程 {0}：{1}{2}': [1, 2],
  '无法关闭 {0}：{1}': [1],
  '无法打开数据位置：{0}': [0],
  'Error Domain={0} Code={1} "{2}"': [0]
};
const runtimeKeys: MessageKey[] = [
  '已添加 {0}', '每日 {0} 分钟；{1}。', '到时延迟 {0} 分钟关闭',
  '{0} 的规则已更新', '{0} 将于明天移除', '{0} 今日已锁定',
  '{0} 还剩 {1} 分钟', '{0} 今日额度已用完', '{0} 自动关闭。',
  '{0} 将在 {1} 分钟内关闭', '最终截止 {0}，届时自动关闭。',
  ...Object.keys(nestedValues) as MessageKey[],
  '这个快捷方式指向 {0}，规则会限制这个程序。若它通过启动器打开另一个应用，请从运行列表中选择实际要限制的应用。',
  '系统程序或Pactime自身受保护：{0}'
];
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = [...new Set(runtimeKeys)].sort((a, b) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length).map(key => {
  const ids: number[] = [];
  const parts = key.split(/(\{\d+\})/g).map(part => {
    const match = /^\{(\d+)\}$/.exec(part);
    if (!match) return escapeRegex(part);
    ids.push(Number(match[1])); return '([\\s\\S]*?)';
  });
  return { key, ids, regex: new RegExp(`^${parts.join('')}$`) };
});
export function localize(text: string, depth = 0): string {
  if (getLanguage() !== 'en' || depth > 6 || !/[\u3400-\u9fff]/.test(text)) return text;
  if (Object.hasOwn(english, text)) return english[text as MessageKey];
  const unpunctuated = text.replace(/。$/, '');
  if (unpunctuated !== text && Object.hasOwn(english, unpunctuated)) {
    const translated = english[unpunctuated as MessageKey];
    return /[.!?]$/.test(translated) ? translated : `${translated}.`;
  }
  for (const { key, ids, regex } of patterns) {
    const match = regex.exec(text);
    if (!match) continue;
    const values: Record<string, string> = {};
    ids.forEach((id, index) => { values[id] = nestedValues[key]?.includes(id) ? localize(match[index + 1], depth + 1) : match[index + 1]; });
    return t(key, values);
  }
  if (text.includes('\n')) return text.split('\n').map(line => localize(line, depth + 1)).join('\n');
  // Advice can be appended to a native OS error. Keep the native detail intact.
  return text.split(/(?<=。)/).map(part => {
    if (part === text) return part;
    return localize(part, depth + 1);
  }).join(' ');
}
