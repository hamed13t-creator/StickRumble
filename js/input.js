// js/input.js — single-player control scheme: left/right run, jump, punch, kick,
// hold block (crouch-block; block+kick = low sweep; block+jump = backflip). Works via
// keyboard or the on-screen touch cluster. Handles double-tap-direction dash detection
// here so main.js/fighter.js just read plain booleans + a one-shot dash event queue.
//
// v2: buffered attack inputs + drift-proof touch buttons + light haptics.
// - Buffering: punch/kick/jump presses are stamped the instant the raw event fires
//   (not on the next game-loop poll), then consumed by edgesFrom() within a short
//   grace window. This matters because main.js skips polling player input entirely
//   while hit-stop is active (up to ~320ms on a KO) — without buffering, a quick tap
//   made during that freeze is pressed AND released before anyone ever checks it, so
//   the input silently vanishes. Buffering means it still registers the instant the
//   fighter can act again.
// - Touch capture: on-screen buttons use setPointerCapture so a thumb drifting off a
//   small button mid-fight no longer cancels the press (previously pointerleave did).
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

// ---- Input buffering for punch/kick/jump ----
// pressStamp[key] holds the performance.now() of the most recent *unconsumed* press.
// Stamped at the moment of the raw down-event (so it's captured even on frames the
// game loop never polls), and cleared to 0 once edgesFrom() consumes it — so one
// physical press still only ever yields one edge, just a more forgiving one.
const INPUT_BUFFER_MS = 150;
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
  try { navigator.vibrate(ms); } catch (_) { /* unsupported / blocked, ignore */ }
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
    stampPress(key); // no-op unless this is a genuine press->hold transition
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
    const on = e => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      if (!input[key]) noteDirectionTap(dir);
      input[key] = true;
    };
    const off = e => { e.preventDefault(); input[key] = false; };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off); // backstop if capture is lost mid-hold
  });

  // ---- Touch: action buttons ----
  root.querySelectorAll('[data-key]').forEach(btn => {
    const key = btn.dataset.key;
    const on = e => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      stampPress(key);
      input[key] = true;
      vibrate(key === 'punch' || key === 'kick' ? 12 : 8);
    };
    const off = e => { e.preventDefault(); input[key] = false; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('lostpointercapture', off); // fires instead of pointerleave now that
    // the button holds pointer capture through drift, so this is the real release signal
  });
}

// Buffered-edge helper: pass the previous frame's snapshot, get back which of
// punch/kick/jump/block should fire this frame. punch/kick/jump consume any
// still-fresh buffered press (see INPUT_BUFFER_MS above) rather than requiring the
// exact frame the key went down; block stays a plain rising edge since fighter.js
// reads raw block state continuously anyway.
export function edgesFrom(prev) {
  const now = performance.now();
  const e = {
    punch: consumeBuffered('punch', now),
    kick: consumeBuffered('kick', now),
    jump: consumeBuffered('jump', now),
    block: input.block && !prev.block
  };
  prev.punch = input.punch; prev.kick = input.kick; prev.jump = input.jump; prev.block = input.block;
  return e;
}

export function consumeDash() {
  return dashEvents.shift() || null;
}
