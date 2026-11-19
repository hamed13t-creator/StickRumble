// js/input.js — single-player control scheme: virtual joystick (left/right run) + hold
// guard (block; block+kick = low sweep; block+jump = backflip).
// Handles double-tap-direction dash detection and buffered inputs.
//
// The joystick is HORIZONTAL-ONLY in effect — this game has no vertical ground
// movement, so vertical drag is purely visual feedback for the knob and never reaches
// `input`. Output is still the same binary input.left/input.right the rest of the
// codebase (fighter.js, ai.js) expects — no analog walk/run speed. Adding that would be
// a fighter.js physics change (scaling targetVx by deflection), not an input.js one.
 
export const input = { left: false, right: false, jump: false, punch: false, kick: false, block: false, super: false };
 
// Block can now be held from three independent sources (keyboard, the on-screen GUARD
// button, and the joystick pulled down for the new crouch/guard command) — tracked
// separately and OR'd into input.block so releasing one source doesn't clear a hold
// another source still has active.
const blockSources = { key: false, button: false, joyDown: false, throw: false };
function updateBlock() {
  input.block = blockSources.key || blockSources.button || blockSources.joyDown || blockSources.throw;
}
 
const DASH_WINDOW = 320;
let lastTapDir = null;
let lastTapTime = 0;
export const dashEvents = []; // { dir: 1|-1 } pushed here, consumed by main.js each frame
// Gesture queues are capped so taps made during banners or pause can't pile up and
// fire late; main.js also clears them at every round start (clearInputQueues).
const MAX_QUEUED_GESTURES = 2;
 
function noteDirectionTap(dir) {
  const now = performance.now();
  if (lastTapDir === dir && now - lastTapTime < DASH_WINDOW) {
    if (dashEvents.length < MAX_QUEUED_GESTURES) dashEvents.push({ dir });
    lastTapDir = null; lastTapTime = 0;
  } else {
    lastTapDir = dir; lastTapTime = now;
  }
}
 
// ---- Joystick Up / Down commands: Up = Jump, a second Up within FLIP_DOUBLE_WINDOW =
// Front Flip (mirrors the horizontal double-tap-to-dash pattern above), Down = hold
// Block/Crouch (feeds the same blockSources.joyDown slot as any other block source). ----
const FLIP_DOUBLE_WINDOW = 250;
let lastUpTapTime = 0;
export const flipEvents = []; // { kind: 'front' } pushed on a qualifying Up-Up; consumed by main.js each frame
 
// ---- Input buffering for punch/kick/jump ----
const INPUT_BUFFER_MS = 320; // matched to KO hit-stop freeze duration
const pressStamp = { punch: 0, kick: 0, jump: 0, super: 0 };
 
function stampPress(key) {
  if ((key === 'punch' || key === 'kick' || key === 'jump' || key === 'super') && !input[key]) {
    pressStamp[key] = performance.now();
  }
}
 
function consumeBuffered(key, now) {
  if (pressStamp[key] && now - pressStamp[key] <= INPUT_BUFFER_MS) {
    pressStamp[key] = 0;
    return true;
  }
  return false;
}
 
function vibrate(ms) {
  if (!navigator.vibrate) return;
  try { navigator.vibrate(ms); } catch (_) { /* ignore unsupported */ }
}
 
// ---- Virtual joystick ----
// JOY_MAX_R: how far (px) the knob can travel from center before clamping.
// JOY_DEADZONE: fraction of JOY_MAX_R the thumb must cross before left/right registers,
// so accidental drift near center doesn't trigger movement.
const JOY_MAX_R = 38;
const JOY_DEADZONE = 0.28;
// Vertical deadzones for the new Up (Jump / double-tap Front Flip) and Down (Block/
// Crouch) commands — the joystick was previously horizontal-only.
const JOY_UP_DEADZONE = 0.32;
const JOY_DOWN_DEADZONE = 0.32;
 
let joyDir = null; // null | -1 | 1 — current registered horizontal direction
let joyVert = null; // null | 'up' | 'down' — current registered vertical direction
 
function setJoyDirection(dir) {
  if (dir === joyDir) return;
  if (dir !== null) noteDirectionTap(dir); // same "fresh press" rule keyboard used, so double-flick still dashes
  input.left = dir === -1;
  input.right = dir === 1;
  joyDir = dir;
}
 
function setJoyVert(dir) {
  if (dir === joyVert) return;
  if (dir === 'up') {
    const now = performance.now();
    if (now - lastUpTapTime < FLIP_DOUBLE_WINDOW) {
      // Second Up within the window: a flip supersedes a plain jump, so this
      // deliberately does NOT also stamp a jump edge (avoids double-triggering both
      // this direct flip and the existing "second jump while airborne = flip" path).
      if (flipEvents.length < MAX_QUEUED_GESTURES) flipEvents.push({ kind: 'front' });
      lastUpTapTime = 0;
    } else {
      stampPress('jump'); input.jump = true; // first Up behaves like the Jump button
      lastUpTapTime = now;
    }
  } else if (joyVert === 'up') {
    input.jump = false;
  }
  if (dir === 'down') {
    blockSources.joyDown = true; updateBlock();
  } else if (joyVert === 'down') {
    blockSources.joyDown = false; updateBlock();
  }
  joyVert = dir;
}
 
function initJoystick(root) {
  const wrap = root.querySelector('#joystickWrap');
  const knob = root.querySelector('#joystickKnob');
  if (!wrap || !knob) return;
 
  let originX = 0, originY = 0, active = false;
  const resetKnob = () => { knob.style.transform = 'translate(-50%,-50%)'; };
 
  const onMove = e => {
    if (!active) return;
    e.preventDefault();
    let dx = e.clientX - originX, dy = e.clientY - originY;
    if (inputRotation === 90) { const t = dx; dx = dy; dy = -t; } // layout is rotated 90° clockwise
    const dist = Math.hypot(dx, dy);
    if (dist > JOY_MAX_R) { const s = JOY_MAX_R / dist; dx *= s; dy *= s; }
    // Knob follows the full 2D drag visually...
    knob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px),calc(-50% + ${dy.toFixed(1)}px))`;
    // ...horizontal deflection past its deadzone drives left/right + dash, vertical
    // deflection past its own deadzone drives Jump/Flip (up) and Block/Crouch (down).
    const deadR = JOY_MAX_R * JOY_DEADZONE;
    if (dx <= -deadR) setJoyDirection(-1);
    else if (dx >= deadR) setJoyDirection(1);
    else setJoyDirection(null);
 
    const upDeadR = JOY_MAX_R * JOY_UP_DEADZONE;
    const downDeadR = JOY_MAX_R * JOY_DOWN_DEADZONE;
    if (dy <= -upDeadR) setJoyVert('up');
    else if (dy >= downDeadR) setJoyVert('down');
    else setJoyVert(null);
  };
 
  wrap.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
    const rect = wrap.getBoundingClientRect();
    originX = rect.left + rect.width / 2;
    originY = rect.top + rect.height / 2;
    active = true;
    wrap.classList.add('active');
    onMove(e);
  });
  const release = () => {
    active = false;
    wrap.classList.remove('active');
    resetKnob();
    setJoyDirection(null);
    setJoyVert(null);
  };
  wrap.addEventListener('pointermove', onMove);
  wrap.addEventListener('pointerup', release);
  wrap.addEventListener('pointercancel', release);
  wrap.addEventListener('lostpointercapture', release);
}
 
// When main.js rotates the fight layout to force landscape, screen-space drags must be
// turned back into game-space directions.
let inputRotation = 0;
export function setInputRotation(deg) { inputRotation = deg; }

// THROW = GUARD + PUNCH in one press.
function pressThrow(down) {
  blockSources.throw = down; updateBlock();
  if (down) { stampPress('punch'); input.punch = true; } else input.punch = false;
}

// Impact haptics: main.js scales the vibration length by hit tier.
export function haptic(ms) { vibrate(Math.max(1, Math.round(ms))); }

export function initInput(root) {
  // ---- Keyboard ----
  const downMap = {
    'ArrowLeft': 'left', 'a': 'left', 'A': 'left',
    'ArrowRight': 'right', 'd': 'right', 'D': 'right',
    'ArrowUp': 'jump', 'w': 'jump', 'W': 'jump', ' ': 'jump',
    'j': 'punch', 'J': 'punch', 'z': 'punch', 'Z': 'punch',
    'k': 'kick', 'K': 'kick', 'x': 'kick', 'X': 'kick',
    'o': 'throw', 'O': 'throw',
    'u': 'super', 'U': 'super', 'i': 'super', 'I': 'super', 'c': 'super', 'C': 'super',
    'l': 'block', 'L': 'block', 'ArrowDown': 'block', 's': 'block', 'S': 'block'
  };
  const wasDown = { left: false, right: false };
 
  document.addEventListener('keydown', e => {
    if (e.repeat) return; // ignore OS auto-repeat — stampPress/preventDefault already no-op'd here, this just skips the unnecessary work
    const key = downMap[e.key];
    if (!key) return;
    e.preventDefault();
    if ((key === 'left' || key === 'right') && !wasDown[key]) noteDirectionTap(key === 'left' ? -1 : 1);
    if (key === 'left' || key === 'right') wasDown[key] = true;
    if (key === 'block') { blockSources.key = true; updateBlock(); return; }
    if (key === 'throw') { pressThrow(true); return; }
    stampPress(key);
    input[key] = true;
  });
 
  document.addEventListener('keyup', e => {
    const key = downMap[e.key];
    if (!key) return;
    if (key === 'block') { blockSources.key = false; updateBlock(); return; }
    if (key === 'throw') { pressThrow(false); return; }
    input[key] = false;
    if (key === 'left' || key === 'right') wasDown[key] = false;
  });
 
  // Losing window focus mid-hold (alt-tab, opening devtools) previously left keys
  // stuck "down" forever since no keyup ever fires — main.js auto-pauses on
  // visibilitychange, but this clears the raw state too so nothing is stuck once resumed.
  window.addEventListener('blur', () => {
    input.left = input.right = input.jump = input.punch = input.kick = input.block = input.super = false;
    wasDown.left = wasDown.right = false;
    joyDir = null; joyVert = null;
    blockSources.key = blockSources.button = blockSources.joyDown = blockSources.throw = false;
  });
 
  // ---- Touch/mouse: virtual joystick ----
  initJoystick(root);
 
  // ---- Touch/mouse: action buttons ----
  root.querySelectorAll('[data-key]').forEach(btn => {
    const key = btn.dataset.key;
    const on = e => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      if (key === 'block') { blockSources.button = true; updateBlock(); }
      else if (key === 'throw') pressThrow(true);
      else { stampPress(key); input[key] = true; }
      vibrate(key === 'punch' || key === 'kick' || key === 'super' ? 12 : 8);
    };
    const off = e => {
      e.preventDefault();
      if (key === 'block') { blockSources.button = false; updateBlock(); }
      else if (key === 'throw') pressThrow(false);
      else input[key] = false;
    };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('lostpointercapture', off);
  });
}
 
// ---- Buffered-edge helper ----
export function edgesFrom(prev) {
  const now = performance.now();
  const e = {
    punch: consumeBuffered('punch', now),
    kick: consumeBuffered('kick', now),
    jump: consumeBuffered('jump', now),
    super: consumeBuffered('super', now),
    block: input.block && !prev.block
  };
  Object.assign(prev, input);
  return e;
}
 
export function consumeDash() {
  return dashEvents.shift() || null;
}
 
export function consumeFlip() {
  return flipEvents.shift() || null;
}

// Drop queued gestures and stale button presses (called at each round start).
export function clearInputQueues() {
  dashEvents.length = 0;
  flipEvents.length = 0;
  pressStamp.punch = pressStamp.kick = pressStamp.jump = pressStamp.super = 0;
}
 
