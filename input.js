// js/input.js — single-player control scheme: left/right run, jump, punch, kick,
// hold block (crouch-block; block+kick = low sweep; block+jump = backflip). Works via
// keyboard or the on-screen touch cluster. Handles double-tap-direction dash detection
// here so main.js/fighter.js just read plain booleans + a one-shot dash event queue.
export const input = { left: false, right: false, jump: false, punch: false, kick: false, block: false };

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
    const key = downMap[e.key];
    if (!key) return;
    e.preventDefault();
    if ((key === 'left' || key === 'right') && !wasDown[key]) noteDirectionTap(key === 'left' ? -1 : 1);
    if (key === 'left' || key === 'right') wasDown[key] = true;
    input[key] = true;
  });
  document.addEventListener('keyup', e => {
    const key = downMap[e.key];
    if (!key) return;
    input[key] = false;
    if (key === 'left' || key === 'right') wasDown[key] = false;
  });

  // ---- Touch: directional pad ----
  const dpadLeft = root.querySelector('[data-ctrl="left"]');
  const dpadRight = root.querySelector('[data-ctrl="right"]');
  [[dpadLeft, 'left', -1], [dpadRight, 'right', 1]].forEach(([el, key, dir]) => {
    if (!el) return;
    const on = e => { e.preventDefault(); if (!input[key]) noteDirectionTap(dir); input[key] = true; };
    const off = e => { e.preventDefault(); input[key] = false; };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  });

  // ---- Touch: action buttons ----
  root.querySelectorAll('[data-key]').forEach(btn => {
    const key = btn.dataset.key;
    const on = e => { e.preventDefault(); input[key] = true; };
    const off = e => { e.preventDefault(); input[key] = false; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  });
}

// Rising-edge helper: pass the previous frame's snapshot, get back which of
// punch/kick/jump/block just went from false->true this frame.
export function edgesFrom(prev) {
  const e = {
    punch: input.punch && !prev.punch,
    kick: input.kick && !prev.kick,
    jump: input.jump && !prev.jump,
    block: input.block && !prev.block
  };
  prev.punch = input.punch; prev.kick = input.kick; prev.jump = input.jump; prev.block = input.block;
  return e;
}

export function consumeDash() {
  return dashEvents.shift() || null;
}
