// js/background.js — chaotic night arena crowd with shuffled supporters
import { WORLD_W, STAGE_W, STAGE_H } from './world.js';

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

const CROWD_COLORS = ['#3f7bff', '#ff5c5c', '#ffcf4d', '#7fffd4', '#c97b3d', '#a86bff', '#ff8fd1', '#5ce1ff'];
const LIGHT_COLORS = ['#2e6bff', '#ff3b3b', '#ffcf4d', '#a86bff', '#7fffd4'];

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

// ---- Other builders unchanged (tiers, spotlight, marquee, banner, flashes) ----
// ... keep your existing buildTierBackdrop, buildSpotlightRig, buildMarquee, buildBanner, buildFlashes ...

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
    // ✅ Layers remain the same, but crowd rows now use shuffled buildCrowdRow
    // Example for far tiers:
    const far = this._makeLayer(0.2, 1.6);
    const rFar = seeded(29);
    const farBaseY = STAGE_H * 0.86;
    let farHtml = buildTierBackdrop(far.width, farBaseY, 6, 20, '#241a30', '#2c2038');
    for (let row = 0; row < 6; row++) {
      farHtml += buildCrowdRow(rFar, far.width, farBaseY - row * 20 - 10, 15, 3.6, { armChance: 0.08 });
    }
    // ... marquee, banners, flashes unchanged ...
    far.el.innerHTML = farHtml;
    this.layers.push(far);

    // Mid tiers
    const mid = this._makeLayer(0.42, 1.9);
    const rMid = seeded(41);
    const midBaseY = STAGE_H * 0.98;
    let midHtml = buildTierBackdrop(mid.width, midBaseY, 5, 28, '#2c2038', '#352842');
    for (let row = 0; row < 5; row++) {
      midHtml += buildCrowdRow(rMid, mid.width, midBaseY - row * 28 - 14, 20, 5.2, { armChance: 0.18 });
    }
    mid.el.innerHTML = midHtml;
    this.layers.push(mid);

    // ✅ Other layers (sky, truss, near foreground) unchanged
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
