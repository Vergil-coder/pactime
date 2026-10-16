import type { LimitEvent, ReminderAudioMode } from '../core/types';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { powershell } from './windows';
import { getLanguage, localize, type Language } from '../shared/i18n';
const execute = promisify(execFile);
const priorities: Partial<Record<LimitEvent['kind'], number>> = { error: 5, blocked: 4, attempt: 3, grace: 2, warning: 1 };
const priority = (event: LimitEvent) => priorities[event.kind] ?? 0;
interface Playback { event: LimitEvent; resolve?: () => void; reject?: (error: Error) => void }

export class ReminderAudio {
  private mode: ReminderAudioMode = 'voice';
  private playing = false;
  private pending?: Playback;
  private lastError = '';
  private lastErrorAt = -Infinity;
  private controller?: AbortController;
  constructor(private readonly play: (event: LimitEvent, mode: ReminderAudioMode, signal: AbortSignal) => Promise<void>, private readonly failed: (error: Error) => void = () => {}) {}
  setMode(mode: ReminderAudioMode) {
    if (mode !== this.mode || mode === 'off') {
      this.pending?.reject?.(new Error(mode === 'off' ? '声音提醒已关闭。' : '提醒方式已切换，试听已取消。'));
      this.pending = undefined; this.controller?.abort();
    }
    this.mode = mode;
  }
  preview(event: LimitEvent): Promise<void> {
    if (this.mode === 'off') return Promise.reject(new Error('请先开启声音提醒。'));
    return new Promise((resolve, reject) => this.enqueue({ event, resolve, reject }));
  }
  private enqueue(playback: Playback) {
    this.pending?.reject?.(new Error('试听已被新的提醒替代。'));
    this.pending = playback;
    if (!this.playing) void this.drain();
  }
  recovered() { this.lastError = ''; }
  announce(events: LimitEvent[]) {
    if (this.mode === 'off') return;
    const event = [...events].filter(e => priority(e) > 0).sort((a, b) => priority(b) - priority(a))[0];
    if (!event) return;
    if (event.kind === 'error') {
      if (event.message === this.lastError && event.at - this.lastErrorAt < 300_000) return;
      this.lastError = event.message; this.lastErrorAt = event.at;
    }
    // One in-flight playback and one latest pending event; never grow an audio queue.
    this.enqueue({ event });
  }
  private async drain() {
    this.playing = true;
    try {
      while (this.pending && this.mode !== 'off') {
        const playback = this.pending; this.pending = undefined;
        const controller = new AbortController(); this.controller = controller;
        try {
          await this.play(playback.event, this.mode, controller.signal);
          if (controller.signal.aborted) playback.reject?.(new Error('试听已取消。')); else playback.resolve?.();
        } catch (error) {
          if (!controller.signal.aborted) this.failed(error as Error);
          playback.reject?.(controller.signal.aborted ? new Error('试听已取消。') : error as Error);
        }
        finally { this.controller = undefined; }
      }
    } finally { this.playing = false; }
  }
}

let macVoices: Promise<{ name: string; locale: string }[]> | undefined;
async function macVoice(language: Language): Promise<string | undefined> {
  macVoices ??= execute('/usr/bin/say', ['-v', '?'], { timeout: 5000 }).then(({ stdout }) => stdout.split('\n').flatMap(line => {
    const match = /^(.+?)\s+([a-z]{2}_[A-Z]{2})\s+#/.exec(line);
    return match ? [{ name: match[1].trim(), locale: match[2] }] : [];
  })).catch(() => []);
  const voices = await macVoices;
  const locale = language === 'zh-CN' ? 'zh_CN' : 'en_US';
  const preferred = language === 'zh-CN' ? 'Tingting' : 'Samantha';
  return voices.find(voice => voice.locale === locale && voice.name === preferred)?.name
    ?? voices.find(voice => voice.locale === locale)?.name
    ?? voices.find(voice => voice.locale.startsWith(language === 'zh-CN' ? 'zh_' : 'en_'))?.name;
}

export async function playReminder(event: LimitEvent, mode: ReminderAudioMode, soundFile: string, signal?: AbortSignal): Promise<void> {
  if (mode === 'off') return;
  const language = getLanguage();
  const zh = event.kind === 'error' ? 'Pactime 提醒：应用监测或关闭失败，请查看详情并检查权限。' : `Pactime 提醒：${event.title.slice(0, 60)}。${event.message.slice(0, 70)}`;
  const en = event.kind === 'error' ? 'Pactime could not monitor or close an application. Please check permissions.' : `Pactime reminder. ${localize(event.title).slice(0, 120)}. ${localize(event.message).slice(0, 160)}`;
  if (process.platform === 'darwin') {
    const voice = mode === 'voice' ? await macVoice(language) : undefined;
    if (voice) await execute('/usr/bin/say', ['-v', voice, '-r', '190', language === 'zh-CN' ? zh : en], { timeout: 20_000, signal });
    else await execute('/usr/bin/afplay', [soundFile], { timeout: 5000, signal });
    return;
  }
  if (process.platform !== 'win32') return;
  const encoded = Buffer.from(JSON.stringify({ mode, zh, en, language: language === 'zh-CN' ? 'zh' : 'en', soundFile }), 'utf8').toString('base64');
  await powershell(`$data = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json
  if ($data.mode -eq 'voice') {
    $speaker = $null
    try {
      Add-Type -AssemblyName System.Speech
      $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
      $voices = @($speaker.GetInstalledVoices() | Where-Object { $_.Enabled })
      $voice = $voices | Where-Object { $_.VoiceInfo.Culture.Name -like ($data.language + '*') } | Select-Object -First 1
      if ($voice) {
        $speaker.SelectVoice($voice.VoiceInfo.Name)
        if ($data.language -eq 'zh') { $speaker.Speak($data.zh) } else { $speaker.Speak($data.en) }
      } else {
        $player = New-Object System.Media.SoundPlayer($data.soundFile)
        try { $player.PlaySync() } finally { $player.Dispose() }
      }
    } finally { if ($speaker) { $speaker.Dispose() } }
  } else {
    $player = New-Object System.Media.SoundPlayer($data.soundFile)
    try { $player.PlaySync() } finally { $player.Dispose() }
  }`, 20_000, signal);
}
