// js/ai.js — CPU brain. Reads Fighter state and produces input decisions.
// Difficulty tiers define numeric behavior differences: reaction delay, guard reliability,
// spacing, mistake rate, and combo eagerness.

const TIERS = {
  easy: {
    reactionMs: [420, 620], blockChance: 0.28, punishChance: 0.15,
    preferredGap: [70, 110], aggression: 0.35, mistakeRate: 0.30,
    comboChance: 0.25, dashChance: 0.10, spacingSkill: 0.3
  },
  medium: {
    reactionMs: [260, 400], blockChance: 0.5, punishChance: 0.4,
    preferredGap: [55, 90], aggression: 0.55, mistakeRate: 0.15,
    comboChance: 0.5, dashChance: 0.22, spacingSkill: 0.6
  },
  hard: {
    reactionMs: [110, 210], blockChance: 0.74, punishChance: 0.7,
    preferredGap: [45, 80], aggression: 0.75, mistakeRate: 0.04,
    comboChance: 0.8, dashChance: 0.35, spacingSkill: 0.9
  }
};

export class AI {
  constructor(difficulty = 'medium') {
    this.tier = TIERS[difficulty] || TIERS.medium;
    this.nextDecisionAt = 0;
    this.decision = { left: false, right: false, jump: false, punch: false, kick: false, block: false };
    this.dashDir = 0;
    this.holdUntil = 0;
  }

  setDifficulty(difficulty) {
    this.tier = TIERS[difficulty] || TIERS.medium;
  }

  decide(self, opp, now) {
    this.dashDir = 0;

    // Reset all action flags each tick to prevent sticky inputs
    this.decision.left = false;
    this.decision.right = false;
    this.decision.jump = false;
    this.decision.punch = false;
    this.decision.kick = false;
    this.decision.block = false;

    const t = this.tier;
    const dist = Math.abs(self.x - opp.x);

    // Reflex layer: block against telegraphed attacks
    const oppTelegraphing = opp.state === 'attack' && opp.attackPhase === 'startup';
    if (oppTelegraphing && dist < 130 && Math.random() < t.blockChance) {
      this.decision.block = true;
    }

    // Throttle strategic decisions
    if (now < this.nextDecisionAt) return this.decision;
    const [rMin, rMax] = t.reactionMs;
    this.nextDecisionAt = now + (rMin + Math.random() * (rMax - rMin)) / 1000;

    const facing = self.x < opp.x ? 1 : -1;
    const [gMin, gMax] = t.preferredGap;
    const preferredGap = gMin + Math.random() * (gMax - gMin);

    const mistake = Math.random() < t.mistakeRate;
    const canAct = self.state === 'idle' || self.state === 'walk';

    if (self.state === 'hitstun' || self.state === 'knockdown') {
      return this.decision; // ride out stun
    }

    // Spacing logic
    if (Math.abs(dist - preferredGap) > 18 && !mistake) {
      const moveIn = dist > preferredGap;
      const dir = moveIn ? facing : -facing;
      if (dir === 1) this.decision.right = true; else this.decision.left = true;
      if (t.spacingSkill > 0.5 && Math.random() < t.dashChance && moveIn) this.dashDir = facing;
    } else if (mistake && Math.random() < 0.5) {
      // whiff a random approach/retreat
      if (Math.random() < 0.5) this.decision.right = true; else this.decision.left = true;
    }

    // Attack choices
    if (canAct && dist <= preferredGap + 25) {
      const roll = Math.random();
      if (roll < t.aggression * 0.5) {
        this.decision.punch = true;
      } else if (roll < t.aggression) {
        this.decision.kick = true;
        if (Math.random() < 0.2) this.decision.block = true; // low sweep via block+kick
      } else if (Math.random() < 0.08) {
        this.decision.jump = true;
      }
    }

    // Punish whiffed/recovering attacks
    if (canAct && opp.state === 'attack' && opp.attackPhase === 'recovery' && dist < 100) {
      if (Math.random() < t.punishChance) {
        this.decision.punch = Math.random() < 0.5;
        this.decision.kick = !this.decision.punch;
      }
    }

    // Combo follow-up
    if (canAct && self.comboCount > 0 && Math.random() < t.comboChance && dist < preferredGap + 15) {
      this.decision.kick = Math.random() < 0.6;
      this.decision.punch = !this.decision.kick;
    }

    return this.decision;
  }
}
