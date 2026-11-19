// js/camera.js — Tekken/Street Fighter style camera: pans to midpoint, zooms with distance,
// and applies trauma-based shake with transient punch zoom.
//
// Render-only: nothing here feeds back into the simulation, so it can use real elapsed
// time and differ per device without affecting the match.
import { WORLD_W, GROUND_Y, STAGE_W } from './world.js';

const MIN_VIEW = 340;
const MAX_VIEW = 640;
const START_VIEW = MAX_VIEW;

const ZOOM_RATE = 6.0;
const PAN_RATE = 10.5;
const TRAUMA_DECAY = 2.6;

const SHAKE_X = 14, SHAKE_Y = 8;
const PUNCH_ZOOM = 46;
const PUNCH_ZOOM_ATTACK = 30;
const PUNCH_ZOOM_RELEASE = 7;
// Directional kick: a spring-loaded offset along the hit direction, plus a brief pull of
// the framing toward the impact point.
const KICK_STIFFNESS = 520, KICK_DAMPING = 30; // slightly under-damped: one small overshoot
const FOCUS_PULL = 0.18, FOCUS_RELEASE = 9;

function smoothing(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

export class Camera {
  constructor(worldEl) {
    this.worldEl = worldEl;
    this.centerX = WORLD_W / 2;
    this.viewW = START_VIEW;
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this._shakeT = 0;
    this.punchZoom = 0;
    this._shakeSeed = Math.random() * 10; // ✅ varied shake pattern per round
    this.kickX = 0; this.kickV = 0;      // directional recoil offset (screen px) and its velocity
    this.focusX = 0;                     // world-px pull of the framing toward the last impact
    this.motionScale = 1;                // 0.5 under prefers-reduced-motion
  }

  setMotionScale(s) { this.motionScale = s; }

  reset() {
    this.centerX = WORLD_W / 2;
    this.viewW = START_VIEW;
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.punchZoom = 0;
    this._shakeT = 0;
    this._shakeSeed = Math.random() * 10;
    this.kickX = 0; this.kickV = 0; this.focusX = 0;
  }

  shake(magnitude) {
    this.trauma = Math.min(1, this.trauma + magnitude * this.motionScale);
  }

  // Hit recoil: shove the view along the hit direction (dirX = +1 / -1) and pull the
  // framing toward the impact. px: 6 (jab) to 18 (KO).
  impact(worldX, dirX, px) {
    this.kickV += dirX * px * 88 * this.motionScale; // peak offset ≈ px
    this.focusX = (worldX - this.centerX) * FOCUS_PULL * this.motionScale;
  }

  update(fighterA, fighterB, dt = 0.016) {
    if (!fighterA || !fighterB) return;

    const midX = (fighterA.x + fighterB.x) / 2;
    const dist = Math.abs(fighterA.x - fighterB.x);
    const targetView = Math.max(MIN_VIEW, Math.min(MAX_VIEW, dist * 1.9 + 220));
    this.viewW += (targetView - this.viewW) * smoothing(ZOOM_RATE, dt);

    const halfView = this.viewW / 2;
    const clampedMid = Math.max(halfView, Math.min(WORLD_W - halfView, midX + this.focusX));
    this.focusX *= 1 - smoothing(FOCUS_RELEASE, dt);
    // Spring back to centre (semi-implicit Euler; dt is a display frame, clamped).
    const sdt = Math.min(dt, 1 / 30);
    this.kickV += (-KICK_STIFFNESS * this.kickX - KICK_DAMPING * this.kickV) * sdt;
    this.kickX += this.kickV * sdt;
    this.centerX += (clampedMid - this.centerX) * smoothing(PAN_RATE, dt);

    this.trauma = Math.max(0, this.trauma - dt * TRAUMA_DECAY);
    const shakeAmt = this.trauma * this.trauma;

    this._shakeT += dt;
    const nx = Math.sin(this._shakeT * 37.1 + this._shakeSeed) * 0.6 +
               Math.sin(this._shakeT * 19.7 + 1.7 + this._shakeSeed) * 0.4;
    const ny = Math.sin(this._shakeT * 41.3 + 2.9 + this._shakeSeed) * 0.6 +
               Math.sin(this._shakeT * 23.4 + 0.4 + this._shakeSeed) * 0.4;
    this.shakeX = nx * SHAKE_X * shakeAmt;
    this.shakeY = ny * SHAKE_Y * shakeAmt;

    const punchTarget = shakeAmt * PUNCH_ZOOM;
    const punchRate = punchTarget > this.punchZoom
      ? PUNCH_ZOOM_ATTACK
      : PUNCH_ZOOM_RELEASE + this.trauma * 5; // ✅ synced to trauma decay
    this.punchZoom += (punchTarget - this.punchZoom) * smoothing(punchRate, dt);
  }

  getZoom() {
    const effectiveView = Math.max(60, this.viewW - this.punchZoom); // ✅ safe clamp
    return STAGE_W / effectiveView;
  }

  applyTransform() {
    const zoom = this.getZoom();
    const e = STAGE_W / 2 - this.centerX * zoom + this.shakeX + this.kickX;
    const f = GROUND_Y * (1 - zoom) + this.shakeY;
    this.worldEl.style.transform = `matrix(${zoom},0,0,${zoom},${e.toFixed(2)},${f.toFixed(2)})`;
    return zoom;
  }
}
