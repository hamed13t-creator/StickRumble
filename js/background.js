// js/background.js — chaotic night arena crowd with shuffled supporters.
//
// BUGFIX: the previous version of this file called buildTierBackdrop(), a function
// that was never defined anywhere in the codebase — a stray comment even said
// "keep your existing buildTierBackdrop, buildSpotlightRig, buildMarquee, buildBanner,
// buildFlashes" as if those already existed, but none of them did. Since _build() runs
// synchronously from the constructor, and `new ParallaxBackground(...)` runs at
// main.js's top-level module init, this threw a ReferenceError before any other game
// code could run — the entire game failed to boot, not just the background. Every
// helper below is now actually implemented.
//
// Five parallax layers, matching the intended scene: night sky/stars, a spotlight
// truss with sweeping beam cones, far stadium tiers with crowd + the marquee sign,
// mid tiers with crowd + flags + an ad-board + camera flashes, and a soft bokeh
// foreground. All motion is SVG SMIL (<animate>/<animateTransform>) so it costs zero
// per-frame JS — only layer-level pan/zoom (update()) touches the DOM each frame.
import { WORLD_W, STAGE_W, STAGE_H } from './world.js';

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

const CROWD_COLORS = ['#3f7bff', '#ff5c5c', '#ffcf4d', '#7fffd4', '#c97b3d', '#a86bff', '#ff8fd1', '#5ce1ff'];
const LIGHT_COLORS = ['#2e6bff', '#ff3b3b', '#ffcf4d', '#a86bff', '#7fffd4'];
const AD_COLORS = ['#2e6bff', '#ff3b3b', '#ffcf4d', '#7fffd4', '#a86bff'];
const BOKEH_COLORS = ['#ffcf4d', '#ff3b3b', '#2e6bff', '#7fffd4'];

function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

function armOrFlag(rand, r) {
  const flagColor = pick(rand, LIGHT_COLORS);
  const side = rand() < 0.5 ? -1 : 1;
  const len = r * (1.6 + rand() * 0.6);
  return `<g transform="translate(${(side * r * 0.5).toFixed(1)},${(-r * 1.2).toFixed(1)})">` +
    `<animateTransform attributeName="transform" type="rotate" additive="sum" values="0;${side * 16};0" dur="${(0.5 + rand() * 0.4).toFixed(2)}s" begin="${(rand() * 2).toFixed(2)}s" repeatCount="indefinite"/>` +
    `<line x1="0" y1="0" x2="0" y2="${(-len).toFixed(1)}" stroke="#241a30" stroke-width="1"/>` +
    `<polygon points="0,${(-len).toFixed(1)} ${(side * len * 0.7).toFixed(1)},${(-len * 1.3).toFixed(1)} 0,${(-len * 1.6).toFixed(1)}" fill="${flagColor}" opacity=".9"/>` +
    `</g>`;
}

// ---- Chaotic crowd row builder ----
function buildCrowdRow(rand, w, y, spacing, r, opts = {}) {
  const armChance = opts.armChance ?? 0;
  let x = -spacing * 0.5 + rand() * spacing;
  let out = '';
  while (x < w + spacing) {
    const color = pick(rand, CROWD_COLORS);
    const bob = (0.8 + rand() * 2.5).toFixed(1);
    const dur = (1.5 + rand() * 3.5).toFixed(2);
    const delay = (rand() * 4).toFixed(2);
    const yOffset = (rand() * 6 - 3).toFixed(1);   // vertical shuffle
    const xOffset = (rand() * 8 - 4).toFixed(1);   // horizontal shuffle

    out += `<g transform="translate(${(x + parseFloat(xOffset)).toFixed(1)},${(y + parseFloat(yOffset)).toFixed(1)})">` +
      `<animateTransform attributeName="transform" type="translate" additive="sum" values="0,0;0,${-bob};0,0" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>` +
      `<circle r="${r}" fill="${color}"/>` +
      `<circle cy="${(-r * 0.9).toFixed(1)}" r="${(r * 0.55).toFixed(1)}" fill="#e8c39e" opacity=".9"/>` +
      (rand() < armChance * (0.5 + rand() * 1.5) ? armOrFlag(rand, r) : '') +
      `</g>`;

    x += spacing * (0.6 + rand() * 0.9); // irregular spacing increment
  }
  return out;
}

// ---- Stacked stadium terrace behind the crowd, for depth/context ----
function buildTierBackdrop(w, baseY, tiers, tierH, colorA, colorB) {
  let out = '';
  for (let i = 0; i < tiers; i++) {
    const y = baseY - (i + 1) * tierH;
    out += `<rect x="0" y="${y.toFixed(1)}" width="${w}" height="${tierH}" fill="${i % 2 === 0 ? colorA : colorB}"/>` +
      `<rect x="0" y="${y.toFixed(1)}" width="${w}" height="2" fill="#000" opacity=".18"/>`;
  }
  return out;
}

// ---- Night sky: gradient + twinkling stars ----
function buildSkyLayer(w, h, rand) {
  const starCount = Math.round(w / 14);
  let out = `<defs><linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="#150f1f"/><stop offset="55%" stop-color="#1e1628"/><stop offset="100%" stop-color="#241a30"/>` +
    `</linearGradient></defs>` +
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#skyGrad)"/>`;
  for (let i = 0; i < starCount; i++) {
    const x = rand() * w, y = rand() * h * 0.6;
    const r = (0.5 + rand() * 1.3).toFixed(1);
    const dur = (1.6 + rand() * 2.6).toFixed(2);
    const delay = (rand() * 3).toFixed(2);
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="#fff">` +
      `<animate attributeName="opacity" values="0.15;0.9;0.15" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>` +
      `</circle>`;
  }
  return out;
}

// ---- Overhead rigging truss with slowly sweeping spotlight beam cones ----
function buildTrussLayer(w, h, rand) {
  const trussY = h * 0.1;
  let out = `<line x1="0" y1="${trussY.toFixed(1)}" x2="${w}" y2="${trussY.toFixed(1)}" stroke="#1a1420" stroke-width="6"/>`;
  const step = 42;
  for (let x = 0; x < w; x += step) {
    out += `<line x1="${x}" y1="${(trussY - 6).toFixed(1)}" x2="${x + step}" y2="${(trussY + 6).toFixed(1)}" stroke="#241a30" stroke-width="2"/>` +
      `<line x1="${x}" y1="${(trussY + 6).toFixed(1)}" x2="${x + step}" y2="${(trussY - 6).toFixed(1)}" stroke="#241a30" stroke-width="2"/>`;
  }
  const count = Math.max(1, Math.round(w / 220));
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) * (w / count);
    const base = (rand() * 10 - 5);
    const dur = (3 + rand() * 2.5).toFixed(2);
    out += `<g transform="translate(${x.toFixed(1)},${trussY.toFixed(1)})">` +
      `<rect x="-7" y="-2" width="14" height="11" rx="2" fill="#2c2038"/>` +
      `<g>` +
      `<animateTransform attributeName="transform" type="rotate" values="${(base - 15).toFixed(1)};${(base + 15).toFixed(1)};${(base - 15).toFixed(1)}" dur="${dur}s" repeatCount="indefinite"/>` +
      `<polygon points="-4,9 4,9 58,160 -58,160" fill="#fff2c4" opacity=".045"/>` +
      `</g></g>`;
  }
  return out;
}

// ---- Neon marquee sign with a chase-lit bulb strip ----
function buildMarquee(w, y) {
  const cx = w / 2, signW = Math.min(440, w * 0.42), signH = 46;
  const bulbCount = Math.max(8, Math.round(signW / 18));
  let bulbs = '';
  for (let i = 0; i < bulbCount; i++) {
    const t = i / (bulbCount - 1);
    const bx = cx - signW / 2 + t * signW;
    const dur = 1.2;
    const delay = (i * (dur / bulbCount)).toFixed(2);
    bulbs += `<circle cx="${bx.toFixed(1)}" cy="${(y - signH - 6).toFixed(1)}" r="2.4" fill="#ffcf4d">` +
      `<animate attributeName="opacity" values="0.22;1;0.22" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>` +
      `</circle>`;
  }
  return `<g>` +
    `<rect x="${(cx - signW / 2).toFixed(1)}" y="${(y - signH).toFixed(1)}" width="${signW.toFixed(1)}" height="${signH}" rx="6" fill="#1a1420" stroke="#3a2a3f" stroke-width="2"/>` +
    `<text x="${cx.toFixed(1)}" y="${(y - signH / 2 + 7).toFixed(1)}" text-anchor="middle" font-family="Trebuchet MS, Segoe UI, sans-serif" font-weight="900" font-size="21" letter-spacing="3" fill="#ff3b3b" stroke="#ffcf4d" stroke-width="0.6">STICK RUMBLE</text>` +
    bulbs + `</g>`;
}

// ---- Ringside ad barricade: abstract sponsor-style color blocks, no real branding ----
function buildAdBanner(w, y, h, rand) {
  let out = `<rect x="0" y="${y.toFixed(1)}" width="${w}" height="${h}" fill="#12101a"/>`;
  const blockW = 68;
  let x = 0;
  while (x < w) {
    out += `<rect x="${x}" y="${(y + h * 0.16).toFixed(1)}" width="${blockW - 6}" height="${(h * 0.68).toFixed(1)}" rx="3" fill="${pick(rand, AD_COLORS)}" opacity=".55"/>`;
    x += blockW;
  }
  return out;
}

// ---- Scattered photographer camera-flash sparkles among the mid crowd ----
function buildFlashes(w, count, rand, yTop, yBottom) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = yTop + rand() * (yBottom - yTop);
    const delay = (rand() * 6).toFixed(2);
    const dur = (3 + rand() * 3).toFixed(2);
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#fff" opacity="0">` +
      `<animate attributeName="opacity" values="0;0;0.9;0;0" keyTimes="0;0.93;0.955;0.98;1" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>` +
      `</circle>`;
  }
  return out;
}

// ---- Soft blurred foreground bokeh, drifting slowly, sits nearest the camera ----
function buildBokeh(w, h, rand, count) {
  let out = `<defs><filter id="bokehBlur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4.5"/></filter></defs>`;
  for (let i = 0; i < count; i++) {
    const x = rand() * w, y = h * (0.55 + rand() * 0.45);
    const r = (8 + rand() * 22).toFixed(1);
    const dur = (6 + rand() * 6).toFixed(2);
    const dx = (rand() * 34 - 17).toFixed(1);
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${pick(rand, BOKEH_COLORS)}" opacity="${(0.05 + rand() * 0.08).toFixed(2)}" filter="url(#bokehBlur)">` +
      `<animateTransform attributeName="transform" type="translate" values="0,0;${dx},0;0,0" dur="${dur}s" repeatCount="indefinite"/>` +
      `</circle>`;
  }
  return out;
}

export class ParallaxBackground {
  constructor(containerEl) {
    this.container = containerEl;
    this.layers = [];
    this._pulseTimer = null;
    this._build();
  }

  _makeLayer(factor, widthMult) {
    const w = STAGE_W * widthMult;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${STAGE_H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('bgLayer');
    svg.style.width = w + 'px';
    this.container.appendChild(svg);
    return { el: svg, factor, width: w };
  }

  _build() {
    // Layer 1 — night sky + stars (farthest, barely moves)
    const sky = this._makeLayer(0.05, 1.3);
    sky.el.innerHTML = buildSkyLayer(sky.width, STAGE_H, seeded(7));
    this.layers.push(sky);

    // Layer 2 — spotlight truss with sweeping beam cones
    const truss = this._makeLayer(0.12, 1.4);
    truss.el.innerHTML = buildTrussLayer(truss.width, STAGE_H, seeded(13));
    this.layers.push(truss);

    // Layer 3 — far stadium tiers, seeded crowd, and the marquee sign
    const far = this._makeLayer(0.2, 1.6);
    const rFar = seeded(29);
    const farBaseY = STAGE_H * 0.86;
    let farHtml = buildTierBackdrop(far.width, farBaseY, 6, 20, '#241a30', '#2c2038');
    farHtml += buildMarquee(far.width, farBaseY - 6 * 20 - 14);
    for (let row = 0; row < 6; row++) {
      farHtml += buildCrowdRow(rFar, far.width, farBaseY - row * 20 - 10, 15, 3.6, { armChance: 0.08 });
    }
    far.el.innerHTML = farHtml;
    this.layers.push(far);

    // Layer 4 — mid tiers, crowd with flags, camera flashes, ringside ad barricade
    const mid = this._makeLayer(0.42, 1.9);
    const rMid = seeded(41);
    const midBaseY = STAGE_H * 0.98;
    let midHtml = buildTierBackdrop(mid.width, midBaseY, 5, 28, '#2c2038', '#352842');
    for (let row = 0; row < 5; row++) {
      midHtml += buildCrowdRow(rMid, mid.width, midBaseY - row * 28 - 14, 20, 5.2, { armChance: 0.18 });
    }
    midHtml += buildFlashes(mid.width, 10, seeded(61), midBaseY - 5 * 28, midBaseY);
    midHtml += buildAdBanner(mid.width, midBaseY - 14, 14, seeded(53)); // frontmost, drawn last so it sits in front of the crowd
    mid.el.innerHTML = midHtml;
    this.layers.push(mid);

    // Layer 5 — soft bokeh foreground, nearest the camera
    const fg = this._makeLayer(0.6, 1.2);
    fg.el.innerHTML = buildBokeh(fg.width, STAGE_H, seeded(97), 14);
    this.layers.push(fg);
  }

  update(cameraCenterX, zoom = 1) {
    this.layers.forEach(layer => {
      const shift = (cameraCenterX - WORLD_W / 2) * layer.factor;
      const baseOffset = (layer.width - STAGE_W) / 2;
      const tx = -baseOffset - shift;
      layer.el.style.transform = `translateX(${tx.toFixed(1)}px) scale(${zoom})`;
      layer.el.style.transformOrigin = 'center center';
    });
  }

  // Crowd "surge" — briefly pulses every layer via the .bgLayer.crowdCheer CSS rule
  // (already defined in style.css, previously never triggered from anywhere).
  // intensity: roughly 0.5 (small reaction) to 3 (KO / match-winning moment).
  pulse(intensity = 1) {
    clearTimeout(this._pulseTimer);
    const holdMs = 500 + Math.min(intensity, 3) * 350;
    this.layers.forEach(layer => layer.el.classList.add('crowdCheer'));
    this._pulseTimer = setTimeout(() => {
      this.layers.forEach(layer => layer.el.classList.remove('crowdCheer'));
    }, holdMs);
  }
}
