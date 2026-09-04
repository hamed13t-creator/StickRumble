// js/camera.js — Tekken/Street Fighter style camera: pans to the midpoint of the two
// fighters, zooms out as they separate and in as they close, and applies a decaying
// "trauma" screen shake on impacts instead of one-shot offsets.
import { WORLD_W, GROUND_Y, STAGE_W } from './world.js';

const MIN_VIEW = 340;     // tightest zoom (virtual units visible across the stage width)
const MAX_VIEW = 640;     // widest zoom
const START_VIEW = MAX_VIEW; // view width at the top of a round, before fighters separate

// Smoothing rates are "per-second" exponential decay constants rather than flat
// per-frame factors, so camera feel stays consistent across refresh rates — a 120Hz
// phone previously smoothed roughly twice as fast per second as a 60Hz one.
const ZOOM_RATE = 6.0;   // higher = snappier zoom response
const PAN_RATE = 10.5;   // higher = snappier horizontal tracking
const TRAUMA_DECAY = 2.6; // trauma units/sec

const SHAKE_X = 14, SHAKE_Y = 8;
const PUNCH_ZOOM = 46;             // max transient zoom-in (viewW reduction) from a big hit
const PUNCH_ZOOM_ATTACK = 30;    // snaps in fast on impact
const PUNCH_ZOOM_RELEASE = 7;    // eases back out more slowly, riding the shake's decay

function smoothing(rate, dt) {
  // Exponential smoothing factor equivalent to the old fixed per-frame lerp, but
  // framerate-independent: converges to the same result whether dt is 1/60 or 1/240.
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
    this._shakeT = 0;   // running clock feeding the shake noise
    this.punchZoom = 0; // transient zoom-in kick, layered on top of the distance zoom
  }

  // Resets the camera to its round-start framing. Centralized here (rather than main.js
  // reaching into centerX/viewW/trauma directly) so "start of round" camera state only
  // has to be correct in one place.
  reset() {
    this.centerX = WORLD_W / 2;
    this.viewW = START_VIEW;
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.punchZoom = 0;
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

    // Trauma decays each frame; shake/punch-in scale with trauma^2 so small taps barely
    // register and big hits punch hard, per the classic screen-shake technique.
    this.trauma = Math.max(0, this.trauma - dt * TRAUMA_DECAY);
    const shakeAmt = this.trauma * this.trauma;

    // Smoothed-noise shake instead of a fresh random offset every frame: raw per-frame
    // randomness reads as high-frequency jitter, while sampling a slow sine field feels
    // like the camera is physically rattling from the impact.
    this._shakeT += dt;
    const nx = Math.sin(this._shakeT * 37.1) * 0.6 + Math.sin(this._shakeT * 19.7 + 1.7) * 0.4;
    const ny = Math.sin(this._shakeT * 41.3 + 2.9) * 0.6 + Math.sin(this._shakeT * 23.4 + 0.4) * 0.4;
    this.shakeX = nx * SHAKE_X * shakeAmt;
    this.shakeY = ny * SHAKE_Y * shakeAmt;

    // Transient punch-in: big hits pull the view tighter for an instant, on top of the
    // normal distance-based zoom, then ease back out — extra weight on heavy hits
    // without main.js needing a second call site beyond the existing shake().
    const punchTarget = shakeAmt * PUNCH_ZOOM;
    const punchRate = punchTarget > this.punchZoom ? PUNCH_ZOOM_ATTACK : PUNCH_ZOOM_RELEASE;
    this.punchZoom += (punchTarget - this.punchZoom) * smoothing(punchRate, dt);
  }

  getZoom() { return STAGE_W / Math.max(60, this.viewW - this.punchZoom); }

  applyTransform() {
    const zoom = this.getZoom();
    const e = STAGE_W / 2 - this.centerX * zoom + this.shakeX;
    const f = GROUND_Y * (1 - zoom) + this.shakeY;
    this.worldEl.style.transform = `matrix(${zoom},0,0,${zoom},${e.toFixed(2)},${f.toFixed(2)})`;
    return zoom;
  }
}
