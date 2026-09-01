// js/background.js — layered parallax stadium crowd background. Each layer scrolls 
// at a different fraction of camera movement to create intense depth behind the fighters.
import { WORLD_W, STAGE_W, STAGE_H } from './world.js';

// Deterministic pseudo-random so the crowd layout stays stable across reloads/rounds.
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
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
    // Layer 0: Deep arena walls, atmospheric stadium fog, and overhead harsh spotlights
    const back = this._makeLayer(0.05, 1.2);
    back.el.innerHTML = `
      <defs>
        <radialGradient id="spotlight" cx="50%" cy="0%" r="70%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="wallGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#0f0f17"/>
          <stop offset="100%" stop-color="#1c1624"/>
        </linearGradient>
      </defs>
      <rect width="${back.width}" height="${STAGE_H}" fill="url(#wallGrad)"/>
      <!-- Overhead Stadium Lights / Beams -->
      <polygon points="${back.width * 0.2},0 0,${STAGE_H} ${back.width * 0.08},${STAGE_H}" fill="url(#spotlight)"/>
      <polygon points="${back.width * 0.8},0 ${back.width},${STAGE_H} ${back.width * 0.92},${STAGE_H}" fill="url(#spotlight)"/>
      <polygon points="${back.width * 0.5},0 ${back.width * 0.35},${STAGE_H} ${back.width * 0.65},${STAGE_H}" fill="url(#spotlight)" opacity="0.7"/>
    `;
    this.layers.push(back);

    // Layer 1: Deep Background Crowd (Dense silhouettes of cheering spectators in the upper stands)
    const farCrowd = this._makeLayer(0.2, 1.5);
    const rFar = seeded(42);
    let farHeadsPath = '';
    for (let x = -50; x < farCrowd.width + 50; x += 14 + rFar() * 8) {
      const y = STAGE_H * 0.52 + rFar() * 12;
      const hRad = 5 + rFar() * 3;
      farHeadsPath += `M ${x - hRad},${y + 35} Q ${x},${y - hRad * 1.5} ${x + hRad},${y + 35} Z `;
    }
    farCrowd.el.innerHTML = `
      <rect x="0" y="${STAGE_H * 0.5}" width="${farCrowd.width}" height="${STAGE_H * 0.5}" fill="#16131c"/>
      <path d="${farHeadsPath}" fill="#251f30" opacity="0.85"/>
    `;
    this.layers.push(farCrowd);

    // Layer 2: Midground Crowd (Closer row of cheering fans with occasional raised arms/flashes)
    const midCrowd = this._makeLayer(0.45, 1.8);
    const rMid = seeded(77);
    let midHeadsHtml = '';
    for (let x = -40; x < midCrowd.width + 40; x += 18 + rMid() * 10) {
      const y = STAGE_H * 0.66 + rMid() * 10;
      const r = 7 + rMid() * 4;
      // Alternate bodies and occasional raised arms
      const raisingArm = rMid() > 0.7;
      midHeadsHtml += `<circle cx="${x}" cy="${y}" r="${r}" fill="#1a1422"/>`;
      if (raisingArm) {
        midHeadsHtml += `<line x1="${x + 4}" y1="${y}" x2="${x + 8}" y2="${y - 18}" stroke="#1a1422" stroke-width="4" stroke-linecap="round"/>`;
      }
    }
    midCrowd.el.innerHTML = `
      <rect x="0" y="${STAGE_H * 0.64}" width="${midCrowd.width}" height="${STAGE_H * 0.36}" fill="#1f1828"/>
      <g opacity="0.95">${midHeadsHtml}</g>
    `;
    this.layers.push(midCrowd);

    // Layer 3: Arena Ropes, Ring Posts & Steel Barrier Barricade foreground elements
    const near = this._makeLayer(0.85, 1.15);
    near.el.innerHTML = `
      <!-- Ring Ropes Perspective Lines -->
      <line x1="0" y1="${STAGE_H * 0.74}" x2="${near.width}" y2="${STAGE_H * 0.74}" stroke="#ef4444" stroke-width="4" opacity="0.8"/>
      <line x1="0" y1="${STAGE_H * 0.81}" x2="${near.width}" y2="${STAGE_H * 0.81}" stroke="#3b82f6" stroke-width="4" opacity="0.8"/>
      <line x1="0" y1="${STAGE_H * 0.88}" x2="${near.width}" y2="${STAGE_H * 0.88}" stroke="#ffffff" stroke-width="3" opacity="0.7"/>

      <!-- Steel Barricade / Floor Edge -->
      <rect x="0" y="${STAGE_H - 32}" width="${near.width}" height="32" fill="#120e17"/>
      ${Array.from({ length: Math.ceil(near.width / 50) }, (_, i) =>
        `<rect x="${i * 50 + 10}" y="${STAGE_H - 48}" width="8" height="20" fill="#2d2638" rx="2"/>`
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
