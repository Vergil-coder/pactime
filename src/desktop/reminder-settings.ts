import type { ReminderAudioMode } from '../core/types';
import { access, readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validLanguagePreference, type LanguagePreference } from '../shared/i18n';

export interface ReminderSettings { audio: ReminderAudioMode; popup: boolean; language: LanguagePreference }
// Chromium owns "Preferences"; "preferences" is the same path on most Mac/Windows disks.
export const reminderSettingsDirectory = (userData: string) => join(userData, 'pactime-settings');
export async function loadReminderPreferences(userData: string): Promise<ReminderSettings> {
  const directory = reminderSettingsDirectory(userData);
  try { await access(join(directory, 'reminder-settings.json')); }
  catch { return loadReminderSettings(join(userData, 'preferences')); }
  return loadReminderSettings(directory);
}
export async function loadReminderSettings(directory: string): Promise<ReminderSettings> {
  try {
    const value = JSON.parse(await readFile(join(directory, 'reminder-settings.json'), 'utf8'));
    return { audio: ['voice', 'soft', 'sound', 'off'].includes(value?.audio) ? value.audio : 'voice', popup: typeof value?.popup === 'boolean' ? value.popup : true, language: validLanguagePreference(value?.language) };
  } catch { return { audio: 'voice', popup: true, language: 'system' }; }
}
export async function saveReminderSettings(directory: string, settings: ReminderSettings): Promise<void> {
  await mkdir(directory, { recursive: true });
  const file = join(directory, 'reminder-settings.json');
  await writeFile(file + '.next', JSON.stringify(settings), { mode: 0o600 });
  await rename(file + '.next', file);
}
