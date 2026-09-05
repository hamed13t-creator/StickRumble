// js/camera.js — Tekken/Street Fighter style camera: pans to midpoint, zooms with distance,
// and applies trauma-based shake with transient punch zoom.
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
  }

  reset() {
    this.centerX = WORLD_W / 2;
    this.viewW = START_VIEW;
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.punchZoom = 0;
    this._shakeT = 0;
    this._shakeSeed = Math.random() * 10;
  }

  shake(magnitude) {
    this.trauma = Math.min(1, this.trauma + magnitude);
  }

  update(fighterA, fighterB, dt = 0.016) {
    if (!fighterA || !fighterB) return;

    const midX = (fighterA.x + fighterB.x) / 2;
    const dist = Math.abs(fighterA.x - fighterB.x);
    const targetView = Math.max(MIN_VIEW, Math.min(MAX_VIEW, dist * 1.9 + 220));
    this.viewW += (targetView - this.viewW) * smoothing(ZOOM_RATE, dt);

    const halfView = this.viewW / 2;
    const clampedMid = Math.max(halfView, Math.min(WORLD_W - halfView, midX));
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
    const e = STAGE_W / 2 - this.centerX * zoom + this.shakeX;
    const f = GROUND_Y * (1 - zoom) + this.shakeY;
    this.worldEl.style.transform = `matrix(${zoom},0,0,${zoom},${e.toFixed(2)},${f.toFixed(2)})`;
    return zoom;
  }
}
