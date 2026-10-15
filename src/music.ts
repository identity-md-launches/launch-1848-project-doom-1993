// Bounded Standard MIDI -> MUS adapter. The original engine's music interface is MUS.
// MIDI is data only; this does not interpret scripts or load instruments from URLs.
const error = (s: string): never => { throw new Error(`Music: ${s}`); };
export function midiToMus(b: Uint8Array): Uint8Array {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 14 || v.getUint32(0) !== 0x4d546864 || v.getUint32(4) !== 6) return error('invalid MIDI header');
  const format = v.getUint16(8), tracks = v.getUint16(10), division = v.getUint16(12);
  if (format > 1 || tracks < 1 || tracks > 64 || !division || division & 0x8000) return error('unsupported MIDI timing');
  const events: { tick: number; kind: number; channel: number; a: number; b: number; order: number }[] = [];
  let pos = 14;
  for (let track = 0; track < tracks; track++) {
    if (pos + 8 > b.length || v.getUint32(pos) !== 0x4d54726b) return error('invalid MIDI track');
    const end = pos + 8 + v.getUint32(pos + 4); pos += 8;
    if (end > b.length) return error('truncated MIDI track');
    const byte = () => { if (pos >= end) return error('truncated event'); return b[pos++]; };
    const variable = () => { let value = 0; for (let i = 0; i < 4; i++) { const n = byte(); value = value * 128 + (n & 127); if (!(n & 128)) return value; } return error('invalid variable integer'); };
    let tick = 0, running = 0;
    while (pos < end) {
      tick += variable(); if (tick > 0x7fffffff || events.length >= 200000) return error('track exceeds limit');
      let status = byte();
      if (status < 128) { if (!running) return error('missing running status'); pos--; status = running; }
      if (status === 255) {
        const type = byte(), len = variable();
        if (len > end - pos) return error('truncated metadata');
        if (type === 81 && len === 3) events.push({ tick, kind: 255, channel: 0, a: b[pos] * 65536 + b[pos + 1] * 256 + b[pos + 2], b: 0, order: events.length });
        pos += len; if (type === 47) { pos = end; break; } continue;
      }
      if (status === 240 || status === 247) { const n = variable(); if (n > end - pos) return error('truncated sysex'); pos += n; running = 0; continue; }
      if (status >= 240) return error('unsupported MIDI event');
      running = status;
      const kind = status >> 4, channel = status & 15, a = byte(), c = kind === 12 || kind === 13 ? 0 : byte();
      if (a > 127 || c > 127) return error('invalid MIDI data');
      events.push({ tick, kind, channel, a, b: c, order: events.length });
    }
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const out: number[] = [], instruments = new Set<number>(), channels = new Map<number, number>();
  let tempo = 500000, tick = 0, time = 0, lastTime = 0, lastStatus = -1;
  function delay(value: number) { const bytes = [value & 127]; while ((value = Math.floor(value / 128)) > 0) bytes.unshift((value & 127) | 128); out.push(...bytes); }
  for (const e of events) {
    time += (e.tick - tick) * tempo * 140 / (division * 1000000); tick = e.tick;
    if (time > 140 * 60 * 60) return error('track longer than one hour');
    if (e.kind === 255) { if (e.a < 1) return error('invalid tempo'); tempo = e.a; continue; }
    let ch: number;
    if (e.channel === 9) ch = 15;
    else { if (!channels.has(e.channel)) channels.set(e.channel, channels.size); ch = channels.get(e.channel)!; }
    let body: number[] = [];
    if (e.kind === 8 || e.kind === 9 && e.b === 0) body = [ch, e.a];
    else if (e.kind === 9) { body = [0x10 | ch, e.a | 128, e.b]; if (ch === 15) instruments.add(e.a + 100); }
    else if (e.kind === 12) { body = [0x40 | ch, 0, e.a]; instruments.add(e.a); }
    else if (e.kind === 14) body = [0x20 | ch, Math.min(255, (e.a + e.b * 128) >> 6)];
    else if (e.kind === 11) {
      const map: Record<number, number> = { 0: 1, 1: 2, 7: 3, 10: 4, 11: 5, 91: 6, 93: 7, 64: 8, 67: 9, 120: 10, 123: 11, 126: 12, 127: 13, 121: 14 };
      const ctrl = map[e.a]; if (ctrl !== undefined) body = ctrl >= 10 ? [0x30 | ch, ctrl] : [0x40 | ch, ctrl, e.b];
    }
    if (!body.length) continue;
    const now = Math.round(time);
    if (lastStatus >= 0 && now > lastTime) { out[lastStatus] |= 128; delay(now - lastTime); }
    lastTime = now; lastStatus = out.length; out.push(...body);
    if (out.length > 65000) return error('MUS score exceeds 65 KB');
  }
  if (lastStatus >= 0) { out[lastStatus] |= 128; delay(140); }
  out.push(0x60);
  const start = 16 + instruments.size * 2, result = new Uint8Array(start + out.length), header = new DataView(result.buffer);
  result.set([77, 85, 83, 26]); header.setUint16(4, out.length, true); header.setUint16(6, start, true); header.setUint16(8, channels.size, true); header.setUint16(12, instruments.size, true);
  let i = 16; for (const id of instruments) { header.setUint16(i, id, true); i += 2; } result.set(out, start); return result;
}

export function validateMus(b: Uint8Array): void {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 16 || v.getUint32(0) !== 0x4d55531a) return error('invalid MUS header');
  const start = v.getUint16(6, true), end = start + v.getUint16(4, true);
  if (start < 16 + v.getUint16(12, true) * 2 || end > b.length || start >= end) return error('invalid MUS range');
  let p = start, elapsed = 0;
  const read = () => { if (p >= end) return error('truncated MUS event'); return b[p++]; };
  while (p < end) {
    const status = read(), kind = status >> 4 & 7;
    if (kind === 6) { if (!elapsed) return error('MUS score has no time progression'); return; }
    if (kind === 0 || kind === 2 || kind === 3) read();
    else if (kind === 1) { if (read() & 128) read(); }
    else if (kind === 4) { read(); read(); }
    else return error('unsupported MUS event');
    if (status & 128) { let d = 0, done = false; for (let j = 0; j < 4; j++) { const n = read(); d = d * 128 + (n & 127); if (!(n & 128)) { done = true; break; } } if (!done) return error('MUS delay exceeds limit'); elapsed += d; }
  }
  return error('MUS score has no end');
}
