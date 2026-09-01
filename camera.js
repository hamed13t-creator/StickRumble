// js/camera.js — Tekken/Street Fighter style camera: pans to the midpoint of the two
// fighters, zooms out as they separate and in as they close, and applies a decaying
// "trauma" screen shake on impacts instead of one-shot offsets.
import { WORLD_W, GROUND_Y, STAGE_W } from './world.js';

const MIN_VIEW = 340;   // tightest zoom (virtual units visible across the stage width)
const MAX_VIEW = 640;   // widest zoom
const ZOOM_LERP = 0.09; // camera smoothing

export class Camera {
  constructor(worldEl) {
    this.worldEl = worldEl;
    this.centerX = WORLD_W / 2;
    this.viewW = MAX_VIEW;
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
  }

  shake(magnitude) {
    this.trauma = Math.min(1, this.trauma + magnitude);
  }

  update(fighterA, fighterB, dt) {
    const midX = (fighterA.x + fighterB.x) / 2;
    const dist = Math.abs(fighterA.x - fighterB.x);
    const targetView = Math.max(MIN_VIEW, Math.min(MAX_VIEW, dist * 1.9 + 220));
    this.viewW += (targetView - this.viewW) * ZOOM_LERP;

    const halfView = this.viewW / 2;
    const clampedMid = Math.max(halfView, Math.min(WORLD_W - halfView, midX));
    this.centerX += (clampedMid - this.centerX) * 0.16;

    // Trauma decays each frame; shake offset scales with trauma^2 so small hits barely
    // register and big hits punch hard, per the classic screen-shake technique.
    this.trauma = Math.max(0, this.trauma - dt * 2.6);
    const shakeAmt = this.trauma * this.trauma;
    this.shakeX = (Math.random() * 2 - 1) * 14 * shakeAmt;
    this.shakeY = (Math.random() * 2 - 1) * 8 * shakeAmt;
  }

  getZoom() { return STAGE_W / this.viewW; }

  applyTransform() {
    const zoom = this.getZoom();
    const e = STAGE_W / 2 - this.centerX * zoom + this.shakeX;
    const f = GROUND_Y * (1 - zoom) + this.shakeY;
    this.worldEl.style.transform = `matrix(${zoom},0,0,${zoom},${e.toFixed(2)},${f.toFixed(2)})`;
    return zoom;
  }
}
