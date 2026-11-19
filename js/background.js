// js/background.js — the street-fight scene around the fighters.
//
// Batch 2: the stadium became a night-time street. From back to front:
//   1. sky with a moon and a few stars
//   2. city skyline with lit windows and neon signs
//   3. brick alley wall with graffiti, a chain-link fence, streetlights, and a far
//      crowd standing along the wall
//   4. the near street crowd (three rows of standing, cheering people) with burning
//      oil drums
//   5. (world) the asphalt street itself, drawn in the fight world by main.js
//   6. a FOREGROUND crowd in front of the fighters (backs of heads, raised fists), so
//      the fight is surrounded on both sides like a street circle, plus dark clusters
//      of spectators framing the left and right screen edges.
//
// All crowd motion is SVG SMIL or CSS, so it costs no per-frame JS; only the layer pan
// and zoom (update()) touch the DOM each frame. setActive(false) pauses everything
// outside a live match. This file is render-only: nothing here touches the simulation.
import { WORLD_W, STAGE_W, STAGE_H } from './world.js';

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }
const f1 = n => n.toFixed(1);

const CLOTHES = ['#2a3550', '#4a2633', '#2f4030', '#4a3d22', '#3a2a4f', '#24343f', '#51302a', '#30303a'];
const SKIN = ['#e8c39e', '#c99a6e', '#8d5a3b', '#f1d0b0', '#a8734f', '#5e3a26'];
const NEON = ['#ff3b6b', '#2ee6ff', '#ffcf4d', '#a86bff', '#4dff9a'];

// ---- One standing spectator (facing the fight). armsUp: 0 none, 1 one fist, 2 both.
// animate: give this one their own fist-pump / bounce on top of the row's sway.
function person(rand, x, y, sc, opts = {}) {
  const shirt = opts.dark ? '#08070c' : pick(rand, CLOTHES);
  const skin = opts.dark ? '#0b0a10' : pick(rand, SKIN);
  const arms = opts.arms ?? (rand() < 0.35 ? (rand() < 0.4 ? 2 : 1) : 0);
  const sw = 13 * sc, sh = 22 * sc, hr = 5.4 * sc;
  const lean = (rand() * 8 - 4).toFixed(1);
  const rim = opts.rim ? `stroke="${opts.rim}" stroke-width="${f1(1.2 * sc)}" stroke-opacity=".55"` : '';
  let body = `<path d="M${f1(-sw / 2)},0 Q${f1(-sw / 2 - 1 * sc)},${f1(-sh * 0.7)} ${f1(-sw * 0.32)},${f1(-sh)} L${f1(sw * 0.32)},${f1(-sh)} Q${f1(sw / 2 + 1 * sc)},${f1(-sh * 0.7)} ${f1(sw / 2)},0 Z" fill="${shirt}" ${rim}/>` +
    `<circle cy="${f1(-sh - hr * 0.9)}" r="${f1(hr)}" fill="${skin}" ${rim}/>`;
  if (!opts.dark && rand() < 0.3) body += `<path d="M${f1(-hr)},${f1(-sh - hr * 1.2)} a${f1(hr)},${f1(hr * 0.9)} 0 0 1 ${f1(hr * 2)},0 Z" fill="${pick(rand, ['#111', '#3a2618', '#d8d8d8', '#7a1f1f'])}"/>`; // cap / hair
  let armsSvg = '';
  const armW = f1(3.4 * sc);
  const armCol = opts.dark ? '#08070c' : shirt;
  for (let i = 0; i < arms; i++) {
    const side = arms === 2 ? (i === 0 ? -1 : 1) : (rand() < 0.5 ? -1 : 1);
    const sx = side * sw * 0.36, sy = -sh * 0.92;
    const ex = sx + side * 4 * sc, ey = sy - 10 * sc, hx = sx + side * 2 * sc, hy = sy - 20 * sc;
    const pump = opts.animate
      ? `<animateTransform attributeName="transform" type="rotate" values="0 ${f1(sx)} ${f1(sy)};${side * 14} ${f1(sx)} ${f1(sy)};0 ${f1(sx)} ${f1(sy)}" dur="${(0.42 + rand() * 0.3).toFixed(2)}s" begin="${(rand() * 1.5).toFixed(2)}s" repeatCount="indefinite"/>` : '';
    armsSvg += `<g>${pump}<path d="M${f1(sx)},${f1(sy)} Q${f1(ex)},${f1(ey)} ${f1(hx)},${f1(hy)}" stroke="${armCol}" stroke-width="${armW}" stroke-linecap="round" fill="none"/>` +
      `<circle cx="${f1(hx)}" cy="${f1(hy)}" r="${f1(2.6 * sc)}" fill="${skin}"/></g>`;
  }
  const bounce = opts.animate
    ? `<animateTransform attributeName="transform" type="translate" additive="sum" values="0,0;0,${f1(-3 * sc)};0,0" dur="${(0.5 + rand() * 0.4).toFixed(2)}s" begin="${(rand() * 1.2).toFixed(2)}s" repeatCount="indefinite"/>` : '';
  return `<g transform="translate(${f1(x)},${f1(y)}) rotate(${lean})">${bounce}${armsSvg}${body}</g>`;
}

// A row of people. The row sways as one group; ~15% of people pump their fists solo.
// The outer <g class="rowJump"> is what the CSS cheer animation moves.
function crowdRow(rand, w, y, spacing, sc, opts = {}) {
  let out = '', x = rand() * spacing * 0.5;
  while (x < w + spacing) {
    out += person(rand, x + (rand() * 6 - 3), y + (rand() * 4 - 2) * sc, sc * (0.9 + rand() * 0.2),
      { ...opts, animate: rand() < (opts.solo ?? 0.15) * 0.5 }); // Batch 3: half as many animated people (less repainting on phones)
    x += spacing * (0.55 + rand() * 0.7);
  }
  // Batch 3: the whole-row sway animation was removed. It repainted the full width of
  // every crowd row on every frame, the biggest single cost on phones. Rows still jump
  // on big moments (CSS .rowJump), and individual fans still pump their fists.
  return `<g class="rowJump"><g>${out}</g></g>`;
}

function cheerGlow(w, yTop, yBottom) {
  return `<rect class="cheerGlow" x="0" y="${f1(yTop)}" width="${w}" height="${f1(yBottom - yTop)}" fill="#ffb347" opacity="0"/>`;
}

// ---- 1. Sky ----
function skyLayer(w, h, rand) {
  let out = `<defs><linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#070812"/><stop offset="60%" stop-color="#151127"/><stop offset="100%" stop-color="#2a1830"/></linearGradient>` +
    `<radialGradient id="moonG"><stop offset="0%" stop-color="#fff6dc" stop-opacity=".9"/><stop offset="35%" stop-color="#ffe9b8" stop-opacity=".25"/><stop offset="100%" stop-color="#ffe9b8" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#skyG)"/>`;
  out += `<circle cx="${f1(w * 0.72)}" cy="62" r="70" fill="url(#moonG)"/><circle cx="${f1(w * 0.72)}" cy="62" r="17" fill="#f7eccd"/>`;
  for (let i = 0; i < w / 22; i++) {
    const x = rand() * w, y = rand() * h * 0.4;
    out += i % 4 === 0
      ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.5 + rand())}" fill="#fff" opacity=".8"/>` // static: twinkling cost a repaint per star per frame
      : `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.4 + rand() * 0.8)}" fill="#fff" opacity=".45"/>`;
  }
  return out;
}

// ---- 2. Skyline ----
function skylineLayer(w, h, rand) {
  let out = '', x = -10;
  const base = 300;
  while (x < w) {
    const bw = 40 + rand() * 70, bh = 70 + rand() * 170;
    const top = base - bh;
    out += `<rect x="${f1(x)}" y="${f1(top)}" width="${f1(bw)}" height="${f1(bh + 200)}" fill="${rand() < 0.5 ? '#0f0c1a' : '#141022'}"/>`;
    if (rand() < 0.3) out += `<rect x="${f1(x + bw * 0.45)}" y="${f1(top - 18)}" width="2" height="18" fill="#0f0c1a"/><circle cx="${f1(x + bw * 0.45 + 1)}" cy="${f1(top - 19)}" r="1.6" fill="#ff3b3b"><animate attributeName="opacity" values="1;.1;1" dur="1.6s" repeatCount="indefinite"/></circle>`;
    for (let wy = top + 8; wy < base - 6; wy += 11) {
      for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
        if (rand() < 0.28) out += `<rect x="${f1(wx)}" y="${f1(wy)}" width="4" height="5" fill="${rand() < 0.8 ? '#ffd27a' : '#7ad0ff'}" opacity="${(0.35 + rand() * 0.5).toFixed(2)}"/>`;
      }
    }
    if (rand() < 0.18) {
      const c = pick(rand, NEON);
      out += `<rect x="${f1(x + 6)}" y="${f1(top + 14)}" width="${f1(Math.min(46, bw - 12))}" height="13" rx="2" fill="none" stroke="${c}" stroke-width="2" opacity=".85"><animate attributeName="opacity" values=".85;.85;.2;.85;.85" keyTimes="0;.9;.92;.94;1" dur="${(3 + rand() * 4).toFixed(2)}s" repeatCount="indefinite"/></rect>`;
    }
    x += bw + rand() * 6;
  }
  // haze at the street level
  out += `<defs><linearGradient id="hazeG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3a1f3a" stop-opacity="0"/><stop offset="100%" stop-color="#3a1f3a" stop-opacity=".7"/></linearGradient></defs><rect x="0" y="200" width="${w}" height="${h - 200}" fill="url(#hazeG)"/>`;
  return out;
}

// ---- 3. Alley wall, graffiti, fence, streetlights, far crowd ----
function alleyLayer(w, h, rand) {
  const top = 168, base = 352;
  let out = `<defs>
    <pattern id="brick" width="28" height="14" patternUnits="userSpaceOnUse">
      <rect width="28" height="14" fill="#3a1d1e"/><path d="M0,0H28M0,7H28M0,14H28M7,0V7M21,7V14" stroke="#24110f" stroke-width="1.6"/>
      <rect x="1" y="1" width="5" height="5" fill="#4a2624" opacity=".5"/><rect x="15" y="8" width="5" height="5" fill="#2e1515" opacity=".6"/>
    </pattern>
    <pattern id="fence" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0,0L12,12M12,0L0,12" stroke="#8a8f99" stroke-width="0.8" opacity=".5"/></pattern>
    <linearGradient id="wallShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#000" stop-opacity=".75"/><stop offset="70%" stop-color="#000" stop-opacity=".25"/><stop offset="100%" stop-color="#000" stop-opacity=".55"/></linearGradient>
    <radialGradient id="lampG" cx="50%" cy="0%" r="100%"><stop offset="0%" stop-color="#ffd58a" stop-opacity=".42"/><stop offset="100%" stop-color="#ffd58a" stop-opacity="0"/></radialGradient>
  </defs>`;
  out += `<rect x="0" y="${top}" width="${w}" height="${h - top}" fill="url(#brick)"/>`;
  // doorways / roller shutters break up the wall
  for (let x = 120; x < w; x += 260 + rand() * 200) {
    out += `<rect x="${f1(x)}" y="${top + 60}" width="70" height="${base - top - 60}" fill="#161219"/>` +
      Array.from({ length: 9 }, (_, i) => `<line x1="${f1(x)}" x2="${f1(x + 70)}" y1="${top + 66 + i * 13}" y2="${top + 66 + i * 13}" stroke="#2a2430" stroke-width="2"/>`).join('');
  }
  // graffiti tags (generic, original)
  const tags = ['RUMBLE', 'STREET', 'K.O.', 'FIGHT!', 'NO RULES', '1 v 1'];
  for (let x = 60; x < w; x += 190 + rand() * 160) {
    const c = pick(rand, NEON);
    out += `<text x="${f1(x)}" y="${f1(top + 40 + rand() * 50)}" transform="rotate(${(rand() * 10 - 5).toFixed(1)} ${f1(x)} ${top + 60})" font-family="Impact, 'Arial Black', sans-serif" font-size="${f1(20 + rand() * 16)}" font-style="italic" fill="none" stroke="${c}" stroke-width="2.2" opacity=".75" letter-spacing="1">${pick(rand, tags)}</text>`;
    if (rand() < 0.5) out += `<path d="M${f1(x + 10)},${f1(top + 90)} q20,-14 40,0 t40,0" fill="none" stroke="${pick(rand, NEON)}" stroke-width="3" opacity=".5" stroke-linecap="round"/>`;
  }
  out += `<rect x="0" y="${top}" width="${w}" height="${h - top}" fill="url(#wallShade)"/>`;
  // chain-link fence segments
  for (let x = 0; x < w; x += 420) {
    out += `<rect x="${f1(x + 220)}" y="${base - 90}" width="160" height="90" fill="url(#fence)"/><rect x="${f1(x + 218)}" y="${base - 92}" width="164" height="3" fill="#6b707a" opacity=".6"/>` +
      `<rect x="${f1(x + 218)}" y="${base - 92}" width="3" height="92" fill="#6b707a" opacity=".6"/><rect x="${f1(x + 379)}" y="${base - 92}" width="3" height="92" fill="#6b707a" opacity=".6"/>`;
  }
  // streetlights with flickering cones
  for (let x = 90; x < w; x += 330) {
    const flick = rand() < 0.35;
    out += `<rect x="${x}" y="${top - 20}" width="4" height="${base - top + 20}" fill="#1a171f"/><path d="M${x + 2},${top - 18} q0,-14 22,-14" stroke="#1a171f" stroke-width="4" fill="none"/>` +
      `<rect x="${x + 16}" y="${top - 36}" width="18" height="6" rx="2" fill="#2a2630"/><circle cx="${x + 25}" cy="${top - 29}" r="3" fill="#ffe2a6"/>` +
      `<polygon points="${x + 17},${top - 29} ${x + 33},${top - 29} ${x + 95},${base} ${x - 45},${base}" fill="url(#lampG)">` +
      (flick ? `<animate attributeName="opacity" values="1;1;.3;1;.5;1" keyTimes="0;.8;.83;.86;.9;1" dur="${(4 + rand() * 3).toFixed(2)}s" repeatCount="indefinite"/>` : '') + `</polygon>`;
  }
  // far crowd standing along the wall
  out += crowdRow(rand, w, base - 2, 13, 0.62, { solo: 0.08 });
  out += crowdRow(rand, w, base + 8, 14, 0.7, { solo: 0.1 });
  out += cheerGlow(w, base - 40, base + 10);
  return out;
}

// ---- 4. Near street crowd with burning oil drums ----
function streetCrowdLayer(w, h, rand) {
  const base = 405;
  let out = `<defs><radialGradient id="fireG"><stop offset="0%" stop-color="#ffb347" stop-opacity=".55"/><stop offset="100%" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient></defs>`;
  const drums = [];
  for (let x = 160; x < w; x += 380 + rand() * 260) drums.push(x);
  // fire glow first (behind people)
  for (const x of drums) out += `<circle cx="${f1(x)}" cy="${base - 40}" r="90" fill="url(#fireG)" opacity=".9"/>`; // static glow (a 180 px animated circle repainted every frame)
  out += crowdRow(rand, w, base - 26, 24, 1.15, { solo: 0.18, rim: '#ff9a52' });
  out += crowdRow(rand, w, base - 12, 26, 1.3, { solo: 0.2, rim: '#ff9a52' });
  for (const x of drums) {
    out += `<rect x="${f1(x - 13)}" y="${base - 34}" width="26" height="34" rx="2" fill="#2b2f36" stroke="#14161a" stroke-width="2"/>` +
      `<line x1="${f1(x - 13)}" x2="${f1(x + 13)}" y1="${base - 24}" y2="${base - 24}" stroke="#14161a" stroke-width="2"/><line x1="${f1(x - 13)}" x2="${f1(x + 13)}" y1="${base - 11}" y2="${base - 11}" stroke="#14161a" stroke-width="2"/>`;
    for (let i = 0; i < 3; i++) {
      const fx = x - 7 + i * 7, fh = 16 + rand() * 10;
      out += `<path d="M${f1(fx - 5)},${base - 34} Q${f1(fx)},${f1(base - 34 - fh * 1.6)} ${f1(fx + 5)},${base - 34} Z" fill="${i === 1 ? '#ffd166' : '#ff6a2b'}" opacity=".9">` +
        `<animateTransform attributeName="transform" type="scale" values="1 1;1.08 0.8;0.95 1.15;1 1" additive="sum" dur="${(0.35 + rand() * 0.25).toFixed(2)}s" repeatCount="indefinite"/></path>`;
    }
  }
  out += cheerGlow(w, base - 90, base);
  return out;
}

// ---- 6a. Foreground crowd in front of the fight (big, dark, backlit) ----
function foregroundLayer(w, h, rand) {
  let out = '';
  out += crowdRow(rand, w, h + 40, 52, 2.5, { dark: true, rim: '#ffb07a', solo: 0.24 });
  out += crowdRow(rand, w, h + 72, 66, 3.1, { dark: true, rim: '#ff8a5c', solo: 0, arms: 0 });
  return out;
}

// ---- 6b. Spectators framing the screen edges (screen-fixed) ----
function sideCluster(rand, side) {
  let out = '';
  for (let i = 0; i < 4; i++) {
    const x = side < 0 ? 4 + i * 18 + rand() * 6 : 96 - i * 18 - rand() * 6;
    out += person(rand, x * 0.8, 430 + i * 12 + rand() * 6, 2.2 - i * 0.2, { dark: true, rim: '#ff9a62', arms: rand() < 0.6 ? 1 : 0, animate: rand() < 0.35 });
  }
  return out;
}

export class ParallaxBackground {
  // containerEl: behind the world. fgEl (optional): in front of the world.
  constructor(containerEl, fgEl = null) {
    this.container = containerEl;
    this.fgContainer = fgEl;
    this.layers = [];
    this._pulseTimer = null;
    this._build();
  }

  _makeLayer(factor, widthMult, parent = this.container, origin = 'center center') {
    const w = Math.round(STAGE_W * widthMult);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${STAGE_H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('overflow', 'visible');
    svg.classList.add('bgLayer');
    svg.style.width = w + 'px';
    svg.style.transformOrigin = origin;
    parent.appendChild(svg);
    return { el: svg, factor, width: w, tx: NaN, zoom: NaN };
  }

  _build() {
    const sky = this._makeLayer(0.04, 1.3);
    sky.el.innerHTML = skyLayer(sky.width, STAGE_H, seeded(7));
    this.layers.push(sky);

    const city = this._makeLayer(0.1, 1.4);
    city.el.innerHTML = skylineLayer(city.width, STAGE_H, seeded(13));
    this.layers.push(city);

    const alley = this._makeLayer(0.25, 1.7);
    alley.el.innerHTML = alleyLayer(alley.width, STAGE_H, seeded(29));
    this.layers.push(alley);

    const street = this._makeLayer(0.55, 2.2);
    street.el.innerHTML = streetCrowdLayer(street.width, STAGE_H, seeded(41));
    this.layers.push(street);

    if (this.fgContainer) {
      // Moves faster than the world (factor > 1), so it reads as nearer the camera.
      const fg = this._makeLayer(1.35, 3.1, this.fgContainer, `center ${STAGE_H}px`);
      fg.zoomFactor = 0.45; // anchored to the screen bottom; grows a little as the camera zooms in
      fg.el.classList.add('fgCrowd');
      fg.el.innerHTML = foregroundLayer(fg.width, STAGE_H, seeded(77));
      this.layers.push(fg);
      // Screen-fixed clusters at the left and right edges.
      const svgNS = 'http://www.w3.org/2000/svg';
      for (const side of [-1, 1]) {
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', `0 0 100 ${STAGE_H}`);
        svg.setAttribute('overflow', 'visible');
        svg.classList.add('sideCrowd', side < 0 ? 'left' : 'right');
        svg.innerHTML = `<g class="rowJump">${sideCluster(seeded(side < 0 ? 101 : 202), side)}</g>`;
        this.fgContainer.appendChild(svg);
        this.layers.push({ el: svg, fixed: true });
      }
    }
  }

  update(cameraCenterX, zoom = 1) {
    for (const layer of this.layers) {
      if (layer.fixed) continue;
      const shift = (cameraCenterX - WORLD_W / 2) * layer.factor;
      const baseOffset = (layer.width - STAGE_W) / 2;
      const tx = -baseOffset - shift;
      if (Math.abs(tx - layer.tx) < 0.1 && Math.abs(zoom - layer.zoom) < 0.0005) continue;
      layer.tx = tx; layer.zoom = zoom;
      // Far layers zoom less than the world, near ones more (depth).
      const z = 1 + (zoom - 1) * (layer.zoomFactor ?? Math.min(1.2, layer.factor));
      layer.el.style.transform = `translateX(${tx.toFixed(1)}px) scale(${z.toFixed(4)})`;
    }
  }

  // Pause/resume every SMIL and CSS animation in the scene. Off on the select screen,
  // while paused, and behind the match-result overlay; on during a live match.
  setActive(on) {
    if (this.active === on) return;
    this.active = on;
    for (const layer of this.layers) {
      const svg = layer.el;
      if (on && svg.unpauseAnimations) svg.unpauseAnimations();
      else if (!on && svg.pauseAnimations) svg.pauseAnimations();
      svg.classList.toggle('paused', !on);
    }
  }

  // Crowd surge: the whole crowd jumps and the warm glow pulses.
  // intensity: roughly 0.5 (small reaction) to 3 (KO / match-winning moment).
  pulse(intensity = 1) {
    clearTimeout(this._pulseTimer);
    const holdMs = 500 + Math.min(intensity, 3) * 350;
    for (const layer of this.layers) {
      layer.el.classList.remove('crowdCheer');
      void layer.el.getBoundingClientRect;
      layer.el.classList.add('crowdCheer');
      layer.el.style.setProperty('--cheerAmp', `${Math.min(3, intensity) * -2.5}px`);
    }
    this._pulseTimer = setTimeout(() => {
      for (const layer of this.layers) layer.el.classList.remove('crowdCheer');
    }, holdMs);
  }
}

// ---- 5. The street surface, drawn inside the fight world (moves 1:1 with fighters).
// Returned as markup for an absolutely positioned <svg> whose top sits just behind the
// fighters' feet. Includes a curb, worn lane paint, cracks, a storm drain grate and
// puddles that reflect the neon.
export function streetFloorSVG() {
  const w = WORLD_W + 600, h = 420, x0 = -300, rand = seeded(313);
  let out = `<svg class="streetFloor" viewBox="${x0} 0 ${w} ${h}" style="left:${x0}px;width:${w}px;height:${h}px" overflow="visible">
  <defs>
    <linearGradient id="asphalt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2a2530"/><stop offset="18%" stop-color="#1d1a22"/><stop offset="100%" stop-color="#0c0b10"/></linearGradient>
    <pattern id="grit" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="2" r=".7" fill="#3a3540" opacity=".6"/><circle cx="5" cy="5.5" r=".5" fill="#09080c" opacity=".7"/></pattern>
    <radialGradient id="puddleG"><stop offset="0%" stop-color="#ff3b6b" stop-opacity=".35"/><stop offset="60%" stop-color="#2ee6ff" stop-opacity=".12"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient>
    <radialGradient id="spotG" cx="50%" cy="20%" r="60%"><stop offset="0%" stop-color="#ffdca0" stop-opacity=".16"/><stop offset="100%" stop-color="#ffdca0" stop-opacity="0"/></radialGradient>
  </defs>
  <rect x="${x0}" y="0" width="${w}" height="${h}" fill="url(#asphalt)"/>
  <rect x="${x0}" y="0" width="${w}" height="${h}" fill="url(#grit)"/>
  <rect x="${x0}" y="0" width="${w}" height="6" fill="#3d3742"/><rect x="${x0}" y="6" width="${w}" height="2" fill="#0a090d"/>`;
  // light pool under the fight
  out += `<ellipse cx="${WORLD_W / 2}" cy="40" rx="900" ry="120" fill="url(#spotG)"/>`;
  // worn lane dashes
  for (let x = x0; x < x0 + w; x += 140) out += `<rect x="${x}" y="58" width="70" height="5" fill="#d8c27a" opacity="${(0.12 + rand() * 0.18).toFixed(2)}" transform="skewX(-30)"/>`;
  // cracks
  for (let i = 0; i < 26; i++) {
    let cx = x0 + rand() * w, cy = 12 + rand() * 90, d = `M${f1(cx)},${f1(cy)}`;
    for (let k = 0; k < 4; k++) { cx += rand() * 40 - 10; cy += rand() * 12 - 4; d += `L${f1(cx)},${f1(cy)}`; }
    out += `<path d="${d}" stroke="#08070b" stroke-width="${f1(0.8 + rand() * 1.2)}" fill="none" opacity=".8"/>`;
  }
  // puddles reflecting neon
  for (let i = 0; i < 7; i++) out += `<ellipse cx="${f1(x0 + rand() * w)}" cy="${f1(24 + rand() * 60)}" rx="${f1(40 + rand() * 60)}" ry="${f1(5 + rand() * 6)}" fill="url(#puddleG)"/>`;
  // storm drain grate in the middle of the street (like the app icon)
  const gx = WORLD_W / 2 - 60;
  out += `<g transform="translate(${gx},22)"><rect width="120" height="34" rx="3" fill="#0b0a0e" stroke="#4a4550" stroke-width="2.5"/>` +
    Array.from({ length: 11 }, (_, i) => `<rect x="${8 + i * 10}" y="5" width="4" height="24" fill="#2b2731"/>`).join('') + `</g>`;
  out += `</svg>`;
  return out;
}
