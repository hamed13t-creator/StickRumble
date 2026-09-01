// js/background.js — layered parallax skyline. Each layer scrolls at a different
// fraction of camera movement (far layers move less) to sell depth behind the fight.
import { WORLD_W, STAGE_W, STAGE_H } from './world.js';

// Deterministic pseudo-random so the skyline is stable across reloads/rounds.
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function buildRoofline(rand, count, minH, maxH, w, baseY) {
  let x = -80, d = `M-80,${baseY} `;
  const pts = [];
  while (x < w + 80) {
    const bw = 40 + rand() * 90;
    const bh = minH + rand() * (maxH - minH);
    pts.push({ x, w: bw, h: bh });
    x += bw + rand() * 14;
  }
  pts.forEach(p => {
    d += `L${p.x},${baseY - p.h} L${p.x + p.w * 0.55},${baseY - p.h} `;
    d += `L${p.x + p.w * 0.55},${baseY - p.h - 6} L${p.x + p.w},${baseY - p.h - 6} `;
    d += `L${p.x + p.w},${baseY} `;
  });
  d += `L${w + 80},${baseY} Z`;
  return { path: d, blocks: pts };
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
    // Layer 0: night sky gradient + moon (near-static, barely parallaxes)
    const sky = this._makeLayer(0.02, 1.3);
    sky.el.innerHTML = `
      <defs>
        <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ffe9a8" stop-opacity=".9"/>
          <stop offset="100%" stop-color="#ffe9a8" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="${sky.width * 0.78}" cy="90" r="70" fill="url(#moonGlow)"/>
      <circle cx="${sky.width * 0.78}" cy="90" r="30" fill="#fff6da"/>
      ${Array.from({ length: 40 }, (_, i) => {
        const r = seeded(i + 1)();
        return `<circle cx="${r * sky.width}" cy="${20 + seeded(i + 99)() * 160}" r="${0.6 + seeded(i + 7)() * 1.2}" fill="#fff" opacity="${0.3 + seeded(i + 3)() * 0.5}"/>`;
      }).join('')}
    `;
    this.layers.push(sky);

    // Layer 1: far rooftop skyline silhouette
    const far = this._makeLayer(0.18, 1.6);
    const rFar = seeded(11);
    const roofFar = buildRoofline(rFar, 0, 60, 150, far.width, STAGE_H * 0.72);
    far.el.innerHTML = `<path d="${roofFar.path}" fill="#241a30"/>` +
      roofFar.blocks.filter((_, i) => i % 3 === 0).map(b =>
        `<rect x="${b.x + b.w * 0.2}" y="${STAGE_H * 0.72 - b.h + 10}" width="4" height="6" fill="#ffcf4d" opacity=".55"/>`
      ).join('');
    this.layers.push(far);

    // Layer 2: mid rooftops with a pagoda/dojo silhouette + neon window glow
    const mid = this._makeLayer(0.4, 1.9);
    const rMid = seeded(23);
    const roofMid = buildRoofline(rMid, 0, 90, 210, mid.width, STAGE_H * 0.82);
    const pagX = mid.width * 0.32;
    mid.el.innerHTML = `
      <path d="${roofMid.path}" fill="#2f2138"/>
      <g fill="#2f2138">
        <path d="M${pagX - 70},${STAGE_H * 0.82} L${pagX - 70},${STAGE_H * 0.5} L${pagX - 90},${STAGE_H * 0.46} L${pagX},${STAGE_H * 0.34} L${pagX + 90},${STAGE_H * 0.46} L${pagX + 70},${STAGE_H * 0.5} L${pagX + 70},${STAGE_H * 0.82} Z"/>
      </g>
      <path d="M${pagX - 60},${STAGE_H * 0.5} L${pagX},${STAGE_H * 0.4} L${pagX + 60},${STAGE_H * 0.5}" stroke="#ff3b3b" stroke-width="3" fill="none" opacity=".5"/>
      ${roofMid.blocks.filter((_, i) => i % 2 === 0).map(b =>
        `<rect x="${b.x + b.w * 0.15}" y="${STAGE_H * 0.82 - b.h + 14}" width="5" height="8" fill="#2e6bff" opacity=".5"/>`
      ).join('')}
    `;
    this.layers.push(mid);

    // Layer 3: near foreground railing/edge — moves almost 1:1 with camera
    const near = this._makeLayer(0.82, 1.15);
    near.el.innerHTML = `
      <rect x="0" y="${STAGE_H - 26}" width="${near.width}" height="26" fill="#1a1420"/>
      ${Array.from({ length: Math.ceil(near.width / 46) }, (_, i) =>
        `<rect x="${i * 46}" y="${STAGE_H - 46}" width="6" height="46" fill="#1a1420"/>`
      ).join('')}
    `;
    this.layers.push(near);
  }

  update(cameraCenterX, zoom) {
    this.layers.forEach(layer => {
      const shift = (cameraCenterX - WORLD_W / 2) * layer.factor;
      const baseOffset = (layer.width - STAGE_W) / 2;
      const tx = -baseOffset - shift;
      layer.el.style.transform = `translateX(${tx.toFixed(1)}px)`;
    });
  }
}
