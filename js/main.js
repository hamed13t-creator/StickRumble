// js/main.js — orchestrates every module. No game logic lives here beyond match/round
// flow and dispatching Fighter combat events to camera/effects/audio.
//
// Timing model: the simulation advances in fixed 1/60 s steps (stepSim), each with an
// integer match.frame; rendering (fighters, camera, background) runs once per display
// frame. Every gameplay timer, including the round-flow banners, counts sim frames, so
// pausing freezes all of it and the same seed + inputs replay the same match.
import { Fighter, CHARACTERS, rigSVG, NEUTRAL_INPUT } from './fighter.js';
import { Camera } from './camera.js';
import { ParallaxBackground } from './background.js';
import { AI } from './ai.js';
import { input, initInput, edgesFrom, consumeDash, consumeFlip, clearInputQueues, haptic } from './input.js';
import { Audio } from './audio.js';
import * as FX from './effects.js';
import { createRng } from './rng.js';
import { STAGE_W, STAGE_H, STEP, framesFor, ARENA_MIN_X, ARENA_MAX_X } from './world.js';

// ---------------- DOM refs ----------------
const selectScreen = document.getElementById('selectScreen');
const gameScreen = document.getElementById('gameScreen');
const charGrid = document.getElementById('charGrid');
const diffRow = document.getElementById('diffRow');
const fightBtn = document.getElementById('fightBtn');
const arenaOuter = document.getElementById('arenaOuter');
const stageEl = document.getElementById('stage');
const bgLayersEl = document.getElementById('bgLayers');
const worldEl = document.getElementById('world');
const koFlashEl = document.getElementById('koFlash');
const bannerEl = document.getElementById('banner');
const overlay = document.getElementById('overlay');
const resultText = document.getElementById('resultText');
const restartBtn = document.getElementById('restartBtn');
const changeBtn = document.getElementById('changeBtn');
const pauseBtn = document.getElementById('pauseBtn');
const pauseOverlay = document.getElementById('pauseOverlay');
const resumeBtn = document.getElementById('resumeBtn');
const pauseRestartBtn = document.getElementById('pauseRestartBtn');
const pauseExitBtn = document.getElementById('pauseExitBtn');
const timerEl = document.getElementById('timer');
const youHealthEl = document.getElementById('youHealth');
const cpuHealthEl = document.getElementById('cpuHealth');
const diffTagEl = document.getElementById('diffTag');
const cpuCharNameEl = document.getElementById('cpuCharName');
const youPipsEl = document.getElementById('youPips');
const cpuPipsEl = document.getElementById('cpuPips');
const controlsRoot = document.getElementById('controls');

// ---------------- Select-screen state ----------------
let pickedKey = CHARACTERS[0].key;
let difficulty = 'medium';

CHARACTERS.forEach(ch => {
  const b = document.createElement('button');
  b.className = 'charBtn';
  b.innerHTML = rigSVG(ch) + `<div class="cname">${ch.name}</div>`;
  b.addEventListener('click', () => { pickedKey = ch.key; refreshCharSelection(); });
  charGrid.appendChild(b);
});
function refreshCharSelection() {
  [...charGrid.children].forEach((b, i) => b.classList.toggle('sel', CHARACTERS[i].key === pickedKey));
}
refreshCharSelection();

diffRow.querySelectorAll('.diffBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    diffRow.querySelectorAll('.diffBtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.diff;
    ai.setDifficulty(difficulty);
  });
});

// ---------------- Stage fit-to-container scaling ----------------
function fitStage() {
  const w = arenaOuter.clientWidth, h = arenaOuter.clientHeight;
  if (!w || !h) return;
  const scale = Math.min(w / STAGE_W, h / STAGE_H);
  const ox = (w - STAGE_W * scale) / 2, oy = (h - STAGE_H * scale) / 2;
  stageEl.style.transform = `translate(${ox.toFixed(1)}px,${oy.toFixed(1)}px) scale(${scale.toFixed(4)})`;
}
new ResizeObserver(fitStage).observe(arenaOuter);
window.addEventListener('resize', fitStage);

// ---------------- Orientation: landscape only during the fight, free elsewhere ----------------
// Best-effort: the Orientation Lock API isn't available on every browser (notably iOS
// Safari), so every call is feature-detected and its promise/exception is swallowed.
function lockLandscape() {
  const so = screen.orientation;
  if (so && so.lock) so.lock('landscape').catch(() => {});
}
function unlockOrientation() {
  const so = screen.orientation;
  if (so && so.unlock) { try { so.unlock(); } catch (_) {} }
}

// ---------------- Core game objects ----------------
initInput(controlsRoot);
FX.initEffects(worldEl);
const camera = new Camera(worldEl);
const background = new ParallaxBackground(bgLayersEl);
background.setActive(false); // select screen: background animation paused
const ai = new AI(difficulty);

// prefers-reduced-motion: halve camera shake/kick and hit-stop jitter, skip the KO white
// flash (photosensitivity). CSS handles the remaining animations.
const reducedMotionMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
let reducedMotion = false;
function applyMotionPref() {
  reducedMotion = !!(reducedMotionMQ && reducedMotionMQ.matches);
  camera.setMotionScale(reducedMotion ? 0.5 : 1);
}
if (reducedMotionMQ && reducedMotionMQ.addEventListener) reducedMotionMQ.addEventListener('change', applyMotionPref);
applyMotionPref();

let p1 = null, p2 = null; // p1 = player, p2 = CPU
let prevPlayerEdge = { punch: false, kick: false, jump: false, block: false };
let prevCpuEdge = { punch: false, kick: false, jump: false, block: false };

const ROUND_TIME = 60;
const ROUNDS_TO_WIN = 2;
const MAX_ROUNDS = 5;
const KO_HOLD_FRAMES = framesFor(0.75); // KO plays out before the round-end banner
const MAX_STEPS_PER_FRAME = 5;          // cap catch-up after a stall (no death spiral)
// Sudden death: in the last 10 s the arena walls close in on the fighters.
const SUDDEN_DEATH_AT = 10;             // seconds left on the round clock
const SHRINK_FRAMES = framesFor(3);     // walls take 3 s to reach their final width
const FINAL_HALF_WIDTH = 350;           // final arena: 700 px wide
let match = null;
let lastFrameTime = 0, stepAccumulator = 0, renderTick = 0;
let matchSeq = 0;
let debugSeed = null; // set through the ?debug hook to replay a match exactly

// ---------------- Combat effect tiers ----------------
const SHAKE = { punch: 0.16, kick: 0.32, lowkick: 0.26, rush: 0.55, aerialKick: 0.42, block: 0.1, ko: 0.95 };
// Hit-stop: whole-simulation freeze, in sim frames (55 ms punch ... 320 ms KO).
const HITSTOP_FRAMES = { punch: 3, kick: 6, lowkick: 5, rush: 11, aerialKick: 9, block: 3, wallsplat: 8, ko: 19 };
// Render-only juice: camera recoil (screen px) and vibration length (ms) per tier.
const KICK_PX = { punch: 6, kick: 11, lowkick: 9, rush: 15, aerialKick: 13, block: 3, wallsplat: 14, ko: 18 };
const HAPTIC_MS = { punch: 8, kick: 16, lowkick: 14, rush: 30, aerialKick: 24, block: 6, wallsplat: 35, ko: 60 };
const SPARKS = { punch: 9, kick: 15, lowkick: 12, rush: 22, aerialKick: 18, block: 8 };
const STREAKS = { punch: 0, kick: 2, lowkick: 2, rush: 5, aerialKick: 4, block: 0 };
const BLOOD = { punch: 0.6, kick: 1.1, lowkick: 0.9, rush: 1.8, aerialKick: 1.5 };

// Freeze the whole simulation (both fighters, AI, round clock) for n sim frames. Called
// from dispatchEvents, which runs inside stepSim on deterministic events, so the freeze
// itself is deterministic. The longest pending freeze wins.
function freezeSim(frames, victim) {
  if (!match || frames <= match.hitStopFrames) return;
  match.hitStopFrames = frames;
  match.hitStopTotal = frames;
  match.hitStopVictim = victim || null;
}

function updateHealthBars() {
  if (!p1 || !p2) return;
  youHealthEl.style.width = Math.max(0, (p1.health / p1.maxHealth) * 100).toFixed(1) + '%';
  cpuHealthEl.style.width = Math.max(0, (p2.health / p2.maxHealth) * 100).toFixed(1) + '%';
}

function buildPips(container) {
  container.innerHTML = '';
  for (let i = 0; i < ROUNDS_TO_WIN; i++) {
    const d = document.createElement('div');
    d.className = 'pip';
    container.appendChild(d);
  }
}
function setPips(container, wonCount) {
  [...container.children].forEach((d, i) => d.classList.toggle('won', i < wonCount));
}

function dispatchEvents(fighter, opp) {
  const events = fighter.events.slice(); // copy events
  fighter.events.length = 0; // clear immediately to avoid re-triggering

  for (const ev of events) {
    switch (ev.type) {
      case 'hit': {
        const tier = ev.tier;
        camera.shake(SHAKE[tier] ?? 2);
        camera.impact(ev.x, ev.dirX, KICK_PX[tier] ?? 6);
        freezeSim(HITSTOP_FRAMES[tier] ?? 4, opp);
        haptic(HAPTIC_MS[tier] ?? 10);
        FX.spawnSparks(ev.x, ev.y, ev.color, SPARKS[tier] ?? 10, tier === 'rush' ? 1.5 : 1);
        if (STREAKS[tier]) FX.spawnStreaks(ev.x, ev.y, ev.color, STREAKS[tier], 1.2);
        if (BLOOD[tier]) FX.spawnBlood(ev.x, ev.y, ev.dirX, BLOOD[tier]);
        Audio.play(tier === 'rush' ? 'special' : (tier.includes('kick') ? 'kick' : 'punch'));
        if (tier === 'rush') Audio.play('splatter');
        if (fighter.comboCount >= 2) {
          const el = fighter.rig.combo;
          el.textContent = fighter.comboCount + 'x COMBO!';
          requestAnimationFrame(() => {
            el.classList.remove('show');
            void el.offsetWidth;
            el.classList.add('show');
          });
        }
        // Crowd reacts to heavy blows (rush tier) OR a 3x+ combo, whichever is stronger.
        const comboIntensity = fighter.comboCount >= 3 ? Math.min(1 + (fighter.comboCount - 3) * 0.15, 2.2) : 0;
        const heavyIntensity = tier === 'rush' ? 1.4 : 0;
        const crowdIntensity = Math.max(comboIntensity, heavyIntensity);
        if (crowdIntensity > 0) {
          Audio.play('crowdReact', crowdIntensity);
          background.pulse(crowdIntensity);
        }
        updateHealthBars();
        // Round end is no longer triggered here: the lethal hit puts the victim in the
        // 'ko' state, stepSim() schedules the round end KO_HOLD_FRAMES later, and the
        // 'ko' event below gets to play.
        break;
      }
      case 'block':
        camera.shake(SHAKE.block);
        freezeSim(HITSTOP_FRAMES.block, fighter);
        haptic(HAPTIC_MS.block);
        FX.spawnSparks(ev.x, ev.y, '#7fffd4', SPARKS.block, 1);
        Audio.play('block');
        break;
      case 'whoosh': Audio.play('whoosh'); break;
      case 'dash': FX.spawnAfterimage(fighter.el, fighter.ch.color); Audio.play('dash'); break;
      case 'trail': FX.spawnAfterimage(fighter.el, ev.color); break;
      case 'flip': Audio.play('flip'); break;
      case 'land': Audio.play('land'); break;
      case 'wallsplat':
        camera.shake(0.5);
        camera.impact(ev.x, ev.side, KICK_PX.wallsplat);
        freezeSim(HITSTOP_FRAMES.wallsplat, fighter);
        haptic(HAPTIC_MS.wallsplat);
        FX.spawnSparks(ev.x + ev.side * 10, ev.y, '#ffffff', 16, 1.3);
        FX.spawnStreaks(ev.x + ev.side * 10, ev.y, '#ffcf4d', 4, 1.1);
        Audio.play('kick'); Audio.play('land');
        Audio.play('crowdReact', 1.3);
        background.pulse(1.3);
        break;
      case 'knockdown':
        camera.shake(Math.min(0.35, 0.16 * (ev.weight || 1)));
        FX.spawnSparks(ev.x, ev.y - 6, '#c9b8a0', 8, 0.8); // floor dust
        Audio.play('land');
        break;
      case 'techroll':
        FX.spawnAfterimage(fighter.el, fighter.ch.color);
        Audio.play('dash');
        break;
      case 'ko':
        if (!reducedMotion) FX.flashKO(koFlashEl);
        camera.shake(SHAKE.ko);
        camera.impact(ev.x, ev.dirX || 1, KICK_PX.ko);
        freezeSim(HITSTOP_FRAMES.ko, fighter);
        haptic(HAPTIC_MS.ko);
        FX.spawnSparks(ev.x, ev.y, '#ffffff', 30, 1.8);
        Audio.play('ko');
        Audio.play('crowdReact', 2.5);
        background.pulse(3);
        break;
    }
  }
}

// ---------------- Frame-based waits (round flow) ----------------
// Banners and round transitions wait on sim frames instead of setTimeout, so they freeze
// while paused and can't race the pause overlay.
function waitFrames(n) {
  if (!match) return Promise.resolve();
  const m = match;
  return new Promise(resolve => m.waits.push({ frame: m.frame + Math.max(1, n), resolve }));
}
function resolveDueWaits() {
  const due = match.waits.filter(w => match.frame >= w.frame);
  if (!due.length) return;
  match.waits = match.waits.filter(w => match.frame < w.frame);
  due.forEach(w => w.resolve());
}
// When a match is replaced or abandoned, settle its pending waits so the old async round
// flow wakes up, sees the match id changed, and exits instead of hanging forever.
function retireMatch(m) {
  if (!m) return;
  const waits = m.waits; m.waits = [];
  waits.forEach(w => w.resolve());
}

// ---------------- Banner helper ----------------
let bannerSeq = 0;
async function showBanner(text, { cls = '', hold = 900 } = {}) {
  const mySeq = ++bannerSeq;
  bannerEl.classList.remove('show', 'ko', 'taunt');
  void bannerEl.offsetWidth;
  bannerEl.textContent = text;
  if (cls) bannerEl.classList.add(cls);
  bannerEl.classList.add('show');
  const owner = match;
  await waitFrames(framesFor(hold / 1000));
  // Only hide it if no newer banner replaced this one in the meantime.
  if (match === owner && bannerSeq === mySeq) bannerEl.classList.remove('show');
}

// ---------------- Match / round flow ----------------
function clearWorld() {
  worldEl.innerHTML = '';
}

// Sudden-death walls (render-only markers at the match's arena bounds).
let wallEls = [];
function mountWalls() {
  wallEls = [0, 1].map(() => { const w = document.createElement('div'); w.className = 'arenaWall'; worldEl.appendChild(w); return w; });
}
function renderWalls() {
  if (!match || wallEls.length !== 2) return;
  const on = !!match.suddenDeath;
  // Fighter x is the body centre, so draw each wall just beyond the body's edge.
  [match.arena.min - 32, match.arena.max + 32].forEach((x, i) => {
    const el = wallEls[i];
    const left = x.toFixed(1) + 'px';
    if (el.style.left !== left) el.style.left = left;
    el.classList.toggle('on', on);
  });
}

function startMatch(p1Key, p2Key, diff) {
  matchSeq++;
  const myId = matchSeq;
  retireMatch(match);

  bannerEl.classList.remove('show', 'ko', 'taunt');
  koFlashEl.classList.remove('show');
  overlay.style.display = 'none';
  pauseOverlay.style.display = 'none';
  document.body.classList.remove('cheering', 'hitstop', 'matchpoint', 'suddendeath');
  timerEl.classList.remove('danger');

  clearWorld();
  ai.setDifficulty(diff);
  ai.reset();
  camera.reset();
  background.setActive(true);

  p1 = new Fighter(p1Key, 'p1', true);
  p2 = new Fighter(p2Key, 'p2', false);
  p1.mount(worldEl);
  p2.mount(worldEl);
  mountWalls();

  prevPlayerEdge = { punch: false, kick: false, jump: false, block: false };
  prevCpuEdge = { punch: false, kick: false, jump: false, block: false };

  diffTagEl.textContent = diff.toUpperCase();
  cpuCharNameEl.textContent = '· ' + p2.ch.name.toUpperCase();
  buildPips(youPipsEl);
  buildPips(cpuPipsEl);

  // The seed is stored so a match can be replayed later (and shared for rollback).
  const seed = debugSeed ?? ((Date.now() ^ (myId * 0x9E3779B1)) >>> 0);
  match = {
    id: myId, p1Key, p2Key, diff,
    seed, rng: createRng(seed),
    p1Rounds: 0, p2Rounds: 0, round: 1,
    roundActive: false, matchOver: false, paused: false,
    timeLeft: ROUND_TIME, frame: 0, waits: [],
    roundEndFrame: -1, pendingWinner: null,
    hitStopFrames: 0, hitStopTotal: 0, hitStopVictim: null, frozenSample: null,
    arena: { min: ARENA_MIN_X, max: ARENA_MAX_X }, suddenDeath: null
  };
  // Both fighters share the match's bounds object, so moving walls apply to both.
  p1.arena = match.arena; p2.arena = match.arena;

  updateHealthBars();
  timerEl.textContent = ROUND_TIME;
  lastFrameTime = 0; stepAccumulator = 0;

  runRoundIntro(myId);
}

async function runRoundIntro(myId) {
  if (!match || match.id !== myId) return;
  p1.reset(500);
  p2.reset(1300);
  p1.render(0); p2.render(0);
  ai.reset();
  camera.reset();
  match.roundEndFrame = -1;
  match.pendingWinner = null;
  match.hitStopFrames = 0; match.hitStopVictim = null; match.frozenSample = null;
  match.arena.min = ARENA_MIN_X; match.arena.max = ARENA_MAX_X; match.suddenDeath = null;
  document.body.classList.remove('suddendeath', 'hitstop');
  timerEl.classList.remove('danger');
  // Match point: one more round wins it (FINAL ROUND when both are one away, or last round).
  const mp1 = match.p1Rounds === ROUNDS_TO_WIN - 1, mp2 = match.p2Rounds === ROUNDS_TO_WIN - 1;
  const mpLabel = (mp1 && mp2) || match.round >= MAX_ROUNDS ? 'FINAL ROUND' : (mp1 || mp2) ? 'MATCH POINT' : null;
  document.body.classList.toggle('matchpoint', !!mpLabel);
  updateHealthBars();
  Audio.play('bell');
  await showBanner(`ROUND ${match.round}`, { hold: 900 });
  if (!match || match.id !== myId) return;
  if (mpLabel) {
    Audio.play('chant');
    background.pulse(1.5);
    await showBanner(mpLabel, { cls: 'taunt', hold: 800 });
    if (!match || match.id !== myId) return;
  }
  await showBanner('FIGHT!', { hold: 550 });
  if (!match || match.id !== myId) return;
  match.timeLeft = ROUND_TIME;
  clearInputQueues(); // taps made during the banners don't fire late
  prevPlayerEdge = { punch: false, kick: false, jump: false, block: false };
  prevCpuEdge = { punch: false, kick: false, jump: false, block: false };
  match.roundActive = true;
}

function checkMatchWinner() {
  if (match.p1Rounds >= ROUNDS_TO_WIN) return 'p1';
  if (match.p2Rounds >= ROUNDS_TO_WIN) return 'p2';
  if (match.round >= MAX_ROUNDS) {
    if (match.p1Rounds > match.p2Rounds) return 'p1';
    if (match.p2Rounds > match.p1Rounds) return 'p2';
  }
  return null;
}

// reason: 'ko' | 'doubleko' | 'time'
async function endRound(reason, winnerSide) {
  if (!match || !match.roundActive) return;
  const myId = match.id;
  match.roundActive = false;

  if (reason === 'time' && !winnerSide) {
    if (p1.health > p2.health) winnerSide = 'p1';
    else if (p2.health > p1.health) winnerSide = 'p2';
    else winnerSide = null; // exact draw — replay the round
  }

  if (winnerSide) {
    match[winnerSide === 'p1' ? 'p1Rounds' : 'p2Rounds']++;
    setPips(youPipsEl, match.p1Rounds);
    setPips(cpuPipsEl, match.p2Rounds);
  }

  if (reason === 'ko') await showBanner('K.O.!', { cls: 'ko', hold: 1100 });
  else if (reason === 'doubleko') await showBanner('DOUBLE K.O.! REPLAYING ROUND', { cls: 'ko', hold: 1300 });
  else if (!winnerSide) await showBanner('DRAW! REPLAYING ROUND', { hold: 1100 });
  else await showBanner("TIME'S UP", { hold: 800 });
  if (!match || match.id !== myId) return;

  const matchWinner = winnerSide ? checkMatchWinner() : null;

  if (matchWinner) {
    const youWon = matchWinner === 'p1';
    await showBanner(youWon ? 'YOU WIN THE MATCH!' : 'CPU WINS THE MATCH!', { cls: 'ko', hold: 1400 });
    if (!match || match.id !== myId) return;
    endMatch(matchWinner);
  } else if (winnerSide) {
    const winnerLabel = winnerSide === 'p1' ? 'YOU' : 'CPU';
    await showBanner(`${winnerLabel} WIN${winnerSide === 'p1' ? '' : 'S'} ROUND ${match.round}`, { hold: 1000 });
    if (!match || match.id !== myId) return;
    match.round++;
    runRoundIntro(myId);
  } else {
    runRoundIntro(myId); // draw — same round number, fresh reset
  }
}

function endMatch(winnerSide) {
  if (!match) return;
  match.matchOver = true;
  match.paused = false;
  document.body.classList.remove('matchpoint', 'suddendeath', 'hitstop');
  pauseOverlay.style.display = 'none'; // never leave a pause overlay under the result
  const youWon = winnerSide === 'p1';
  resultText.textContent = youWon ? 'YOU WIN THE MATCH!' : 'CPU WINS THE MATCH!';
  background.pulse(3);
  FX.pulseClass(document.body, 'cheering', 1500);
  Audio.play('cheer', 2.2);
  overlay.style.display = 'flex';
  // Render-only: let the cheer pulse play, then stop the background behind the overlay.
  const m = match;
  setTimeout(() => { if (m === match && m.matchOver) background.setActive(false); }, 1600);
}

// ---------------- Pause ----------------
function pauseGame() {
  if (!match || match.matchOver || match.paused) return;
  match.paused = true;
  pauseOverlay.style.display = 'flex';
  background.setActive(false);
}
function resumeGame() {
  if (!match || match.matchOver || !match.paused) return;
  match.paused = false;
  lastFrameTime = 0; stepAccumulator = 0; // no catch-up for the paused wall-clock time
  pauseOverlay.style.display = 'none';
  background.setActive(true);
}
function exitToSelect() {
  retireMatch(match);
  match = null;
  document.body.classList.remove('matchpoint', 'suddendeath');
  timerEl.classList.remove('danger');
  pauseOverlay.style.display = 'none';
  overlay.style.display = 'none';
  bannerEl.classList.remove('show', 'ko', 'taunt');
  document.body.classList.remove('cheering', 'hitstop');
  gameScreen.style.display = 'none';
  selectScreen.style.display = 'flex';
  clearWorld();
  background.setActive(false);
  unlockOrientation();
}

pauseBtn.addEventListener('click', pauseGame);
resumeBtn.addEventListener('click', resumeGame);
pauseRestartBtn.addEventListener('click', () => {
  pauseOverlay.style.display = 'none';
  if (match) startMatch(match.p1Key, match.p2Key, match.diff);
});
pauseExitBtn.addEventListener('click', exitToSelect);
restartBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  if (match) startMatch(match.p1Key, match.p2Key, match.diff);
});
changeBtn.addEventListener('click', exitToSelect);

// Auto-pause if the tab/app is backgrounded mid-match.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});

// ---------------- Fight! ----------------
fightBtn.addEventListener('click', () => {
  Audio.unlock(); // guaranteed real user gesture — reliable place to init the AudioContext
  lockLandscape();
  const others = CHARACTERS.filter(c => c.key !== pickedKey);
  const cpuKey = (others.length ? others[Math.floor(Math.random() * others.length)] : CHARACTERS[0]).key;
  selectScreen.style.display = 'none';
  gameScreen.style.display = 'flex';
  fitStage();
  startMatch(pickedKey, cpuKey, difficulty);
});

// ---------------- Input sampling ----------------
function toFighterInput(cur, edges) {
  return { left: cur.left, right: cur.right, block: cur.block, kickHeld: cur.kick, jumpEdge: edges.jump, punchEdge: edges.punch, kickEdge: edges.kick, flipRequest: false };
}
function computeEdges(cur, prev) {
  const e = { jump: cur.jump && !prev.jump, punch: cur.punch && !prev.punch, kick: cur.kick && !prev.kick };
  Object.assign(prev, cur);
  return e;
}
// Player input is sampled once per display frame. Edges and gestures go to the first sim
// step only; held buttons apply to every step (heldOnly), so a press never fires twice.
function samplePlayer() {
  const inp = toFighterInput(input, edgesFrom(prevPlayerEdge));
  const dashEv = consumeDash();
  inp.flipRequest = !!consumeFlip();
  return { input: inp, dash: dashEv ? dashEv.dir : 0 };
}
function heldOnly(sample) {
  return { input: { ...sample.input, jumpEdge: false, punchEdge: false, kickEdge: false, flipRequest: false }, dash: 0 };
}
// Presses made during a hit-stop freeze are kept and delivered on the first step after it.
function mergeSamples(older, newer) {
  if (!older) return newer;
  if (!newer) return older;
  const a = older.input, b = newer.input;
  return {
    input: { ...b, jumpEdge: a.jumpEdge || b.jumpEdge, punchEdge: a.punchEdge || b.punchEdge,
      kickEdge: a.kickEdge || b.kickEdge, flipRequest: a.flipRequest || b.flipRequest },
    dash: older.dash || newer.dash
  };
}

// Pushbox: standing fighters can't overlap. Each is pushed out by half the overlap; if
// one is pinned at an arena wall, the other takes the whole push. Airborne fighters,
// flips, tech rolls and fighters lying down pass through (cross-ups stay possible).
const PUSHBOX_W = 44; // min distance between body centres, px
function solid(f) {
  return f.y < 30 && f.state !== 'flip' && f.state !== 'ko' &&
    !(f.state === 'knockdown' && f.kdPhase !== 'rise') && f.state !== 'wallsplat';
}
function separateFighters() {
  if (!solid(p1) || !solid(p2)) return;
  const dx = p2.x - p1.x;
  const overlap = PUSHBOX_W - Math.abs(dx);
  if (overlap <= 0) return;
  const dir = dx !== 0 ? Math.sign(dx) : (p1.facing || 1); // +1: p2 belongs on the right
  const { min, max } = match.arena;
  let a = p1.x - dir * overlap / 2, b = p2.x + dir * overlap / 2;
  // Clamp to the walls and hand any leftover push to the other fighter.
  const ca = Math.max(min, Math.min(max, a)), cb = Math.max(min, Math.min(max, b));
  b = Math.max(min, Math.min(max, cb + (ca - a))); // a was clamped: shift b instead
  a = Math.max(min, Math.min(max, ca + (cb - (p2.x + dir * overlap / 2))));
  p1.x = a; p2.x = b;
}

function startSuddenDeath() {
  const lo = ARENA_MIN_X + FINAL_HALF_WIDTH, hi = ARENA_MAX_X - FINAL_HALF_WIDTH;
  const centre = Math.max(lo, Math.min(hi, (p1.x + p2.x) / 2)); // close in around the fight
  match.suddenDeath = {
    startFrame: match.frame,
    from: { min: match.arena.min, max: match.arena.max },
    to: { min: centre - FINAL_HALF_WIDTH, max: centre + FINAL_HALF_WIDTH }
  };
  // Render-only reactions; the shrink itself is driven frame by frame in stepSim.
  document.body.classList.add('suddendeath');
  timerEl.classList.add('danger');
  Audio.play('crowdReact', 1.6);
  background.pulse(2);
  showBanner('SUDDEN DEATH!', { cls: 'ko', hold: 900 });
}

function updateSuddenDeath() {
  const sd = match.suddenDeath;
  const t = Math.min(1, (match.frame - sd.startFrame) / SHRINK_FRAMES);
  const e = t * t * (3 - 2 * t); // smoothstep
  match.arena.min = sd.from.min + (sd.to.min - sd.from.min) * e;
  match.arena.max = sd.from.max + (sd.to.max - sd.from.max) * e;
}

// ---------------- Simulation step (fixed 1/60 s) ----------------
function stepSim(playerSample) {
  match.frame++;
  resolveDueWaits();
  if (!match || !match.roundActive) return;

  // Hit-stop: nothing in the match advances (fighters, AI, round clock, walls) except
  // match.frame, which drives the KO hold and banners. Input pressed meanwhile is kept.
  if (match.hitStopFrames > 0) {
    match.hitStopFrames--;
    ai.nextDecisionFrame++; // the CPU's think timer is frozen too
    if (playerSample) match.frozenSample = mergeSamples(match.frozenSample, playerSample);
    return;
  }
  if (match.frozenSample) {
    playerSample = mergeSamples(match.frozenSample, playerSample);
    match.frozenSample = null;
  }

  const ending = match.roundEndFrame >= 0; // round decided: let the KO play out
  const pInput = !ending && playerSample ? playerSample.input : NEUTRAL_INPUT;
  const pDash = !ending && playerSample ? playerSample.dash : 0;

  let cpuInput = NEUTRAL_INPUT, cpuDash = 0;
  if (!ending) {
    const aiDecision = ai.decide(p2, p1, match.frame, match.rng);
    cpuInput = toFighterInput(aiDecision, computeEdges(aiDecision, prevCpuEdge));
    cpuDash = ai.dashDir;
  }

  p1.update(STEP, pInput, p2, pDash);
  p2.update(STEP, cpuInput, p1, cpuDash);
  separateFighters();

  // Attack resolution is deferred until BOTH fighters have advanced, so trades are symmetric.
  p1.resolvePending(p2);
  p2.resolvePending(p1);

  if (!ending && (p1.health <= 0 || p2.health <= 0)) {
    match.roundEndFrame = match.frame + KO_HOLD_FRAMES;
    // A simultaneous lethal trade is a double KO (draw), not an automatic P1 win.
    match.pendingWinner = p1.health <= 0 && p2.health <= 0 ? null : (p2.health <= 0 ? 'p1' : 'p2');
  }

  dispatchEvents(p1, p2);
  dispatchEvents(p2, p1);

  if (match.roundEndFrame >= 0) {
    if (match.frame >= match.roundEndFrame) endRound(match.pendingWinner ? 'ko' : 'doubleko', match.pendingWinner);
  } else {
    match.timeLeft -= STEP;
    if (!match.suddenDeath && match.timeLeft <= SUDDEN_DEATH_AT) startSuddenDeath();
    if (match.timeLeft <= 0) {
      match.timeLeft = 0;
      endRound('time');
    }
  }
  if (match.suddenDeath) updateSuddenDeath();
  const shown = String(Math.ceil(match.timeLeft));
  if (timerEl.textContent !== shown) timerEl.textContent = shown;
}

// ---------------- Main loop ----------------
function loop(ts) {
  requestAnimationFrame(loop);

  if (!match || match.matchOver || match.paused) { lastFrameTime = 0; stepAccumulator = 0; return; }

  if (!lastFrameTime) lastFrameTime = ts;
  const elapsed = Math.min((ts - lastFrameTime) / 1000, MAX_STEPS_PER_FRAME * STEP);
  lastFrameTime = ts;
  stepAccumulator += elapsed;

  const steps = Math.min(MAX_STEPS_PER_FRAME, Math.floor(stepAccumulator / STEP + 1e-9));
  if (steps > 0) {
    // Only consume input when a step will actually run (on 120 Hz screens some display
    // frames run no step; their presses wait for the next one instead of being lost).
    const sample = match.roundActive ? samplePlayer() : null;
    for (let i = 0; i < steps; i++) {
      stepAccumulator -= STEP;
      stepSim(i === 0 ? sample : (sample && heldOnly(sample)));
      if (!match || match.matchOver) break;
    }
  }
  if (!match) return;

  // Hit-stop presentation (render-only): CSS animations pause and the victim shakes
  // in place, fading out over the freeze.
  const frozen = match.hitStopFrames > 0;
  document.body.classList.toggle('hitstop', frozen);
  let jitter = 0;
  if (frozen) {
    renderTick++;
    jitter = (renderTick % 2 ? 1 : -1) * 3 * (match.hitStopFrames / Math.max(1, match.hitStopTotal)) * (reducedMotion ? 0.5 : 1);
  }
  if (p1 && p2) {
    p1.render(elapsed, frozen && match.hitStopVictim === p1 ? jitter : 0);
    p2.render(elapsed, frozen && match.hitStopVictim === p2 ? jitter : 0);
  }
  renderWalls();
  // Camera/background keep tracking between rounds (banners) so the scene settles
  // smoothly onto the reset fighters instead of visibly snapping.
  camera.update(p1, p2, elapsed);
  const zoom = camera.applyTransform();
  background.update(camera.centerX, zoom);
}

requestAnimationFrame(loop);

// ---------------- Test hook ----------------
// Load the page with ?debug to expose game state for scripted tests and replays.
if (new URLSearchParams(location.search).has('debug')) {
  window.__sr = {
    get match() { return match; }, get p1() { return p1; }, get p2() { return p2; },
    ai, background, camera, startMatch, stepSim, pauseGame, resumeGame,
    setSeed(s) { debugSeed = s >>> 0; },
    neutralSample: () => ({ input: { ...NEUTRAL_INPUT }, dash: 0 })
  };
}

// ---------------- Offline support ----------------
// sw.js existed but was never registered, so the game never worked offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('[sw] registration failed', err));
  });
}
