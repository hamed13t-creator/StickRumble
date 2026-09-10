// js/main.js — orchestrates every module. No game logic lives here beyond match/round
// flow and dispatching Fighter combat events to camera/effects/audio.
import { Fighter, CHARACTERS, rigSVG } from './fighter.js';
import { Camera } from './camera.js';
import { ParallaxBackground } from './background.js';
import { AI } from './ai.js';
import { input, initInput, edgesFrom, consumeDash, consumeFlip } from './input.js';
import { Audio } from './audio.js';
import * as FX from './effects.js';
import { STAGE_W, STAGE_H, WORLD_W } from './world.js';
 
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
// manifest.json no longer declares a blanket "orientation": "landscape" — that forced
// rotation even on the portrait-friendly select screen for anyone who'd installed the
// PWA. Landscape is requested only once a match actually starts, and released back to
// the device's natural orientation on return to select. Best-effort: the Orientation
// Lock API isn't available on every browser (notably iOS Safari), so every call is
// feature-detected and its promise/exception is swallowed.
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
const ai = new AI(difficulty);
 
let p1 = null, p2 = null; // p1 = player, p2 = CPU
let prevPlayerEdge = { punch: false, kick: false, jump: false, block: false };
let prevCpuEdge = { punch: false, kick: false, jump: false, block: false };
 
const ROUND_TIME = 60;
const ROUNDS_TO_WIN = 2;
const MAX_ROUNDS = 5;
let match = null;
let loopId = null, lastFrameTime = 0;
let matchSeq = 0;
 
// ---------------- Combat effect tiers ----------------
const SHAKE = { punch: 0.16, kick: 0.32, lowkick: 0.26, rush: 0.55, aerialKick: 0.42, block: 0.1, ko: 0.95 };
const HITSTOP = { punch: 55, kick: 105, lowkick: 85, rush: 190, aerialKick: 150, block: 45, ko: 320 };
const SPARKS = { punch: 9, kick: 15, lowkick: 12, rush: 22, aerialKick: 18, block: 8 };
const STREAKS = { punch: 0, kick: 2, lowkick: 2, rush: 5, aerialKick: 4, block: 0 };
const BLOOD = { punch: 0.6, kick: 1.1, lowkick: 0.9, rush: 1.8, aerialKick: 1.5 };
 
function applyHitStop(ms) {
  if (!match) return;
  const now = performance.now();
  const target = now + ms;
  if (target > match.hitStopUntil) match.hitStopUntil = target;
  document.body.classList.add('hitstop');
  clearTimeout(match._hsTimer);
  match._hsTimer = setTimeout(() => document.body.classList.remove('hitstop'), Math.max(0, match.hitStopUntil - performance.now()));
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
        applyHitStop(HITSTOP[tier] ?? 60);
        FX.spawnSparks(ev.x, ev.y, ev.color, SPARKS[tier] ?? 10, tier === 'rush' ? 1.5 : 1);
        if (STREAKS[tier]) FX.spawnStreaks(ev.x, ev.y, ev.color, STREAKS[tier], 1.2);
        if (BLOOD[tier]) FX.spawnBlood(ev.x, ev.y, ev.dirX, BLOOD[tier]);
        Audio.play(tier === 'rush' ? 'special' : (tier.includes('kick') ? 'kick' : 'punch'));
        // Extra gore layer on the heaviest hit — SFX.splatter already existed in audio.js
        // but had no call site anywhere in the codebase.
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
        // Also the first place Audio's intensity args are actually forwarded (see the
        // audio.js fix) instead of always firing at a flat 1.0.
        const comboIntensity = fighter.comboCount >= 3 ? Math.min(1 + (fighter.comboCount - 3) * 0.15, 2.2) : 0;
        const heavyIntensity = tier === 'rush' ? 1.4 : 0;
        const crowdIntensity = Math.max(comboIntensity, heavyIntensity);
        if (crowdIntensity > 0) {
          Audio.play('crowdReact', crowdIntensity);
          background.pulse(crowdIntensity);
        }
        updateHealthBars();
        if (opp.health <= 0 && match && match.roundActive) endRound('ko', fighter === p1 ? 'p1' : 'p2');
        break;
      }
      case 'block':
        camera.shake(SHAKE.block);
        FX.spawnSparks(ev.x, ev.y, '#7fffd4', SPARKS.block, 1);
        Audio.play('block');
        break;
      case 'whoosh': Audio.play('whoosh'); break;
      case 'dash': FX.spawnAfterimage(fighter.el, fighter.ch.color); Audio.play('dash'); break;
      case 'trail': FX.spawnAfterimage(fighter.el, ev.color); break;
      case 'flip': Audio.play('flip'); break;
      case 'land': Audio.play('land'); break;
      case 'ko':
        FX.flashKO(koFlashEl);
        camera.shake(SHAKE.ko);
        applyHitStop(HITSTOP.ko);
        FX.spawnSparks(ev.x, ev.y, '#ffffff', 30, 1.8);
        Audio.play('ko');
        Audio.play('crowdReact', 2.5);
        background.pulse(3);
        break;
    }
  }
}
 
// ---------------- Banner helper ----------------
let bannerTimer = null;
function showBanner(text, { cls = '', hold = 900 } = {}) {
  clearTimeout(bannerTimer);
  bannerEl.classList.remove('show', 'ko', 'taunt');
  void bannerEl.offsetWidth;
  bannerEl.textContent = text;
  if (cls) bannerEl.classList.add(cls);
  bannerEl.classList.add('show');
  return new Promise(resolve => {
    bannerTimer = setTimeout(() => { bannerEl.classList.remove('show'); resolve(); }, hold);
  });
}
 
// ---------------- Match / round flow ----------------
function clearWorld() {
  worldEl.innerHTML = '';
}
 
function startMatch(p1Key, p2Key, diff) {
  matchSeq++;
  const myId = matchSeq;
 
  clearTimeout(bannerTimer);
  bannerEl.classList.remove('show', 'ko', 'taunt');
  koFlashEl.classList.remove('show');
  overlay.style.display = 'none';
  pauseOverlay.style.display = 'none';
  document.body.classList.remove('cheering', 'hitstop');
 
  clearWorld();
  ai.setDifficulty(diff);
  camera.reset();
 
  p1 = new Fighter(p1Key, 'p1', true);
  p2 = new Fighter(p2Key, 'p2', false);
  p1.mount(worldEl);
  p2.mount(worldEl);
 
  prevPlayerEdge = { punch: false, kick: false, jump: false, block: false };
  prevCpuEdge = { punch: false, kick: false, jump: false, block: false };
 
  diffTagEl.textContent = diff.toUpperCase();
  cpuCharNameEl.textContent = '· ' + p2.ch.name.toUpperCase();
  buildPips(youPipsEl);
  buildPips(cpuPipsEl);
 
  match = {
    id: myId, p1Key, p2Key, diff,
    p1Rounds: 0, p2Rounds: 0, round: 1,
    roundActive: false, matchOver: false, paused: false,
    timeLeft: ROUND_TIME, clock: 0,
    hitStopUntil: 0, _hsTimer: null
  };
 
  updateHealthBars();
  timerEl.textContent = ROUND_TIME;
  lastFrameTime = 0;
 
  runRoundIntro(myId);
}
 
async function runRoundIntro(myId) {
  if (!match || match.id !== myId) return;
  p1.reset(500);
  p2.reset(1300);
  camera.reset();
  Audio.play('bell'); // round-start bell — SFX.bell existed but was never called before
  await showBanner(`ROUND ${match.round}`, { hold: 900 });
  if (!match || match.id !== myId) return;
  await showBanner('FIGHT!', { hold: 550 });
  if (!match || match.id !== myId) return;
  match.timeLeft = ROUND_TIME;
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
  const youWon = winnerSide === 'p1';
  resultText.textContent = youWon ? 'YOU WIN THE MATCH!' : 'CPU WINS THE MATCH!';
  background.pulse(3);
  FX.pulseClass(document.body, 'cheering', 1500);
  Audio.play('cheer', 2.2);
  overlay.style.display = 'flex';
}
 
// ---------------- Pause ----------------
function pauseGame() {
  if (!match || match.matchOver || match.paused) return;
  match.paused = true;
  pauseOverlay.style.display = 'flex';
}
function resumeGame() {
  if (!match || match.matchOver || !match.paused) return;
  match.paused = false;
  lastFrameTime = 0; // avoid a huge dt spike covering the paused wall-clock duration
  pauseOverlay.style.display = 'none';
}
function exitToSelect() {
  match = null;
  pauseOverlay.style.display = 'none';
  overlay.style.display = 'none';
  document.body.classList.remove('cheering');
  gameScreen.style.display = 'none';
  selectScreen.style.display = 'flex';
  clearWorld();
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
 
// Auto-pause if the tab/app is backgrounded mid-match, so nobody comes back to find
// they got KO'd while alt-tabbed.
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
 
// ---------------- Main loop ----------------
function toFighterInput(cur, edges) {
  return { left: cur.left, right: cur.right, block: cur.block, kickHeld: cur.kick, jumpEdge: edges.jump, punchEdge: edges.punch, kickEdge: edges.kick };
}
function computeEdges(cur, prev) {
  const e = { jump: cur.jump && !prev.jump, punch: cur.punch && !prev.punch, kick: cur.kick && !prev.kick };
  Object.assign(prev, cur);
  return e;
}
 
function loop(ts) {
  loopId = requestAnimationFrame(loop);
 
  if (!match || match.matchOver || match.paused) { lastFrameTime = 0; return; }
 
  if (!lastFrameTime) lastFrameTime = ts;
  let dt = (ts - lastFrameTime) / 1000;
  lastFrameTime = ts;
  dt = Math.min(dt, 1 / 20); // clamp so a lag spike/tab-switch can't tunnel physics or skip a whole combo window
 
  match.clock += dt;
 
  if (match.roundActive) {
    // ---- Player ----
    const playerEdges = edgesFrom(prevPlayerEdge);
    const playerInput = toFighterInput(input, playerEdges);
    const dashEv = consumeDash();
    // BUGFIX: consumeDash() resolves to { dir: 1|-1 } or null, not a bare number.
    // Fighter.update()'s dashRequest expects a number (it's later multiplied straight
    // into velocity as `this.dashDir * DASH_SPEED`) — passing the wrapped object through
    // would have made every dash resolve to NaN velocity the first time it was thrown.
    const playerDash = dashEv ? dashEv.dir : 0;
    // Joystick Up-Up (within input.js's double-tap window) triggers a front flip
    // directly instead of routing through a second jump edge — see setJoyVert() in
    // input.js. startFlip() already no-ops if the fighter can't act (mid-attack/hitstun).
    const flipEv = consumeFlip();
    if (flipEv) p1.startFlip(flipEv.kind);
 
    // ---- CPU ----
    const aiDecision = ai.decide(p2, p1, match.clock);
    const cpuEdges = computeEdges(aiDecision, prevCpuEdge);
    const cpuInput = toFighterInput(aiDecision, cpuEdges);
 
    p1.update(dt, playerInput, p2, playerDash);
    p2.update(dt, cpuInput, p1, ai.dashDir);
 
    // BUGFIX: attack resolution is deferred inside Fighter.update() (see
    // pendingResolve in fighter.js) and applied here, after BOTH fighters have
    // advanced their own attack phase for this frame. Previously p1.update() could
    // resolve its hit mid-call and flip p2.state to 'hitstun' before p2.update() ran —
    // p2's own updateAttackState() early-returns once state !== 'attack', so a
    // same-frame trade silently dropped p2's hit and gave p1 deterministic priority
    // on every simultaneous exchange.
    p1.resolvePending(p2);
    p2.resolvePending(p1);
 
    dispatchEvents(p1, p2);
    dispatchEvents(p2, p1);
 
    match.timeLeft -= dt;
    if (match.timeLeft <= 0) {
      match.timeLeft = 0;
      endRound('time');
    }
    timerEl.textContent = Math.ceil(match.timeLeft);
  }
 
  // Camera/background keep tracking even between rounds (round-intro banners) so the
  // scene settles smoothly onto the reset fighters instead of visibly snapping.
  camera.update(p1, p2, dt);
  const zoom = camera.applyTransform();
  background.update(camera.centerX, zoom);
}
 
loopId = requestAnimationFrame(loop);
 
