// js/ai.js — CPU brain. Reads Fighter state and produces input decisions.
// Difficulty tiers define numeric behavior differences: reaction delay, guard reliability,
// spacing, mistake rate, and combo eagerness.
//
// Runs inside the fixed-step simulation: timing is in sim frames and all randomness comes
// from the match's seeded rng, so a CPU match is fully reproducible.
import { SIM_HZ } from './world.js';

const TIERS = {
  easy: {
    reactionMs: [420, 620], blockChance: 0.28, punishChance: 0.15,
    preferredGap: [70, 110], aggression: 0.35, mistakeRate: 0.30,
    comboChance: 0.25, dashChance: 0.10, spacingSkill: 0.3, techChance: 0.1
  },
  medium: {
    reactionMs: [260, 400], blockChance: 0.5, punishChance: 0.4,
    preferredGap: [55, 90], aggression: 0.55, mistakeRate: 0.15,
    comboChance: 0.5, dashChance: 0.22, spacingSkill: 0.6, techChance: 0.35
  },
  hard: {
    reactionMs: [110, 210], blockChance: 0.74, punishChance: 0.7,
    preferredGap: [45, 80], aggression: 0.75, mistakeRate: 0.04,
    comboChance: 0.8, dashChance: 0.35, spacingSkill: 0.9, techChance: 0.7
  }
};

const GAP_TOLERANCE = 18;  // px either side of the preferred gap that counts as "in range"
const REFLEX_RANGE = 130;  // px within which the CPU reacts to a telegraphed attack

export class AI {
  constructor(difficulty = 'medium') {
    this.tier = TIERS[difficulty] || TIERS.medium;
    this.decision = { left: false, right: false, jump: false, punch: false, kick: false, block: false };
    this.reset();
  }

  setDifficulty(difficulty) {
    this.tier = TIERS[difficulty] || TIERS.medium;
  }

  // Called at every match start and round intro. Previously nothing reset the decision
  // clock, so after a long match the CPU stood still for most of the rematch.
  reset() {
    this.nextDecisionFrame = 0;
    this.moveDir = 0;       // held movement: -1 | 0 | 1, kept until the next decision
    this.moveGoal = 0;      // 'in' | 'out' | 0: stop early once the preferred gap is reached
    this.targetGap = 0;
    this.dashDir = 0;
    this.guardHeld = false;
    this.lastRolledAttack = -1;
    this.techForKnockdown = -1; this.techDir = 0;
  }

  decide(self, opp, frame, rng) {
    const d = this.decision;
    const t = this.tier;
    // One-shot actions last a single frame; held movement and guard persist.
    this.dashDir = 0;
    d.jump = false; d.punch = false; d.kick = false; d.block = false;

    const dist = Math.abs(self.x - opp.x);
    const facing = self.x < opp.x ? 1 : -1;

    // Reflex guard: roll ONCE per opponent attack, then hold the guard until that attack
    // reaches recovery. It used to re-roll every frame, which made the guard flicker.
    const oppAttacking = opp.state === 'attack';
    if (oppAttacking && opp.attackPhase === 'startup' && opp.attackStartFrame !== this.lastRolledAttack) {
      this.lastRolledAttack = opp.attackStartFrame;
      this.guardHeld = dist < REFLEX_RANGE && rng.next() < t.blockChance;
    }
    if (!oppAttacking || opp.attackPhase === 'recovery') this.guardHeld = false;

    // Knocked down: decide once per knockdown whether to tech-roll on landing (the
    // fighter rolls if a direction is held as it lands). Rolls away from the opponent,
    // unless that would roll into the arena edge.
    if (self.state === 'knockdown' && self.kdPhase === 'air') {
      if (self.kdStartFrame !== this.techForKnockdown) {
        this.techForKnockdown = self.kdStartFrame;
        const away = self.x < opp.x ? -1 : 1;
        const room = away < 0 ? self.x - self.arena.min : self.arena.max - self.x;
        this.techDir = rng.next() < t.techChance ? (room > 160 ? away : -away) : 0;
      }
      this.moveDir = 0;
      d.left = this.techDir === -1; d.right = this.techDir === 1;
      return d;
    }
    if (self.state === 'hitstun' || self.state === 'knockdown' || self.state === 'wallsplat' || self.state === 'ko') {
      this.moveDir = 0;
      d.left = false; d.right = false;
      return d; // ride out stun
    }

    // Held movement stops early once the goal gap is reached, so it doesn't overshoot.
    if (this.moveGoal === 'in' && dist <= this.targetGap) this.moveDir = 0;
    if (this.moveGoal === 'out' && dist >= this.targetGap) this.moveDir = 0;

    if (frame >= this.nextDecisionFrame) this._strategic(self, opp, dist, facing, frame, rng);

    d.left = this.moveDir === -1;
    d.right = this.moveDir === 1;
    if (this.guardHeld) d.block = true;
    return d;
  }

  _strategic(self, opp, dist, facing, frame, rng) {
    const d = this.decision;
    const t = this.tier;
    const [rMin, rMax] = t.reactionMs;
    this.nextDecisionFrame = frame + Math.max(1, Math.round(rng.range(rMin, rMax) * SIM_HZ / 1000));

    const [gMin, gMax] = t.preferredGap;
    const preferredGap = rng.range(gMin, gMax);
    const mistake = rng.next() < t.mistakeRate;
    const canAct = self.state === 'idle' || self.state === 'walk';

    // Spacing: choose a held direction for the coming decision window.
    this.moveDir = 0; this.moveGoal = 0;
    if (Math.abs(dist - preferredGap) > GAP_TOLERANCE && !mistake) {
      const moveIn = dist > preferredGap;
      this.moveDir = moveIn ? facing : -facing;
      this.moveGoal = moveIn ? 'in' : 'out';
      this.targetGap = preferredGap;
      if (t.spacingSkill > 0.5 && moveIn && rng.next() < t.dashChance) this.dashDir = facing;
    } else if (mistake && rng.next() < 0.5) {
      // whiff a random approach/retreat for this window
      this.moveDir = rng.next() < 0.5 ? 1 : -1;
    }

    // Attack choices
    if (canAct && dist <= preferredGap + 25) {
      const roll = rng.next();
      if (roll < t.aggression * 0.5) {
        d.punch = true;
      } else if (roll < t.aggression) {
        d.kick = true;
        if (rng.next() < 0.2) d.block = true; // low sweep via block+kick
      } else if (rng.next() < 0.08) {
        d.jump = true;
      }
    }

    // Punish whiffed/recovering attacks
    if (canAct && opp.state === 'attack' && opp.attackPhase === 'recovery' && dist < 100) {
      if (rng.next() < t.punishChance) {
        d.punch = rng.next() < 0.5;
        d.kick = !d.punch;
      }
    }

    // Combo follow-up
    if (canAct && self.comboCount > 0 && rng.next() < t.comboChance && dist < preferredGap + 15) {
      d.kick = rng.next() < 0.6;
      d.punch = !d.kick;
    }

    // Committing to an attack ends this window's walk.
    if (d.punch || d.kick) { this.moveDir = 0; this.moveGoal = 0; }
  }
}
