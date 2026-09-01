// js/fighter.js — physics-driven stick-man fighter: gravity, momentum, ground friction,
// a real 2-bone IK solve for the punch arm, keyframe-driven kicks/flips, and a
// startup/active/recovery attack state machine with combo buffering.
import { GROUND_Y, ARENA_MIN_X, ARENA_MAX_X } from './world.js';

// ---------------- Roster ----------------
export const CHARACTERS = [
  { key:'boxer',    name:'Boxer',     color:'#3f7bff', accent:'#ffcf4d', skin:'#ffd9b3', accessory:'gloves',    stats:{} },
  { key:'ninja',    name:'Ninja',     color:'#2b2b33', accent:'#ff3b3b', skin:'#e8c39e', accessory:'headband',  stats:{ speed:1.25, health:0.85, dashMult:1.3 } },
  { key:'sumo',     name:'Sumo',      color:'#c97b3d', accent:'#fff2d6', skin:'#e8b98a', accessory:'topknot',   stats:{ speed:0.75, health:1.35, knockback:1.5 } },
  { key:'kickboxer',name:'Kickboxer', color:'#e0602b', accent:'#2b2b33', skin:'#d9a066', accessory:'wristbands',stats:{ kickDmg:1.3, punchDmg:0.85 } },
  { key:'robot',    name:'Robot',     color:'#8f9bab', accent:'#2ee6ff', skin:'#c7ced6', accessory:'antenna',   stats:{ dmgAll:1.2, cooldownMult:1.2 } },
  { key:'monk',     name:'Monk',      color:'#f0a500', accent:'#7a3a1a', skin:'#e8b98a', accessory:'robe',      stats:{ punchCooldownMult:0.7, kickDmg:0.85 } }
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

function accessorySVG(ch) {
  switch (ch.accessory) {
    case 'headband': return `<rect x="19" y="9" width="22" height="4" fill="${ch.accent}"/><path d="M41,10 Q50,7 54,15 Q49,12 44,14 Z" fill="${ch.accent}"/>`;
    case 'topknot': return `<circle cx="30" cy="4" r="3.5" fill="${ch.color}"/><rect x="18" y="52" width="24" height="5" rx="1" fill="${ch.accent}"/>`;
    case 'wristbands': return `<circle cx="19" cy="29" r="4.5" fill="${ch.accent}"/><circle cx="41" cy="29" r="4.5" fill="${ch.accent}"/>`;
    case 'antenna': return `<line x1="30" y1="6" x2="30" y2="0" stroke="${ch.accent}" stroke-width="2"/><circle cx="30" cy="0" r="2.2" fill="${ch.accent}"/>`;
    case 'robe': return `<path d="M18,50 Q11,58 15,68 Q18,60 21,58 Z" fill="${ch.accent}" opacity=".75"/><path d="M42,50 Q49,58 45,68 Q42,60 39,58 Z" fill="${ch.accent}" opacity=".7"/>`;
    case 'gloves': return `<rect x="24" y="6" width="12" height="4" rx="2" fill="#fff" opacity=".85"/>`;
    default: return '';
  }
}

function faceSVG(ch) {
  const isRobot = ch.accessory === 'antenna';
  const eyeFill = isRobot ? ch.accent : '#1a1420';
  return `<g class="face">
    <ellipse cx="26" cy="15" rx="1.7" ry="${isRobot ? 2.2 : 1.9}" fill="${eyeFill}"/>
    <ellipse cx="34" cy="15" rx="1.7" ry="${isRobot ? 2.2 : 1.9}" fill="${eyeFill}"/>
    <path class="mouthNeutral" d="M26,20 Q30,21.5 34,20" stroke="#3a2418" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <ellipse class="mouthOpen" cx="30" cy="20.5" rx="3" ry="2.4" fill="#5c2418" opacity="0"/>
  </g>`;
}

export function rigSVG(ch) {
  const back = shade(ch.color, -30), main = ch.color;
  const torsoPath = `M23.5,27 Q22,38 26,45 Q20.2,52 20,58 L40,58 Q39.5,52 34,45 Q38,38 36.5,27 Z`;
  return `<svg class="rig" viewBox="0 0 60 100">
    <g class="legBackUpper"><path d="M30,58 L24,75" stroke="${back}" stroke-width="7.5" stroke-linecap="round"/>
      <circle cx="30" cy="58" r="4.2" fill="${back}"/>
      <g class="legBackLower"><path d="M24,75 L19,96" stroke="${back}" stroke-width="7" stroke-linecap="round"/>
        <circle cx="24" cy="75" r="3.6" fill="${back}"/></g></g>
    <g class="legFrontUpper"><path d="M30,58 L37,75" stroke="${main}" stroke-width="7.8" stroke-linecap="round"/>
      <g class="legFrontLower"><path d="M37,75 L42,96" stroke="${main}" stroke-width="7.2" stroke-linecap="round"/>
        <circle cx="37" cy="75" r="3.8" fill="${main}"/></g></g>
    <g class="torsoG"><path d="${torsoPath}" fill="${main}"/></g>
    <rect x="27" y="22" width="6" height="6" rx="2.5" fill="${main}"/>
    <g class="armBackUpper"><path d="M30,27 L23,42" stroke="${back}" stroke-width="6.5" stroke-linecap="round"/>
      <circle cx="30" cy="27" r="3.6" fill="${back}"/>
      <g class="armBackLower"><path d="M23,42 L19,29" stroke="${back}" stroke-width="6" stroke-linecap="round"/>
        <circle cx="23" cy="42" r="3.1" fill="${back}"/></g></g>
    <circle class="head" cx="30" cy="15" r="9" fill="${ch.skin}"/>
    ${faceSVG(ch)}
    ${accessorySVG(ch)}
    <g class="armFrontUpper"><path d="M30,27 L37,42" stroke="${main}" stroke-width="6.8" stroke-linecap="round"/>
      <circle cx="30" cy="27" r="3.9" fill="${main}"/>
      <g class="armFrontLower">
        <path d="M37,42 L41,29" stroke="${main}" stroke-width="6.2" stroke-linecap="round"/>
        <circle cx="37" cy="42" r="3.4" fill="${main}"/>${ch.accessory === 'gloves' ? `<circle cx="41" cy="29" r="6.4" fill="#c0392b"/>` : ''}
      </g></g>
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
    this.ikPunch = null; this.events = [];
    if (this.rig.flipSpin) this.rig.flipSpin.style.animation = 'none';
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
    const el = this.el, r = this.rig;
    el.style.left = this.x + 'px';
    el.style.top = (GROUND_Y - this.y) + 'px';
    if (r.svg) r.svg.style.transform = `scaleX(${this.facing >= 0 ? 1 : -1})`;
    el.classList.toggle('jump', !this.grounded && this.state !== 'flip');
    el.classList.toggle('flipping', this.state === 'flip');
    el.classList.toggle('ko', this.state === 'ko');

    // Lean: tilt torso opposite the direction of acceleration, more when dashing.
    const leanTarget = Math.max(-16, Math.min(16, -this.vx * 0.045));
    const curLean = parseFloat(r.lean.dataset.lean || '0');
    const nextLean = curLean + (leanTarget - curLean) * Math.min(1, dt * 10);
    r.lean.dataset.lean = nextLean;
    r.lean.style.transform = `rotate(${nextLean.toFixed(2)}deg)`;

    // Procedural walk cycle: swing legs with velocity-scaled phase speed.
    if (this.state === 'walk') {
      this.walkPhase += dt * (6 + Math.abs(this.vx) * 0.02);
      const swing = Math.sin(this.walkPhase) * 26;
      r.legFU.style.transform = `rotate(${swing}deg)`;
      r.legBU.style.transform = `rotate(${-swing}deg)`;
      r.legFL.style.transform = `rotate(${Math.max(0, -swing * 0.6)}deg)`;
      r.legBL.style.transform = `rotate(${Math.max(0, swing * 0.6)}deg)`;
    } else if (this.state !== 'attack') {
      // Clear the procedural walk pose for every other state (idle/jump/flip/block/
      // landing/hitstun) so CSS class-driven poses for those states can take over —
      // an inline transform left over from walking would otherwise outrank them.
      r.legFU.style.transform = ''; r.legBU.style.transform = '';
      r.legFL.style.transform = ''; r.legBL.style.transform = '';
    }

    // IK punch arm
    if (this.ikPunch) {
      const t = (this.timeSec - this.ikPunch.start) / this.ikPunch.dur;
      if (t >= 1) {
        r.armFU.style.transform = ''; r.armFL.style.transform = ''; this.ikPunch = null;
      } else {
        const target = sampleHand(PUNCH_KEYS, Math.max(0, t));
        const sol = armIK.solve(ARM_ROOT, target, 1);
        const upperDeg = (sol.upperAngle - ARM_REST_U) * 180 / Math.PI;
        const lowerDeg = ((sol.lowerAngle - ARM_REST_L) * 180 / Math.PI) - upperDeg;
        r.armFU.style.transform = `rotate(${upperDeg.toFixed(1)}deg)`;
        r.armFL.style.transform = `rotate(${lowerDeg.toFixed(1)}deg)`;
      }
    }

    // Mouth: bare teeth mid-swing / on hit reaction
    const shout = this.state === 'attack' || this.state === 'hitstun';
    if (r.mouthOpen) r.mouthOpen.style.opacity = shout ? '1' : '0';
    if (r.mouthNeutral) r.mouthNeutral.style.opacity = shout ? '0' : '1';
  }
}
