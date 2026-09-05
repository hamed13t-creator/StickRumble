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
    ai = new AI(difficulty); // ensure AI resets if difficulty changes mid-session
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
let match = null;
let timerInterval = null, loopId = null, lastFrameTime = 0;

// ---------------- Combat effect tiers ----------------
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
        if (fighter.comboCount >= 2) {
          const el = fighter.rig.combo;
          el.textContent = fighter.comboCount + 'x COMBO!';
          requestAnimationFrame(() => { // smoother UI refresh
            el.classList.remove('show');
            void el.offsetWidth;
            el.classList.add('show');
          });
          if (fighter.comboCount >= 3) Audio.play('crowdReact');
        }
        updateHealthBars();
        if (opp.health <= 0 && match.roundActive) endRound('ko', fighter === p1 ? 'p1' : 'p2');
        break;
      }
      case 'block':
        camera.shake(SHAKE.block);
        FX.spawnSparks(ev.x, ev.y, '#7fffd4', SPARKS.block, 1);
        Audio.play('block');
        break;
      case 'whoosh': Audio.play('whoosh'); break;
      case 'dash': FX.spawnAfterimage(fighter.el, fighter.ch.color); Audio.play('dash'); break;
      case 'flip': Audio.play('flip'); break;
      case 'land': Audio.play('land'); break;
      case 'ko':
        FX.flashKO(koFlashEl);
        camera.shake(SHAKE.ko);
        applyHitStop(HITSTOP.ko);
        FX.spawnSparks(ev.x, ev.y, '#ffffff', 30, 1.8);
        Audio.play('ko'); Audio.play('crowdReact');
        break;
    }
  }
}

// ---------------- Match / round flow ----------------
// (unchanged except AI reset already added above)

// ---------------- Main loop ----------------
function toFighterInput(cur, edges) {
  return { left: cur.left, right: cur.right, block: cur.block, jumpEdge: edges.jump, punchEdge: edges.punch, kickEdge: edges.kick };
}
function computeEdges(cur, prev) {
  const e = { jump: cur.jump && !prev.jump, punch: cur.punch && !prev.punch, kick: cur.kick && !prev.kick };
  Object.assign(prev, cur); // cleaner state update
  return e;
}

function loop() {
  if (!match || match.matchOver) { loopId = requestAnimationFrame(loop); return; }
