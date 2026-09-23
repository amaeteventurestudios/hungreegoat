/** Original test signal: one second of a quiet 220 Hz sine wave, mono PCM16. */
export function tinyWav(): Buffer {
  const sampleRate = 22050;
  const frames = sampleRate;
  const dataBytes = frames * 2;
  const audio = Buffer.alloc(44 + dataBytes);
  audio.write("RIFF", 0);
  audio.writeUInt32LE(36 + dataBytes, 4);
  audio.write("WAVEfmt ", 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(sampleRate, 24);
  audio.writeUInt32LE(sampleRate * 2, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34);
  audio.write("data", 36);
  audio.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < frames; frame++) {
    audio.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * frame / sampleRate) * 655), 44 + frame * 2);
  }
  return audio;
}
