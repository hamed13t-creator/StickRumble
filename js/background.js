// js/background.js — crowded night arena: tiered supporter stands packed with cheering
// crowd, a sweeping spotlight rig, glowing marquee/sponsor signage, and foreground
// floor-light + bokeh for depth. Each layer scrolls at a different fraction of camera
// movement (far layers move less) to sell depth behind the fight. All motion (crowd
// bob, flag wave, spotlight sweep, bulb chase, camera flashes) runs via native SVG
// SMIL animation, so there is zero per-frame JS cost beyond the existing translateX
// repositioning in update().
import { WORLD_W, STAGE_W, STAGE_H } from './world.js';

// Deterministic pseudo-random so the arena is stable across reloads/rounds.
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

const CROWD_COLORS = ['#3f7bff', '#ff5c5c', '#ffcf4d', '#7fffd4', '#c97b3d', '#a86bff', '#ff8fd1', '#5ce1ff'];
const LIGHT_COLORS = ['#2e6bff', '#ff3b3b', '#ffcf4d', '#a86bff', '#7fffd4'];

function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

// One raised arm or waving flag above a crowd member — small % chance per person,
// keeps the stands from reading as a static wall of dots.
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

// One horizontal row of supporters: alternating small circle "heads+bodies", gently
// bobbing on independent staggered timers so the crowd feels alive, not synchronized.
function buildCrowdRow(rand, w, y, spacing, r, opts = {}) {
  const armChance = opts.armChance ?? 0;
  let x = -spacing * 0.5 + rand() * spacing;
  let out = '';
  while (x < w + spacing) {
    const color = pick(rand, CROWD_COLORS);
    const bob = (1 + rand() * 1.8).toFixed(1);
    const dur = (2 + rand() * 2.2).toFixed(2);
    const delay = (rand() * 3).toFixed(2);
    out += `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})">` +
      `<animateTransform attributeName="transform" type="translate" additive="sum" values="0,0;0,${-bob};0,0" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>` +
      `<circle r="${r}" fill="${color}"/>` +
      `<circle cy="${(-r * 0.9).toFixed(1)}" r="${(r * 0.55).toFixed(1)}" fill="#e8c39e" opacity=".9"/>` +
      (rand() < armChance ? armOrFlag(rand, r) : '') +
      `</g>`;
    x += spacing * (0.7 + rand() * 0.6);
  }
  return out;
}

// Banded stadium-tier backdrop sitting behind each crowd row, giving the stands a
// stepped bleacher silhouette instead of a flat wall of color.
function buildTierBackdrop(w, baseY, rows, rowH, colorTop, colorBottom) {
  let out = '';
  for (let i = 0; i < rows; i++) {
    const y = baseY - i * rowH;
    const shade = 1 - i / rows;
    out += `<rect x="-40" y="${(y - rowH).toFixed(1)}" width="${(w + 80).toFixed(1)}" height="${rowH.toFixed(1)}" fill="${i % 2 === 0 ? colorTop : colorBottom}" opacity="${(0.5 + shade * 0.3).toFixed(2)}"/>`;
  }
  return out;
}

// Overhead lighting truss with several fixtures, each slowly sweeping a translucent
// colored beam back and forth across the crowd below.
function buildSpotlightRig(rand, w, count) {
  let out = `<rect x="-40" y="16" width="${(w + 80).toFixed(1)}" height="9" fill="#15101a"/>`;
  for (let i = 0; i < count; i++) {
    const fx = (w / (count + 1)) * (i + 1);
    const color = LIGHT_COLORS[i % LIGHT_COLORS.length];
    const sweep = (8 + rand() * 12).toFixed(1);
    const dur = (4 + rand() * 3).toFixed(2);
    const delay = (rand() * 2).toFixed(2);
    out += `<g transform="translate(${fx.toFixed(1)},22)">` +
      `<rect x="-5" y="-5" width="10" height="9" rx="2" fill="#241a30"/>` +
      `<circle r="2.6" fill="${color}"/>` +
      `<g>` +
      `<animateTransform attributeName="transform" type="rotate" values="${-sweep} 0 0;${sweep} 0 0;${-sweep} 0 0" dur="${dur}s" begin="${delay}s" repeatCount="indefinite"/>` +
      `<polygon points="-3,3 3,3 88,360 -88,360" fill="${color}" opacity=".08"/>` +
      `<polygon points="-1.6,3 1.6,3 34,220 -34,220" fill="${color}" opacity=".16"/>` +
      `</g>` +
      `</g>`;
  }
  return out;
}

// Glowing neon marquee/jumbotron sign with a flickering title and a chase-lit bulb
// border (top row lit while bottom row dims, and vice versa).
function buildMarquee(rand, cx, cy, text, hue) {
  const w = 210, h = 58, n = 14;
  let bulbsTop = '', bulbsBot = '';
  for (let i = 0; i < n; i++) {
    const bx = -w / 2 + 8 + (w - 16) * (i / (n - 1));
    const delay = (i * 0.09 + rand() * 0.04).toFixed(2);
    bulbsTop += `<circle cx="${bx.toFixed(1)}" cy="${(-h / 2).toFixed(1)}" r="2.4" fill="#fff6da"><animate attributeName="opacity" values="1;0.15;1" dur="1.4s" begin="${delay}s" repeatCount="indefinite"/></circle>`;
    bulbsBot += `<circle cx="${bx.toFixed(1)}" cy="${(h / 2).toFixed(1)}" r="2.4" fill="#fff6da"><animate attributeName="opacity" values="0.15;1;0.15" dur="1.4s" begin="${delay}s" repeatCount="indefinite"/></circle>`;
  }
  return `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})">` +
    `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="6" fill="#14101c" stroke="#3a2a44" stroke-width="2"/>` +
    `<text x="0" y="6" text-anchor="middle" font-family="Trebuchet MS, sans-serif" font-weight="900" font-size="22" letter-spacing="2" fill="${hue}" style="filter:drop-shadow(0 0 6px ${hue}) drop-shadow(0 0 14px ${hue})">${text}` +
    `<animate attributeName="opacity" values="1;0.85;1;1;0.7;1" dur="3.2s" repeatCount="indefinite"/>` +
    `</text>` +
    bulbsTop + bulbsBot +
    `</g>`;
}

// Small sponsor-style emblem banner (abstract ring/star mark) flanking the marquee,
// bordered by chase-lit string lights along the top edge.
function buildBanner(rand, cx, cy, w, h, accent) {
  const n = 10;
  let bulbs = '';
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const bx = -w / 2 + t * w;
    const delay = (i * 0.08 + rand() * 0.05).toFixed(2);
    bulbs += `<circle cx="${bx.toFixed(1)}" cy="${(-h / 2 - 3).toFixed(1)}" r="2" fill="#fff6da"><animate attributeName="opacity" values="1;0.2;1" dur="1.1s" begin="${delay}s" repeatCount="indefinite"/></circle>`;
  }
  return `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})">` +
    `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="4" fill="#1c1522" stroke="${accent}" stroke-width="1.5" opacity=".95"/>` +
    `<circle r="${(Math.min(w, h) * 0.22).toFixed(1)}" fill="none" stroke="${accent}" stroke-width="2" opacity=".8"/>` +
    `<polygon points="0,${(-h * 0.18).toFixed(1)} ${(h * 0.14).toFixed(1)},${(h * 0.12).toFixed(1)} ${(-h * 0.14).toFixed(1)},${(h * 0.12).toFixed(1)}" fill="${accent}" opacity=".9"/>` +
    bulbs +
    `</g>`;
}

// Randomly-timed camera-flash pops scattered through the crowd — brief bright pulses
// on independent, irregular timers so they read as scattered phone/camera flashes.
function buildFlashes(rand, w, hMin, hMax, count) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = hMin + rand() * (hMax - hMin);
    const r = 1.2 + rand() * 1.6;
    const dur = (3 + rand() * 4).toFixed(2);
    const pop = 0.05 + rand() * 0.1;
    const keyTimes = `0;${(0.5 - pop).toFixed(2)};0.5;${(0.5 + pop).toFixed(2)};1`;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#fff">` +
      `<animate attributeName="opacity" values="0;0;1;0;0" keyTimes="${keyTimes}" dur="${dur}s" begin="${(rand() * dur).toFixed(2)}s" repeatCount="indefinite"/>` +
      `</circle>`;
  }
  return out;
}

export class ParallaxBackground {
  constructor(containerEl) {
    this.container = containerEl;
    this.layers = [];
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
    // Layer 0: night sky, moon, stars, and a soft violet floodlight haze near the horizon.
    const sky = this._makeLayer(0.02, 1.3);
    sky.el.innerHTML = `
      <defs>
        <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffe9a8" stop-opacity=".9"/>
          <stop offset="100%" stop-color="#ffe9a8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="floodHaze" cx="50%" cy="100%" r="70%">
          <stop offset="0%" stop-color="#6a4bd6" stop-opacity=".35"/>
          <stop offset="100%" stop-color="#6a4bd6" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="${sky.width}" height="${STAGE_H}" fill="url(#floodHaze)"/>
      <circle cx="${sky.width * 0.78}" cy="80" r="70" fill="url(#moonGlow)"/>
      <circle cx="${sky.width * 0.78}" cy="80" r="26" fill="#fff6da"/>
      ${Array.from({ length: 34 }, (_, i) => {
        const r = seeded(i + 1)();
        return `<circle cx="${r * sky.width}" cy="${16 + seeded(i + 99)() * 130}" r="${0.6 + seeded(i + 7)() * 1.2}" fill="#fff" opacity="${0.3 + seeded(i + 3)() * 0.5}"/>`;
      }).join('')}
    `;
    this.layers.push(sky);

    // Layer 1: overhead lighting truss with sweeping colored spotlight beams.
    const truss = this._makeLayer(0.09, 1.4);
    truss.el.innerHTML = buildSpotlightRig(seeded(17), truss.width, 6);
    this.layers.push(truss);

    // Layer 2: far stadium tiers packed with distant crowd, marquee, and banners.
    const far = this._makeLayer(0.2, 1.6);
    const rFar = seeded(29);
    const farBaseY = STAGE_H * 0.86;
    let farHtml = buildTierBackdrop(far.width, farBaseY, 6, 20, '#241a30', '#2c2038');
    for (let row = 0; row < 6; row++) {
      farHtml += buildCrowdRow(rFar, far.width, farBaseY - row * 20 - 10, 15, 3.6, { armChance: 0.05 });
    }
    farHtml += buildMarquee(rFar, far.width * 0.5, STAGE_H * 0.34, 'RING RUMBLE', '#ffcf4d');
    farHtml += buildBanner(rFar, far.width * 0.18, STAGE_H * 0.42, 46, 60, '#2e6bff');
    farHtml += buildBanner(rFar, far.width * 0.82, STAGE_H * 0.42, 46, 60, '#ff3b3b');
    farHtml += buildFlashes(rFar, far.width, STAGE_H * 0.4, farBaseY, 10);
    far.el.innerHTML = farHtml;
    this.layers.push(far);

    // Layer 3: mid tiers — closer, larger crowd with more flag-waving and flashes.
    const mid = this._makeLayer(0.42, 1.9);
    const rMid = seeded(41);
    const midBaseY = STAGE_H * 0.98;
    let midHtml = buildTierBackdrop(mid.width, midBaseY, 5, 28, '#2c2038', '#352842');
    for (let row = 0; row < 5; row++) {
      midHtml += buildCrowdRow(rMid, mid.width, midBaseY - row * 28 - 14, 20, 5.2, { armChance: 0.14 });
    }
    midHtml += buildFlashes(rMid, mid.width, STAGE_H * 0.5, midBaseY, 8);
    mid.el.innerHTML = midHtml;
    this.layers.push(mid);

    // Layer 4: near foreground — barrier, floor-light pooling, and bokeh blobs.
    const near = this._makeLayer(0.82, 1.15);
    const rNear = seeded(53);
    near.el.innerHTML = `
      <defs>
        <filter id="bokehBlur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>
        <linearGradient id="floorGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffcf4d" stop-opacity=".22"/>
          <stop offset="100%" stop-color="#ffcf4d" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect x="0" y="${STAGE_H - 70}" width="${near.width}" height="70" fill="url(#floorGlow)"/>
      ${Array.from({ length: 5 }, (_, i) => {
        const bx = (near.width / 5) * i + rNear() * 30;
        const color = pick(rNear, LIGHT_COLORS);
        return `<circle cx="${bx.toFixed(1)}" cy="${STAGE_H - 30}" r="26" fill="${color}" opacity=".14" filter="url(#bokehBlur)"/>`;
      }).join('')}
      <rect x="0" y="${STAGE_H - 26}" width="${near.width}" height="26" fill="#1a1420"/>
      ${Array.from({ length: Math.ceil(near.width / 46) }, (_, i) =>
        `<rect x="${i * 46}" y="${STAGE_H - 46}" width="6" height="46" fill="#1a1420"/>`
      ).join('')}
      ${buildFlashes(rNear, near.width, STAGE_H - 60, STAGE_H - 30, 6)}
    `;
    this.layers.push(near);
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
}
