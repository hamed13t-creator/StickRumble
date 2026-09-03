// js/fighter.js — physics-driven stick-man fighter: gravity, momentum, ground friction,
// a real 2-bone IK solve for the punch arm, keyframe-driven kicks/flips, and a
// startup/active/recovery attack state machine with combo buffering.
//
// v2: anatomically richer SVG rig (pelvis, neck, tapered/joint-shaded limbs, foot/fist
// shapes) plus a procedural animation layer — idle weight-shift, per-character stance,
// back-arm counter-rotation and support-leg weight transfer during strikes, tiered
// hit-reaction recoil, and landing squash. All new motion is written to elements/
// properties style.css never touches, so it layers on top of the existing CSS
// keyframes (block/jump/kick/lowkick/punch/rush poses) instead of fighting them.
// Physics, attack timing, state machine, combo logic, and events are unchanged.
import { GROUND_Y, ARENA_MIN_X, ARENA_MAX_X } from './world.js';

// ---------------- Roster ----------------
// Per-character animation/proportion data. Shoulder/elbow/hip/knee stay fixed (style.css
// hardcodes those as CSS transform-origins), but hand/foot endpoints, head size, torso
// width, limb thickness, and idle-sway character are free to vary per fighter.
const POSE = {
  boxer:      { footF:{x:44,y:94}, footB:{x:16,y:97}, backHand:{x:23,y:19}, headR:9,   torsoTopW:15,   waistW:9,   pelvisW:13,   limbScale:1.05, swayAmp:1,   swaySpeed:1.1,  weight:1,    jointStyle:'round' },
  ninja:      { footF:{x:40,y:95}, footB:{x:20,y:96}, backHand:{x:26,y:22}, headR:8,   torsoTopW:12.5, waistW:7.5, pelvisW:10.5, limbScale:0.85, swayAmp:0.8, swaySpeed:1.4,  weight:0.8,  jointStyle:'round' },
  sumo:       { footF:{x:48,y:92}, footB:{x:12,y:93}, backHand:{x:19,y:26}, headR:10,  torsoTopW:20,   waistW:15,  pelvisW:19,   limbScale:1.5,  swayAmp:0.6, swaySpeed:0.7,  weight:1.6,  jointStyle:'round' },
  kickboxer:  { footF:{x:43,y:95}, footB:{x:17,y:96}, backHand:{x:24,y:21}, headR:9,   torsoTopW:15.5, waistW:9,   pelvisW:13.5, limbScale:1.05, swayAmp:1,   swaySpeed:1,    weight:1.05, jointStyle:'round' },
  robot:      { footF:{x:42,y:96}, footB:{x:18,y:96}, backHand:{x:22,y:23}, headR:8.5, torsoTopW:16,   waistW:11,  pelvisW:14,   limbScale:1.1,  swayAmp:0.5, swaySpeed:0.6,  weight:1.2,  jointStyle:'mech'  },
  monk:       { footF:{x:41,y:95}, footB:{x:19,y:96}, backHand:{x:27,y:26}, headR:8.5, torsoTopW:14,   waistW:9.5, pelvisW:12.5, limbScale:0.95, swayAmp:0.9, swaySpeed:0.85, weight:0.95, jointStyle:'round' }
};

export const CHARACTERS = [
  { key:'boxer',    name:'Boxer',     color:'#3f7bff', accent:'#ffcf4d', skin:'#ffd9b3', accessory:'gloves',    stats:{}, pose: POSE.boxer },
  { key:'ninja',    name:'Ninja',     color:'#2b2b33', accent:'#ff3b3b', skin:'#e8c39e', accessory:'headband',  stats:{ speed:1.25, health:0.85, dashMult:1.3 }, pose: POSE.ninja },
  { key:'sumo',     name:'Sumo',      color:'#c97b3d', accent:'#fff2d6', skin:'#e8b98a', accessory:'topknot',   stats:{ speed:0.75, health:1.35, knockback:1.5 }, pose: POSE.sumo },
  { key:'kickboxer',name:'Kickboxer', color:'#e0602b', accent:'#2b2b33', skin:'#d9a066', accessory:'wristbands',stats:{ kickDmg:1.3, punchDmg:0.85 }, pose: POSE.kickboxer },
  { key:'robot',    name:'Robot',     color:'#8f9bab', accent:'#2ee6ff', skin:'#c7ced6', accessory:'antenna',   stats:{ dmgAll:1.2, cooldownMult:1.2 }, pose: POSE.robot },
  { key:'monk',     name:'Monk',      color:'#f0a500', accent:'#7a3a1a', skin:'#e8b98a', accessory:'robe',      stats:{ punchCooldownMult:0.7, kickDmg:0.85 }, pose: POSE.monk }
];
export const charByKey = k => CHARACTERS.find(c => c.key === k) || CHARACTERS[0];

function shade(hex, amt) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

// ---------------- Visual-only accessories (head/torso). Hand accessories (gloves,
// wristbands) are drawn per-arm in rigSVG so they track each character's hand position. --
function accessorySVG(ch) {
  switch (ch.accessory) {
    case 'headband': return `<rect x="19" y="9" width="22" height="4" fill="${ch.accent}"/><path d="M41,10 Q50,7 54,15 Q49,12 44,14 Z" fill="${ch.accent}"/>`;
    case 'topknot': return `<circle cx="30" cy="4" r="3.5" fill="${ch.color}"/><rect x="18" y="52" width="24" height="5" rx="1" fill="${ch.accent}"/>`;
    case 'antenna': return `<line x1="30" y1="6" x2="30" y2="0" stroke="${ch.accent}" stroke-width="2"/><circle cx="30" cy="0" r="2.2" fill="${ch.accent}"/>`;
    case 'robe': return `<path d="M18,50 Q11,58 15,68 Q18,60 21,58 Z" fill="${ch.accent}" opacity=".75"/><path d="M42,50 Q49,58 45,68 Q42,60 39,58 Z" fill="${ch.accent}" opacity=".7"/>`;
    default: return '';
  }
}

function faceSVG(ch) {
  const isRobot = ch.accessory === 'antenna';
  const eyeFill = isRobot ? ch.accent : '#1a1420';
  return `<g class="face">
    <path d="M23.5,11.5 Q26,9.8 28.4,11.2" stroke="#2a1810" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".85"/>
    <path d="M31.6,11.2 Q34,9.8 36.5,11.5" stroke="#2a1810" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".85"/>
    <ellipse cx="26" cy="15" rx="1.7" ry="${isRobot ? 2.2 : 1.9}" fill="${eyeFill}"/>
    <ellipse cx="34" cy="15" rx="1.7" ry="${isRobot ? 2.2 : 1.9}" fill="${eyeFill}"/>
    <path class="mouthNeutral" d="M25.5,20 Q30,21.7 34.5,20" stroke="#3a2418" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <ellipse class="mouthOpen" cx="30" cy="20.5" rx="3" ry="2.4" fill="#5c2418" opacity="0"/>
  </g>`;
}

// ---- Rig-building helpers: joint shading, a pelvis-anchored torso silhouette, and
// foot/fist caps drawn as static children of each limb group (so they inherit whatever
// rotation CSS or JS applies to that group, for free). ----
function jointCap(cx, cy, r, color, style) {
  if (style === 'mech') {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 6 + i * Math.PI / 3;
      return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
    }).join(' ');
    return `<polygon points="${pts}" fill="${color}" stroke="${shade(color, -50)}" stroke-width="0.7"/><circle cx="${cx}" cy="${cy}" r="${(r * 0.32).toFixed(1)}" fill="${shade(color, 70)}" opacity=".85"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="${color}"/><ellipse cx="${(cx - r * 0.3).toFixed(1)}" cy="${(cy - r * 0.32).toFixed(1)}" rx="${(r * 0.4).toFixed(1)}" ry="${(r * 0.3).toFixed(1)}" fill="#fff" opacity=".32"/>`;
}

function footShape(fx, fy, angleDeg, color) {
  const pts = `${(fx - 3).toFixed(1)},${(fy - 1.4).toFixed(1)} ${(fx + 7).toFixed(1)},${(fy - 0.8).toFixed(1)} ${(fx + 8).toFixed(1)},${(fy + 2.6).toFixed(1)} ${(fx - 2.8).toFixed(1)},${(fy + 3.1).toFixed(1)}`;
  return `<polygon points="${pts}" fill="${shade(color, -28)}" transform="rotate(${angleDeg.toFixed(1)} ${fx} ${fy})"/>`;
}

function handDecor(ch, hx, hy, angleDeg, skin) {
  if (ch.accessory === 'gloves') {
    return `<circle cx="${hx}" cy="${hy}" r="6" fill="#c0392b"/><circle cx="${(hx - 1.3).toFixed(1)}" cy="${(hy - 1.5).toFixed(1)}" r="1.9" fill="#e0605a" opacity=".7"/>`;
  }
  if (ch.accessory === 'wristbands') {
    return `<ellipse cx="${hx}" cy="${hy}" rx="4" ry="3" fill="${skin}" transform="rotate(${angleDeg.toFixed(1)} ${hx} ${hy})"/><rect x="${(hx - 3.4).toFixed(1)}" y="${(hy - 2.2).toFixed(1)}" width="6.8" height="3.6" rx="1.4" fill="${ch.accent}" transform="rotate(${angleDeg.toFixed(1)} ${hx} ${hy})"/>`;
  }
  return `<ellipse cx="${hx}" cy="${hy}" rx="4" ry="3" fill="${skin}" transform="rotate(${angleDeg.toFixed(1)} ${hx} ${hy})"/>`;
}

function torsoPath(topW, waistW, pelvisW) {
  const cx = 30, topY = 26, waistY = 48, hipY = 58, pelvisY = 64;
  const tL = cx - topW / 2, tR = cx + topW / 2;
  const wL = cx - waistW / 2, wR = cx + waistW / 2;
  const hL = cx - pelvisW / 2, hR = cx + pelvisW / 2;
  const pL = hL + 2.5, pR = hR - 2.5;
  return `M${tL},${topY} Q${(tL - 1.5).toFixed(1)},${((topY + waistY) / 2).toFixed(1)} ${wL},${waistY} ` +
    `L${hL},${hipY} L${pL},${pelvisY} L${pR},${pelvisY} L${hR},${hipY} ` +
    `Q${(tR + 1.5).toFixed(1)},${((topY + waistY) / 2).toFixed(1)} ${tR},${topY} Z`;
}

// rigSVG produces the fighter's static "ready stance" — used both as the character-select
// preview and as the Fighter's base pose that CSS/JS animate on top of. Shoulder (30,27),
// front elbow (37,42), back elbow (23,42), hip (30,58), front knee (37,75), and back knee
// (24,75) are the exact CSS transform-origin coordinates and are never moved; everything
// past those joints (hands, feet) and the torso/head are free to vary per character.
export function rigSVG(ch) {
  const pose = ch.pose;
  const back = shade(ch.color, -30), main = ch.color, hi = shade(ch.color, 55);
  const jt = pose.jointStyle, ls = pose.limbScale;
  const { footF, footB, backHand, headR, torsoTopW, waistW, pelvisW } = pose;
  const frontHand = { x: 41, y: 29 };

  const feAngle = Math.atan2(frontHand.y - 42, frontHand.x - 37) * 180 / Math.PI;
  const beAngle = Math.atan2(backHand.y - 42, backHand.x - 23) * 180 / Math.PI;
  const ffAngle = Math.atan2(footF.y - 75, footF.x - 37) * 180 / Math.PI;
  const fbAngle = Math.atan2(footB.y - 75, footB.x - 24) * 180 / Math.PI;

  return `<svg class="rig" viewBox="0 0 60 100">
    <g class="legBackUpper">
      <path d="M30,58 L24,75" stroke="${back}" stroke-width="${(7.5 * ls).toFixed(1)}" stroke-linecap="round"/>
      ${jointCap(30, 58, 4.4 * ls, back, jt)}
      <g class="legBackLower">
        <path d="M24,75 L${footB.x},${footB.y}" stroke="${back}" stroke-width="${(7 * ls).toFixed(1)}" stroke-linecap="round"/>
        ${jointCap(24, 75, 3.8 * ls, back, jt)}
        ${footShape(footB.x, footB.y, fbAngle, back)}
      </g>
    </g>
    <g class="legFrontUpper">
      <path d="M30,58 L37,75" stroke="${main}" stroke-width="${(7.8 * ls).toFixed(1)}" stroke-linecap="round"/>
      <g class="legFrontLower">
        <path d="M37,75 L${footF.x},${footF.y}" stroke="${main}" stroke-width="${(7.2 * ls).toFixed(1)}" stroke-linecap="round"/>
        ${jointCap(37, 75, 4 * ls, main, jt)}
        ${footShape(footF.x, footF.y, ffAngle, main)}
      </g>
    </g>
    <g class="torsoG">
      <path d="${torsoPath(torsoTopW, waistW, pelvisW)}" fill="${main}"/>
      <path d="M${(30 - torsoTopW * 0.26).toFixed(1)},31 Q30,28.4 ${(30 + torsoTopW * 0.26).toFixed(1)},31" stroke="${hi}" stroke-width="1.1" fill="none" opacity=".32"/>
      <line x1="30" y1="33" x2="30" y2="53" stroke="${back}" stroke-width="1" opacity=".3"/>
    </g>
    <rect x="26.5" y="21" width="7" height="7" rx="2" fill="${shade(main, -12)}"/>
    <g class="armBackUpper">
      <path d="M30,27 L23,42" stroke="${back}" stroke-width="${(6.5 * ls).toFixed(1)}" stroke-linecap="round"/>
      ${jointCap(30, 27, 3.9 * ls, back, jt)}
      <g class="armBackLower">
        <path d="M23,42 L${backHand.x},${backHand.y}" stroke="${back}" stroke-width="${(6 * ls).toFixed(1)}" stroke-linecap="round"/>
        ${jointCap(23, 42, 3.3 * ls, back, jt)}
        ${handDecor(ch, backHand.x, backHand.y, beAngle, ch.skin)}
      </g>
    </g>
    <circle class="head" cx="30" cy="15" r="${headR}" fill="${ch.skin}"/>
    ${faceSVG(ch)}
    ${accessorySVG(ch)}
    <g class="armFrontUpper">
      <path d="M30,27 L37,42" stroke="${main}" stroke-width="${(6.8 * ls).toFixed(1)}" stroke-linecap="round"/>
      ${jointCap(30, 27, 4.2 * ls, main, jt)}
      <g class="armFrontLower">
        <path d="M37,42 L${frontHand.x},${frontHand.y}" stroke="${main}" stroke-width="${(6.2 * ls).toFixed(1)}" stroke-linecap="round"/>
        ${jointCap(37, 42, 3.6 * ls, main, jt)}
        ${handDecor(ch, frontHand.x, frontHand.y, feAngle, ch.skin)}
      </g>
    </g>
  </svg>`;
}

// ---------------- Compact 2-bone IK (punch arm) ----------------
class TwoBoneIK {
  constructor(len1, len2, maxStretch = 1.15) { this.len1 = len1; this.len2 = len2; this.maxStretch = maxStretch; }
  solve(root, target, poleSign) {
    let dx = target.x - root.x, dy = target.y - root.y;
    let dist = Math.hypot(dx, dy);
    const maxReach = (this.len1 + this.len2) * this.maxStretch;
    let stretch = 1;
    if (dist > maxReach) { stretch = dist / (this.len1 + this.len2); dist = maxReach; const a = Math.atan2(dy, dx); dx = Math.cos(a) * dist; dy = Math.sin(a) * dist; }
    dist = Math.max(dist, Math.abs(this.len1 - this.len2) + 0.01);
    const a = this.len1, b = this.len2, c = dist;
    let cosA = Math.min(1, Math.max(-1, (a * a + c * c - b * b) / (2 * a * c)));
    const bend = Math.max(Math.acos(cosA), 0.08);
    const base = Math.atan2(dy, dx);
    const upperAngle = base + poleSign * bend;
    const joint = { x: root.x + Math.cos(upperAngle) * a, y: root.y + Math.sin(upperAngle) * a };
    const lowerAngle = Math.atan2(target.y - joint.y, target.x - joint.x);
    return { upperAngle, lowerAngle, stretch };
  }
}
const ARM_ROOT = { x: 30, y: 27 };
const ARM_LEN1 = Math.hypot(7, 15), ARM_LEN2 = Math.hypot(4, -13);
const ARM_REST_U = Math.atan2(15, 7), ARM_REST_L = Math.atan2(-13, 4);
const armIK = new TwoBoneIK(ARM_LEN1, ARM_LEN2, 1.2);
function easeOutBack(x) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
function easeOutExpo(x) { return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); }
function easeInOutQuad(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
const PUNCH_KEYS = [{ t: 0, x: 41, y: 29 }, { t: 0.18, x: 32, y: 22 }, { t: 0.45, x: 68, y: 18 }, { t: 0.62, x: 50, y: 24 }, { t: 1, x: 41, y: 29 }];
function sampleHand(keys, t) {
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t <= b.t) {
      const local = (t - a.t) / ((b.t - a.t) || 1);
      const eased = i === 0 ? easeInOutQuad(local) : i === 1 ? easeOutExpo(local) : i === 2 ? easeOutBack(local) : easeInOutQuad(local);
      return { x: a.x + (b.x - a.x) * eased, y: a.y + (b.y - a.y) * eased };
    }
  }
  return keys[keys.length - 1];
}

// ---------------- Timing / balance tables ----------------
const ATTACK = {
  punch: { startup: 0.09, active: 0.07, recovery: { hit: 0.11, block: 0.19, whiff: 0.26 }, dmg: 7, range: 100, kb: 90 },
  kick:  { startup: 0.14, active: 0.08, recovery: { hit: 0.18, block: 0.32, whiff: 0.46 }, dmg: 13, range: 120, kb: 170 },
  lowkick: { startup: 0.10, active: 0.07, recovery: { hit: 0.15, block: 0.26, whiff: 0.34 }, dmg: 10, range: 108, kb: 130 },
  rush:  { startup: 0.06, active: 0.10, recovery: { hit: 0.16, block: 0.26, whiff: 0.32 }, dmg: 20, range: 130, kb: 220 },
  aerialKick: { startup: 0.08, active: 0.10, recovery: { hit: 0.14, block: 0.24, whiff: 0.30 }, dmg: 18, range: 130, kb: 200 }
};
const GRAVITY = 2500, JUMP_V = 760, MOVE_ACCEL = 2400, MAX_SPEED = 250, AIR_CONTROL = 0.55;
const GROUND_DECEL = 1900, DASH_SPEED = 880, DASH_TIME = 0.16, DASH_COOLDOWN = 0.55, DASH_IFRAME = 0.14;
const FLIP_TIME = 0.46, BACKFLIP_TIME = 0.36, LANDING_RECOVERY = 0.09;
const COMBO_WINDOW = 1.1;

export class Fighter {
  constructor(charKey, side, isPlayer) {
    this.ch = charByKey(charKey);
    this.side = side; // 'p1' | 'p2'
    this.isPlayer = isPlayer;
    this.x = side === 'p1' ? 500 : 1300;
    this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = side === 'p1' ? 1 : -1;
    this.grounded = true;
    this.state = 'idle';
    this.attackType = null; this.attackPhase = null; this.attackPhaseStart = 0;
    this.attackDurations = null; this.attackOutcome = null; this.bufferedAttack = null;
    this.comboBuffer = []; this.comboCount = 0; this.lastHitTime = -99; this.hits = 0;
    this.health = 100 * (this.ch.stats.health || 1);
    this.maxHealth = this.health;
    this.dashCooldownUntil = 0; this.invincibleUntil = 0; this.dashDir = 0;
    this.flipUntil = 0; this.flipType = null; this.landingUntil = 0;
    this.hitstunUntil = 0; this.knockdownUntil = 0;
    this.walkPhase = 0;
    this.ikPunch = null;
    this.hitReaction = null; // { tier, start } — decaying recoil impulse from being hit/blocking
    this._idleSeed = Math.random() * 1000;
    this._nextShiftAt = 2 + Math.random() * 3;
    this._shiftPulseStart = undefined;
    this.events = [];
    this.el = null; this.rig = {};
    this.timeSec = 0;
  }

  mount(container) {
    this.el = document.createElement('div');
    this.el.className = `fighter ${this.side}`;
    this.el.innerHTML = `
      <div class="comboPopup"></div>
      <div class="leanWrap"><div class="rigWrap"><div class="flipSpin">${rigSVG(this.ch)}</div></div></div>
      <div class="platform"></div>`;
    container.appendChild(this.el);
    const q = sel => this.el.querySelector(sel);
    this.rig = {
      combo: q('.comboPopup'), lean: q('.leanWrap'), rigWrap: q('.rigWrap'), flipSpin: q('.flipSpin'),
      svg: q('.rig'), torso: q('.torsoG'),
      armFU: q('.armFrontUpper'), armFL: q('.armFrontLower'),
      armBU: q('.armBackUpper'), armBL: q('.armBackLower'),
      legFU: q('.legFrontUpper'), legFL: q('.legFrontLower'),
      legBU: q('.legBackUpper'), legBL: q('.legBackLower'),
      mouthOpen: q('.mouthOpen'), mouthNeutral: q('.mouthNeutral')
    };
  }

  reset(x) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
    this.health = this.maxHealth; this.state = 'idle'; this.grounded = true;
    this.attackType = null; this.attackPhase = null; this.comboCount = 0; this.comboBuffer = []; this.hits = 0;
    this.hitstunUntil = 0; this.knockdownUntil = 0; this.invincibleUntil = 0; this.dashCooldownUntil = 0;
    this._dashUntil = 0; this.flipUntil = 0; this._flipStart = 0; this.landingUntil = 0; this.walkPhase = 0;
    this.ikPunch = null; this.hitReaction = null; this.events = [];
    this._nextShiftAt = this.timeSec + 2 + Math.random() * 3;
    this._shiftPulseStart = undefined;
    if (this.rig.flipSpin) this.rig.flipSpin.style.animation = 'none';
    ['armFU', 'armFL', 'armBU', 'armBL', 'legFU', 'legFL', 'legBU', 'legBL', 'rigWrap'].forEach(k => {
      if (this.rig[k]) this.rig[k].style.transform = '';
    });
    this.el.classList.remove('hitflash', 'dashing', 'flipping', 'blocking', 'attack-punch', 'attack-kick',
      'attack-heavy', 'attack-lowkick', 'aerial', 'jump', 'ko');
  }

  pushEvent(ev) { this.events.push(ev); }

  // ---------------- Attacks ----------------
  canAct() {
    return this.state === 'idle' || this.state === 'walk' || (this.state === 'jump' && this.grounded === false);
  }

  startAttack(type, buffered) {
    const isAerial = !this.grounded;
    const isLow = type === 'kick' && this.grounded && this.state === 'block';
    const t = isAerial && type === 'kick' ? 'aerialKick' : isLow ? 'lowkick' : type;
    const timing = ATTACK[t];
    this.state = 'attack';
    this.attackType = t;
    this.attackPhase = 'startup';
    this.attackPhaseStart = this.timeSec;
    const cdMult = (this.ch.stats.cooldownMult || 1) * (t === 'punch' ? (this.ch.stats.punchCooldownMult || 1) : 1);
    this.attackDurations = {
      startup: timing.startup * (buffered ? 0.7 : 1),
      active: timing.active,
      recovery: { hit: timing.recovery.hit * cdMult, block: timing.recovery.block * cdMult, whiff: timing.recovery.whiff * cdMult }
    };
    this.attackOutcome = null;
    this.bufferedAttack = null;

    const cls = t === 'rush' ? 'attack-heavy' : t === 'aerialKick' ? 'attack-kick aerial' : t === 'lowkick' ? 'attack-lowkick' : `attack-${t}`;
    const allAtkClasses = ['attack-punch', 'attack-kick', 'attack-heavy', 'attack-lowkick', 'aerial'];
    this.el.classList.remove(...allAtkClasses);
    void this.el.offsetWidth;
    cls.split(' ').forEach(c => this.el.classList.add(c));
    clearTimeout(this._atkTimer);
    const animMs = (timing.startup + timing.active) * 1000 + 40;
    this._atkTimer = setTimeout(() => this.el.classList.remove(...allAtkClasses), animMs);

    if (t === 'punch' || t === 'rush') this.ikPunch = { start: this.timeSec, dur: (timing.startup + timing.active) * 1.6 };
  }

  resolveAttack(opp) {
    const t = this.attackType;
    const timing = ATTACK[t];
    const dist = Math.abs(this.x - opp.x);
    const facingOK = (this.x < opp.x && this.facing === 1) || (this.x > opp.x && this.facing === -1);
    if (dist > timing.range || !facingOK) { this.attackOutcome = 'whiff'; this.pushEvent({ type: 'whoosh' }); return; }
    if (this.timeSec < opp.invincibleUntil) { this.attackOutcome = 'whiff'; return; }

    this.comboCount = (this.timeSec - this.lastHitTime < COMBO_WINDOW) ? this.comboCount + 1 : 1;
    this.lastHitTime = this.timeSec;

    let dmg = timing.dmg * (this.ch.stats.dmgAll || 1);
    if (t === 'punch') dmg *= (this.ch.stats.punchDmg || 1);
    if (t === 'kick' || t === 'aerialKick') dmg *= (this.ch.stats.kickDmg || 1);
    dmg += Math.min(this.comboCount - 1, 5) * 1.6;

    if (opp.state === 'block' && t !== 'rush') {
      this.attackOutcome = 'block';
      dmg *= 0.22;
      opp.pushEvent({ type: 'block', x: opp.x, y: GROUND_Y - opp.y - 40 });
      opp.hitReaction = { tier: 'block', start: this.timeSec };
      const kb = timing.kb * 0.4;
      opp.vx += (opp.x >= this.x ? 1 : -1) * kb;
      this.vx -= (opp.x >= this.x ? 1 : -1) * kb * 0.5;
    } else {
      // Rush partially pierces guard (reduced damage, still counts as a hit) instead
      // of being fully blockable or fully unblockable.
      if (t === 'rush' && opp.state === 'block') { dmg *= 0.4; opp.pushEvent({ type: 'block', x: opp.x, y: GROUND_Y - opp.y - 40 }); }
      this.attackOutcome = 'hit';
      const kb = timing.kb * (opp.ch.stats.knockback ? 1 / opp.ch.stats.knockback : 1);
      opp.vx += (opp.x >= this.x ? 1 : -1) * kb;
      opp.vy += t === 'kick' || t === 'aerialKick' ? 140 : 60;
      opp.hitstunUntil = this.timeSec + (t === 'rush' ? 0.42 : t === 'punch' ? 0.22 : 0.34);
      opp.state = 'hitstun';
      opp.hitReaction = { tier: t, start: this.timeSec };
      opp.el.classList.add('hitflash');
      setTimeout(() => opp.el.classList.remove('hitflash'), 220);
      opp.health = Math.max(0, opp.health - dmg);
      this.hits++;
      this.pushEvent({
        type: 'hit', tier: t, combo: this.comboCount,
        x: opp.x, y: GROUND_Y - opp.y - 45, dirX: (opp.x >= this.x ? 1 : -1), color: this.ch.color
      });
    }
  }

  updateAttackState(opp) {
    if (this.state !== 'attack') return;
    const el = this.attackPhaseStart;
    if (this.attackPhase === 'startup') {
      if (this.timeSec - el >= this.attackDurations.startup) {
        this.attackPhase = 'active';
        this.attackPhaseStart = this.timeSec;
        this.resolveAttack(opp);
      }
      return;
    }
    if (this.attackPhase === 'active') {
      if (this.timeSec - el >= this.attackDurations.active) {
        this.attackPhase = 'recovery';
        this.attackPhaseStart = this.timeSec;
      }
      return;
    }
    if (this.attackPhase === 'recovery') {
      const dur = this.attackDurations.recovery[this.attackOutcome] || this.attackDurations.recovery.whiff;
      if (this.timeSec - el >= dur) {
        if (this.bufferedAttack) {
          const next = this.bufferedAttack;
          this.startAttack(next, true);
        } else {
          this.state = this.grounded ? 'idle' : 'jump';
          this.attackType = null; this.attackPhase = null;
        }
      }
    }
  }

  // ---------------- Dash / Flip ----------------
  startDash(dir) {
    if (this.timeSec < this.dashCooldownUntil || this.state === 'attack' || this.state === 'hitstun') return;
    this.dashDir = dir; this.facing = dir >= 0 ? this.facing : this.facing; // facing unaffected by dash direction
    this.dashCooldownUntil = this.timeSec + DASH_COOLDOWN;
    this.invincibleUntil = this.timeSec + DASH_IFRAME;
    this._dashUntil = this.timeSec + DASH_TIME;
    this.el.classList.add('dashing');
    setTimeout(() => this.el && this.el.classList.remove('dashing'), DASH_TIME * 1000 + 60);
    this.pushEvent({ type: 'dash', x: this.x, y: GROUND_Y - this.y - 30 });
  }

  startFlip(kind) {
    if (this.state === 'attack' || this.state === 'hitstun') return;
    this.state = 'flip';
    this.flipType = kind; // 'front' | 'back'
    this.flipUntil = this.timeSec + (kind === 'front' ? FLIP_TIME : BACKFLIP_TIME);
    this._flipStart = this.timeSec;
    this.invincibleUntil = this.timeSec + (kind === 'front' ? FLIP_TIME * 0.7 : BACKFLIP_TIME * 0.8);
    this.vy = Math.max(this.vy, kind === 'front' ? 520 : 420);
    this.el.classList.add('flipping');
    this.rig.flipSpin.style.animation = 'none';
    void this.rig.flipSpin.offsetWidth;
    this.rig.flipSpin.style.animation = `${kind === 'front' ? 'flipFwd' : 'flipBack'} ${(kind === 'front' ? FLIP_TIME : BACKFLIP_TIME).toFixed(2)}s linear`;
    this.pushEvent({ type: 'flip', x: this.x, y: GROUND_Y - this.y - 30 });
  }

  // ---------------- Per-frame update ----------------
  update(dt, inp, opp, dashRequest) {
    this.timeSec += dt;
    this.events = [];
    const now = this.timeSec;

    // Facing always toward opponent unless mid-attack/flip (keeps strikes readable).
    if (this.state !== 'attack' && this.state !== 'flip') this.facing = this.x <= opp.x ? 1 : -1;

    // ---- Knockdown / hitstun timers ----
    if (this.state === 'hitstun' && now >= this.hitstunUntil) {
      this.state = this.grounded ? 'idle' : 'jump';
    }

    // ---- Dash trigger ----
    if (dashRequest && this.canAct()) this.startDash(dashRequest);

    // ---- Flip triggers: jump-while-airborne = front flip, block+jump grounded = backflip ----
    if (inp.jumpEdge) {
      if (this.grounded && inp.block) this.startFlip('back');
      else if (!this.grounded && this.state === 'jump') this.startFlip('front');
      else if (this.grounded && this.state !== 'attack') {
        this.vy = JUMP_V * (this.ch.stats.jumpMult || 1);
        this.grounded = false;
        this.state = 'jump';
      }
    }

    // ---- Block (grounded only; covers entering AND releasing block) ----
    const dashing = now < this._dashUntil;
    if (this.grounded && (this.state === 'idle' || this.state === 'walk' || this.state === 'block')) {
      this.state = inp.block ? 'block' : (Math.abs(this.vx) > 12 ? 'walk' : 'idle');
    }
    this.el.classList.toggle('blocking', this.state === 'block');

    // ---- Attack input (edge-triggered, with buffering during recovery) ----
    if (inp.punchEdge && this.state !== 'block') {
      if (this.canAct()) this.startAttack('punch', false);
      else if (this.state === 'attack' && this.attackPhase === 'recovery') this.bufferedAttack = 'punch';
    }
    if (inp.kickEdge) {
      if (this.canAct() || this.state === 'block') this.startAttack('kick', false);
      else if (this.state === 'attack' && this.attackPhase === 'recovery') this.bufferedAttack = 'kick';
    }

    // ---- Combo buffer -> Rush special (punch, punch, kick) ----
    if (inp.punchEdge || inp.kickEdge) {
      this.comboBuffer.push({ n: inp.punchEdge ? 'p' : 'k', t: now });
      while (this.comboBuffer.length && now - this.comboBuffer[0].t > 1.2) this.comboBuffer.shift();
      const last3 = this.comboBuffer.slice(-3).map(e => e.n).join('');
      if (last3 === 'ppk' && this.state === 'attack') {
        this.comboBuffer.length = 0;
        this.bufferedAttack = 'rush';
      }
    }

    this.updateAttackState(opp);

    // ---- Physics: horizontal movement ----
    const moving = this.state === 'idle' || this.state === 'walk' || this.state === 'jump';
    let targetVx = 0;
    if (moving && this.state !== 'block') {
      const speedMult = (this.ch.stats.speed || 1);
      if (inp.left) targetVx = -MAX_SPEED * speedMult;
      if (inp.right) targetVx = MAX_SPEED * speedMult;
    }
    if (dashing) {
      this.vx = this.dashDir * DASH_SPEED * (this.ch.stats.dashMult || 1);
    } else if (this.state === 'flip') {
      const p = Math.min(1, (now - this._flipStart) / (this.flipType === 'front' ? FLIP_TIME : BACKFLIP_TIME));
      const dir = this.flipType === 'front' ? this.facing : -this.facing;
      this.vx = dir * (this.flipType === 'front' ? 340 : 460) * (1 - p * 0.3);
    } else {
      const control = this.grounded ? 1 : AIR_CONTROL;
      const accel = (targetVx !== 0 ? MOVE_ACCEL : GROUND_DECEL) * control;
      this.vx += Math.sign(targetVx - this.vx) * Math.min(Math.abs(targetVx - this.vx), accel * dt);
    }
    this.x += this.vx * dt;
    this.x = Math.max(ARENA_MIN_X, Math.min(ARENA_MAX_X, this.x));
    if (this.x === ARENA_MIN_X || this.x === ARENA_MAX_X) this.vx = 0;

    // ---- Physics: vertical (gravity) ----
    if (!this.grounded || this.y > 0 || this.vy !== 0) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0; this.vy = 0;
        if (!this.grounded) this.pushEvent({ type: 'land', x: this.x, y: GROUND_Y });
        this.grounded = true;
        if (this.state === 'jump') this.state = 'idle';
        if (this.state === 'flip') {
          this.state = 'landing';
          this.landingUntil = now + LANDING_RECOVERY;
        }
      } else {
        this.grounded = false;
      }
    }
    if (this.state === 'landing' && now >= this.landingUntil) this.state = 'idle';

    // ---- Walk vs idle bookkeeping ----
    if (this.grounded && (this.state === 'idle' || this.state === 'walk')) {
      this.state = Math.abs(this.vx) > 12 ? 'walk' : 'idle';
    }

    // ---- KO check ----
    if (this.health <= 0 && this.state !== 'ko') {
      this.state = 'ko';
      this.pushEvent({ type: 'ko', x: this.x, y: GROUND_Y - 40 });
    }

    this._render(dt);
  }

  // ---------------- Rendering ----------------
  _render(dt) {
    const el = this.el, r = this.rig, ch = this.ch, pose = ch.pose;
    const t = this.timeSec;
    el.style.left = this.x + 'px';
    el.style.top = (GROUND_Y - this.y) + 'px';
    if (r.svg) r.svg.style.transform = `scaleX(${this.facing >= 0 ? 1 : -1})`;
    el.classList.toggle('jump', !this.grounded && this.state !== 'flip');
    el.classList.toggle('flipping', this.state === 'flip');
    el.classList.toggle('landing', this.state === 'landing');
    el.classList.toggle('ko', this.state === 'ko');

    // ---- Whole-body lean: velocity sway + idle weight-shift + attack anticipation/drive
    // + a decaying hit-reaction impulse, layered additively then smoothed. This lives on
    // .leanWrap — one level outside the SVG's own torsoG, which CSS keyframes drive during
    // attacks/blocks — so nothing here ever fights a CSS animation. ----
    let lean = -this.vx * 0.045;

    if ((this.state === 'idle' || this.state === 'walk') && !this.ikPunch) {
      const sp = pose.swaySpeed;
      let sway = Math.sin((t + this._idleSeed) * 1.6 * sp) * 1.1 * pose.swayAmp
               + Math.sin((t + this._idleSeed) * 0.55 * sp) * 1.8 * pose.swayAmp;
      lean += sway;
      if (t >= this._nextShiftAt) {
        this._nextShiftAt = t + 2.4 + Math.random() * 3.2;
        this._shiftPulseStart = t;
      }
      if (this._shiftPulseStart !== undefined) {
        const sp2 = t - this._shiftPulseStart;
        if (sp2 >= 0 && sp2 < 0.4) lean += Math.sin(sp2 / 0.4 * Math.PI) * 3 * this.facing;
      }
    }

    if (this.state === 'attack' && this.attackPhase && this.attackDurations) {
      const durs = this.attackDurations, elapsed = t - this.attackPhaseStart;
      if (this.attackPhase === 'startup') {
        const frac = Math.min(1, elapsed / durs.startup);
        lean += -this.facing * 3.5 * (1 - frac); // brief coil backward before the strike
      } else if (this.attackPhase === 'active') {
        lean += this.facing * 5.5; // drive the whole body through the hit
      } else if (this.attackPhase === 'recovery') {
        const rd = durs.recovery[this.attackOutcome] || durs.recovery.whiff;
        const frac = Math.min(1, elapsed / rd);
        lean += this.facing * 5.5 * (1 - frac); // settle back to neutral
      }
    }

    if (this.hitReaction) {
      const MAG = { punch: 6, kick: 10, lowkick: 8, rush: 15, aerialKick: 13, block: 3 };
      const DUR = { punch: 0.22, kick: 0.3, lowkick: 0.26, rush: 0.42, aerialKick: 0.34, block: 0.16 };
      const mag = (MAG[this.hitReaction.tier] ?? 8) / (pose.weight || 1);
      const dur = DUR[this.hitReaction.tier] ?? 0.28;
      const el2 = t - this.hitReaction.start;
      if (el2 >= dur) this.hitReaction = null;
      else lean += -this.facing * mag * (1 - el2 / dur) * Math.cos(el2 * 26);
    }

    if (pose.jointStyle === 'mech') lean = Math.round(lean * 2) / 2; // quantized, mechanical recoil

    const curLean = parseFloat(r.lean.dataset.lean || '0');
    const nextLean = curLean + (lean - curLean) * Math.min(1, dt * 14);
    r.lean.dataset.lean = nextLean;
    r.lean.style.transform = `rotate(${nextLean.toFixed(2)}deg)`;

    // ---- Landing squash / impact recoil — rigWrap is otherwise untouched by CSS or JS. ----
    let sx = 1, sy = 1;
    if (this.state === 'landing') {
      const p = Math.min(1, Math.max(0, (t - (this.landingUntil - LANDING_RECOVERY)) / LANDING_RECOVERY));
      const wob = Math.sin(p * Math.PI) * (pose.weight || 1);
      sx = 1 + wob * 0.16; sy = 1 - wob * 0.14;
    }
    r.rigWrap.style.transform = (sx === 1 && sy === 1) ? '' : `scale(${sx.toFixed(3)},${sy.toFixed(3)})`;

    // ---- Legs: walk cycle owns all four; a grounded kick gets a support-leg weight
    // transfer on the back leg while CSS drives the striking front leg via the
    // attack-kick/attack-lowkick classes; everything else releases control back to the
    // base rig pose or other CSS rules (block, jump). ----
    if (this.state === 'walk') {
      this.walkPhase += dt * (6 + Math.abs(this.vx) * 0.02);
      const swing = Math.sin(this.walkPhase) * 26;
      r.legFU.style.transform = `rotate(${swing}deg)`;
      r.legBU.style.transform = `rotate(${-swing}deg)`;
      r.legFL.style.transform = `rotate(${Math.max(0, -swing * 0.6)}deg)`;
      r.legBL.style.transform = `rotate(${Math.max(0, swing * 0.6)}deg)`;
    } else {
      r.legFU.style.transform = ''; r.legFL.style.transform = '';
      const kicking = this.state === 'attack' && this.grounded &&
        (this.attackType === 'kick' || this.attackType === 'lowkick') && this.attackDurations;
      if (kicking) {
        const durs = this.attackDurations, elapsed = t - this.attackPhaseStart;
        let p = 0;
        if (this.attackPhase === 'startup') p = elapsed / durs.startup;
        else if (this.attackPhase === 'active') p = 1;
        else if (this.attackPhase === 'recovery') {
          const rd = durs.recovery[this.attackOutcome] || durs.recovery.whiff;
          p = 1 - Math.min(1, elapsed / rd);
        }
        const bend = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI * 0.5) * 22;
        r.legBU.style.transform = `rotate(${(bend * 0.7).toFixed(1)}deg)`;
        r.legBL.style.transform = `rotate(${(-bend * 0.9).toFixed(1)}deg)`;
      } else {
        r.legBU.style.transform = ''; r.legBL.style.transform = '';
      }
    }

    // ---- Front arm: IK owns it mid-punch/rush (unchanged math — the arm's rest geometry
    // was left untouched specifically so this still tracks accurately); a subtle idle sway
    // otherwise; CSS/base rig pose owns it during block, kicks, and flips. ----
    if (this.ikPunch) {
      const p = (this.timeSec - this.ikPunch.start) / this.ikPunch.dur;
      if (p >= 1) {
        r.armFU.style.transform = ''; r.armFL.style.transform = ''; this.ikPunch = null;
      } else {
        const target = sampleHand(PUNCH_KEYS, Math.max(0, p));
        const sol = armIK.solve(ARM_ROOT, target, 1);
        const upperDeg = (sol.upperAngle - ARM_REST_U) * 180 / Math.PI;
        const lowerDeg = ((sol.lowerAngle - ARM_REST_L) * 180 / Math.PI) - upperDeg;
        r.armFU.style.transform = `rotate(${upperDeg.toFixed(1)}deg)`;
        r.armFL.style.transform = `rotate(${lowerDeg.toFixed(1)}deg)`;
      }
    } else if (this.state === 'idle') {
      const m = Math.sin((t + this._idleSeed) * 1.8 * pose.swaySpeed) * 2.2 * pose.swayAmp;
      r.armFU.style.transform = `rotate(${m.toFixed(1)}deg)`;
      r.armFL.style.transform = `rotate(${(m * 0.5).toFixed(1)}deg)`;
    } else {
      r.armFU.style.transform = ''; r.armFL.style.transform = '';
    }

    // ---- Back arm: counter-rotates for a punch/rush's hip-and-shoulder drive (the classic
    // "rear hand pulls back as the lead hand fires" mechanic); idle sway otherwise; CSS
    // owns it during block. ----
    if (this.ikPunch && (this.attackType === 'punch' || this.attackType === 'rush')) {
      const p = Math.max(0, Math.min(1, (t - this.ikPunch.start) / this.ikPunch.dur));
      const swing = p < 0.55 ? -(p / 0.55) * 26 : -26 * (1 - (p - 0.55) / 0.45);
      r.armBU.style.transform = `rotate(${swing.toFixed(1)}deg)`;
      r.armBL.style.transform = `rotate(${(swing * 0.6).toFixed(1)}deg)`;
    } else if (this.state === 'idle') {
      const m = Math.sin((t + this._idleSeed) * 1.8 * pose.swaySpeed + 1.4) * 2.6 * pose.swayAmp;
      r.armBU.style.transform = `rotate(${m.toFixed(1)}deg)`;
      r.armBL.style.transform = `rotate(${(m * 0.5).toFixed(1)}deg)`;
    } else {
      r.armBU.style.transform = ''; r.armBL.style.transform = '';
    }

    // Mouth: bare teeth mid-swing / on hit reaction
    const shout = this.state === 'attack' || this.state === 'hitstun';
    if (r.mouthOpen) r.mouthOpen.style.opacity = shout ? '1' : '0';
    if (r.mouthNeutral) r.mouthNeutral.style.opacity = shout ? '0' : '1';
  }
}
