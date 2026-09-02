// js/background.js — crowded fight arena parallax background
import { WORLD_W, STAGE_W, STAGE_H } from './world.js';

// Deterministic pseudo-random generator.
// Keeps the crowd/background identical between reloads.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
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
    svg.style.height = STAGE_H + 'px';
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.pointerEvents = 'none';

    this.container.appendChild(svg);

    return {
      el: svg,
      factor,
      width: w
    };
  }

  // ------------------------------------------------------------
  // Crowd generator
  // ------------------------------------------------------------

  _makeCrowd(rand, startX, endX, baseY, rows, scaleMin, scaleMax) {
    let output = '';

    const crowdColors = [
      '#17131d',
      '#211827',
      '#291b2e',
      '#15151f',
      '#302033',
      '#1b1825'
    ];

    const skinColors = [
      '#f3c7a5',
      '#e8ad86',
      '#d89570',
      '#f0b995',
      '#c98162'
    ];

    const shirtColors = [
      '#25253a',
      '#32243d',
      '#17305a',
      '#3b202c',
      '#262c43',
      '#412738',
      '#192e43'
    ];

    for (let row = 0; row < rows; row++) {
      const depth = row / Math.max(1, rows - 1);

      const y = baseY + row * 22;

      const scale =
        scaleMin +
        (scaleMax - scaleMin) * (1 - depth);

      const spacing = 30 + depth * 12;

      let x = startX - 40;

      while (x < endX + 40) {
        x += spacing * (0.65 + rand() * 0.7);

        const headR = 5 + rand() * 3;
        const personScale = scale * (0.85 + rand() * 0.3);

        const skin =
          skinColors[Math.floor(rand() * skinColors.length)];

        const shirt =
          shirtColors[Math.floor(rand() * shirtColors.length)];

        const dark =
          crowdColors[Math.floor(rand() * crowdColors.length)];

        const headY = y - 24 * personScale;

        // Some spectators have arms raised.
        const cheering = rand() > 0.38;

        const armOffset = (12 + rand() * 8) * personScale;

        let arms = '';

        if (cheering) {
          const leftArmX = x - armOffset;
          const rightArmX = x + armOffset;

          const handHeight =
            headY -
            (28 + rand() * 32) * personScale;

          arms = `
            <path
              d="
                M${x - 7 * personScale},${y - 10 * personScale}
                L${leftArmX},${handHeight}
              "
              stroke="${dark}"
              stroke-width="${5 * personScale}"
              stroke-linecap="round"
              fill="none"
            />

            <path
              d="
                M${x + 7 * personScale},${y - 10 * personScale}
                L${rightArmX},${handHeight}
              "
              stroke="${dark}"
              stroke-width="${5 * personScale}"
              stroke-linecap="round"
              fill="none"
            />

            <circle
              cx="${leftArmX}"
              cy="${handHeight}"
              r="${3 * personScale}"
              fill="${skin}"
            />

            <circle
              cx="${rightArmX}"
              cy="${handHeight}"
              r="${3 * personScale}"
              fill="${skin}"
            />
          `;
        } else {
          arms = `
            <path
              d="
                M${x - 6 * personScale},${y - 10 * personScale}
                L${x - 13 * personScale},${y + 8 * personScale}
              "
              stroke="${dark}"
              stroke-width="${5 * personScale}"
              stroke-linecap="round"
            />

            <path
              d="
                M${x + 6 * personScale},${y - 10 * personScale}
                L${x + 13 * personScale},${y + 8 * personScale}
              "
              stroke="${dark}"
              stroke-width="${5 * personScale}"
              stroke-linecap="round"
            />
          `;
        }

        // Occasional glowing cheering stick.
        let glowStick = '';

        if (rand() > 0.68) {
          const stickColor =
            rand() > 0.5 ? '#3278ff' : '#ff304d';

          const stickX =
            x + (rand() - 0.5) * 25;

          const stickTop =
            headY - 25 - rand() * 30;

          glowStick = `
            <line
              x1="${stickX}"
              y1="${headY + 5}"
              x2="${stickX + (rand() - 0.5) * 8}"
              y2="${stickTop}"
              stroke="${stickColor}"
              stroke-width="3"
              stroke-linecap="round"
              opacity=".9"
              filter="url(#crowdGlow)"
            />
          `;
        }

        output += `
          <g opacity="${0.65 + depth * 0.35}">
            ${arms}

            <ellipse
              cx="${x}"
              cy="${y + 3 * personScale}"
              rx="${13 * personScale}"
              ry="${20 * personScale}"
              fill="${shirt}"
            />

            <circle
              cx="${x}"
              cy="${headY}"
              r="${headR * personScale}"
              fill="${skin}"
            />

            <path
              d="
                M${x - headR * personScale},${headY - 1 * personScale}
                Q${x},${headY - 8 * personScale}
                 ${x + headR * personScale},${headY - 1 * personScale}
              "
              stroke="${dark}"
              stroke-width="${2 * personScale}"
              fill="none"
            />

            ${glowStick}
          </g>
        `;
      }
    }

    return output;
  }

  // ------------------------------------------------------------
  // Build entire background
  // ------------------------------------------------------------

  _build() {
    // ============================================================
    // LAYER 0 — Dark arena sky
    // ============================================================

    const sky = this._makeLayer(0.02, 1.35);

    const skyW = sky.width;

    sky.el.innerHTML = `
      <defs>

        <linearGradient id="arenaSkyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#05040b"/>
          <stop offset="48%" stop-color="#0b0812"/>
          <stop offset="100%" stop-color="#17101e"/>
        </linearGradient>

        <radialGradient id="arenaLightGlow">
          <stop offset="0%" stop-color="#ffffff" stop-opacity=".55"/>
          <stop offset="45%" stop-color="#6d8cff" stop-opacity=".16"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>

        <filter id="skyBlur">
          <feGaussianBlur stdDeviation="16"/>
        </filter>
      </defs>

      <rect
        width="${skyW}"
        height="${STAGE_H}"
        fill="url(#arenaSkyGradient)"
      />

      <!-- Huge overhead arena glow -->
      <ellipse
        cx="${skyW / 2}"
        cy="${STAGE_H * 0.28}"
        rx="${skyW * 0.43}"
        ry="${STAGE_H * 0.35}"
        fill="url(#arenaLightGlow)"
        opacity=".7"
      />

      <!-- Small distant lights -->
      ${Array.from({ length: 70 }, (_, i) => {
        const r = seeded(1000 + i);

        const x = r() * skyW;
        const y = 30 + r() * STAGE_H * 0.55;
        const size = 0.7 + r() * 1.8;

        return `
          <circle
            cx="${x}"
            cy="${y}"
            r="${size}"
            fill="#ffffff"
            opacity="${0.15 + r() * 0.5}"
          />
        `;
      }).join('')}

      <!-- Left arena light -->
      <ellipse
        cx="${skyW * 0.12}"
        cy="${STAGE_H * 0.25}"
        rx="110"
        ry="150"
        fill="url(#arenaLightGlow)"
        filter="url(#skyBlur)"
      />

      <!-- Right arena light -->
      <ellipse
        cx="${skyW * 0.88}"
        cy="${STAGE_H * 0.25}"
        rx="110"
        ry="150"
        fill="url(#arenaLightGlow)"
        filter="url(#skyBlur)"
      />
    `;

    this.layers.push(sky);

    // ============================================================
    // LAYER 1 — Distant city / arena structure
    // ============================================================

    const buildings = this._makeLayer(0.12, 1.55);
    const r = seeded(42);

    let buildingHTML = '';

    let bx = -50;

    while (bx < buildings.width + 50) {
      const bw = 35 + r() * 80;
      const bh = 70 + r() * 160;

      buildingHTML += `
        <rect
          x="${bx}"
          y="${STAGE_H * 0.68 - bh}"
          width="${bw}"
          height="${bh}"
          fill="#15121e"
        />

        ${Array.from({
          length: Math.floor(bw / 15)
        }, (_, wi) =>
          Array.from({
            length: Math.floor(bh / 25)
          }, (_, hi) => {
            if (r() > 0.58) {
              return `
                <rect
                  x="${bx + 7 + wi * 15}"
                  y="${STAGE_H * 0.68 - bh + 12 + hi * 25}"
                  width="4"
                  height="5"
                  rx="1"
                  fill="${r() > 0.5 ? '#ff304d' : '#356dff'}"
                  opacity=".25"
                />
              `;
            }

            return '';
          }).join('')
        ).join('')}
      `;

      bx += bw + 8 + r() * 15;
    }

    buildings.el.innerHTML = `
      <defs>
        <filter id="cityGlow">
          <feGaussianBlur stdDeviation="3"/>
        </filter>
      </defs>

      ${buildingHTML}
    `;

    this.layers.push(buildings);

    // ============================================================
    // LAYER 2 — Massive crowd
    // ============================================================

    const crowd = this._makeLayer(0.34, 1.65);

    const crowdRand = seeded(777);

    const crowdBase = STAGE_H * 0.73;

    crowd.el.innerHTML = `
      <defs>
        <filter id="crowdGlow">
          <feGaussianBlur stdDeviation="1.5"/>
        </filter>

        <linearGradient id="crowdFade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#35243c"/>
          <stop offset="100%" stop-color="#100c15"/>
        </linearGradient>
      </defs>

      <!-- Back wall -->
      <rect
        x="0"
        y="${STAGE_H * 0.58}"
        width="${crowd.width}"
        height="${STAGE_H * 0.25}"
        fill="#0e0b14"
      />

      <!-- Crowd -->
      ${this._makeCrowd(
        crowdRand,
        0,
        crowd.width,
        crowdBase,
        5,
        0.65,
        1
      )}

      <!-- Large crowd banners -->
      <g font-family="Arial, sans-serif" font-weight="900"
         text-anchor="middle">

        <g transform="translate(${crowd.width * 0.13}, ${STAGE_H * 0.60}) rotate(-3)">
          <rect x="-75" y="-35" width="150" height="65"
                rx="4" fill="#b32635" opacity=".95"/>
          <text x="0" y="-2" font-size="21" fill="#fff">
            FIGHT!
          </text>
          <text x="0" y="22" font-size="11" fill="#ffd9d9">
            LET'S GO!
          </text>
        </g>

        <g transform="translate(${crowd.width * 0.32}, ${STAGE_H * 0.64}) rotate(2)">
          <rect x="-80" y="-35" width="160" height="65"
                rx="4" fill="#253d87" opacity=".95"/>
          <text x="0" y="4" font-size="19" fill="#fff">
            YOU GOT THIS!
          </text>
        </g>

        <g transform="translate(${crowd.width * 0.50}, ${STAGE_H * 0.56})">
          <rect x="-115" y="-42" width="230" height="78"
                rx="5" fill="#16121d"
                stroke="#ff344b"
                stroke-width="3"/>

          <text x="0" y="-8" font-size="27" fill="#fff">
            RING
          </text>

          <text x="0" y="22" font-size="28" fill="#ff4054">
            RUMBLE
          </text>
        </g>

        <g transform="translate(${crowd.width * 0.70}, ${STAGE_H * 0.62}) rotate(-2)">
          <rect x="-82" y="-35" width="164" height="65"
                rx="4" fill="#a52a35" opacity=".95"/>
          <text x="0" y="5" font-size="21" fill="#fff">
            KO!
          </text>
        </g>

        <g transform="translate(${crowd.width * 0.87}, ${STAGE_H * 0.59}) rotate(3)">
          <rect x="-82" y="-35" width="164" height="65"
                rx="4" fill="#293d83" opacity=".95"/>
          <text x="0" y="-1" font-size="18" fill="#fff">
            FINISH HIM!
          </text>
        </g>

      </g>
    `;

    this.layers.push(crowd);

    // ============================================================
    // LAYER 3 — Arena lighting / spotlights
    // ============================================================

    const lights = this._makeLayer(0.5, 1.45);

    const lightW = lights.width;

    lights.el.innerHTML = `
      <defs>

        <linearGradient id="redBeam"
          x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ff304d" stop-opacity=".32"/>
          <stop offset="100%" stop-color="#ff304d" stop-opacity="0"/>
        </linearGradient>

        <linearGradient id="blueBeam"
          x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#3278ff" stop-opacity=".32"/>
          <stop offset="100%" stop-color="#3278ff" stop-opacity="0"/>
        </linearGradient>

        <filter id="lightBlur">
          <feGaussianBlur stdDeviation="8"/>
        </filter>

      </defs>

      <!-- Red spotlight -->
      <path
        d="
          M${lightW * 0.08},40
          L${lightW * 0.40},${STAGE_H * 0.72}
          L${lightW * 0.25},${STAGE_H * 0.72}
          Z
        "
        fill="url(#redBeam)"
        filter="url(#lightBlur)"
      />

      <!-- Blue spotlight -->
      <path
        d="
          M${lightW * 0.92},40
          L${lightW * 0.60},${STAGE_H * 0.72}
          L${lightW * 0.75},${STAGE_H * 0.72}
          Z
        "
        fill="url(#blueBeam)"
        filter="url(#lightBlur)"
      />

      <!-- Arena light rig -->
      <g opacity=".85">

        <line
          x1="${lightW * 0.18}"
          y1="${STAGE_H * 0.16}"
          x2="${lightW * 0.82}"
          y2="${STAGE_H * 0.16}"
          stroke="#211c2b"
          stroke-width="8"
        />

        ${Array.from({ length: 12 }, (_, i) => {
          const x = lightW * 0.18 +
            (lightW * 0.64 / 11) * i;

          const c = i % 2 === 0 ? '#ff4054' : '#4b80ff';

          return `
            <circle
              cx="${x}"
              cy="${STAGE_H * 0.16}"
              r="7"
              fill="${c}"
            />

            <circle
              cx="${x}"
              cy="${STAGE_H * 0.16}"
              r="18"
              fill="${c}"
              opacity=".16"
              filter="url(#lightBlur)"
            />
          `;
        }).join('')}

      </g>
    `;

    this.layers.push(lights);

    // ============================================================
    // LAYER 4 — Front rows of spectators
    // ============================================================

    const front = this._makeLayer(0.72, 1.25);

    const frontRand = seeded(991);

    front.el.innerHTML = `
      <defs>

        <linearGradient id="frontCrowdGradient"
          x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#211827"/>
          <stop offset="100%" stop-color="#07060b"/>
        </linearGradient>

        <filter id="frontGlow">
          <feGaussianBlur stdDeviation="2"/>
        </filter>

      </defs>

      <!-- Dark front crowd mass -->
      <path
        d="
          M0,${STAGE_H * 0.84}
          ${Array.from({ length: 30 }, (_, i) => {
            const x =
              (front.width / 29) * i;

            const h =
              20 + frontRand() * 85;

            return `L${x},${STAGE_H * 0.84 - h}`;
          }).join(' ')}
          L${front.width},${STAGE_H}
          L0,${STAGE_H}
          Z
        "
        fill="url(#frontCrowdGradient)"
      />

      ${Array.from({ length: 34 }, (_, i) => {
        const x =
          (front.width / 33) * i +
          (frontRand() - 0.5) * 25;

        const headY =
          STAGE_H * 0.83 -
          frontRand() * 65;

        const headR =
          9 + frontRand() * 5;

        const skin =
          frontRand() > 0.5
            ? '#d79572'
            : '#edb18c';

        return `
          <g>

            <!-- body -->
            <ellipse
              cx="${x}"
              cy="${headY + 32}"
              rx="${headR * 2.2}"
              ry="${headR * 2.8}"
              fill="#111019"
            />

            <!-- head -->
            <circle
              cx="${x}"
              cy="${headY}"
              r="${headR}"
              fill="${skin}"
            />

            <!-- raised arm -->
            <path
              d="
                M${x - 10},${headY + 22}
                L${x - 22 - frontRand() * 20},${headY - 35 - frontRand() * 40}
              "
              stroke="#111019"
              stroke-width="9"
              stroke-linecap="round"
            />

            <!-- hand -->
            <circle
              cx="${x - 22 - frontRand() * 20}"
              cy="${headY - 35 - frontRand() * 40}"
              r="5"
              fill="${skin}"
            />

          </g>
        `;
      }).join('')}

      <!-- Front glow sticks -->
      ${Array.from({ length: 18 }, (_, i) => {
        const x =
          frontRand() * front.width;

        const y =
          STAGE_H * 0.72 +
          frontRand() * STAGE_H * 0.18;

        const top =
          y - 55 - frontRand() * 80;

        const c =
          i % 2 === 0
            ? '#ff304d'
            : '#3278ff';

        return `
          <line
            x1="${x}"
            y1="${y}"
            x2="${x + (frontRand() - 0.5) * 35}"
            y2="${top}"
            stroke="${c}"
            stroke-width="5"
            stroke-linecap="round"
            filter="url(#frontGlow)"
            opacity=".85"
          />
        `;
      }).join('')}
    `;

    this.layers.push(front);

    // ============================================================
    // LAYER 5 — Ring barrier / foreground
    // ============================================================

    const near = this._makeLayer(0.86, 1.15);

    near.el.innerHTML = `
      <defs>

        <linearGradient id="ringMetal"
          x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#65516f"/>
          <stop offset="50%" stop-color="#2c2434"/>
          <stop offset="100%" stop-color="#100c14"/>
        </linearGradient>

      </defs>

      <!-- Ring floor edge -->
      <rect
        x="0"
        y="${STAGE_H - 55}"
        width="${near.width}"
        height="55"
        fill="#0c0a10"
      />

      <!-- Ring barrier -->
      <rect
        x="0"
        y="${STAGE_H - 86}"
        width="${near.width}"
        height="7"
        rx="3"
        fill="url(#ringMetal)"
      />

      <rect
        x="0"
        y="${STAGE_H - 46}"
        width="${near.width}"
        height="5"
        fill="#33283b"
      />

      ${Array.from({
        length: Math.ceil(near.width / 55)
      }, (_, i) => `
        <rect
          x="${i * 55}"
          y="${STAGE_H - 92}"
          width="6"
          height="58"
          rx="2"
          fill="#1c1722"
        />
      `).join('')}

      <!-- Crowd-side red/blue accent -->
      <rect
        x="0"
        y="${STAGE_H - 89}"
        width="${near.width * 0.5}"
        height="3"
        fill="#ff304d"
        opacity=".65"
      />

      <rect
        x="${near.width * 0.5}"
        y="${STAGE_H - 89}"
        width="${near.width * 0.5}"
        height="3"
        fill="#3278ff"
        opacity=".65"
      />
    `;

    this.layers.push(near);
  }

  // ------------------------------------------------------------
  // Camera/parallax update
  // ------------------------------------------------------------

  update(cameraCenterX, zoom) {
    this.layers.forEach(layer => {
      const shift =
        (cameraCenterX - WORLD_W / 2) *
        layer.factor;

      const baseOffset =
        (layer.width - STAGE_W) / 2;

      const tx =
        -baseOffset - shift;

      layer.el.style.transform =
        `translateX(${tx.toFixed(1)}px)`;
    });
  }
}
