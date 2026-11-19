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
import { GROUND_Y, ARENA_MIN_X, ARENA_MAX_X, STEP, framesFor } from './world.js';
import { Puppet, puppetSVG } from './puppet.js';

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
  { key:'sumo',     name:'Sumo',      color:'#c97b3d', accent:'#fff2d6', skin:'#e8b98a', accessory:'topknot',   stats:{ speed:0.75, health:1.35 } /* knockback resistance now comes from pose.weight */, pose: POSE.sumo },
  { key:'kickboxer',name:'Kickboxer', color:'#e0602b', accent:'#2b2b33', skin:'#d9a066', accessory:'wristbands',stats:{ kickDmg:1.3, punchDmg:0.85 }, pose: POSE.kickboxer },
  { key:'robot',    name:'Robot',     color:'#8f9bab', accent:'#2ee6ff', skin:'#c7ced6', accessory:'antenna',   stats:{ dmgAll:1.2, cooldownMult:1.2 }, pose: POSE.robot },
  { key:'monk',     name:'Monk',      color:'#f0a500', accent:'#7a3a1a', skin:'#e8b98a', accessory:'robe',      stats:{ punchCooldownMult:0.7, kickDmg:0.85 }, pose: POSE.monk }
];
export const charByKey = k => CHARACTERS.find(c => c.key === k) || CHARACTERS[0];

// Drawing and animation live in puppet.js (smooth neon outlines, keyed attacks).
// rigSVG is kept as the name main.js uses for the character-select previews.
export const rigSVG = puppetSVG;

// ---------------- Timing / balance tables ----------------
const ATTACK = {
  punch: { startup: 0.09, active: 0.07, recovery: { hit: 0.11, block: 0.19, whiff: 0.26 }, dmg: 7, range: 100, kb: 90 },
  kick:  { startup: 0.14, active: 0.08, recovery: { hit: 0.18, block: 0.32, whiff: 0.46 }, dmg: 13, range: 120, kb: 170 },
  lowkick: { startup: 0.10, active: 0.07, recovery: { hit: 0.15, block: 0.26, whiff: 0.34 }, dmg: 10, range: 108, kb: 130 },
  rush:  { startup: 0.06, active: 0.10, recovery: { hit: 0.16, block: 0.26, whiff: 0.32 }, dmg: 20, range: 130, kb: 220 },
  aerialKick: { startup: 0.08, active: 0.10, recovery: { hit: 0.14, block: 0.24, whiff: 0.30 }, dmg: 18, range: 130, kb: 200 },
  // Throw (GUARD + PUNCH up close): beats a blocking opponent, can't be blocked, but a
  // whiffed throw leaves you open.
  throw: { startup: 0.07, active: 0.05, recovery: { hit: 0.26, block: 0.45, whiff: 0.45 }, dmg: 14, range: 80, kb: 0 },
  // Super move (full meter): armoured during startup, launches, chips through guard.
  super: { startup: 0.14, active: 0.14, recovery: { hit: 0.30, block: 0.50, whiff: 0.55 }, dmg: 30, range: 150, kb: 300 }
};
// One super per character. style picks the animation; lunge is forward speed (px/s)
// during startup + active; range is how far the blow reaches at the moment it lands.
export const SUPERS = {
  boxer:     { name: 'HAYMAKER',      style: 'punch', lunge: 520, range: 150, dmg: 30 },
  ninja:     { name: 'SHADOW STRIKE', style: 'punch', lunge: 900, range: 150, dmg: 27 },
  sumo:      { name: 'SUMO CHARGE',   style: 'punch', lunge: 700, range: 140, dmg: 34 },
  kickboxer: { name: 'TORNADO KICK',  style: 'kick',  lunge: 380, range: 165, dmg: 32 },
  robot:     { name: 'ROCKET PUNCH',  style: 'punch', lunge: 0,   range: 240, dmg: 28 },
  monk:      { name: 'PALM BLAST',    style: 'punch', lunge: 300, range: 195, dmg: 29 }
};
export const METER_MAX = 100;
const GRAVITY = 2500, JUMP_V = 760, MOVE_ACCEL = 2400, MAX_SPEED = 250, AIR_CONTROL = 0.55;
const GROUND_DECEL = 1900, DASH_SPEED = 880, DASH_TIME = 0.16, DASH_COOLDOWN = 0.55, DASH_IFRAME = 0.14;
const FLIP_TIME = 0.46, BACKFLIP_TIME = 0.36, LANDING_RECOVERY = 0.09;
const COMBO_WINDOW = 1.1;
// Visual-state deadlines, in sim frames (replace the old gameplay setTimeouts).
const HITFLASH_FRAMES = framesFor(0.22);
const DASH_FX_FRAMES = framesFor(DASH_TIME + 0.06);
const ATK_CLASS_PAD_FRAMES = framesFor(0.04);
const ALL_ATK_CLASSES = ['attack-punch', 'attack-kick', 'attack-heavy', 'attack-lowkick', 'aerial'];
// ---- Knockdown / wall splat (Batch 1). Every duration is in whole sim frames. ----
const KNOCKDOWN_TIERS = { rush: true, aerialKick: true, super: true, throw: true };          // these launch + knock down
const LAUNCH = { rush: { vx: 360, vy: 560 }, aerialKick: { vx: 300, vy: 470 }, super: { vx: 470, vy: 600 }, throw: { vx: 300, vy: 560 } }; // px/s, before weight
const KO_LAUNCH = { vx: 300, vy: 420 };                            // finishing blow sends the loser flying
const KD_LIE_FRAMES = framesFor(0.5);      // lying on the floor (invulnerable)
const KD_RISE_FRAMES = framesFor(0.3);     // getting up (invulnerable)
const TECH_ROLL_FRAMES = framesFor(0.33);  // hold a direction on landing to roll instead of lying
const TECH_ROLL_SPEED = 420;
const WALL_SPLAT_SPEED = 200;              // px/s into the arena edge needed to splat
const WALL_STICK_FRAMES = framesFor(0.25);
const WALL_SLIDE_SPEED = 260;              // px/s down the wall after the stick
// Crowd bounce: a launched fighter flying into the crowd at the arena edge gets shoved
// back into the fight (once per launch) and can be hit again on the way.
const CROWD_BOUNCE_SPEED = 150;            // px/s into the edge needed
const CROWD_BOUNCE_VX = 340, CROWD_BOUNCE_VY = 430;
// Meter gain per point of damage dealt / taken, and per blocked hit.
const METER_GAIN_DEAL = 1.0, METER_GAIN_TAKE = 0.6, METER_GAIN_BLOCK = 3;
const ROLL_ANIM_TIME = 0.33;

// Input object used when a fighter must ignore control (KO'd, or round already decided).
export const NEUTRAL_INPUT = Object.freeze({ left: false, right: false, block: false, kickHeld: false,
  jumpEdge: false, punchEdge: false, kickEdge: false, flipRequest: false, superEdge: false });

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
    this.chain = 0; this.chainDmg = 0;   // true combo: hits landed while the victim never recovered
    this.meter = 0;                       // super meter, kept across rounds
    this.bounceUsed = false; this.juggleable = false;
    this.victory = false;                 // render-only: winner's pose after the round
    this.health = 100 * (this.ch.stats.health || 1);
    this.maxHealth = this.health;
    this.dashCooldownUntil = 0; this.invincibleUntil = 0; this.dashDir = 0;
    this.flipUntil = 0; this.flipType = null; this.landingUntil = 0;
    this.hitstunUntil = 0; this.knockdownUntil = 0;
    this.walkPhase = 0;
    this.ikPunch = null;
    this.hitReaction = null; // { tier, start } — decaying recoil impulse from being hit/blocking
    this.pendingResolve = false; // set when this frame's startup->active transition needs resolveAttack()
    this._idleSeed = Math.random() * 1000;
    this._nextShiftAt = 2 + Math.random() * 3;
    this._shiftPulseStart = undefined;
    this.events = [];
    this.el = null; this.rig = {};
    // Simulation clock: an integer frame count advanced once per fixed sim step.
    // timeSec is derived from it, so every existing seconds-based timer now lands on
    // exact frame boundaries and is identical on every device.
    this.frame = 0;
    this.attackStartFrame = -1; // identifies one attack (the AI rolls its guard once per attack)
    this.airFlipUsed = false;
    // Frame deadlines for visual classes (rendered by render(), never by timers).
    this.hitflashUntilF = 0; this.dashFxUntilF = 0;
    this.atkClass = null; this.atkClassUntilF = 0; this.atkClassSeq = 0;
    this.flipSeq = 0;
    this._renderedAtkSeq = 0; this._renderedAtkCls = null; this._renderedFlipSeq = 0;
    // Knockdown / wall splat state.
    this.kdPhase = null;    // null | 'air' | 'down' | 'rise' | 'roll'
    this.kdUntilF = 0; this.kdStartFrame = -1; this.rollDir = 0; this.rollSeq = 0; this._renderedRollSeq = 0;
    this.splatUsed = false; this.wallStuck = false; this.splatUntilF = 0; this.wallSide = 0;
    // Arena bounds. main.js swaps in the match's shared bounds object so sudden death
    // can move the walls; these defaults keep a standalone Fighter usable.
    this.arena = { min: ARENA_MIN_X, max: ARENA_MAX_X };
  }

  get timeSec() { return this.frame * STEP; }
  get weight() { return this.ch.pose.weight || 1; } // heavier = less knockback taken
  get superMove() { return SUPERS[this.ch.key] || SUPERS.boxer; }
  get superReady() { return this.meter >= METER_MAX; }
  gainMeter(n) { this.meter = Math.min(METER_MAX, this.meter + n); }

  mount(container) {
    this.puppet = new Puppet(this);
    this.el = document.createElement('div');
    this.el.className = `fighter ${this.side}`;
    this.el.innerHTML = `
      <div class="comboPopup"></div>
      <div class="leanWrap"><div class="rigWrap"><div class="flipSpin">${this.puppet.markup()}</div></div></div>
      <div class="platform"></div>`;
    container.appendChild(this.el);
    const q = sel => this.el.querySelector(sel);
    this.rig = {
      combo: q('.comboPopup'), lean: q('.leanWrap'), rigWrap: q('.rigWrap'), flipSpin: q('.flipSpin'),
      svg: q('.rig'), mouthOpen: q('.mouthOpen'), mouthNeutral: q('.mouthNeutral')
    };
    this.puppet.bind(this.rig.svg);
  }

  reset(x) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
    this.health = this.maxHealth; this.state = 'idle'; this.grounded = true;
    this.attackType = null; this.attackPhase = null; this.comboCount = 0; this.comboBuffer = []; this.hits = 0;
    this.chain = 0; this.chainDmg = 0; this.bounceUsed = false; this.juggleable = false; this.victory = false; this.rushAfter = false;
    this.hitstunUntil = 0; this.knockdownUntil = 0; this.invincibleUntil = 0; this.dashCooldownUntil = 0;
    this._dashUntil = 0; this.flipUntil = 0; this._flipStart = 0; this.landingUntil = 0; this.walkPhase = 0;
    this.ikPunch = null; this.hitReaction = null; this.pendingResolve = false; this.events = [];
    this.flipType = null; this.airFlipUsed = false; this.attackStartFrame = -1;
    this.bufferedAttack = null; this.attackOutcome = null; this.attackDurations = null;
    this.hitflashUntilF = 0; this.dashFxUntilF = 0; this.atkClass = null; this.atkClassUntilF = 0;
    this._renderedAtkCls = null; this._renderedAtkSeq = this.atkClassSeq; this._renderedFlipSeq = this.flipSeq;
    this.kdPhase = null; this.kdUntilF = 0; this.kdStartFrame = -1; this.rollDir = 0; this._renderedRollSeq = this.rollSeq;
    this.splatUsed = false; this.wallStuck = false; this.splatUntilF = 0; this.wallSide = 0;
    this._nextShiftAt = this.timeSec + 2 + Math.random() * 3;
    this._shiftPulseStart = undefined;
    if (this.rig.flipSpin) this.rig.flipSpin.style.animation = 'none';
    if (this.puppet) this.puppet.reset();
    if (this.rig.lean) { this.rig.lean.style.transform = ''; this.rig.lean._prevRot = 0; this.rig.lean.dataset.lean = '0'; }
    this.el.classList.remove('hitflash', 'dashing', 'flipping', 'blocking', 'attack-punch', 'attack-kick',
      'attack-heavy', 'attack-lowkick', 'aerial', 'jump', 'ko', 'launched', 'downed', 'rolling', 'wallsplat');
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
    if (t === 'super') {
      this.meter = 0;
      this.invincibleUntil = this.timeSec + timing.startup; // armour: can't be stuffed
      this.pushEvent({ type: 'super', name: this.superMove.name, x: this.x, y: GROUND_Y - this.y - 50 });
    }
    this.state = 'attack';
    this.attackType = t;
    this.attackPhase = 'startup';
    this.attackPhaseStart = this.timeSec;
    this.attackStartFrame = this.frame;
    const cdMult = (this.ch.stats.cooldownMult || 1) * (t === 'punch' ? (this.ch.stats.punchCooldownMult || 1) : 1);
    this.attackDurations = {
      startup: timing.startup * (buffered ? 0.7 : 1),
      active: timing.active,
      recovery: { hit: timing.recovery.hit * cdMult, block: timing.recovery.block * cdMult, whiff: timing.recovery.whiff * cdMult }
    };
    this.attackOutcome = null;
    this.bufferedAttack = null;

    // Pose class is state + a frame deadline; render() applies it (and restarts the CSS
    // animation when atkClassSeq changes). No timers in the simulation.
    this.atkClass = t === 'rush' || t === 'super' ? 'attack-heavy' : t === 'throw' ? 'attack-punch' : t === 'aerialKick' ? 'attack-kick aerial' : t === 'lowkick' ? 'attack-lowkick' : `attack-${t}`;
    this.atkClassUntilF = this.frame + framesFor(timing.startup + timing.active) + ATK_CLASS_PAD_FRAMES;
    this.atkClassSeq++;

    if (t === 'punch' || t === 'rush' || t === 'super') this.ikPunch = { start: this.timeSec, dur: (timing.startup + timing.active) * 1.6 };

    // Motion-blur trail on the two fastest, IK-driven strikes only. Kick/lowkick are
    // CSS-keyframe driven and slower, and already read well without one.
    if (t === 'punch' || t === 'rush' || t === 'super') this.pushEvent({ type: 'trail', color: this.ch.color });
  }

  // Called by main.js after BOTH fighters' update() has run for the frame — see the
  // pendingResolve comment in updateAttackState() for why this is deferred.
  resolvePending(opp) {
    if (!this.pendingResolve) return;
    this.pendingResolve = false;
    this.resolveAttack(opp);
  }

  resolveAttack(opp) {
    const t = this.attackType;
    const timing = ATTACK[t];
    const range = t === 'super' ? this.superMove.range : timing.range;
    const dist = Math.abs(this.x - opp.x);
    const facingOK = (this.x < opp.x && this.facing === 1) || (this.x > opp.x && this.facing === -1);
    if (dist > range || !facingOK) { this.attackOutcome = 'whiff'; this.pushEvent({ type: 'whoosh' }); return; }
    if (this.timeSec < opp.invincibleUntil) { this.attackOutcome = 'whiff'; return; }
    if (opp.state === 'ko') { this.attackOutcome = 'whiff'; return; } // round already decided
    // No hitting a downed fighter, except one the crowd just shoved back into the fight.
    const juggle = opp.state === 'knockdown' && opp.kdPhase === 'air' && opp.juggleable;
    if (opp.state === 'knockdown' && !juggle) { this.attackOutcome = 'whiff'; return; }
    // Throws only catch a standing, grounded opponent (blocking or not).
    if (t === 'throw' && (!opp.grounded || opp.y > 4 || opp.state === 'knockdown' || opp.state === 'flip' ||
        opp.state === 'wallsplat' || opp.state === 'hitstun')) { this.attackOutcome = 'whiff'; this.pushEvent({ type: 'whoosh' }); return; }
    if (juggle) opp.juggleable = false;
    // True combo: the victim was still reeling (never got back to neutral) when hit.
    const reeling = opp.state === 'hitstun' || opp.state === 'wallsplat' || juggle;

    this.comboCount = (this.timeSec - this.lastHitTime < COMBO_WINDOW) ? this.comboCount + 1 : 1;
    this.lastHitTime = this.timeSec;

    let dmg = (t === 'super' ? this.superMove.dmg : timing.dmg) * (this.ch.stats.dmgAll || 1);
    if (t === 'punch') dmg *= (this.ch.stats.punchDmg || 1);
    if (t === 'kick' || t === 'aerialKick') dmg *= (this.ch.stats.kickDmg || 1);
    dmg += Math.min(this.comboCount - 1, 5) * 1.6;

    const guarding = opp.state === 'block' || opp.state === 'aerialGuard';
    if (guarding && t !== 'rush' && t !== 'super' && t !== 'throw') {
      this.attackOutcome = 'block';
      dmg *= 0.22;
      this.gainMeter(METER_GAIN_BLOCK * 0.7); opp.gainMeter(METER_GAIN_BLOCK);
      opp.pushEvent({ type: 'block', x: opp.x, y: GROUND_Y - opp.y - 40 });
      opp.hitReaction = { tier: 'block', start: this.timeSec };
      const kb = timing.kb * 0.4;
      opp.vx += (opp.x >= this.x ? 1 : -1) * kb;
      this.vx -= (opp.x >= this.x ? 1 : -1) * kb * 0.5;
    } else {
      // Rush partially pierces guard (reduced damage, still counts as a hit) instead
      // of being fully blockable or fully unblockable.
      if ((t === 'rush' || t === 'super') && guarding) { dmg *= t === 'super' ? 0.5 : 0.4; opp.pushEvent({ type: 'block', x: opp.x, y: GROUND_Y - opp.y - 40 }); }
      if (t === 'throw') opp.x = this.x + this.facing * 30; // pulled in for the toss
      this.chain = reeling ? this.chain + 1 : 1;
      this.chainDmg = (reeling ? this.chainDmg : 0) + Math.min(dmg, opp.health);
      if (t !== 'super') { this.gainMeter(dmg * METER_GAIN_DEAL); opp.gainMeter(dmg * METER_GAIN_TAKE); }
      this.attackOutcome = 'hit';
      const dirX = opp.x >= this.x ? 1 : -1;
      const w = opp.weight;
      const lethal = opp.health - dmg <= 0;
      if (KNOCKDOWN_TIERS[t] || lethal) {
        // Launch: a real arc instead of the old 60-140 px/s hop. Weight scales distance
        // fully and height by its square root, so a Sumo stays low and a Ninja flies.
        const l = LAUNCH[t] || KO_LAUNCH;
        opp.vx = dirX * l.vx / w;
        opp.vy = l.vy / Math.sqrt(w);
        opp.grounded = false;
        opp.state = 'knockdown'; opp.kdPhase = 'air'; opp.kdStartFrame = this.frame;
        opp.attackType = opp.attackType && opp.pendingResolve ? opp.attackType : null;
        opp.wallStuck = false;
      } else {
        opp.vx += dirX * timing.kb / w;
        opp.vy += (t === 'kick' || t === 'aerialKick' ? 140 : 60) / w;
        // Long enough that punch > punch > kick links into a true combo (Batch 3).
        opp.hitstunUntil = this.timeSec + (t === 'rush' ? 0.42 : t === 'punch' ? 0.30 : 0.40);
        opp.state = 'hitstun';
        opp.wallStuck = false; // a hit knocks a splatted fighter off the wall
      }
      opp.hitReaction = { tier: t, start: this.timeSec };
      // BUGFIX: rapid pre-hit button presses (an in-progress combo attempt, or a
      // just-queued bufferedAttack) used to survive across the hit and could fire an
      // unintended attack/Rush the instant hitstun cleared. Getting hit now clears both.
      opp.comboBuffer.length = 0;
      opp.bufferedAttack = null; opp.rushAfter = false;
      opp.hitflashUntilF = this.frame + HITFLASH_FRAMES;
      opp.health = Math.max(0, opp.health - dmg);
      this.hits++;
      this.pushEvent({
        type: 'hit', tier: t, combo: this.comboCount, chain: this.chain, chainDmg: this.chainDmg,
        x: opp.x, y: GROUND_Y - opp.y - 45, dirX: (opp.x >= this.x ? 1 : -1), color: this.ch.color
      });
      // KO is decided here, at the moment of the lethal hit. It used to be detected at the
      // end of the victim's next update(), which never ran because main.js ended the round
      // first, so the KO pose, flash, sound and crowd roar never played.
      if (opp.health <= 0) {
        opp.state = 'ko';
        opp.bufferedAttack = null;
        // opp.pendingResolve is deliberately left alone: if the victim's own strike went
        // active this same frame, it still resolves (main.js) and the trade is a double KO.
        opp.pushEvent({ type: 'ko', x: opp.x, y: GROUND_Y - 40, dirX: (opp.x >= this.x ? 1 : -1) });
      }
    }
  }

  updateAttackState(opp) {
    if (this.state !== 'attack') return;
    const el = this.attackPhaseStart;
    if (this.attackPhase === 'startup') {
      if (this.timeSec - el >= this.attackDurations.startup) {
        this.attackPhase = 'active';
        this.attackPhaseStart = this.timeSec;
        // BUGFIX: resolution used to happen immediately here, inside update(). Since
        // main.js calls p1.update() before p2.update(), a same-frame trade meant p1's
        // resolveAttack() could mutate p2.state to 'hitstun' before p2's own
        // updateAttackState() ran — which then early-returns (state !== 'attack') and
        // permanently drops p2's hit. Flagging it here and resolving from main.js via
        // resolvePending(), after both fighters have advanced their own phase for the
        // frame, makes trades symmetric.
        this.pendingResolve = true;
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
          if (this.rushAfter) { this.bufferedAttack = 'rush'; this.rushAfter = false; }
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
    this.dashDir = dir; // facing is unaffected by dash direction
    this.dashCooldownUntil = this.timeSec + DASH_COOLDOWN;
    this.invincibleUntil = this.timeSec + DASH_IFRAME;
    this._dashUntil = this.timeSec + DASH_TIME;
    this.dashFxUntilF = this.frame + DASH_FX_FRAMES;
    this.pushEvent({ type: 'dash', x: this.x, y: GROUND_Y - this.y - 30 });
  }

  startFlip(kind) {
    if (this.state === 'attack' || this.state === 'hitstun' || this.state === 'flip' ||
        this.state === 'landing' || this.state === 'ko' || this.state === 'knockdown' ||
        this.state === 'wallsplat') return;
    if (kind === 'front' && !this.grounded) this.airFlipUsed = true;
    this.state = 'flip';
    this.flipType = kind; // 'front' | 'back'
    this.flipUntil = this.timeSec + (kind === 'front' ? FLIP_TIME : BACKFLIP_TIME);
    this._flipStart = this.timeSec;
    this.invincibleUntil = this.timeSec + (kind === 'front' ? FLIP_TIME * 0.7 : BACKFLIP_TIME * 0.8);
    this.vy = Math.max(this.vy, kind === 'front' ? 520 : 420);
    this.flipSeq++; // render() restarts the spin animation
    this.pushEvent({ type: 'flip', x: this.x, y: GROUND_Y - this.y - 30 });
  }

  // ---------------- Knockdown / wall splat ----------------
  // Landing from a launch (or sliding off a wall): roll if a direction is held, else lie down.
  enterDown(techDir) {
    this.state = 'knockdown';
    this.wallStuck = false; this.juggleable = false;
    if (techDir) {
      this.kdPhase = 'roll'; this.rollDir = techDir;
      this.kdUntilF = this.frame + TECH_ROLL_FRAMES;
      this.rollSeq++;
      this.pushEvent({ type: 'techroll', x: this.x, y: GROUND_Y });
    } else {
      this.kdPhase = 'down';
      this.kdUntilF = this.frame + KD_LIE_FRAMES;
      this.pushEvent({ type: 'knockdown', x: this.x, y: GROUND_Y, weight: this.weight });
    }
  }

  startWallSplat(side) {
    this.state = 'wallsplat'; this.kdPhase = null;
    this.wallSide = side; this.wallStuck = true; this.splatUsed = true;
    this.splatUntilF = this.frame + WALL_STICK_FRAMES;
    this.vx = 0; this.vy = 0;
    this.hitflashUntilF = this.frame + HITFLASH_FRAMES;
    this.pushEvent({ type: 'wallsplat', x: this.x, y: GROUND_Y - this.y - 45, side });
  }

  // ---------------- Per-frame update ----------------
  // One fixed sim step (dt is always STEP). Pure simulation: no DOM access; call
  // render() once per displayed frame to draw the result.
  update(dt, inp, opp, dashRequest) {
    this.frame++;
    this.events = [];
    const now = this.timeSec;
    // Direction held right now: used only to tech-roll when landing from a knockdown.
    const techDir = inp.right ? 1 : inp.left ? -1 : 0;
    if (this.state === 'ko' || this.state === 'knockdown' || this.state === 'wallsplat') {
      inp = NEUTRAL_INPUT; dashRequest = 0; // no control while KO'd, knocked down or splatted
    }

    // Facing always toward opponent unless mid-attack/flip/hitstun (keeps strikes
    // readable and stops the rapid left-right facing flicker that rapid-fire trades
    // could cause when knockback pushes a stunned fighter past the opponent's x — a
    // 2px deadzone additionally prevents flip-flopping when both fighters are almost
    // exactly overlapped at point-blank range).
    if (this.state !== 'attack' && this.state !== 'flip' && this.state !== 'hitstun' && this.state !== 'ko' &&
        this.state !== 'knockdown' && this.state !== 'wallsplat') {
      const dx = opp.x - this.x;
      if (Math.abs(dx) > 2) this.facing = dx >= 0 ? 1 : -1;
    }

    // ---- Knockdown / hitstun timers ----
    if (this.state === 'hitstun' && now >= this.hitstunUntil) {
      this.state = this.grounded ? 'idle' : 'jump';
    }
    if (this.state === 'knockdown') {
      if (this.kdPhase === 'down' && this.frame >= this.kdUntilF) {
        this.kdPhase = 'rise'; this.kdUntilF = this.frame + KD_RISE_FRAMES;
      } else if ((this.kdPhase === 'rise' || this.kdPhase === 'roll') && this.frame >= this.kdUntilF) {
        this.state = 'idle'; this.kdPhase = null; this.vx = 0;
      }
    }
    if (this.state === 'wallsplat' && this.wallStuck && this.frame >= this.splatUntilF) {
      this.wallStuck = false; // start sliding down
      if (this.y <= 0) this.enterDown(techDir); // splatted on the ground: straight to the floor
    }

    // ---- Dash trigger ----
    if (dashRequest && this.canAct()) this.startDash(dashRequest);

    // ---- Flip triggers: jump-while-airborne = front flip, block+jump grounded = backflip ----
    if (inp.jumpEdge) {
      if (this.grounded && inp.block) this.startFlip('back');
      else if (!this.grounded && this.state === 'jump' && !this.airFlipUsed) this.startFlip('front');
      else if (this.grounded && (this.state === 'idle' || this.state === 'walk')) { // not out of hitstun/landing
        this.vy = JUMP_V * (this.ch.stats.jumpMult || 1);
        this.grounded = false;
        this.state = 'jump';
      }
    }

    // Joystick up-up: same rule as jump-then-jump, once per airtime. (main.js used to call
    // startFlip() directly, which allowed endless invincible re-flips mid-flip.)
    if (inp.flipRequest && !this.grounded && this.state === 'jump' && !this.airFlipUsed) this.startFlip('front');

    // ---- Aerial guard ("push guard"): holding Kick while airborne from a jump drops
    // into a defensive stance — incoming hits are mitigated the same way a ground block
    // is (see resolveAttack). A quick tap-and-release still throws the existing aerial
    // kick attack via the kickEdge branch below; only a sustained hold, once the
    // fighter is back to a plain airborne 'jump' state, engages the guard.
    if (!this.grounded && (this.state === 'jump' || this.state === 'aerialGuard')) {
      this.state = inp.kickHeld ? 'aerialGuard' : (this.state === 'aerialGuard' ? 'jump' : this.state);
    }

    // ---- Block (grounded only; covers entering AND releasing block) ----
    const dashing = now < this._dashUntil;
    if (this.grounded && (this.state === 'idle' || this.state === 'walk' || this.state === 'block')) {
      this.state = inp.block ? 'block' : (Math.abs(this.vx) > 12 ? 'walk' : 'idle');
    }

    // ---- Attack input (edge-triggered, with buffering during any active attack) ----
    // BUGFIX: previously only a press landing during 'recovery' got queued into
    // bufferedAttack — a press during 'startup'/'active' (including the very common
    // case of mashing punch and kick on the same frame, where the punch branch below
    // has already flipped state to 'attack' by the time the kick branch runs) was
    // silently dropped instead of queued, making rapid mashing feel unresponsive.
    // Super: full meter, from neutral or guard.
    if (inp.superEdge && this.superReady && this.grounded && (this.canAct() || this.state === 'block')) {
      this.startAttack('super', false);
    }
    // Throw: GUARD + PUNCH on the ground.
    if (inp.punchEdge && this.state === 'block' && this.grounded) { this.startAttack('throw', false); inp = { ...inp, punchEdge: false }; }
    if (inp.punchEdge && this.state !== 'block') {
      if (this.canAct()) this.startAttack('punch', false);
      else if (this.state === 'attack' && !this.bufferedAttack) this.bufferedAttack = 'punch';
    }
    if (inp.kickEdge) {
      if (this.canAct() || this.state === 'block') this.startAttack('kick', false);
      else if (this.state === 'attack' && !this.bufferedAttack) this.bufferedAttack = 'kick';
    }

    // ---- Combo buffer -> Rush special (punch, punch, kick) ----
    if (inp.punchEdge || inp.kickEdge) {
      this.comboBuffer.push({ n: inp.punchEdge ? 'p' : 'k', t: now });
      while (this.comboBuffer.length && now - this.comboBuffer[0].t > 1.2) this.comboBuffer.shift();
      const last3 = this.comboBuffer.slice(-3).map(e => e.n).join('');
      if (last3 === 'ppk' && this.state === 'attack') {
        this.comboBuffer.length = 0;
        // Mashed fast, the 2nd punch may still be queued: keep it, then do the Rush.
        if (this.bufferedAttack === 'punch') this.rushAfter = true;
        else this.bufferedAttack = 'rush';
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
    } else if (this.state === 'knockdown' && this.kdPhase === 'roll') {
      this.vx = this.rollDir * TECH_ROLL_SPEED;
    } else if (!this.grounded && ((this.state === 'knockdown' && this.kdPhase === 'air') || this.state === 'ko')) {
      // ballistic flight: keep the launch velocity (no air control or drag)
    } else if (this.state === 'wallsplat') {
      this.vx = 0;
    } else if (this.state === 'attack' && this.attackType === 'super' && this.attackPhase !== 'recovery') {
      this.vx = this.facing * this.superMove.lunge; // the super lunges forward
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
    const lo = this.arena.min, hi = this.arena.max;
    if (this.x <= lo || this.x >= hi) {
      const side = this.x <= lo ? -1 : 1;
      const intoWall = this.vx * side;
      this.x = side < 0 ? lo : hi;
      const launched = this.state === 'knockdown' && this.kdPhase === 'air';
      const flying = launched || this.state === 'hitstun';
      if (launched && !this.bounceUsed && intoWall >= CROWD_BOUNCE_SPEED) {
        // The crowd catches the fighter and shoves them back into the fight.
        this.bounceUsed = true; this.juggleable = true;
        this.vx = -side * CROWD_BOUNCE_VX / this.weight;
        this.vy = CROWD_BOUNCE_VY / Math.sqrt(this.weight);
        this.pushEvent({ type: 'crowdbounce', x: this.x, y: GROUND_Y - this.y - 45, side });
      } else {
        if (flying && !this.splatUsed && intoWall >= WALL_SPLAT_SPEED) this.startWallSplat(side);
        this.vx = 0;
      }
    }

    // ---- Physics: vertical (gravity) ----
    if (this.state === 'wallsplat' && this.wallStuck) {
      // pinned to the wall: no gravity during the stick
    } else if (this.state === 'wallsplat') {
      this.y = Math.max(0, this.y - WALL_SLIDE_SPEED * dt); // constant slide down the wall
      if (this.y <= 0) { this.grounded = true; this.vy = 0; this.enterDown(techDir); }
    } else if (!this.grounded || this.y > 0 || this.vy !== 0) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0; this.vy = 0;
        if (!this.grounded) this.pushEvent({ type: 'land', x: this.x, y: GROUND_Y });
        this.grounded = true;
        this.airFlipUsed = false;
        if (this.state === 'jump' || this.state === 'aerialGuard') this.state = 'idle';
        if (this.state === 'flip') {
          this.state = 'landing';
          this.landingUntil = now + LANDING_RECOVERY;
        }
        if (this.state === 'knockdown' && this.kdPhase === 'air') this.enterDown(techDir);
      } else {
        this.grounded = false;
      }
    }
    if (this.state === 'landing' && now >= this.landingUntil) this.state = 'idle';

    // ---- Walk vs idle bookkeeping ----
    if (this.grounded && (this.state === 'idle' || this.state === 'walk')) {
      this.state = Math.abs(this.vx) > 12 ? 'walk' : 'idle';
      this.splatUsed = false; // back to neutral: the next combo may splat again
      this.bounceUsed = false; this.juggleable = false;
    }
  }

  // ---------------- Rendering (once per displayed frame) ----------------
  // jitterPx: render-only shake applied to the hit-stop victim (main.js).
  render(dt, jitterPx = 0) {
    const el = this.el, f = this.frame;
    el.classList.toggle('launched', this.state === 'knockdown' && this.kdPhase === 'air');
    el.classList.toggle('downed', this.state === 'knockdown' && this.kdPhase === 'down');
    el.classList.toggle('rolling', this.state === 'knockdown' && this.kdPhase === 'roll');
    el.classList.toggle('wallsplat', this.state === 'wallsplat');
    // Fall backwards, away from the way the fighter is facing; splat leans into the wall.
    el.style.setProperty('--fall', this.facing > 0 ? '-84deg' : '84deg');
    el.style.setProperty('--splatTilt', this.wallSide < 0 ? '-10deg' : '10deg');
    el.classList.toggle('blocking', this.state === 'block' || this.state === 'aerialGuard');
    el.classList.toggle('dashing', f < this.dashFxUntilF);
    el.classList.toggle('hitflash', f < this.hitflashUntilF);
    const wantAtk = f < this.atkClassUntilF ? this.atkClass : null;
    if (wantAtk !== this._renderedAtkCls || this.atkClassSeq !== this._renderedAtkSeq) {
      el.classList.remove(...ALL_ATK_CLASSES);
      if (wantAtk) { void el.offsetWidth; wantAtk.split(' ').forEach(c => el.classList.add(c)); } // reflow restarts the keyframes
      this._renderedAtkCls = wantAtk; this._renderedAtkSeq = this.atkClassSeq;
    }
    if (this.flipSeq !== this._renderedFlipSeq) {
      this._renderedFlipSeq = this.flipSeq;
      const spin = this.rig.flipSpin;
      spin.style.animation = 'none';
      void spin.offsetWidth;
      spin.style.animation = `${this.flipType === 'front' ? 'flipFwd' : 'flipBack'} ${(this.flipType === 'front' ? FLIP_TIME : BACKFLIP_TIME).toFixed(2)}s linear`;
    }
    if (this.rollSeq !== this._renderedRollSeq) {
      this._renderedRollSeq = this.rollSeq;
      const spin = this.rig.flipSpin;
      spin.style.animation = 'none';
      void spin.offsetWidth;
      spin.style.animation = `${this.rollDir === this.facing ? 'flipFwd' : 'flipBack'} ${ROLL_ANIM_TIME}s linear`;
    }
    this._render(dt, jitterPx);
  }

  // ---------------- Rendering ----------------
  _render(dt, jitterPx = 0) {
    const el = this.el, r = this.rig, ch = this.ch, pose = ch.pose;
    const t = this.timeSec;
    el.style.left = this.x + 'px';
    el.style.top = (GROUND_Y - this.y) + 'px';
    if (r.svg) r.svg.style.transform = `scaleX(${this.facing >= 0 ? 1 : -1})`;
    el.classList.toggle('jump', !this.grounded && this.state !== 'flip');
    el.classList.toggle('flipping', this.state === 'flip');
    el.classList.toggle('ko', this.state === 'ko');

    // ---- Whole-body lean: velocity sway + idle weight-shift + a decaying hit-reaction
    // impulse, smoothed, on .leanWrap. The limbs themselves are posed by the puppet. ----
    let lean = -this.vx * 0.045;

    if (this.state === 'idle' || this.state === 'walk') {
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
    // Hit-stop victim shake is layered on the lean. Skip the write when nothing changed.
    const lt = `translateX(${(jitterPx || 0).toFixed(1)}px) rotate(${nextLean.toFixed(2)}deg)`;
    if (r.lean._t !== lt) { r.lean._t = lt; r.lean.style.transform = lt; }

    // Limbs, torso and head: keyed, eased skeletal animation (puppet.js).
    this.puppet.update(dt);

    // Mouth: bare teeth mid-swing / on hit reaction
    const shout = this.state === 'attack' || this.state === 'hitstun';
    if (r.mouthOpen) r.mouthOpen.style.opacity = shout ? '1' : '0';
    if (r.mouthNeutral) r.mouthNeutral.style.opacity = shout ? '0' : '1';
  }
}
