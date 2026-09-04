// js/main.js — orchestrates every module. No game logic lives here beyond match/round
// flow and dispatching Fighter combat events to camera/effects/audio.
import { Fighter, CHARACTERS, rigSVG } from './fighter.js';
import { Camera } from './camera.js';
import { ParallaxBackground } from './background.js';
import { AI } from './ai.js';
import { input, initInput, edgesFrom, consumeDash } from './input.js';
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
  });
});

// ---------------- Stage fit-to-container scaling ----------------
function fitStage() {
  const w = arenaOuter.clientWidth, h = arenaOuter.clientHeight;
  const scale = Math.min(w / STAGE_W, h / STAGE_H);
  const ox = (w - STAGE_W * scale) / 2, oy = (h - STAGE_H * scale) / 2;
  stageEl.style.transform = `translate(${ox.toFixed(1)}px,${oy.toFixed(1)}px) scale(${scale.toFixed(4)})`;
}
new ResizeObserver(fitStage).observe(arenaOuter);
window.addEventListener('resize', fitStage);

// ---------------- Core game objects ----------------
initInput(controlsRoot);
FX.initEffects(worldEl);
const camera = new Camera(worldEl);
const background = new ParallaxBackground(bgLayersEl);
let ai = new AI(difficulty);

let p1 = null, p2 = null; // p1 = player, p2 = CPU
let prevPlayerEdge = { punch: false, kick: false, jump: false, block: false };
let prevCpuEdge = { punch: false, kick: false, jump: false, block: false };

const ROUND_TIME = 60;
const ROUNDS_TO_WIN = 2;
const MAX_ROUNDS = 5;
let match = null; // { round, p1Wins, p2Wins, matchOver, roundActive, paused, roundTime, hitStopUntil }
let timerInterval = null, loopId = null, lastFrameTime = 0;

// ---------------- Tier tables for combat juice ----------------
const SHAKE = { punch: 0.16, kick: 0.32, lowkick: 0.26, rush: 0.55, aerialKick: 0.42, block: 0.1, ko: 0.95 };
const HITSTOP = { punch: 55, kick: 105, lowkick: 85, rush: 190, aerialKick: 150, block: 45, ko: 320 };
const SPARKS = { punch: 9, kick: 15, lowkick: 12, rush: 22, aerialKick: 18, block: 8 };
const STREAKS = { punch: 0, kick: 2, lowkick: 2, rush: 5, aerialKick: 4, block: 0 };
const BLOOD = { punch: 0.6, kick: 1.1, lowkick: 0.9, rush: 1.8, aerialKick: 1.5 };

function applyHitStop(ms) {
  const now = performance.now();
  const target = now + ms;
  if (target > match.hitStopUntil) match.hitStopUntil = target;
  document.body.classList.add('hitstop');
  clearTimeout(match._hsTimer);
  match._hsTimer = setTimeout(() => document.body.classList.remove('hitstop'), Math.max(0, match.hitStopUntil - performance.now()));
}

function dispatchEvents(fighter, opp) {
  // FIX: Clear fighter events immediately to prevent infinite event re-triggering across frames
  const events = fighter.events;
  fighter.events = [];

  for (const ev of events) {
    if (ev.type === 'hit') {
      const tier = ev.tier;
      camera.shake(SHAKE[tier] ?? 2);
      applyHitStop(HITSTOP[tier] ?? 60);
      FX.spawnSparks(ev.x, ev.y, ev.color, SPARKS[tier] ?? 10, tier === 'rush' ? 1.5 : 1);
      if (STREAKS[tier]) FX.spawnStreaks(ev.x, ev.y, ev.color, STREAKS[tier], 1.2);
      if (BLOOD[tier]) FX.spawnBlood(ev.x, ev.y, ev.dirX, BLOOD[tier]);
      Audio.play(tier === 'rush' ? 'special' : (tier === 'kick' || tier === 'lowkick' || tier === 'aerialKick') ? 'kick' : 'punch');
      if (fighter.comboCount >= 2) {
        const el = fighter.rig.combo;
        el.textContent = fighter.comboCount + 'x COMBO!';
        el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
        if (fighter.comboCount >= 3) Audio.play('crowdReact');
      }
      updateHealthBars();
      if (opp.health <= 0 && match.roundActive) endRound('ko', fighter === p1 ? 'p1' : 'p2');
    } else if (ev.type === 'block') {
      camera.shake(SHAKE.block);
      FX.spawnSparks(ev.x, ev.y, '#7fffd4', SPARKS.block, 1);
      Audio.play('block');
    } else if (ev.type === 'whoosh') {
      Audio.play('whoosh');
    } else if (ev.type === 'dash') {
      FX.spawnAfterimage(fighter.el, fighter.ch.color);
      Audio.play('dash');
    } else if (ev.type === 'flip') {
      Audio.play('flip');
    } else if (ev.type === 'land') {
      Audio.play('land');
    } else if (ev.type === 'ko') {
      FX.flashKO(koFlashEl);
      camera.shake(SHAKE.ko);
      applyHitStop(HITSTOP.ko);
      FX.spawnSparks(ev.x, ev.y, '#ffffff', 30, 1.8);
      Audio.play('ko');
      Audio.play('crowdReact');
    }
  }
}

// ---------------- Match / round flow ----------------
fightBtn.addEventListener('click', () => {
  Audio.unlock();
  selectScreen.style.display = 'none';
  gameScreen.style.display = 'flex';
  diffTagEl.textContent = difficulty.toUpperCase();
  fitStage();
  initMatch();
});

restartBtn.addEventListener('click', () => { overlay.style.display = 'none'; initMatch(); });
changeBtn.addEventListener('click', backToSelect);

function openPause() {
  if (match.matchOver || !match.roundActive) return;
  match.paused = true;
  pauseOverlay.style.display = 'flex';
}
function closePause() { match.paused = false; pauseOverlay.style.display = 'none'; }
pauseBtn.addEventListener('click', openPause);
resumeBtn.addEventListener('click', closePause);
pauseRestartBtn.addEventListener('click', () => { pauseOverlay.style.display = 'none'; initMatch(); });
pauseExitBtn.addEventListener('click', () => { pauseOverlay.style.display = 'none'; backToSelect(); });

function backToSelect() {
  if (match) match.matchOver = true;
  if (timerInterval) clearInterval(timerInterval);
  if (loopId) cancelAnimationFrame(loopId);
  overlay.style.display = 'none';
  pauseOverlay.style.display = 'none';
  gameScreen.style.display = 'none';
  selectScreen.style.display = 'flex';
}

function pickCpuKey() {
  const others = CHARACTERS.filter(c => c.key !== pickedKey);
  return (others.length ? others : CHARACTERS)[Math.floor(Math.random() * (others.length || CHARACTERS.length))].key;
}

function initMatch() {
  if (p1) { p1.el.remove(); p2.el.remove(); }
  p1 = new Fighter(pickedKey, 'p1', true);
  p2 = new Fighter(pickCpuKey(), 'p2', false);
  p1.mount(worldEl); p2.mount(worldEl);
  ai = new AI(difficulty);
  prevPlayerEdge = { punch: false, kick: false, jump: false, block: false };
  prevCpuEdge = { punch: false, kick: false, jump: false, block: false };

  match = { round: 1, p1Wins: 0, p2Wins: 0, matchOver: false, roundActive: false, paused: false, roundTime: ROUND_TIME, hitStopUntil: 0, _hsTimer: null };
  overlay.style.display = 'none';
  pauseOverlay.style.display = 'none';
  updateHealthBars();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!match.roundActive || match.matchOver || match.paused) return;
    match.roundTime--;
    timerEl.textContent = Math.max(0, match.roundTime);
    if (match.roundTime <= 0) endRound('time');
  }, 1000);

  startRound();
  lastFrameTime = performance.now();
  if (loopId) cancelAnimationFrame(loopId);
  loop();
}

function startRound() {
  p1.reset(WORLD_W * 0.38);
  p2.reset(WORLD_W * 0.62);
  match.roundTime = ROUND_TIME;
  timerEl.textContent = match.roundTime;
  match.roundActive = false;
  camera.reset();
  camera.applyTransform();
  background.update(camera.centerX, camera.getZoom());
  updateHealthBars();

  showBanner('ROUND ' + match.round, 850, () => {
    showBanner('FIGHT!', 650, () => { match.roundActive = true; Audio.play('bell'); });
  });
}

function endRound(reason, winnerSide) {
  match.roundActive = false;
  let winner = winnerSide || null;
  if (!winner) {
    if (p1.health > p2.health) winner = 'p1';
    else if (p2.health > p1.health) winner = 'p2';
    else if (p1.hits > p2.hits) winner = 'p1';
    else if (p2.hits > p1.hits) winner = 'p2';
  }
  if (winner === 'p1') match.p1Wins++; else if (winner === 'p2') match.p2Wins++;
  Audio.play('bell');
  if (winner) Audio.play('crowdReact');

  const text = winner === 'p1' ? '🔵 YOU WIN ROUND ' + match.round
    : winner === 'p2' ? '🔴 CPU WINS ROUND ' + match.round
    : 'DRAW ROUND';

  const goNext = () => {
    if (match.p1Wins >= ROUNDS_TO_WIN || match.p2Wins >= ROUNDS_TO_WIN) endMatch(match.p1Wins > match.p2Wins ? 'p1' : 'p2');
    else if (match.round >= MAX_ROUNDS) endMatch(match.p1Wins >= match.p2Wins ? 'p1' : 'p2');
    else { match.round++; startRound(); }
  };

  if (reason === 'ko' && winner) {
    showBanner(text, 1100, () => showBanner((winner === 'p1' ? '🔵' : '🔴') + ' KNOCKOUT!', 1000, goNext, true));
  } else {
    showBanner(text, 1400, goNext);
  }
}

function endMatch(winner) {
  match.matchOver = true;
  clearInterval(timerInterval);
  resultText.textContent = winner === 'p1' ? '🔵 YOU WIN THE MATCH!' : '🔴 CPU WINS THE MATCH!';
  overlay.style.display = 'flex';
  Audio.play('cheer');
}

function showBanner(text, duration, cb, taunt) {
  bannerEl.textContent = text;
  bannerEl.classList.toggle('taunt', !!taunt);
  bannerEl.classList.remove('show'); void bannerEl.offsetWidth; bannerEl.classList.add('show');
  setTimeout(() => { bannerEl.classList.remove('show'); if (cb) cb(); }, duration);
}

function updateHealthBars() {
  youHealthEl.style.width = Math.max(0, (p1.health / p1.maxHealth) * 100) + '%';
  cpuHealthEl.style.width = Math.max(0, (p2.health / p2.maxHealth) * 100) + '%';
}

// ---------------- Main loop ----------------
function toFighterInput(cur, edges) {
  return { left: cur.left, right: cur.right, block: cur.block, jumpEdge: edges.jump, punchEdge: edges.punch, kickEdge: edges.kick };
}
function computeEdges(cur, prev) {
  const e = { jump: cur.jump && !prev.jump, punch: cur.punch && !prev.punch, kick: cur.kick && !prev.kick };
  prev.jump = cur.jump; prev.punch = cur.punch; prev.kick = cur.kick; prev.block = cur.block;
  return e;
}

function loop() {
  if (!match || match.matchOver) { loopId = requestAnimationFrame(loop); return; }
  const now = performance.now();
  let dt = Math.min((now - lastFrameTime) / 1000, 1 / 20);
  lastFrameTime = now;

  if (match.roundActive && !match.paused) {
    if (now >= match.hitStopUntil) {
      // ---- Player ----
      const pEdges = edgesFrom(prevPlayerEdge);
      const pInput = toFighterInput(input, pEdges);
      const pDash = consumeDash();
      p1.update(dt, pInput, p2, pDash ? pDash.dir : 0);

      // ---- CPU ----
      const decision = ai.decide(p2, p1, now / 1000);
      const cEdges = computeEdges(decision, prevCpuEdge);
      const cInput = toFighterInput(decision, cEdges);
      p2.update(dt, cInput, p1, ai.dashDir || 0);

      dispatchEvents(p1, p2);
      dispatchEvents(p2, p1);
    }

    camera.update(p1, p2, dt);
    const zoom = camera.applyTransform();
    background.update(camera.centerX, zoom);
  }

  loopId = requestAnimationFrame(loop);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
try {
  // FIX: Fighting games require landscape orientation rather than portrait
  if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
} catch (e) {}
