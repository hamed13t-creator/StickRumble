// js/input.js — single-player control scheme: virtual joystick (left/right run) + hold
// guard (block; block+kick = low sweep; block+jump = backflip).
// Handles double-tap-direction dash detection and buffered inputs.
//
// The joystick is HORIZONTAL-ONLY in effect — this game has no vertical ground
// movement, so vertical drag is purely visual feedback for the knob and never reaches
// `input`. Output is still the same binary input.left/input.right the rest of the
// codebase (fighter.js, ai.js) expects — no analog walk/run speed. Adding that would be
// a fighter.js physics change (scaling targetVx by deflection), not an input.js one.

export const input = { left: false, right: false, jump: false, punch: false, kick: false, block: false };

// Block can now be held from three independent sources (keyboard, the on-screen GUARD
// button, and the joystick pulled down for the new crouch/guard command) — tracked
// separately and OR'd into input.block so releasing one source doesn't clear a hold
// another source still has active.
const blockSources = { key: false, button: false, joyDown: false };
function updateBlock() {
  input.block = blockSources.key || blockSources.button || blockSources.joyDown;
}

const DASH_WINDOW = 320;
let lastTapDir = null;
let lastTapTime = 0;
export const dashEvents = []; // { dir: 1|-1 } pushed here, consumed by main.js each frame

function noteDirectionTap(dir) {
  const now = performance.now();
  if (lastTapDir === dir && now - lastTapTime < DASH_WINDOW) {
    dashEvents.push({ dir });
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
const pressStamp = { punch: 0, kick: 0, jump: 0 };

function stampPress(key) {
  if ((key === 'punch' || key === 'kick' || key === 'jump') && !input[key]) {
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
      flipEvents.push({ kind: 'front' });
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

export function initInput(root) {
  // ---- Keyboard ----
  const downMap = {
    'ArrowLeft': 'left', 'a': 'left', 'A': 'left',
    'ArrowRight': 'right', 'd': 'right', 'D': 'right',
    'ArrowUp': 'jump', 'w': 'jump', 'W': 'jump', ' ': 'jump',
    'j': 'punch', 'J': 'punch', 'z': 'punch', 'Z': 'punch',
    'k': 'kick', 'K': 'kick', 'x': 'kick', 'X': 'kick',
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
    stampPress(key);
    input[key] = true;
  });

  document.addEventListener('keyup', e => {
    const key = downMap[e.key];
    if (!key) return;
    if (key === 'block') { blockSources.key = false; updateBlock(); return; }
    input[key] = false;
    if (key === 'left' || key === 'right') wasDown[key] = false;
  });

  // Losing window focus mid-hold (alt-tab, opening devtools) previously left keys
  // stuck "down" forever since no keyup ever fires — main.js auto-pauses on
  // visibilitychange, but this clears the raw state too so nothing is stuck once resumed.
  window.addEventListener('blur', () => {
    input.left = input.right = input.jump = input.punch = input.kick = input.block = false;
    wasDown.left = wasDown.right = false;
    joyDir = null; joyVert = null;
    blockSources.key = blockSources.button = blockSources.joyDown = false;
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
      else { stampPress(key); input[key] = true; }
      vibrate(key === 'punch' || key === 'kick' ? 12 : 8);
    };
    const off = e => {
      e.preventDefault();
      if (key === 'block') { blockSources.button = false; updateBlock(); }
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
