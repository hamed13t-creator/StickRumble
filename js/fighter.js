// js/fighter.js
// -----------------------------------------------------------------------------
// ULTIMATE STICKMAN FIGHTER
// Physics-driven stick fighter with:
//
// - Momentum-based movement
// - Ground / air control
// - Dash + invulnerability
// - Front / back flips
// - 2-bone IK punching
// - Procedural walking
// - Procedural breathing
// - Anticipation / follow-through poses
// - Dynamic kick animation
// - Hit reactions
// - Guard pose
// - Fighter-specific visual styling
// - Startup / active / recovery attack state machine
// - Combo buffering
//
// The gameplay API is intentionally kept compatible with the original fighter.
// -----------------------------------------------------------------------------

import { GROUND_Y, ARENA_MIN_X, ARENA_MAX_X } from './world.js';

// =============================================================================
// ROSTER
// =============================================================================

export const CHARACTERS = [
  {
    key: 'boxer',
    name: 'Boxer',
    color: '#3f7bff',
    accent: '#ffcf4d',
    skin: '#ffd9b3',
    accessory: 'gloves',
    stats: {}
  },

  {
    key: 'ninja',
    name: 'Ninja',
    color: '#2b2b33',
    accent: '#ff3b3b',
    skin: '#e8c39e',
    accessory: 'headband',
    stats: {
      speed: 1.25,
      health: 0.85,
      dashMult: 1.3
    }
  },

  {
    key: 'sumo',
    name: 'Sumo',
    color: '#c97b3d',
    accent: '#fff2d6',
    skin: '#e8b98a',
    accessory: 'topknot',
    stats: {
      speed: 0.75,
      health: 1.35,
      knockback: 1.5
    }
  },

  {
    key: 'kickboxer',
    name: 'Kickboxer',
    color: '#e0602b',
    accent: '#2b2b33',
    skin: '#d9a066',
    accessory: 'wristbands',
    stats: {
      kickDmg: 1.3,
      punchDmg: 0.85
    }
  },

  {
    key: 'robot',
    name: 'Robot',
    color: '#8f9bab',
    accent: '#2ee6ff',
    skin: '#c7ced6',
    accessory: 'antenna',
    stats: {
      dmgAll: 1.2,
      cooldownMult: 1.2
    }
  },

  {
    key: 'monk',
    name: 'Monk',
    color: '#f0a500',
    accent: '#7a3a1a',
    skin: '#e8b98a',
    accessory: 'robe',
    stats: {
      punchCooldownMult: 0.7,
      kickDmg: 0.85
    }
  }
];

export const charByKey = k =>
  CHARACTERS.find(c => c.key === k) || CHARACTERS[0];


// =============================================================================
// COLOR UTILITIES
// =============================================================================

function shade(hex, amt) {
  let c = hex.replace('#', '');

  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }

  const num = parseInt(c, 16);

  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt));

  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex) {
  let c = hex.replace('#', '');

  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }

  const n = parseInt(c, 16);

  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255
  };
}

function rgba(hex, alpha) {
  const c = hexToRgb(hex);
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}


// =============================================================================
// ACCESSORIES
// =============================================================================

function accessorySVG(ch) {
  switch (ch.accessory) {

    case 'headband':
      return `
        <g class="accessory headband">
          <rect
            x="20"
            y="9"
            width="20"
            height="4"
            rx="1.5"
            fill="${ch.accent}"
          />

          <path
            d="M39 10
               Q48 7 54 13
               Q49 13 43 15
               Q47 12 39 10Z"
            fill="${ch.accent}"
          />

          <path
            d="M21 13
               Q27 14 30 14"
            stroke="${shade(ch.accent, -30)}"
            stroke-width="1"
            opacity=".7"
            fill="none"
          />
        </g>
      `;

    case 'topknot':
      return `
        <g class="accessory topknot">
          <ellipse
            cx="30"
            cy="4"
            rx="4.3"
            ry="4.7"
            fill="${ch.color}"
          />

          <circle
            cx="28.5"
            cy="2.8"
            r="1"
            fill="${shade(ch.color, 30)}"
            opacity=".7"
          />

          <rect
            x="18"
            y="51"
            width="24"
            height="5"
            rx="1.5"
            fill="${ch.accent}"
          />

          <path
            d="M19 53 L41 53"
            stroke="${shade(ch.accent, -30)}"
            stroke-width="1"
            opacity=".55"
          />
        </g>
      `;

    case 'wristbands':
      return `
        <g class="accessory wristbands">
          <circle
            cx="19"
            cy="29"
            r="4.6"
            fill="${ch.accent}"
          />

          <circle
            cx="41"
            cy="29"
            r="4.6"
            fill="${ch.accent}"
          />

          <path
            d="M16.2 28.3 Q19 30.3 21.8 28.3"
            stroke="${shade(ch.accent, -35)}"
            stroke-width="1"
            fill="none"
          />

          <path
            d="M38.2 28.3 Q41 30.3 43.8 28.3"
            stroke="${shade(ch.accent, -35)}"
            stroke-width="1"
            fill="none"
          />
        </g>
      `;

    case 'antenna':
      return `
        <g class="accessory antenna">
          <line
            x1="30"
            y1="7"
            x2="30"
            y2="0"
            stroke="${ch.accent}"
            stroke-width="2"
            stroke-linecap="round"
          />

          <circle
            cx="30"
            cy="0"
            r="2.4"
            fill="${ch.accent}"
          />

          <circle
            cx="29.4"
            cy="-.6"
            r=".7"
            fill="#fff"
            opacity=".9"
          />
        </g>
      `;

    case 'robe':
      return `
        <g class="accessory robe">
          <path
            d="M18 49
               Q11 57 14 69
               Q18 63 22 57
               Z"
            fill="${ch.accent}"
            opacity=".82"
          />

          <path
            d="M42 49
               Q49 57 46 69
               Q42 63 38 57
               Z"
            fill="${ch.accent}"
            opacity=".78"
          />

          <path
            d="M21 56 Q30 60 39 56"
            stroke="${shade(ch.accent, -25)}"
            stroke-width="1"
            opacity=".7"
            fill="none"
          />
        </g>
      `;

    case 'gloves':
      return `
        <g class="accessory gloves">
          <rect
            x="24"
            y="6"
            width="12"
            height="4"
            rx="2"
            fill="#fff"
            opacity=".9"
          />

          <path
            d="M25 7.7 L35 7.7"
            stroke="#c9d1dc"
            stroke-width="1"
            opacity=".7"
          />
        </g>
      `;

    default:
      return '';
  }
}


// =============================================================================
// FACE
// =============================================================================

function faceSVG(ch) {
  const isRobot = ch.accessory === 'antenna';

  const eyeFill = isRobot
    ? ch.accent
    : '#1a1420';

  return `
    <g class="face">

      <!-- subtle ear -->
      <circle
        cx="21.3"
        cy="17"
        r="1.8"
        fill="${shade(ch.skin, -12)}"
      />

      <circle
        cx="38.7"
        cy="17"
        r="1.8"
        fill="${shade(ch.skin, -12)}"
      />

      <!-- eyes -->
      <ellipse
        class="eye eyeLeft"
        cx="26"
        cy="15"
        rx="1.7"
        ry="${isRobot ? 2.2 : 1.9}"
        fill="${eyeFill}"
      />

      <ellipse
        class="eye eyeRight"
        cx="34"
        cy="15"
        rx="1.7"
        ry="${isRobot ? 2.2 : 1.9}"
        fill="${eyeFill}"
      />

      <!-- eye highlights -->
      <circle
        cx="26.5"
        cy="14.5"
        r=".45"
        fill="#fff"
        opacity="${isRobot ? '.9' : '.55'}"
      />

      <circle
        cx="34.5"
        cy="14.5"
        r=".45"
        fill="#fff"
        opacity="${isRobot ? '.9' : '.55'}"
      />

      <!-- brow -->
      <path
        class="brow"
        d="M23.8 12.5 Q26 11.4 28 12.3"
        stroke="${shade(ch.skin, -50)}"
        stroke-width="1"
        fill="none"
        stroke-linecap="round"
      />

      <path
        class="brow"
        d="M32 12.3 Q34 11.4 36.2 12.5"
        stroke="${shade(ch.skin, -50)}"
        stroke-width="1"
        fill="none"
        stroke-linecap="round"
      />

      <!-- nose -->
      <path
        d="M30 15.5 L29 18.2 L30.8 18.5"
        stroke="${shade(ch.skin, -28)}"
        stroke-width=".8"
        fill="none"
        stroke-linecap="round"
      />

      <!-- neutral mouth -->
      <path
        class="mouthNeutral"
        d="M26 20
           Q30 21.5 34 20"
        stroke="#3a2418"
        stroke-width="1.3"
        fill="none"
        stroke-linecap="round"
      />

      <!-- open mouth -->
      <ellipse
        class="mouthOpen"
        cx="30"
        cy="20.5"
        rx="3.1"
        ry="2.4"
        fill="#5c2418"
        opacity="0"
      />

      <!-- teeth -->
      <path
        class="mouthTeeth"
        d="M27.5 19.6 Q30 21 32.5 19.6"
        stroke="#fff8ed"
        stroke-width="1"
        opacity="0"
        fill="none"
      />

    </g>
  `;
}


// =============================================================================
// BODY / RIG SVG
// =============================================================================

export function rigSVG(ch) {

  const back = shade(ch.color, -38);
  const main = ch.color;
  const light = shade(ch.color, 32);
  const dark = shade(ch.color, -62);
  const skinDark = shade(ch.skin, -22);

  const isSumo = ch.key === 'sumo';
  const isRobot = ch.key === 'robot';
  const isNinja = ch.key === 'ninja';
  const isMonk = ch.key === 'monk';

  const torsoPath = isSumo
    ? `
      M23,27
      Q18,34 18.5,42
      Q17,48 20,57
      Q30,61 40,57
      Q43,48 41.5,42
      Q42,34 37,27
      Z
    `
    : `
      M23.5,27
      Q21.8,35 25.5,44
      Q21.5,51 20.5,58
      Q30,61 39.5,58
      Q38.5,51 34.5,44
      Q38.2,35 36.5,27
      Z
    `;

  const torsoInner =
    isRobot
      ? `
        <path
          d="M24 31 Q30 34 36 31"
          stroke="${light}"
          stroke-width="1.2"
          opacity=".75"
          fill="none"
        />

        <path
          d="M25 42 L35 42"
          stroke="${dark}"
          stroke-width="1"
          opacity=".7"
        />

        <circle
          cx="30"
          cy="37"
          r="2"
          fill="${ch.accent}"
          opacity=".85"
        />
      `
      : `
        <path
          d="M24.5 30 Q30 33 35.5 30"
          stroke="${light}"
          stroke-width="1.3"
          opacity=".5"
          fill="none"
        />

        <path
          d="M26 43 Q30 45 34 43"
          stroke="${dark}"
          stroke-width="1"
          opacity=".42"
          fill="none"
        />
      `;

  const shoulderDetail = `
    <path
      d="M23 28 Q20.5 29.5 20 33"
      stroke="${light}"
      stroke-width="1.1"
      opacity=".5"
      fill="none"
      stroke-linecap="round"
    />

    <path
      d="M37 28 Q39.5 29.5 40 33"
      stroke="${dark}"
      stroke-width="1.1"
      opacity=".5"
      fill="none"
      stroke-linecap="round"
    />
  `;

  const belt =
    isSumo || isMonk
      ? `
        <path
          d="M20 54 Q30 57 40 54"
          stroke="${ch.accent}"
          stroke-width="4"
          fill="none"
          stroke-linecap="round"
        />
      `
      : '';

  const robotChest =
    isRobot
      ? `
        <path
          d="M23 29 L30 33 L37 29"
          stroke="${ch.accent}"
          stroke-width="1.2"
          opacity=".65"
          fill="none"
        />

        <path
          d="M23 49 L37 49"
          stroke="${ch.accent}"
          stroke-width="1"
          opacity=".4"
        />
      `
      : '';

  return `
    <svg
      class="rig"
      viewBox="0 0 60 100"
      preserveAspectRatio="xMidYMax meet"
    >

      <defs>

        <filter id="fighterGlow-${ch.key}">
          <feGaussianBlur
            stdDeviation="1.8"
            result="blur"
          />

          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        <linearGradient
          id="bodyGradient-${ch.key}"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop
            offset="0%"
            stop-color="${light}"
          />

          <stop
            offset="45%"
            stop-color="${main}"
          />

          <stop
            offset="100%"
            stop-color="${back}"
          />
        </linearGradient>

        <linearGradient
          id="skinGradient-${ch.key}"
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <stop
            offset="0%"
            stop-color="${ch.skin}"
          />

          <stop
            offset="100%"
            stop-color="${skinDark}"
          />
        </linearGradient>

      </defs>


      <!-- ===============================================================
           BACK LEG
           =============================================================== -->

      <g class="legBackUpper">

        <path
          d="M30 58 L24 75"
          stroke="${back}"
          stroke-width="${isSumo ? 8.5 : 7.5}"
          stroke-linecap="round"
        />

        <circle
          cx="30"
          cy="58"
          r="4.2"
          fill="${back}"
        />

        <g class="legBackLower">

          <path
            d="M24 75 L19 96"
            stroke="${back}"
            stroke-width="${isSumo ? 8 : 7}"
            stroke-linecap="round"
          />

          <circle
            cx="24"
            cy="75"
            r="3.6"
            fill="${back}"
          />

          <!-- back foot -->
          <path
            d="M19 94
               Q15 95 14 97
               Q17 99 22 98
               L24 96"
            fill="${back}"
          />

        </g>

      </g>


      <!-- ===============================================================
           FRONT LEG
           =============================================================== -->

      <g class="legFrontUpper">

        <path
          d="M30 58 L37 75"
          stroke="url(#bodyGradient-${ch.key})"
          stroke-width="${isSumo ? 9 : 7.8}"
          stroke-linecap="round"
        />

        <circle
          cx="30"
          cy="58"
          r="4.2"
          fill="${main}"
        />

        <circle
          cx="31"
          cy="57.2"
          r="1.15"
          fill="${light}"
          opacity=".55"
        />

        <g class="legFrontLower">

          <path
            d="M37 75 L42 96"
            stroke="url(#bodyGradient-${ch.key})"
            stroke-width="${isSumo ? 8.5 : 7.2}"
            stroke-linecap="round"
          />

          <circle
            cx="37"
            cy="75"
            r="3.8"
            fill="${main}"
          />

          <circle
            cx="38"
            cy="74.2"
            r="1"
            fill="${light}"
            opacity=".5"
          />

          <!-- front foot -->
          <path
            d="M42 94
               Q47 95 48 97
               Q45 99 40 98
               L39 96"
            fill="${main}"
          />

        </g>

      </g>


      <!-- ===============================================================
           TORSO
           =============================================================== -->

      <g class="torsoG">

        <path
          class="torsoShadow"
          d="${torsoPath}"
          fill="${back}"
          opacity=".75"
        />

        <path
          class="torsoMain"
          d="${torsoPath}"
          fill="url(#bodyGradient-${ch.key})"
        />

        ${shoulderDetail}
        ${torsoInner}
        ${belt}
        ${robotChest}

        ${
          isNinja
            ? `
              <path
                d="M24 47 Q30 50 36 47"
                stroke="${ch.accent}"
                stroke-width="1.4"
                opacity=".65"
                fill="none"
              />
            `
            : ''
        }

        ${
          isMonk
            ? `
              <path
                d="M22 34 Q30 39 38 34"
                stroke="${ch.accent}"
                stroke-width="1.2"
                opacity=".65"
                fill="none"
              />

              <path
                d="M24 48 Q30 52 36 48"
                stroke="${ch.accent}"
                stroke-width="1"
                opacity=".5"
                fill="none"
              />
            `
            : ''
        }

      </g>


      <!-- ===============================================================
           NECK
           =============================================================== -->

      <rect
        x="27"
        y="22"
        width="6"
        height="7"
        rx="2.5"
        fill="url(#skinGradient-${ch.key})"
      />


      <!-- ===============================================================
           BACK ARM
           =============================================================== -->

      <g class="armBackUpper">

        <path
          d="M30 27 L23 42"
          stroke="${back}"
          stroke-width="6.5"
          stroke-linecap="round"
        />

        <circle
          cx="30"
          cy="27"
          r="3.6"
          fill="${back}"
        />

        <g class="armBackLower">

          <path
            d="M23 42 L19 29"
            stroke="${back}"
            stroke-width="6"
            stroke-linecap="round"
          />

          <circle
            cx="23"
            cy="42"
            r="3.1"
            fill="${back}"
          />

          <circle
            cx="19"
            cy="29"
            r="3"
            fill="${back}"
          />

        </g>

      </g>


      <!-- ===============================================================
           HEAD
           =============================================================== -->

      <circle
        class="head"
        cx="30"
        cy="15"
        r="9"
        fill="url(#skinGradient-${ch.key})"
      />

      <ellipse
        cx="27.2"
        cy="11.8"
        rx="3.2"
        ry="1.4"
        fill="#fff"
        opacity=".1"
      />

      ${faceSVG(ch)}


      <!-- ===============================================================
           FRONT ARM
           =============================================================== -->

      <g class="armFrontUpper">

        <path
          d="M30 27 L37 42"
          stroke="url(#bodyGradient-${ch.key})"
          stroke-width="${isSumo ? 7.4 : 6.8}"
          stroke-linecap="round"
        />

        <circle
          cx="30"
          cy="27"
          r="3.9"
          fill="${main}"
        />

        <circle
          cx="31"
          cy="26"
          r="1"
          fill="${light}"
          opacity=".55"
        />

        <g class="armFrontLower">

          <path
            d="M37 42 L41 29"
            stroke="url(#bodyGradient-${ch.key})"
            stroke-width="${isSumo ? 7 : 6.2}"
            stroke-linecap="round"
          />

          <circle
            cx="37"
            cy="42"
            r="3.4"
            fill="${main}"
          />

          <circle
            cx="38"
            cy="41"
            r=".9"
            fill="${light}"
            opacity=".5"
          />

          ${
            ch.accessory === 'gloves'
              ? `
                <circle
                  class="glove"
                  cx="41"
                  cy="29"
                  r="6.4"
                  fill="#b92f2f"
                />

                <circle
                  cx="39.2"
                  cy="27.3"
                  r="1.8"
                  fill="#e35b55"
                  opacity=".55"
                />

                <path
                  d="M37.2 29 Q41 32 44.7 29"
                  stroke="#7d1d1d"
                  stroke-width="1"
                  opacity=".65"
                  fill="none"
                />
              `
              : `
                <circle
                  cx="41"
                  cy="29"
                  r="3"
                  fill="${main}"
                />
              `
          }

        </g>

      </g>


      <!-- accessories -->
      ${accessorySVG(ch)}

    </svg>
  `;
}


// =============================================================================
// 2-BONE IK
// =============================================================================

class TwoBoneIK {

  constructor(len1, len2, maxStretch = 1.15) {
    this.len1 = len1;
    this.len2 = len2;
    this.maxStretch = maxStretch;
  }

  solve(root, target, poleSign) {

    let dx = target.x - root.x;
    let dy = target.y - root.y;

    let dist = Math.hypot(dx, dy);

    const maxReach =
      (this.len1 + this.len2) * this.maxStretch;

    let stretch = 1;

    if (dist > maxReach) {

      stretch =
        dist /
        (this.len1 + this.len2);

      dist = maxReach;

      const a = Math.atan2(dy, dx);

      dx = Math.cos(a) * dist;
      dy = Math.sin(a) * dist;
    }

    dist = Math.max(
      dist,
      Math.abs(this.len1 - this.len2) + 0.01
    );

    const a = this.len1;
    const b = this.len2;
    const c = dist;

    let cosA =
      (a * a + c * c - b * b) /
      (2 * a * c);

    cosA =
      Math.min(
        1,
        Math.max(-1, cosA)
      );

    const bend =
      Math.max(
        Math.acos(cosA),
        0.08
      );

    const base =
      Math.atan2(dy, dx);

    const upperAngle =
      base + poleSign * bend;

    const joint = {
      x:
        root.x +
        Math.cos(upperAngle) * a,

      y:
        root.y +
        Math.sin(upperAngle) * a
    };

    const lowerAngle =
      Math.atan2(
        target.y - joint.y,
        target.x - joint.x
      );

    return {
      upperAngle,
      lowerAngle,
      stretch
    };
  }
}


const ARM_ROOT = {
  x: 30,
  y: 27
};

const ARM_LEN1 =
  Math.hypot(7, 15);

const ARM_LEN2 =
  Math.hypot(4, -13);

const ARM_REST_U =
  Math.atan2(15, 7);

const ARM_REST_L =
  Math.atan2(-13, 4);

const armIK =
  new TwoBoneIK(
    ARM_LEN1,
    ARM_LEN2,
    1.2
  );


// =============================================================================
// EASING
// =============================================================================

function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;

  return (
    1 +
    c3 * Math.pow(x - 1, 3) +
    c1 * Math.pow(x - 1, 2)
  );
}

function easeOutExpo(x) {
  return x >= 1
    ? 1
    : 1 - Math.pow(2, -10 * x);
}

function easeInOutQuad(x) {
  return x < 0.5
    ? 2 * x * x
    : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function easeInCubic(x) {
  return x * x * x;
}


// =============================================================================
// PUNCH KEYFRAMES
// =============================================================================
//
// The hand travels backwards first to create anticipation,
// accelerates through the target, then retracts.
//
// This is visually much more believable than moving directly
// from idle -> fully extended punch.
//

const PUNCH_KEYS = [

  // Guard / idle
  {
    t: 0,
    x: 41,
    y: 29
  },

  // Pull back
  {
    t: 0.12,
    x: 33,
    y: 22
  },

  // Chamber
  {
    t: 0.24,
    x: 35,
    y: 19
  },

  // Explosion
  {
    t: 0.46,
    x: 68,
    y: 18
  },

  // Follow through
  {
    t: 0.60,
    x: 55,
    y: 21
  },

  // Return
  {
    t: 0.82,
    x: 45,
    y: 26
  },

  // Guard
  {
    t: 1,
    x: 41,
    y: 29
  }
];


function sampleHand(keys, t) {

  for (
    let i = 0;
    i < keys.length - 1;
    i++
  ) {

    const a = keys[i];
    const b = keys[i + 1];

    if (
      t >= a.t &&
      t <= b.t
    ) {

      const local =
        (t - a.t) /
        ((b.t - a.t) || 1);

      let eased;

      if (i === 0) {
        eased = easeInOutQuad(local);
      }

      else if (i === 1) {
        eased = easeInCubic(local);
      }

      else if (i === 2) {
        eased = easeOutExpo(local);
      }

      else if (i === 3) {
        eased = easeOutBack(local);
      }

      else {
        eased = easeInOutQuad(local);
      }

      return {
        x:
          a.x +
          (b.x - a.x) * eased,

        y:
          a.y +
          (b.y - a.y) * eased
      };
    }
  }

  return keys[keys.length - 1];
}


// =============================================================================
// ATTACK BALANCE
// =============================================================================

const ATTACK = {

  punch: {
    startup: 0.09,
    active: 0.07,

    recovery: {
      hit: 0.11,
      block: 0.19,
      whiff: 0.26
    },

    dmg: 7,
    range: 100,
    kb: 90
  },

  kick: {
    startup: 0.14,
    active: 0.08,

    recovery: {
      hit: 0.18,
      block: 0.32,
      whiff: 0.46
    },

    dmg: 13,
    range: 120,
    kb: 170
  },

  lowkick: {
    startup: 0.10,
    active: 0.07,

    recovery: {
      hit: 0.15,
      block: 0.26,
      whiff: 0.34
    },

    dmg: 10,
    range: 108,
    kb: 130
  },

  rush: {
    startup: 0.06,
    active: 0.10,

    recovery: {
      hit: 0.16,
      block: 0.26,
      whiff: 0.32
    },

    dmg: 20,
    range: 130,
    kb: 220
  },

  aerialKick: {
    startup: 0.08,
    active: 0.10,

    recovery: {
      hit: 0.14,
      block: 0.24,
      whiff: 0.30
    },

    dmg: 18,
    range: 130,
    kb: 200
  }
};


// =============================================================================
// PHYSICS
// =============================================================================

const GRAVITY = 2500;
const JUMP_V = 760;

const MOVE_ACCEL = 2400;
const MAX_SPEED = 250;
const AIR_CONTROL = 0.55;

const GROUND_DECEL = 1900;

const DASH_SPEED = 880;
const DASH_TIME = 0.16;
const DASH_COOLDOWN = 0.55;
const DASH_IFRAME = 0.14;

const FLIP_TIME = 0.46;
const BACKFLIP_TIME = 0.36;

const LANDING_RECOVERY = 0.09;

const COMBO_WINDOW = 1.1;


// =============================================================================
// FIGHTER
// =============================================================================

export class Fighter {

  constructor(
    charKey,
    side,
    isPlayer
  ) {

    this.ch =
      charByKey(charKey);

    this.side = side;
    this.isPlayer = isPlayer;

    this.x =
      side === 'p1'
        ? 500
        : 1300;

    this.y = 0;

    this.vx = 0;
    this.vy = 0;

    this.facing =
      side === 'p1'
        ? 1
        : -1;

    this.grounded = true;

    this.state = 'idle';

    this.attackType = null;
    this.attackPhase = null;
    this.attackPhaseStart = 0;

    this.attackDurations = null;
    this.attackOutcome = null;

    this.bufferedAttack = null;

    this.comboBuffer = [];
    this.comboCount = 0;

    this.lastHitTime = -99;
    this.hits = 0;

    this.health =
      100 *
      (this.ch.stats.health || 1);

    this.maxHealth = this.health;

    this.dashCooldownUntil = 0;
    this.invincibleUntil = 0;

    this.dashDir = 0;
    this._dashUntil = 0;

    this.flipUntil = 0;
    this.flipType = null;
    this._flipStart = 0;

    this.landingUntil = 0;

    this.hitstunUntil = 0;
    this.knockdownUntil = 0;

    // Animation state
    this.walkPhase = 0;
    this.breathPhase = 0;

    this.hitReaction = 0;
    this.attackVisual = 0;

    this.ikPunch = null;

    this.events = [];

    this.el = null;
    this.rig = {};

    this.timeSec = 0;

    // Small random phase prevents both fighters from breathing
    // at exactly the same time.
    this.animOffset =
      side === 'p1'
        ? 0
        : 1.7;
  }


  // ===========================================================================
  // MOUNT
  // ===========================================================================

  mount(container) {

    this.el =
      document.createElement('div');

    this.el.className =
      `fighter ${this.side}`;

    this.el.innerHTML = `
      <div class="comboPopup"></div>

      <div class="leanWrap">
        <div class="rigWrap">
          <div class="flipSpin">
            ${rigSVG(this.ch)}
          </div>
        </div>
      </div>

      <div class="platform"></div>
    `;

    container.appendChild(this.el);

    const q =
      sel =>
        this.el.querySelector(sel);

    this.rig = {

      combo:
        q('.comboPopup'),

      lean:
        q('.leanWrap'),

      rigWrap:
        q('.rigWrap'),

      flipSpin:
        q('.flipSpin'),

      svg:
        q('.rig'),

      torso:
        q('.torsoG'),

      torsoMain:
        q('.torsoMain'),

      head:
        q('.head'),

      armFU:
        q('.armFrontUpper'),

      armFL:
        q('.armFrontLower'),

      armBU:
        q('.armBackUpper'),

      armBL:
        q('.armBackLower'),

      legFU:
        q('.legFrontUpper'),

      legFL:
        q('.legFrontLower'),

      legBU:
        q('.legBackUpper'),

      legBL:
        q('.legBackLower'),

      mouthOpen:
        q('.mouthOpen'),

      mouthNeutral:
        q('.mouthNeutral'),

      mouthTeeth:
        q('.mouthTeeth'),

      eyes:
        qAll('.eye'),

      brows:
        qAll('.brow')
    };


    function qAll(selector) {
      return [
        ...this.el.querySelectorAll(selector)
      ];
    }


    // Important because qAll above needs the element.
    this.rig.eyes =
      [
        ...this.el.querySelectorAll('.eye')
      ];

    this.rig.brows =
      [
        ...this.el.querySelectorAll('.brow')
      ];
  }


  // ===========================================================================
  // RESET
  // ===========================================================================

  reset(x) {

    this.x = x;
    this.y = 0;

    this.vx = 0;
    this.vy = 0;

    this.health =
      this.maxHealth;

    this.state = 'idle';

    this.grounded = true;

    this.attackType = null;
    this.attackPhase = null;

    this.comboCount = 0;
    this.comboBuffer = [];

    this.hits = 0;

    this.hitstunUntil = 0;
    this.knockdownUntil = 0;

    this.invincibleUntil = 0;
    this.dashCooldownUntil = 0;

    this._dashUntil = 0;

    this.flipUntil = 0;
    this._flipStart = 0;

    this.landingUntil = 0;

    this.walkPhase = 0;
    this.breathPhase = 0;

    this.hitReaction = 0;
    this.attackVisual = 0;

    this.ikPunch = null;

    this.events = [];

    if (this.rig.flipSpin) {
      this.rig.flipSpin.style.animation =
        'none';
    }

    this.el.classList.remove(
      'hitflash',
      'dashing',
      'flipping',
      'blocking',
      'attack-punch',
      'attack-kick',
      'attack-heavy',
      'attack-lowkick',
      'aerial',
      'jump',
      'ko'
    );

    this._clearPose();
  }


  // ===========================================================================
  // EVENTS
  // ===========================================================================

  pushEvent(ev) {
    this.events.push(ev);
  }


  // ===========================================================================
  // CAN ACT
  // ===========================================================================

  canAct() {

    return (
      this.state === 'idle' ||
      this.state === 'walk' ||
      (
        this.state === 'jump' &&
        this.grounded === false
      )
    );
  }


  // ===========================================================================
  // ATTACK
  // ===========================================================================

  startAttack(type, buffered) {

    const isAerial =
      !this.grounded;

    const isLow =
      type === 'kick' &&
      this.grounded &&
      this.state === 'block';

    const t =
      isAerial && type === 'kick'
        ? 'aerialKick'
        : isLow
          ? 'lowkick'
          : type;

    const timing =
      ATTACK[t];

    if (!timing) {
      return;
    }

    this.state = 'attack';

    this.attackType = t;

    this.attackPhase = 'startup';

    this.attackPhaseStart =
      this.timeSec;

    const cdMult =
      (this.ch.stats.cooldownMult || 1) *
      (
        t === 'punch'
          ? (this.ch.stats.punchCooldownMult || 1)
          : 1
      );

    this.attackDurations = {

      startup:
        timing.startup *
        (buffered ? 0.7 : 1),

      active:
        timing.active,

      recovery: {
        hit:
          timing.recovery.hit *
          cdMult,

        block:
          timing.recovery.block *
          cdMult,

        whiff:
          timing.recovery.whiff *
          cdMult
      }
    };

    this.attackOutcome = null;
    this.bufferedAttack = null;

    // Visual attack state
    this.attackVisual = 0;

    const cls =
      t === 'rush'
        ? 'attack-heavy'
        : t === 'aerialKick'
          ? 'attack-kick aerial'
          : t === 'lowkick'
            ? 'attack-lowkick'
            : `attack-${t}`;

    const allAtkClasses = [
      'attack-punch',
      'attack-kick',
      'attack-heavy',
      'attack-lowkick',
      'aerial'
    ];

    this.el.classList.remove(
      ...allAtkClasses
    );

    void this.el.offsetWidth;

    cls
      .split(' ')
      .forEach(c =>
        this.el.classList.add(c)
      );

    clearTimeout(this._atkTimer);

    const animMs =
      (
        timing.startup +
        timing.active
      ) * 1000 + 60;

    this._atkTimer =
      setTimeout(() => {

        if (this.el) {
          this.el.classList.remove(
            ...allAtkClasses
          );
        }

      }, animMs);


    // Punches use IK.
    if (
      t === 'punch' ||
      t === 'rush'
    ) {

      this.ikPunch = {

        start:
          this.timeSec,

        dur:
          (
            timing.startup +
            timing.active
          ) * 1.6
      };
    }
  }


  // ===========================================================================
  // ATTACK RESOLUTION
  // ===========================================================================

  resolveAttack(opp) {

    const t =
      this.attackType;

    const timing =
      ATTACK[t];

    if (!timing) {
      return;
    }

    const dist =
      Math.abs(
        this.x - opp.x
      );

    const facingOK =
      (
        this.x < opp.x &&
        this.facing === 1
      ) ||
      (
        this.x > opp.x &&
        this.facing === -1
      );

    if (
      dist > timing.range ||
      !facingOK
    ) {

      this.attackOutcome =
        'whiff';

      this.pushEvent({
        type: 'whoosh'
      });

      return;
    }

    if (
      this.timeSec <
      opp.invincibleUntil
    ) {

      this.attackOutcome =
        'whiff';

      return;
    }


    // Combo
    this.comboCount =
      (
        this.timeSec -
        this.lastHitTime <
        COMBO_WINDOW
      )
        ? this.comboCount + 1
        : 1;

    this.lastHitTime =
      this.timeSec;


    // Damage
    let dmg =
      timing.dmg *
      (this.ch.stats.dmgAll || 1);

    if (t === 'punch') {
      dmg *=
        (this.ch.stats.punchDmg || 1);
    }

    if (
      t === 'kick' ||
      t === 'aerialKick'
    ) {
      dmg *=
        (this.ch.stats.kickDmg || 1);
    }

    dmg +=
      Math.min(
        this.comboCount - 1,
        5
      ) * 1.6;


    // -------------------------------------------------------------------------
    // BLOCK
    // -------------------------------------------------------------------------

    if (
      opp.state === 'block' &&
      t !== 'rush'
    ) {

      this.attackOutcome =
        'block';

      dmg *= 0.22;

      opp.pushEvent({
        type: 'block',
        x: opp.x,
        y:
          GROUND_Y -
          opp.y -
          40
      });

      const kb =
        timing.kb * 0.4;

      const direction =
        opp.x >= this.x
          ? 1
          : -1;

      opp.vx +=
        direction * kb;

      this.vx -=
        direction *
        kb *
        0.5;

      return;
    }


    // -------------------------------------------------------------------------
    // HIT
    // -------------------------------------------------------------------------

    if (
      t === 'rush' &&
      opp.state === 'block'
    ) {

      dmg *= 0.4;

      opp.pushEvent({
        type: 'block',
        x: opp.x,
        y:
          GROUND_Y -
          opp.y -
          40
      });
    }


    this.attackOutcome =
      'hit';


    const kb =
      timing.kb *
      (
        opp.ch.stats.knockback
          ? 1 /
            opp.ch.stats.knockback
          : 1
      );

    const direction =
      opp.x >= this.x
        ? 1
        : -1;


    opp.vx +=
      direction * kb;


    opp.vy +=
      (
        t === 'kick' ||
        t === 'aerialKick'
      )
        ? 140
        : 60;


    opp.hitstunUntil =
      this.timeSec +
      (
        t === 'rush'
          ? 0.42
          : t === 'punch'
            ? 0.22
            : 0.34
      );


    opp.state =
      'hitstun';


    // Visual hit reaction
    opp.hitReaction = 1;

    opp.el.classList.add(
      'hitflash'
    );

    setTimeout(() => {

      if (opp.el) {
        opp.el.classList.remove(
          'hitflash'
        );
      }

    }, 220);


    opp.health =
      Math.max(
        0,
        opp.health - dmg
      );

    this.hits++;


    this.pushEvent({

      type: 'hit',

      tier: t,

      combo:
        this.comboCount,

      x:
        opp.x,

      y:
        GROUND_Y -
        opp.y -
        45,

      dirX:
        direction,

      color:
        this.ch.color
    });
  }


  // ===========================================================================
  // ATTACK STATE
  // ===========================================================================

  updateAttackState(opp) {

    if (
      this.state !== 'attack'
    ) {
      return;
    }

    const elapsed =
      this.timeSec -
      this.attackPhaseStart;


    // Startup
    if (
      this.attackPhase ===
      'startup'
    ) {

      if (
        elapsed >=
        this.attackDurations.startup
      ) {

        this.attackPhase =
          'active';

        this.attackPhaseStart =
          this.timeSec;

        this.resolveAttack(opp);
      }

      return;
    }


    // Active
    if (
      this.attackPhase ===
      'active'
    ) {

      if (
        elapsed >=
        this.attackDurations.active
      ) {

        this.attackPhase =
          'recovery';

        this.attackPhaseStart =
          this.timeSec;
      }

      return;
    }


    // Recovery
    if (
      this.attackPhase ===
      'recovery'
    ) {

      const dur =
        this.attackDurations.recovery[
          this.attackOutcome
        ] ||
        this.attackDurations.recovery.whiff;


      if (
        elapsed >= dur
      ) {

        if (
          this.bufferedAttack
        ) {

          const next =
            this.bufferedAttack;

          this.startAttack(
            next,
            true
          );

        } else {

          this.state =
            this.grounded
              ? 'idle'
              : 'jump';

          this.attackType =
            null;

          this.attackPhase =
            null;
        }
      }
    }
  }


  // ===========================================================================
  // DASH
  // ===========================================================================

  startDash(dir) {

    if (
      this.timeSec <
      this.dashCooldownUntil
    ) {
      return;
    }

    if (
      this.state === 'attack' ||
      this.state === 'hitstun'
    ) {
      return;
    }

    this.dashDir = dir;

    this.dashCooldownUntil =
      this.timeSec +
      DASH_COOLDOWN;

    this.invincibleUntil =
      this.timeSec +
      DASH_IFRAME;

    this._dashUntil =
      this.timeSec +
      DASH_TIME;

    this.el.classList.add(
      'dashing'
    );

    setTimeout(() => {

      if (this.el) {
        this.el.classList.remove(
          'dashing'
        );
      }

    }, DASH_TIME * 1000 + 60);


    this.pushEvent({
      type: 'dash',
      x: this.x,
      y:
        GROUND_Y -
        this.y -
        30
    });
  }


  // ===========================================================================
  // FLIP
  // ===========================================================================

  startFlip(kind) {

    if (
      this.state === 'attack' ||
      this.state === 'hitstun'
    ) {
      return;
    }

    this.state = 'flip';

    this.flipType = kind;

    this.flipUntil =
      this.timeSec +
      (
        kind === 'front'
          ? FLIP_TIME
          : BACKFLIP_TIME
      );

    this._flipStart =
      this.timeSec;


    this.invincibleUntil =
      this.timeSec +
      (
        kind === 'front'
          ? FLIP_TIME * 0.7
          : BACKFLIP_TIME * 0.8
      );


    this.vy =
      Math.max(
        this.vy,
        kind === 'front'
          ? 520
          : 420
      );


    this.el.classList.add(
      'flipping'
    );


    this.rig.flipSpin.style.animation =
      'none';

    void this.rig.flipSpin.offsetWidth;


    this.rig.flipSpin.style.animation =
      `${
        kind === 'front'
          ? 'flipFwd'
          : 'flipBack'
      } ${
        (
          kind === 'front'
            ? FLIP_TIME
            : BACKFLIP_TIME
        ).toFixed(2)
      }s linear`;


    this.pushEvent({
      type: 'flip',
      x: this.x,
      y:
        GROUND_Y -
        this.y -
        30
    });
  }


  // ===========================================================================
  // MAIN UPDATE
  // ===========================================================================

  update(
    dt,
    inp,
    opp,
    dashRequest
  ) {

    this.timeSec += dt;

    this.events = [];

    const now =
      this.timeSec;


    // -------------------------------------------------------------------------
    // Face opponent
    // -------------------------------------------------------------------------

    if (
      this.state !== 'attack' &&
      this.state !== 'flip'
    ) {

      this.facing =
        this.x <= opp.x
          ? 1
          : -1;
    }


    // -------------------------------------------------------------------------
    // Hitstun timer
    // -------------------------------------------------------------------------

    if (
      this.state === 'hitstun' &&
      now >= this.hitstunUntil
    ) {

      this.state =
        this.grounded
          ? 'idle'
          : 'jump';
    }


    // -------------------------------------------------------------------------
    // Dash
    // -------------------------------------------------------------------------

    if (
      dashRequest &&
      this.canAct()
    ) {

      this.startDash(
        dashRequest
      );
    }


    // -------------------------------------------------------------------------
    // Jump / flips
    // -------------------------------------------------------------------------

    if (inp.jumpEdge) {

      if (
        this.grounded &&
        inp.block
      ) {

        this.startFlip(
          'back'
        );

      } else if (
        !this.grounded &&
        this.state === 'jump'
      ) {

        this.startFlip(
          'front'
        );

      } else if (
        this.grounded &&
        this.state !== 'attack'
      ) {

        this.vy =
          JUMP_V *
          (
            this.ch.stats.jumpMult ||
            1
          );

        this.grounded = false;

        this.state =
          'jump';
      }
    }


    // -------------------------------------------------------------------------
    // Block
    // -------------------------------------------------------------------------

    const dashing =
      now < this._dashUntil;


    if (
      this.grounded &&
      (
        this.state === 'idle' ||
        this.state === 'walk' ||
        this.state === 'block'
      )
    ) {

      this.state =
        inp.block
          ? 'block'
          : (
              Math.abs(this.vx) > 12
                ? 'walk'
                : 'idle'
            );
    }


    this.el.classList.toggle(
      'blocking',
      this.state === 'block'
    );


    // -------------------------------------------------------------------------
    // Attacks
    // -------------------------------------------------------------------------

    if (
      inp.punchEdge &&
      this.state !== 'block'
    ) {

      if (
        this.canAct()
      ) {

        this.startAttack(
          'punch',
          false
        );

      } else if (
        this.state === 'attack' &&
        this.attackPhase ===
        'recovery'
      ) {

        this.bufferedAttack =
          'punch';
      }
    }


    if (inp.kickEdge) {

      if (
        this.canAct() ||
        this.state === 'block'
      ) {

        this.startAttack(
          'kick',
          false
        );

      } else if (
        this.state === 'attack' &&
        this.attackPhase ===
        'recovery'
      ) {

        this.bufferedAttack =
          'kick';
      }
    }


    // -------------------------------------------------------------------------
    // Combo buffer
    // -------------------------------------------------------------------------

    if (
      inp.punchEdge ||
      inp.kickEdge
    ) {

      this.comboBuffer.push({

        n:
          inp.punchEdge
            ? 'p'
            : 'k',

        t:
          now
      });


      while (
        this.comboBuffer.length &&
        now -
        this.comboBuffer[0].t >
        1.2
      ) {

        this.comboBuffer.shift();
      }


      const last3 =
        this.comboBuffer
          .slice(-3)
          .map(e => e.n)
          .join('');


      if (
        last3 === 'ppk' &&
        this.state === 'attack'
      ) {

        this.comboBuffer.length = 0;

        this.bufferedAttack =
          'rush';
      }
    }


    // -------------------------------------------------------------------------
    // Attack state
    // -------------------------------------------------------------------------

    this.updateAttackState(
      opp
    );


    // -------------------------------------------------------------------------
    // Horizontal movement
    // -------------------------------------------------------------------------

    const moving =
      this.state === 'idle' ||
      this.state === 'walk' ||
      this.state === 'jump';


    let targetVx = 0;


    if (
      moving &&
      this.state !== 'block'
    ) {

      const speedMult =
        this.ch.stats.speed ||
        1;

      if (inp.left) {

        targetVx =
          -MAX_SPEED *
          speedMult;
      }

      if (inp.right) {

        targetVx =
          MAX_SPEED *
          speedMult;
      }
    }


    if (dashing) {

      this.vx =
        this.dashDir *
        DASH_SPEED *
        (
          this.ch.stats.dashMult ||
          1
        );

    } else if (
      this.state === 'flip'
    ) {

      const p =
        Math.min(
          1,
          (
            now -
            this._flipStart
          ) /
          (
            this.flipType === 'front'
              ? FLIP_TIME
              : BACKFLIP_TIME
          )
        );

      const dir =
        this.flipType === 'front'
          ? this.facing
          : -this.facing;

      this.vx =
        dir *
        (
          this.flipType === 'front'
            ? 340
            : 460
        ) *
        (
          1 -
          p * 0.3
        );

    } else {

      const control =
        this.grounded
          ? 1
          : AIR_CONTROL;

      const accel =
        targetVx !== 0
          ? MOVE_ACCEL
          : GROUND_DECEL;

      const adjustedAccel =
        accel * control;

      this.vx +=
        Math.sign(
          targetVx -
          this.vx
        ) *
        Math.min(
          Math.abs(
            targetVx -
            this.vx
          ),
          adjustedAccel * dt
        );
    }


    // -------------------------------------------------------------------------
    // Horizontal position
    // -------------------------------------------------------------------------

    this.x +=
      this.vx * dt;


    this.x =
      Math.max(
        ARENA_MIN_X,
        Math.min(
          ARENA_MAX_X,
          this.x
        )
      );


    if (
      this.x === ARENA_MIN_X ||
      this.x === ARENA_MAX_X
    ) {

      this.vx = 0;
    }


    // -------------------------------------------------------------------------
    // Vertical physics
    // -------------------------------------------------------------------------

    if (
      !this.grounded ||
      this.y > 0 ||
      this.vy !== 0
    ) {

      this.vy -=
        GRAVITY * dt;

      this.y +=
        this.vy * dt;


      if (this.y <= 0) {

        this.y = 0;

        this.vy = 0;


        if (!this.grounded) {

          this.pushEvent({
            type: 'land',
            x: this.x,
            y: GROUND_Y
          });
        }


        this.grounded = true;


        if (
          this.state === 'jump'
        ) {

          this.state =
            'idle';
        }


        if (
          this.state === 'flip'
        ) {

          this.state =
            'landing';

          this.landingUntil =
            now +
            LANDING_RECOVERY;
        }

      } else {

        this.grounded = false;
      }
    }


    // -------------------------------------------------------------------------
    // Landing recovery
    // -------------------------------------------------------------------------

    if (
      this.state === 'landing' &&
      now >= this.landingUntil
    ) {

      this.state =
        'idle';
    }


    // -------------------------------------------------------------------------
    // Walk state
    // -------------------------------------------------------------------------

    if (
      this.grounded &&
      (
        this.state === 'idle' ||
        this.state === 'walk'
      )
    ) {

      this.state =
        Math.abs(this.vx) > 12
          ? 'walk'
          : 'idle';
    }


    // -------------------------------------------------------------------------
    // KO
    // -------------------------------------------------------------------------

    if (
      this.health <= 0 &&
      this.state !== 'ko'
    ) {

      this.state = 'ko';

      this.pushEvent({
        type: 'ko',
        x: this.x,
        y: GROUND_Y - 40
      });
    }


    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    this._render(dt);
  }


  // ===========================================================================
  // RENDER
  // ===========================================================================

  _render(dt) {

    const el = this.el;
    const r = this.rig;

    if (!el || !r.svg) {
      return;
    }


    // -------------------------------------------------------------------------
    // Position
    // -------------------------------------------------------------------------

    el.style.left =
      `${this.x}px`;

    el.style.top =
      `${GROUND_Y - this.y}px`;


    // -------------------------------------------------------------------------
    // Face direction
    // -------------------------------------------------------------------------

    r.svg.style.transform =
      `scaleX(${
        this.facing >= 0
          ? 1
          : -1
      })`;


    // -------------------------------------------------------------------------
    // Classes
    // -------------------------------------------------------------------------

    el.classList.toggle(
      'jump',
      !this.grounded &&
      this.state !== 'flip'
    );

    el.classList.toggle(
      'flipping',
      this.state === 'flip'
    );

    el.classList.toggle(
      'ko',
      this.state === 'ko'
    );


    // -------------------------------------------------------------------------
    // Breathing
    // -------------------------------------------------------------------------

    this.breathPhase +=
      dt *
      (
        this.state === 'idle'
          ? 2.4
          : 3.4
      );


    const breathing =
      Math.sin(
        this.breathPhase +
        this.animOffset
      );


    // -------------------------------------------------------------------------
    // Hit reaction decay
    // -------------------------------------------------------------------------

    this.hitReaction =
      Math.max(
        0,
        this.hitReaction -
        dt * 5
      );


    // -------------------------------------------------------------------------
    // Acceleration lean
    // -------------------------------------------------------------------------

    const leanVelocity =
      -this.vx *
      0.045;

    const hitLean =
      this.hitReaction *
      (
        this.vx >= 0
          ? -7
          : 7
      );

    const dashLean =
      this._dashUntil >
      this.timeSec
        ? -this.dashDir * 12
        : 0;


    let leanTarget =
      leanVelocity +
      hitLean +
      dashLean;


    leanTarget =
      Math.max(
        -22,
        Math.min(
          22,
          leanTarget
        )
      );


    // Smooth torso movement
    const curLean =
      parseFloat(
        r.lean.dataset.lean ||
        '0'
      );


    const nextLean =
      curLean +
      (
        leanTarget -
        curLean
      ) *
      Math.min(
        1,
        dt * 12
      );


    r.lean.dataset.lean =
      nextLean;


    r.lean.style.transform =
      `rotate(${
        nextLean.toFixed(2)
      }deg)`;


    // -------------------------------------------------------------------------
    // Tiny breathing scale
    // -------------------------------------------------------------------------

    if (
      this.state === 'idle' ||
      this.state === 'block'
    ) {

      const breathScale =
        1 +
        breathing * 0.008;

      r.rigWrap.style.transform =
        `scaleY(${breathScale.toFixed(4)})`;

    } else {

      r.rigWrap.style.transform =
        '';
    }


    // -------------------------------------------------------------------------
    // Walk animation
    // -------------------------------------------------------------------------

    if (
      this.state === 'walk'
    ) {

      this.walkPhase +=
        dt *
        (
          6 +
          Math.abs(this.vx) *
          0.02
        );


      const swing =
        Math.sin(
          this.walkPhase
        ) *
        26;


      const kneeLift =
        Math.max(
          0,
          Math.sin(
            this.walkPhase
          )
        ) *
        5;


      r.legFU.style.transform =
        `rotate(${swing.toFixed(1)}deg)`;


      r.legBU.style.transform =
        `rotate(${(-swing * 0.85).toFixed(1)}deg)`;


      r.legFL.style.transform =
        `rotate(${
          Math.max(
            0,
            -swing * 0.55
          ).toFixed(1)
        }deg)
         translateY(${
           -kneeLift.toFixed(1)
         }px)`;


      r.legBL.style.transform =
        `rotate(${
          Math.max(
            0,
            swing * 0.55
          ).toFixed(1)
        }deg)`;
    }


    // -------------------------------------------------------------------------
    // Idle / block / jump / attack pose
    // -------------------------------------------------------------------------

    else if (
      this.state !== 'attack'
    ) {

      this._clearLegWalkTransforms();

      this._applyBodyPose();
    }


    // -------------------------------------------------------------------------
    // Attack-specific animation
    // -------------------------------------------------------------------------

    if (
      this.state === 'attack'
    ) {

      this._renderAttackPose();
    }


    // -------------------------------------------------------------------------
    // IK punch
    // -------------------------------------------------------------------------

    this._renderPunchIK();


    // -------------------------------------------------------------------------
    // Face expression
    // -------------------------------------------------------------------------

    this._renderFace();


    // -------------------------------------------------------------------------
    // Hit shake
    // -------------------------------------------------------------------------

    if (
      this.hitReaction > 0
    ) {

      const shake =
        Math.sin(
          this.timeSec * 90
        ) *
        this.hitReaction *
        1.8;

      r.svg.style.transform +=
        ` translateX(${shake.toFixed(2)}px)`;
    }
  }


  // ===========================================================================
  // CLEAR WALK POSE
  // ===========================================================================

  _clearLegWalkTransforms() {

    const r = this.rig;

    r.legFU.style.transform = '';
    r.legBU.style.transform = '';
    r.legFL.style.transform = '';
    r.legBL.style.transform = '';
  }


  // ===========================================================================
  // CLEAR ALL POSE
  // ===========================================================================

  _clearPose() {

    if (!this.rig) {
      return;
    }

    const r = this.rig;

    [
      r.armFU,
      r.armFL,
      r.armBU,
      r.armBL,
      r.legFU,
      r.legFL,
      r.legBU,
      r.legBL
    ].forEach(node => {

      if (node) {
        node.style.transform = '';
      }
    });

    if (r.rigWrap) {
      r.rigWrap.style.transform = '';
    }

    if (r.lean) {
      r.lean.style.transform = '';
    }
  }


  // ===========================================================================
  // BODY POSE
  // ===========================================================================

  _applyBodyPose() {

    const r = this.rig;

    if (!r.svg) {
      return;
    }


    // -------------------------------------------------------------------------
    // IDLE
    // -------------------------------------------------------------------------

    if (
      this.state === 'idle'
    ) {

      const idle =
        Math.sin(
          this.timeSec * 2.2 +
          this.animOffset
        );

      // Relaxed legs.
      r.legFU.style.transform =
        `rotate(${(
          idle * 2
        ).toFixed(2)}deg)`;

      r.legBU.style.transform =
        `rotate(${(
          -idle * 1.6
        ).toFixed(2)}deg)`;


      // Slight natural arm movement.
      r.armBU.style.transform =
        `rotate(${(
          -idle * 2
        ).toFixed(2)}deg)`;

      r.armBL.style.transform =
        `rotate(${(
          idle * 1.5
        ).toFixed(2)}deg)`;
    }


    // -------------------------------------------------------------------------
    // BLOCK
    // -------------------------------------------------------------------------

    else if (
      this.state === 'block'
    ) {

      // Back arm rises to protect head.
      r.armBU.style.transform =
        'rotate(-18deg)';

      r.armBL.style.transform =
        'rotate(-48deg)';


      // Front arm covers torso/head.
      r.armFU.style.transform =
        'rotate(-48deg)';

      r.armFL.style.transform =
        'rotate(-62deg)';


      // Slight defensive leg stance.
      r.legFU.style.transform =
        'rotate(7deg)';

      r.legBU.style.transform =
        'rotate(-8deg)';
    }


    // -------------------------------------------------------------------------
    // JUMP
    // -------------------------------------------------------------------------

    else if (
      this.state === 'jump'
    ) {

      const upward =
        this.vy > 0;

      if (upward) {

        r.legFU.style.transform =
          'rotate(14deg)';

        r.legBU.style.transform =
          'rotate(-18deg)';

        r.legFL.style.transform =
          'rotate(-10deg)';

        r.legBL.style.transform =
          'rotate(12deg)';

      } else {

        // Falling pose:
        // legs prepare for landing.
        r.legFU.style.transform =
          'rotate(8deg)';

        r.legBU.style.transform =
          'rotate(-8deg)';

        r.legFL.style.transform =
          'rotate(5deg)';

        r.legBL.style.transform =
          'rotate(-5deg)';
      }


      r.armFU.style.transform =
        'rotate(-18deg)';

      r.armFL.style.transform =
        'rotate(-25deg)';

      r.armBU.style.transform =
        'rotate(18deg)';

      r.armBL.style.transform =
        'rotate(25deg)';
    }


    // -------------------------------------------------------------------------
    // LANDING
    // -------------------------------------------------------------------------

    else if (
      this.state === 'landing'
    ) {

      r.legFU.style.transform =
        'rotate(20deg)';

      r.legBU.style.transform =
        'rotate(-20deg)';

      r.legFL.style.transform =
        'rotate(-14deg)';

      r.legBL.style.transform =
        'rotate(14deg)';

      r.armFU.style.transform =
        'rotate(-12deg)';

      r.armBU.style.transform =
        'rotate(12deg)';
    }


    // -------------------------------------------------------------------------
    // HITSTUN
    // -------------------------------------------------------------------------

    else if (
      this.state === 'hitstun'
    ) {

      const direction =
        this.vx >= 0
          ? 1
          : -1;

      r.legFU.style.transform =
        `rotate(${
          20 * direction
        }deg)`;

      r.legBU.style.transform =
        `rotate(${
          -18 * direction
        }deg)`;


      r.armFU.style.transform =
        `rotate(${
          -25 * direction
        }deg)`;

      r.armBU.style.transform =
        `rotate(${
          30 * direction
        }deg)`;


      r.armFL.style.transform =
        `rotate(${
          20 * direction
        }deg)`;

      r.armBL.style.transform =
        `rotate(${
          -25 * direction
        }deg)`;
    }


    // -------------------------------------------------------------------------
    // KO
    // -------------------------------------------------------------------------

    else if (
      this.state === 'ko'
    ) {

      r.legFU.style.transform =
        'rotate(38deg)';

      r.legBU.style.transform =
        'rotate(-30deg)';

      r.legFL.style.transform =
        'rotate(22deg)';

      r.legBL.style.transform =
        'rotate(-18deg)';

      r.armFU.style.transform =
        'rotate(55deg)';

      r.armBU.style.transform =
        'rotate(-50deg)';

      r.armFL.style.transform =
        'rotate(25deg)';

      r.armBL.style.transform =
        'rotate(-25deg)';
    }
  }


  // ===========================================================================
  // ATTACK POSES
  // ===========================================================================

  _renderAttackPose() {

    const r = this.rig;

    const phase =
      this.attackPhase;

    if (!phase) {
      return;
    }


    // -------------------------------------------------------------------------
    // PUNCH
    // -------------------------------------------------------------------------

    if (
      this.attackType === 'punch'
    ) {

      if (
        phase === 'startup'
      ) {

        // Body coils backward.
        r.legFU.style.transform =
          'rotate(-7deg)';

        r.legBU.style.transform =
          'rotate(8deg)';

        r.armBU.style.transform =
          'rotate(-20deg)';

      } else if (
        phase === 'active'
      ) {

        // Forward drive.
        r.legFU.style.transform =
          'rotate(9deg)';

        r.legBU.style.transform =
          'rotate(-8deg)';

      } else {

        // Follow through.
        r.legFU.style.transform =
          'rotate(12deg)';

        r.legBU.style.transform =
          'rotate(-11deg)';
      }

      return;
    }


    // -------------------------------------------------------------------------
    // RUSH
    // -------------------------------------------------------------------------

    if (
      this.attackType === 'rush'
    ) {

      r.legFU.style.transform =
        'rotate(16deg)';

      r.legBU.style.transform =
        'rotate(-12deg)';

      r.armBU.style.transform =
        'rotate(-35deg)';

      return;
    }


    // -------------------------------------------------------------------------
    // NORMAL KICK
    // -------------------------------------------------------------------------

    if (
      this.attackType === 'kick'
    ) {

      if (
        phase === 'startup'
      ) {

        // Load the kicking leg.
        r.legFU.style.transform =
          'rotate(-25deg)';

        r.legFL.style.transform =
          'rotate(34deg)';

        // Counterbalance arm.
        r.armFU.style.transform =
          'rotate(-20deg)';

        r.armBU.style.transform =
          'rotate(22deg)';

      } else if (
        phase === 'active'
      ) {

        // Explosive extension.
        r.legFU.style.transform =
          'rotate(32deg)';

        r.legFL.style.transform =
          'rotate(-8deg)';

        r.armFU.style.transform =
          'rotate(-24deg)';

        r.armBU.style.transform =
          'rotate(28deg)';

      } else {

        // Recovery.
        r.legFU.style.transform =
          'rotate(18deg)';

        r.legFL.style.transform =
          'rotate(8deg)';
      }

      return;
    }


    // -------------------------------------------------------------------------
    // LOW KICK
    // -------------------------------------------------------------------------

    if (
      this.attackType === 'lowkick'
    ) {

      if (
        phase === 'startup'
      ) {

        r.legFU.style.transform =
          'rotate(-20deg)';

        r.legFL.style.transform =
          'rotate(28deg)';

      } else if (
        phase === 'active'
      ) {

        r.legFU.style.transform =
          'rotate(25deg)';

        r.legFL.style.transform =
          'rotate(-4deg)';

        r.armFU.style.transform =
          'rotate(-28deg)';

        r.armBU.style.transform =
          'rotate(26deg)';

      } else {

        r.legFU.style.transform =
          'rotate(8deg)';

        r.legFL.style.transform =
          'rotate(8deg)';
      }

      return;
    }


    // -------------------------------------------------------------------------
    // AERIAL KICK
    // -------------------------------------------------------------------------

    if (
      this.attackType === 'aerialKick'
    ) {

      r.armFU.style.transform =
        'rotate(-28deg)';

      r.armBU.style.transform =
        'rotate(30deg)';

      if (
        phase === 'startup'
      ) {

        r.legFU.style.transform =
          'rotate(-30deg)';

        r.legFL.style.transform =
          'rotate(40deg)';

      } else if (
        phase === 'active'
      ) {

        r.legFU.style.transform =
          'rotate(42deg)';

        r.legFL.style.transform =
          'rotate(-12deg)';

      } else {

        r.legFU.style.transform =
          'rotate(20deg)';

        r.legFL.style.transform =
          'rotate(8deg)';
      }
    }
  }


  // ===========================================================================
  // PUNCH IK
  // ===========================================================================

  _renderPunchIK() {

    const r =
      this.rig;

    if (!this.ikPunch) {
      return;
    }


    const t =
      (
        this.timeSec -
        this.ikPunch.start
      ) /
      this.ikPunch.dur;


    if (t >= 1) {

      r.armFU.style.transform = '';
      r.armFL.style.transform = '';

      this.ikPunch = null;

      return;
    }


    const target =
      sampleHand(
        PUNCH_KEYS,
        Math.max(
          0,
          Math.min(
            1,
            t
          )
        )
      );


    const sol =
      armIK.solve(
        ARM_ROOT,
        target,
        1
      );


    const upperDeg =
      (
        sol.upperAngle -
        ARM_REST_U
      ) *
      180 /
      Math.PI;


    const lowerDeg =
      (
        (
          sol.lowerAngle -
          ARM_REST_L
        ) *
        180 /
        Math.PI
      ) -
      upperDeg;


    r.armFU.style.transform =
      `rotate(${
        upperDeg.toFixed(1)
      }deg)`;


    r.armFL.style.transform =
      `rotate(${
        lowerDeg.toFixed(1)
      }deg)`;
  }


  // ===========================================================================
  // FACE ANIMATION
  // ===========================================================================

  _renderFace() {

    const r =
      this.rig;


    if (!r.mouthOpen) {
      return;
    }


    const attacking =
      this.state === 'attack';

    const hurt =
      this.state === 'hitstun';


    const shout =
      attacking ||
      hurt;


    r.mouthOpen.style.opacity =
      shout
        ? '1'
        : '0';


    r.mouthNeutral.style.opacity =
      shout
        ? '0'
        : '1';


    if (r.mouthTeeth) {

      r.mouthTeeth.style.opacity =
        shout
          ? '.9'
          : '0';
    }


    // Aggressive eyebrows during attacks.
    if (
      r.brows &&
      r.brows.length >= 2
    ) {

      if (
        attacking
      ) {

        r.brows[0].style.transform =
          'rotate(-8deg)';

        r.brows[1].style.transform =
          'rotate(8deg)';

      } else if (
        hurt
      ) {

        r.brows[0].style.transform =
          'rotate(10deg)';

        r.brows[1].style.transform =
          'rotate(-10deg)';

      } else {

        r.brows[0].style.transform =
          '';

        r.brows[1].style.transform =
          '';
      }
    }
  }
}
