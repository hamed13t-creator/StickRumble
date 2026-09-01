// js/audio.js — procedural Web Audio synthesis. No asset files, everything is generated.
let ctx = null;

function ensure() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq1, freq2, dur, type, gain, delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq1, t);
  if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur);
}

function noiseBurst(dur, gain, filterFreq, delay = 0) {
  const t = ctx.currentTime + delay;
  const bufSize = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(filterFreq, t);
  filt.frequency.exponentialRampToValueAtTime(Math.max(200, filterFreq * 0.3), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filt).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + dur);
}

const SFX = {
  punch()   { tone(190, 65, 0.09, 'square', 0.22); noiseBurst(0.06, 0.18, 2200); },
  punchHeavy() { tone(140, 45, 0.14, 'square', 0.3); noiseBurst(0.09, 0.24, 1600); },
  kick()    { tone(120, 38, 0.2, 'sawtooth', 0.32); noiseBurst(0.12, 0.26, 1200); },
  block()   { tone(520, 380, 0.09, 'triangle', 0.2); },
  whoosh()  { noiseBurst(0.18, 0.14, 3200); },
  splatter(){ noiseBurst(0.22, 0.2, 900); tone(90, 40, 0.15, 'sawtooth', 0.12); },
  land()    { tone(80, 40, 0.1, 'sine', 0.22); noiseBurst(0.05, 0.1, 500); },
  dash()    { tone(320, 760, 0.12, 'sine', 0.16); },
  flip()    { tone(440, 880, 0.16, 'sine', 0.14); },
  pickup()  { tone(600, 1200, 0.15, 'sine', 0.2); },
  ko() {
    [180, 100, 55].forEach((f, i) => tone(f, f * 0.4, 0.4, 'sawtooth', 0.28, i * 0.09));
  },
  special() {
    [520, 780, 1040].forEach((f, i) => tone(f, null, 0.3, 'sawtooth', 0.26, i * 0.06));
  },
  bell() {
    [880, 1320].forEach((f, i) => tone(f, null, 0.6, 'sine', 0.3, i * 0.05));
  },
  cheer() {
    for (let i = 0; i < 6; i++) tone(440 + Math.random() * 440, null, 0.4, 'sine', 0.15, i * 0.08);
  }
};

export const Audio = {
  unlock() { ensure(); },
  play(name) {
    if (!ctx) return; // stays silent until unlock() has been called from a user gesture
    const fn = SFX[name];
    if (fn) fn();
  }
};
