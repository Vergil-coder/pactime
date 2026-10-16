import { writeFile } from 'node:fs/promises';

const sampleRate = 22050, duration = 0.28;
const frames = Math.round(sampleRate * duration);
const wav = Buffer.alloc(44 + frames * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
for (let index = 0; index < frames; index++) {
  const t = index / sampleRate;
  const envelope = Math.min(1, t / .008) * Math.exp(-11 * t) * Math.min(1, (duration - t) / .04);
  const tone = Math.sin(2 * Math.PI * 740 * t) + .18 * Math.sin(2 * Math.PI * 1110 * t);
  wav.writeInt16LE(Math.round(32767 * .085 * tone * envelope), 44 + index * 2);
}
await writeFile(new URL('../assets/reminder-soft.wav', import.meta.url), wav);
console.log(`Gentle reminder: ${duration}s, ${wav.length} bytes`);
