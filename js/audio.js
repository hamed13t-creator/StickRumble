// js/audio.js — procedural Web Audio synthesis. No asset files, everything is generated.
let ctx = null;
 
// OPTIMIZATION: noiseBurst()/crowdSwell() previously allocated a brand-new AudioBuffer
// and filled it sample-by-sample with Math.random() on every call — up to ~19 of these
// in a single cheer(), plus one on every punch/kick. AudioBuffers are read-only during
// playback, so many concurrent AudioBufferSourceNodes can safely share one buffer; each
// just plays from a random offset via start(when, offset, duration). One shared buffer
// is generated once, up front, instead of per-hit.
const NOISE_BUFFER_SECONDS = 2;
let sharedNoiseBuffer = null;
 
function getNoiseBuffer() {
  if (!sharedNoiseBuffer) {
    const len = Math.floor(ctx.sampleRate * NOISE_BUFFER_SECONDS);
    sharedNoiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = sharedNoiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return sharedNoiseBuffer;
}
 
function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Auto-recover when app comes back to foreground
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    });
    document.addEventListener('pageshow', () => {
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    });
    getNoiseBuffer(); // pre-allocate once, up front, off the hot path
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
 
function tone(freq1, freq2, dur, type, gain, delay = 0, pan = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const panner = ctx.createStereoPanner();
  o.type = type;
  o.frequency.setValueAtTime(freq1, t);
  if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur); // safe floor
  o.connect(g).connect(panner).connect(ctx.destination);
  panner.pan.setValueAtTime(pan, t);
  o.start(t);
  o.stop(t + dur);
}
 
function noiseBurst(dur, gain, filterFreq, delay = 0, pan = 0) {
  const t = ctx.currentTime + delay;
  const buf = getNoiseBuffer();
  const offset = Math.random() * Math.max(0, buf.duration - dur);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(filterFreq, t);
  filt.frequency.exponentialRampToValueAtTime(Math.max(200, filterFreq * 0.3), t + dur);
  const g = ctx.createGain();
  // The per-sample linear taper baked into the old one-off buffer is now folded into
  // this gain envelope alone (it already ramped to near-silence by dur's end).
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const panner = ctx.createStereoPanner();
  panner.pan.setValueAtTime(pan, t);
  src.connect(filt).connect(g).connect(panner).connect(ctx.destination);
  src.start(t, offset, dur);
}
 
function crowdSwell(dur, gain, freqStart, freqEnd, delay = 0) {
  const t = ctx.currentTime + delay;
  const buf = getNoiseBuffer();
  const offset = Math.random() * Math.max(0, buf.duration - dur);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.Q.value = 0.7;
  filt.frequency.setValueAtTime(freqStart, t);
  filt.frequency.linearRampToValueAtTime(freqEnd, t + dur * 0.6);
  filt.frequency.exponentialRampToValueAtTime(Math.max(200, freqEnd * 0.6), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt).connect(g).connect(ctx.destination);
  src.start(t, offset, dur);
}
 
function applauseBurst(count, spread, gain, delay = 0) {
  for (let i = 0; i < count; i++) {
    const d = delay + Math.random() * spread;
    noiseBurst(0.025 + Math.random() * 0.025, gain * (0.6 + Math.random() * 0.4), 3200 + Math.random() * 2400, d, (Math.random() - 0.5) * 0.8);
  }
}
 
const SFX = {
  punch() {
    tone(190, 65, 0.09, 'square', 0.22, 0, -0.2);
    noiseBurst(0.06, 0.18, 2200, 0, 0.2);
    tone(60, null, 0.08, 'sine', 0.12, 0, 0); // low thud layer
  },
  punchHeavy() {
    tone(140, 45, 0.14, 'square', 0.3, 0, -0.3);
    noiseBurst(0.09, 0.24, 1600, 0, 0.3);
    tone(50, null, 0.12, 'sine', 0.18, 0, 0);
  },
  kick() {
    tone(120, 38, 0.2, 'sawtooth', 0.32, 0, 0.2);
    noiseBurst(0.12, 0.26, 1200, 0, -0.2);
    tone(70, null, 0.15, 'sine', 0.14, 0, 0);
  },
  block() { tone(520, 380, 0.09, 'triangle', 0.2); },
  whoosh() { noiseBurst(0.18, 0.14, 3200); },
  splatter() { noiseBurst(0.22, 0.2, 900); tone(90, 40, 0.15, 'sawtooth', 0.12); },
  land() { tone(80, 40, 0.1, 'sine', 0.22); noiseBurst(0.05, 0.1, 500); },
  dash() { tone(320, 760, 0.12, 'sine', 0.16); },
  flip() { tone(440, 880, 0.16, 'sine', 0.14); },
  pickup() { tone(600, 1200, 0.15, 'sine', 0.2); },
  ko() { [180, 100, 55].forEach((f, i) => tone(f, f * 0.4, 0.4, 'sawtooth', 0.28, i * 0.09)); },
  special() { [520, 780, 1040].forEach((f, i) => tone(f, null, 0.3, 'sawtooth', 0.26, i * 0.06)); },
  bell() { [880, 1320].forEach((f, i) => tone(f, null, 0.6, 'sine', 0.3, i * 0.05)); },
  crowdReact(intensity = 1) {
    crowdSwell(0.55, 0.16 * intensity, 500, 1500);
    applauseBurst(7 + Math.round(5 * intensity), 0.4, 0.12, 0.05);
  },
  cheer(intensity = 1) {
    const dur = 1.1 + intensity * 0.5;
    crowdSwell(dur, 0.3 * intensity, 300, 1400);
    crowdSwell(dur * 0.85, 0.22 * intensity, 500, 2200, 0.05);
    applauseBurst(Math.round(14 * intensity), dur * 0.9, 0.14, 0.1);
    const whoops = Math.round(5 + intensity * 4);
    for (let i = 0; i < whoops; i++) {
      tone(380 + Math.random() * 500, null, 0.3 + Math.random() * 0.2, 'triangle', 0.09, 0.15 + Math.random() * dur * 0.7, (Math.random() - 0.5) * 0.6);
    }
  },
};
 
export const Audio = {
  unlock() { ensure(); },
  // BUGFIX: this previously dropped every argument after `name`, so
  // Audio.play('crowdReact', 2) or Audio.play('cheer', 1.6) always ran at a flat
  // intensity=1 regardless of what was passed — the intensity parameters on
  // crowdReact/cheer were dead code. Args now forward straight through.
  play(name, ...args) {
    const activeCtx = ensure();
    if (!activeCtx) return;
    const fn = SFX[name];
    if (fn) fn(...args);
    else console.warn(`[audio] unknown SFX name: "${name}"`); // surfaces typo'd call sites immediately instead of a silent no-op
  }
};
 
