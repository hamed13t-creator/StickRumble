// js/puppet.js — how a fighter LOOKS and MOVES on screen (render-only).
//
// The fighter is drawn like the app icon: smooth, glowing neon outlines with hollow,
// rounded limbs that bend in curves (no joint dots, no straight sticks). Each display
// frame the puppet:
//   1. builds a target pose from the fighter's simulation state (idle, walk, attack
//      phase and progress, hitstun, knockdown, ...). Attacks are hand-keyed animations
//      with anticipation, a fast eased strike, a hold and a follow-through, timed to the
//      attack's real startup/active/recovery frames;
//   2. eases every joint toward that pose (springy smoothing), so changes of state blend
//      instead of popping;
//   3. solves the skeleton (feet that are planted stay glued to the floor by a small
//      2-bone IK, so crouches and lunges bend the knees naturally) and redraws the paths.
//
// Nothing here is read back by the simulation, so it can never affect determinism.

const D2R = Math.PI / 180;
// Angles are degrees measured from straight DOWN; positive turns toward the way the
// fighter faces. The SVG is drawn facing right and mirrored by Fighter for facing left.
const dir = a => [Math.sin(a * D2R), Math.cos(a * D2R)];

const GROUND = 96;            // foot sole y in the 60x100 viewBox
const PELVIS = { x: 30, y: 57 };
const L = { spine: 27, thigh: 20, shin: 20.5, upper: 15, fore: 14.5, foot: 6.5 };
const DARK = '#0d0b14';

// ---------- small math helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = {
  inOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  snap: t => 1 - Math.pow(1 - t, 4),            // fast strike that decelerates into impact
  back: t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  out: t => 1 - (1 - t) * (1 - t),
  lin: t => t
};

// Pose fields. Legs may be given as angles (hF/kF) or as a planted foot position
// (pF/pB = [x, y] relative to the pelvis column, y defaults to the floor).
const FIELDS = ['rx', 'ry', 'sp', 'hd', 'sF', 'eF', 'sB', 'eB', 'hF', 'kF', 'hB', 'kB', 'fF', 'fB'];

// 2-bone leg IK: hip -> foot target. Knee bends forward (toward facing).
function legIK(hx, hy, fx, fy) {
  let dx = fx - hx, dy = fy - hy;
  const max = (L.thigh + L.shin) * 0.999;
  let d = Math.hypot(dx, dy);
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  d = Math.max(d, 4);
  const base = Math.atan2(dx, dy) / D2R;
  const a = Math.acos(clamp((L.thigh * L.thigh + d * d - L.shin * L.shin) / (2 * L.thigh * d), -1, 1)) / D2R;
  const b = Math.acos(clamp((L.shin * L.shin + d * d - L.thigh * L.thigh) / (2 * L.shin * d), -1, 1)) / D2R;
  return { h: base + a, k: a + b };
}

// Turn a partial key pose into a complete set of angles (resolving planted feet).
function resolve(p) {
  const o = {};
  for (const k of FIELDS) o[k] = p[k] ?? 0;
  const hx = PELVIS.x + o.rx, hy = PELVIS.y + o.ry;
  if (p.pF) { const s = legIK(hx, hy, PELVIS.x + p.pF[0], p.pF[1] ?? GROUND); o.hF = s.h; o.kF = s.k; o.fF = p.fF ?? 90; }
  else if (p.fF === undefined) o.fF = o.hF - o.kF + 80;
  if (p.pB) { const s = legIK(hx, hy, PELVIS.x + p.pB[0], p.pB[1] ?? GROUND); o.hB = s.h; o.kB = s.k; o.fB = p.fB ?? 90; }
  else if (p.fB === undefined) o.fB = o.hB - o.kB + 80;
  return o;
}

function mix(a, b, t) { const o = {}; for (const k of FIELDS) o[k] = lerp(a[k], b[k], t); return o; }

// Sample a keyed animation at u in [0,1]. keys: [[u, pose|'base', easeName], ...]
function sampleKeys(keys, u, base) {
  const R = k => k === 'base' ? base : resolve(k);
  if (u <= keys[0][0]) return R(keys[0][1]);
  for (let i = 0; i < keys.length - 1; i++) {
    const [u0, p0] = keys[i], [u1, p1, e] = keys[i + 1];
    if (u <= u1) return mix(R(p0), R(p1), (ease[e] || ease.inOut)((u - u0) / ((u1 - u0) || 1)));
  }
  return R(keys[keys.length - 1][1]);
}

// ---------- The move set (facing right) ----------
// Every attack maps its real phases onto u: startup 0..0.3, active 0.3..0.5,
// recovery 0.5..1. So the strike lands visually on the exact frame it hits.
const S = 0.3, A = 0.5;
const ATTACKS = {
  // Lead jab: shoulder turns in, fist snaps out straight, rear hand guards the chin.
  punch: [
    [0, 'base'],
    [S * 0.75, { rx: -2, ry: 3, sp: 0, hd: -2, sF: 40, eF: 128, sB: 40, eB: 122, pF: [11], pB: [-12] }, 'inOut'],
    [S + 0.06, { rx: 4, ry: 2, sp: 14, hd: 2, sF: 93, eF: 2, sB: 30, eB: 138, pF: [14], pB: [-11] }, 'snap'],
    [A, { rx: 3, ry: 2, sp: 12, hd: 2, sF: 90, eF: 10, sB: 32, eB: 136, pF: [14], pB: [-11] }, 'lin'],
    [1, 'base', 'inOut']
  ],
  // Heavy rush: deep wind-up, then a lunging cross with a forward step and the rear arm
  // flung back for balance.
  rush: [
    [0, 'base'],
    [S * 0.8, { rx: -5, ry: 6, sp: -12, hd: -4, sF: 10, eF: 140, sB: 70, eB: 95, pF: [9], pB: [-14] }, 'inOut'],
    [S + 0.07, { rx: 13, ry: 5, sp: 26, hd: 4, sF: 96, eF: 0, sB: -25, eB: 35, pF: [27], pB: [-16] }, 'snap'],
    [A + 0.08, { rx: 12, ry: 5, sp: 23, hd: 4, sF: 92, eF: 6, sB: -18, eB: 40, pF: [27], pB: [-16] }, 'lin'],
    [1, 'base', 'inOut']
  ],
  // Side kick: knee chambers high, leg snaps out straight, body leans away, arms out
  // for balance, then the leg re-chambers before it comes down.
  kick: [
    [0, 'base'],
    [S * 0.85, { rx: -3, ry: 1, sp: -8, hd: 0, sF: 70, eF: 70, sB: -35, eB: 50, hF: 92, kF: 125, fF: 60, pB: [-5] }, 'inOut'],
    [S + 0.06, { rx: 2, ry: 2, sp: -24, hd: 8, sF: 60, eF: 60, sB: -50, eB: 40, hF: 102, kF: 3, fF: 175, pB: [-6] }, 'snap'],
    [A + 0.05, { rx: 2, ry: 2, sp: -22, hd: 8, sF: 62, eF: 62, sB: -48, eB: 42, hF: 99, kF: 8, fF: 172, pB: [-6] }, 'lin'],
    [0.78, { rx: 0, ry: 2, sp: -10, hd: 2, sF: 62, eF: 90, sB: 0, eB: 90, hF: 82, kF: 118, fF: 70, pB: [-7] }, 'inOut'],
    [1, 'base', 'inOut']
  ],
  // Low sweep: drop the hips, lean over, sweep the lead leg out along the floor.
  lowkick: [
    [0, 'base'],
    [S * 0.8, { rx: -3, ry: 12, sp: 16, hd: -6, sF: 60, eF: 100, sB: 50, eB: 110, hF: 35, kF: 85, fF: 80, pB: [-10] }, 'inOut'],
    [S + 0.06, { rx: 1, ry: 16, sp: 28, hd: -10, sF: 75, eF: 70, sB: 20, eB: 120, hF: 80, kF: 2, fF: 150, pB: [-12] }, 'snap'],
    [A + 0.05, { rx: 1, ry: 16, sp: 27, hd: -10, sF: 75, eF: 72, sB: 22, eB: 118, hF: 78, kF: 4, fF: 148, pB: [-12] }, 'lin'],
    [1, 'base', 'inOut']
  ],
  // Flying kick in the air: tuck, then the lead leg spears out with the rear leg folded.
  aerialKick: [
    [0, 'base'],
    [S * 0.8, { rx: 0, ry: 0, sp: -4, hd: 0, sF: 120, eF: 40, sB: -60, eB: 40, hF: 75, kF: 120, hB: 40, kB: 115 }, 'inOut'],
    [S + 0.05, { rx: 0, ry: 0, sp: -18, hd: 6, sF: 140, eF: 20, sB: -80, eB: 30, hF: 106, kF: 0, fF: 176, hB: 25, kB: 125 }, 'snap'],
    [0.72, { rx: 0, ry: 0, sp: -16, hd: 6, sF: 138, eF: 22, sB: -78, eB: 32, hF: 102, kF: 6, fF: 172, hB: 25, kB: 122 }, 'lin'],
    [1, 'base', 'inOut']
  ]
};
// Which end effector leaves a motion smear for each attack.
const SMEAR = { punch: 'handF', rush: 'handF', kick: 'footF', lowkick: 'footF', aerialKick: 'footF' };

// ---------- Static poses ----------
function stancePose(ch, t, seed) {
  const p = ch.pose, sp = p.swaySpeed || 1, amp = p.swayAmp || 1;
  const breathe = Math.sin((t + seed) * 2.2 * sp);
  const bounce = ch.key === 'boxer' || ch.key === 'kickboxer' ? Math.abs(Math.sin((t + seed) * 5.2)) * 2.2 : 0;
  return {
    rx: Math.sin((t + seed) * 0.9 * sp) * 1.2 * amp, ry: 3 + breathe * 0.8 * amp - bounce,
    sp: 7 + breathe * 1.5 * amp, hd: -4,
    sF: 55 + breathe * 3 * amp, eF: 108, sB: 36 - breathe * 2 * amp, eB: 116,
    pF: [12], pB: [-12]
  };
}

const STATIC = {
  block: { rx: -2, ry: 7, sp: -6, hd: 10, sF: 78, eF: 142, sB: 68, eB: 146, pF: [13], pB: [-14] },
  landing: { rx: 0, ry: 11, sp: 14, hd: 2, sF: 40, eF: 90, sB: 25, eB: 95, pF: [12], pB: [-12] },
  jumpUp: { rx: 0, ry: 0, sp: 8, hd: -6, sF: 135, eF: 40, sB: 30, eB: 100, hF: 60, kF: 95, hB: 12, kB: 85 },
  jumpDown: { rx: 0, ry: 0, sp: 4, hd: 0, sF: 95, eF: 50, sB: 70, eB: 60, hF: 30, kF: 35, hB: -5, kB: 40 },
  tuck: { rx: 0, ry: -4, sp: 25, hd: 15, sF: 70, eF: 120, sB: 60, eB: 125, hF: 120, kF: 150, hB: 105, kB: 150 },
  dash: { rx: 6, ry: 6, sp: 28, hd: -10, sF: 30, eF: 50, sB: -50, eB: 30, pF: [20], pB: [-22] },
  launched: { rx: 0, ry: 0, sp: -14, hd: -25, sF: 165, eF: 25, sB: 145, eB: 35, hF: 45, kF: 40, hB: -5, kB: 55 },
  down: { rx: 0, ry: 0, sp: -2, hd: -12, sF: 172, eF: 12, sB: 150, eB: 20, hF: 8, kF: 12, hB: -6, kB: 22 },
  rise: { rx: 2, ry: 16, sp: 26, hd: -4, sF: 30, eF: 60, sB: 20, eB: 70, pF: [14], pB: [-10] },
  ko: { rx: 0, ry: 0, sp: -4, hd: 28, sF: 160, eF: 40, sB: 120, eB: 60, hF: 14, kF: 30, hB: -4, kB: 45 },
  splat: { rx: 0, ry: 0, sp: -4, hd: -20, sF: 150, eF: 15, sB: -150, eB: -15, hF: 28, kF: 12, hB: -24, kB: 14 },
  hit: { rx: -5, ry: 4, sp: -24, hd: -30, sF: 25, eF: 50, sB: -35, eB: 40, pF: [14], pB: [-14] }
};

// ---------- Geometry + drawing ----------
// Solve joint positions for a full angle set.
function solve(a) {
  const P = [PELVIS.x + a.rx, PELVIS.y + a.ry];
  const up = [Math.sin(a.sp * D2R), -Math.cos(a.sp * D2R)];
  const C = [P[0] + up[0] * L.spine, P[1] + up[1] * L.spine];           // chest / shoulders
  const W = [lerp(P[0], C[0], 0.5) + up[1] * -0.6, lerp(P[1], C[1], 0.5)]; // waist
  const ha = a.sp + a.hd;
  const H = [C[0] + Math.sin(ha * D2R) * 11.5, C[1] - Math.cos(ha * D2R) * 11.5]; // head centre
  const limb = (root, a1, a2, l1, l2) => {
    const d1 = dir(a1), d2 = dir(a2);
    const j = [root[0] + d1[0] * l1, root[1] + d1[1] * l1];
    return [root, j, [j[0] + d2[0] * l2, j[1] + d2[1] * l2]];
  };
  const armF = limb(C, a.sp + a.sF, a.sp + a.sF + a.eF, L.upper, L.fore);
  const armB = limb([C[0] - up[1] * 0, C[1] + 1], a.sp + a.sB, a.sp + a.sB + a.eB, L.upper, L.fore);
  const legF = limb(P, a.hF, a.hF - a.kF, L.thigh, L.shin);
  const legB = limb([P[0] - 1, P[1]], a.hB, a.hB - a.kB, L.thigh, L.shin);
  const toe = (ankle, ang) => { const d = dir(ang); return [ankle[0] + d[0] * L.foot, ankle[1] + d[1] * L.foot]; };
  return { P, C, W, H, ha, armF, armB, legF, legB, toeF: toe(legF[2], a.fF), toeB: toe(legB[2], a.fB) };
}

const f1 = n => n.toFixed(1);
// A limb as ONE smooth curve passing through the joint (quadratic whose control point
// is placed so the curve goes through the elbow/knee): rounded, rubber-hose bends.
function limbPath([A, J, B]) {
  const cx = 2 * J[0] - (A[0] + B[0]) / 2, cy = 2 * J[1] - (A[1] + B[1]) / 2;
  return `M${f1(A[0])},${f1(A[1])}Q${f1(cx)},${f1(cy)} ${f1(B[0])},${f1(B[1])}`;
}
function footPath(ankle, toe) { return `M${f1(ankle[0])},${f1(ankle[1])}L${f1(toe[0])},${f1(toe[1])}`; }
// Tapered torso: wide shoulders to a narrower waist and hips, all rounded curves.
function torsoPath(g, pose) {
  const { P, C, W } = g;
  const ax = C[0] - P[0], ay = C[1] - P[1], len = Math.hypot(ax, ay) || 1;
  const nx = -ay / len, ny = ax / len; // perpendicular
  const tw = pose.torsoTopW * 0.55, ww = pose.waistW * 0.55, pw = pose.pelvisW * 0.55;
  const pt = (o, w) => `${f1(o[0] + nx * w)},${f1(o[1] + ny * w)}`;
  const top = [C[0] - ax / len * 1.5, C[1] - ay / len * 1.5];
  return `M${pt(top, tw)}Q${pt(W, ww * 1.15)} ${pt(P, pw)}Q${f1(P[0] - ax / len * 4)},${f1(P[1] - ay / len * 4)} ${pt(P, -pw)}` +
    `Q${pt(W, -ww * 1.15)} ${pt(top, -tw)}Q${f1(top[0] - ax / len * -3)},${f1(top[1] - ay / len * -3)} ${pt(top, tw)}Z`;
}

function accessory(ch, g) {
  const [hx, hy] = g.H, r = ch.pose.headR + 1, rot = g.ha;
  const t = `transform="rotate(${f1(rot)} ${f1(hx)} ${f1(hy)})"`;
  switch (ch.accessory) {
    case 'headband': return `<g ${t}><path d="M${f1(hx - r)},${f1(hy - 3)}L${f1(hx + r)},${f1(hy - 3)}" stroke="${ch.accent}" stroke-width="3" stroke-linecap="round"/><path d="M${f1(hx - r)},${f1(hy - 3)}q-6,1 -9,6M${f1(hx - r)},${f1(hy - 2)}q-5,4 -6,9" stroke="${ch.accent}" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>`;
    case 'topknot': return `<g ${t}><circle cx="${f1(hx)}" cy="${f1(hy - r - 2.5)}" r="3.2" fill="${DARK}" stroke="currentColor" stroke-width="1.8"/></g>`;
    case 'antenna': return `<g ${t}><path d="M${f1(hx)},${f1(hy - r)}l0,-6" stroke="currentColor" stroke-width="1.6"/><circle cx="${f1(hx)}" cy="${f1(hy - r - 7)}" r="2" fill="${ch.accent}"/></g>`;
    default: return '';
  }
}

function faceMarkup(ch, g) {
  const [hx, hy] = g.H, robot = ch.accessory === 'antenna';
  const t = `transform="rotate(${f1(g.ha)} ${f1(hx)} ${f1(hy)})"`;
  const eye = robot ? `<rect x="${f1(hx + 1)}" y="${f1(hy - 3)}" width="6" height="2.4" rx="1" fill="${ch.accent}"/>`
    : `<path d="M${f1(hx + 2)},${f1(hy - 2.2)}l3.4,-0.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="${f1(hx + 3.6)}" cy="${f1(hy - 0.4)}" r="1.15" fill="#fff"/>`;
  return `<g class="face" ${t}>${eye}
    <path class="mouthNeutral" d="M${f1(hx + 1.5)},${f1(hy + 3.6)}q2.5,0.8 4.6,-0.4" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <ellipse class="mouthOpen" cx="${f1(hx + 3.6)}" cy="${f1(hy + 3.8)}" rx="2.2" ry="1.9" fill="#fff" opacity="0"/></g>`;
}

// Limb thickness: hollow neon tube = thick colour stroke with a dark core.
function widths(ch) { const s = ch.pose.limbScale || 1; return { arm: 5.6 * s, leg: 6.4 * s, core: 0.42 }; }

function handMarkup(ch, end, cls) {
  const r = ch.accessory === 'gloves' ? 4.6 : 3.2;
  const fill = ch.accessory === 'gloves' ? '#d8322a' : DARK;
  const band = ch.accessory === 'wristbands' ? `<circle cx="${f1(end[0])}" cy="${f1(end[1])}" r="${f1(r + 1.6)}" fill="none" stroke="${ch.accent}" stroke-width="1.6" opacity=".9"/>` : '';
  return `<g class="${cls}">${band}<circle cx="${f1(end[0])}" cy="${f1(end[1])}" r="${r}" fill="${fill}" stroke="currentColor" stroke-width="1.8"/></g>`;
}

// Full SVG markup for one pose (used for the select screen and as the initial DOM).
function markup(ch, g) {
  const w = widths(ch), back = 'opacity=".62"';
  const tube = (cls, d, width, extra = '') =>
    `<path class="${cls}" d="${d}" fill="none" stroke="currentColor" stroke-width="${f1(width)}" stroke-linecap="round" ${extra}/>` +
    `<path class="${cls}C" d="${d}" fill="none" stroke="${DARK}" stroke-width="${f1(width * w.core)}" stroke-linecap="round" ${extra}/>`;
  const robe = ch.accessory === 'robe' ? ' robe' : '';
  return `<svg class="rig${robe}" viewBox="0 0 60 100" overflow="visible">
    <path class="smear" d="" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
    <g class="back" ${back}>
      ${tube('legB', limbPath(g.legB), w.leg)}${tube('footB', footPath(g.legB[2], g.toeB), w.leg * 0.85)}
      ${tube('armB', limbPath(g.armB), w.arm)}${handMarkup(ch, g.armB[2], 'handB')}
    </g>
    <path class="torso" d="${torsoPath(g, ch.pose)}" fill="${DARK}" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
    <path class="sash" d="" stroke="${ch.accent}" stroke-width="2.4" stroke-linecap="round" opacity="${ch.accessory === 'topknot' || ch.accessory === 'robe' ? 0.9 : 0}"/>
    ${tube('legF', limbPath(g.legF), w.leg)}${tube('footF', footPath(g.legF[2], g.toeF), w.leg * 0.85)}
    <g class="headG"><circle class="head" cx="${f1(g.H[0])}" cy="${f1(g.H[1])}" r="${ch.pose.headR + 1}" fill="${DARK}" stroke="currentColor" stroke-width="2.2"/>
    ${faceMarkup(ch, g)}${accessory(ch, g)}</g>
    ${tube('armF', limbPath(g.armF), w.arm)}${handMarkup(ch, g.armF[2], 'handF')}
  </svg>`;
}

// Character-select preview: the stance, drawn once.
export function puppetSVG(ch) {
  return markup(ch, solve(resolve(stancePose(ch, 0, 0))));
}

// ---------- Live puppet ----------
export class Puppet {
  constructor(fighter) {
    this.f = fighter;
    this.cur = null;      // current (smoothed) angles
    this.walkPh = 0;
    this.trail = [];      // recent smear points
    this.seed = (fighter.side === 'p1' ? 0.3 : 2.1);
    this.el = null;
  }

  markup() { return markup(this.f.ch, solve(resolve(stancePose(this.f.ch, 0, this.seed)))); }

  bind(svg) {
    const q = s => svg.querySelector(s);
    this.el = {
      svg, smear: q('.smear'), torso: q('.torso'), sash: q('.sash'),
      legB: q('.legB'), legBC: q('.legBC'), footB: q('.footB'), footBC: q('.footBC'),
      armB: q('.armB'), armBC: q('.armBC'), handB: q('.handB'),
      legF: q('.legF'), legFC: q('.legFC'), footF: q('.footF'), footFC: q('.footFC'),
      armF: q('.armF'), armFC: q('.armFC'), handF: q('.handF'), headG: q('.headG'), head: q('.head')
    };
    // Rest geometry the markup was drawn at: head and hands are moved relative to it.
    const g0 = solve(resolve(stancePose(this.f.ch, 0, this.seed)));
    this._rest = { H: g0.H, ha: g0.ha, hF: g0.armF[2], hB: g0.armB[2] };
    this.cur = null; this.trail = [];
  }

  reset() { this.cur = null; this.trail = []; this.walkPh = 0; }

  // Build this frame's target pose from simulation state.
  target(dt) {
    const f = this.f, ch = f.ch, t = f.timeSec;
    const base = resolve(stancePose(ch, t, this.seed));
    const st = f.state;
    let rate = 14; // joint easing speed (1/s)

    if (st === 'attack' && f.attackType && f.attackDurations && ATTACKS[f.attackType]) {
      const d = f.attackDurations, el = t - f.attackPhaseStart;
      let u;
      if (f.attackPhase === 'startup') u = S * clamp(el / d.startup, 0, 1);
      else if (f.attackPhase === 'active') u = S + (A - S) * clamp(el / d.active, 0, 1);
      else { const rd = d.recovery[f.attackOutcome] || d.recovery.whiff; u = A + (1 - A) * clamp(el / rd, 0, 1); }
      const airBase = f.attackType === 'aerialKick' ? resolve(STATIC.jumpDown) : base;
      return { pose: sampleKeys(ATTACKS[f.attackType], u, airBase), rate: 40, smear: SMEAR[f.attackType], u };
    }
    if (st === 'block' || st === 'aerialGuard') return { pose: resolve(STATIC.block), rate: 24 };
    if (st === 'hitstun') return { pose: resolve(STATIC.hit), rate: 30 };
    if (st === 'landing') return { pose: resolve(STATIC.landing), rate: 30 };
    if (st === 'flip') return { pose: resolve(STATIC.tuck), rate: 22 };
    if (st === 'ko') return { pose: resolve(f.grounded ? STATIC.ko : STATIC.launched), rate: 10 };
    if (st === 'wallsplat') return { pose: resolve(STATIC.splat), rate: 40 };
    if (st === 'knockdown') {
      const k = f.kdPhase;
      if (k === 'air') return { pose: resolve(STATIC.launched), rate: 16 };
      if (k === 'roll') return { pose: resolve(STATIC.tuck), rate: 30 };
      if (k === 'rise') return { pose: resolve(STATIC.rise), rate: 12 };
      return { pose: resolve(STATIC.down), rate: 18 };
    }
    if (f.dashFxUntilF > f.frame) return { pose: resolve(STATIC.dash), rate: 26 };
    if (!f.grounded || st === 'jump') {
      const up = f.vy > 120;
      return { pose: resolve(up ? STATIC.jumpUp : STATIC.jumpDown), rate: 10 };
    }
    if (st === 'walk') {
      // Stepping cycle driven by distance actually travelled, so feet don't skate.
      const fwd = f.vx * f.facing;
      this.walkPh += fwd * dt / 9;
      const s = Math.sin(this.walkPh), c = Math.cos(this.walkPh);
      const stride = 10;
      const p = {
        rx: 1.5 * Math.sign(fwd), ry: 3.5 - Math.abs(Math.sin(this.walkPh)) * 1.6, sp: 9 + Math.sign(fwd) * 3, hd: -4,
        sF: 55 + s * 7, eF: 106, sB: 36 - s * 7, eB: 116,
        pF: [10 + s * stride, GROUND - Math.max(0, c) * 5], pB: [-10 - s * stride, GROUND - Math.max(0, -c) * 5]
      };
      return { pose: resolve(p), rate: 22 };
    }
    return { pose: base, rate };
  }

  update(dt) {
    if (!this.el) return;
    const tg = this.target(dt);
    if (!this.cur) this.cur = { ...tg.pose };
    else {
      const k = 1 - Math.exp(-tg.rate * Math.min(dt, 0.05));
      for (const key of FIELDS) this.cur[key] += (tg.pose[key] - this.cur[key]) * k;
    }
    // Robot moves in small steps (mechanical), everyone else is fluid.
    const a = this.f.ch.accessory === 'antenna' ? quantize(this.cur) : this.cur;
    const g = solve(a);
    this.draw(g);
    this.updateSmear(g, tg);
  }

  draw(g) {
    const e = this.el, ch = this.f.ch;
    const setD = (n, d) => { if (n && n._d !== d) { n._d = d; n.setAttribute('d', d); } };
    const lF = limbPath(g.legF), lB = limbPath(g.legB), aF = limbPath(g.armF), aB = limbPath(g.armB);
    const fF = footPath(g.legF[2], g.toeF), fB = footPath(g.legB[2], g.toeB);
    setD(e.legF, lF); setD(e.legFC, lF); setD(e.legB, lB); setD(e.legBC, lB);
    setD(e.armF, aF); setD(e.armFC, aF); setD(e.armB, aB); setD(e.armBC, aB);
    setD(e.footF, fF); setD(e.footFC, fF); setD(e.footB, fB); setD(e.footBC, fB);
    setD(e.torso, torsoPath(g, ch.pose));
    if (ch.accessory === 'topknot' || ch.accessory === 'robe') {
      const { P, C } = g; // belt / sash across the hips
      const ax = C[0] - P[0], ay = C[1] - P[1], len = Math.hypot(ax, ay) || 1, nx = -ay / len, ny = ax / len;
      const w = ch.pose.pelvisW * 0.55, bx = P[0] + ax / len * 4, by = P[1] + ay / len * 4;
      setD(e.sash, `M${f1(bx + nx * w)},${f1(by + ny * w)}L${f1(bx - nx * w)},${f1(by - ny * w)}`);
    }
    // Head group and hands are moved as a whole (cheaper than rebuilding the face).
    const R = this._rest;
    const ht = `translate(${f1(g.H[0] - R.H[0])} ${f1(g.H[1] - R.H[1])}) rotate(${f1(g.ha - R.ha)} ${f1(R.H[0])} ${f1(R.H[1])})`;
    if (e.headG._t !== ht) { e.headG._t = ht; e.headG.setAttribute('transform', ht); }
    const mv = (n, rest, p) => { const tr = `translate(${f1(p[0] - rest[0])} ${f1(p[1] - rest[1])})`; if (n._t !== tr) { n._t = tr; n.setAttribute('transform', tr); } };
    mv(e.handF, this._rest.hF, g.armF[2]);
    mv(e.handB, this._rest.hB, g.armB[2]);
  }

  // Motion smear: a fading arc behind the striking fist/foot during the strike.
  updateSmear(g, tg) {
    const e = this.el.smear;
    if (tg.smear && tg.u > S * 0.7 && tg.u < A + 0.08) {
      const p = tg.smear === 'handF' ? g.armF[2] : g.toeF;
      this.trail.push(p);
      if (this.trail.length > 7) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();
    if (this.trail.length < 2) { if (e._on) { e._on = false; e.setAttribute('opacity', '0'); } return; }
    let d = `M${f1(this.trail[0][0])},${f1(this.trail[0][1])}`;
    for (let i = 1; i < this.trail.length; i++) d += `L${f1(this.trail[i][0])},${f1(this.trail[i][1])}`;
    e.setAttribute('d', d);
    e.setAttribute('stroke-width', f1(3 + this.trail.length * 0.9));
    e.setAttribute('opacity', f1(0.12 + this.trail.length * 0.05));
    e._on = true;
  }
}

function quantize(c) { const o = {}; for (const k of FIELDS) o[k] = k === 'rx' || k === 'ry' ? c[k] : Math.round(c[k] / 4) * 4; return o; }
