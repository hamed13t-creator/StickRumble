// js/effects.js — combat juice: hit-stop, procedural particles, blood splatter,
// motion-blur afterimages. Everything here is DOM+CSS driven, no canvas.
let fxLayer = null;
let hitStopTimer = null;

export function initEffects(layerEl) {
  fxLayer = layerEl;
}

export function triggerHitStop(ms) {
  if (!ms) return;
  document.body.classList.add('hitstop');
  clearTimeout(hitStopTimer);
  hitStopTimer = setTimeout(() => document.body.classList.remove('hitstop'), ms);
  return performance.now() + ms;
}

function spawnEl(cls) {
  const el = document.createElement('div');
  el.className = cls;
  fxLayer.appendChild(el);
  const cleanup = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  el.addEventListener('animationend', cleanup, { once: true });
  setTimeout(cleanup, 900);
  return el;
}

export function spawnSparks(x, y, color, count = 10, power = 1) {
  for (let i = 0; i < count; i++) {
    const el = spawnEl('spark');
    const angle = Math.random() * Math.PI * 2;
    const dist = (18 + Math.random() * 34) * power;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
    el.style.setProperty('--dy', (Math.sin(angle) * dist - 10 * power).toFixed(1) + 'px');
    el.style.setProperty('--sz', (2.5 + Math.random() * 3.5 * power).toFixed(1) + 'px');
    el.style.background = color; el.style.color = color;
  }
}

export function spawnStreaks(x, y, color, count = 4, power = 1) {
  for (let i = 0; i < count; i++) {
    const el = spawnEl('streak');
    const angle = Math.random() * Math.PI * 2;
    const dist = (26 + Math.random() * 40) * power;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
    el.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
    el.style.setProperty('--ang', (angle * 180 / Math.PI).toFixed(1) + 'deg');
    el.style.setProperty('--sz', (10 + Math.random() * 14 * power).toFixed(1) + 'px');
    el.style.background = color; el.style.color = color;
  }
}

// Stylized blood splatter: dark-crimson droplets that fall under gravity and a couple
// of flat "spray" streaks along the hit direction. Kept graphic-novel stylized, not
// photoreal — small circles/streaks, same visual language as the spark system.
export function spawnBlood(x, y, dirX, power = 1) {
  const count = Math.round(7 * power);
  for (let i = 0; i < count; i++) {
    const el = spawnEl('blood');
    const angle = (dirX >= 0 ? -0.5 : Math.PI + 0.5) + (Math.random() - 0.5) * 1.6;
    const dist = (14 + Math.random() * 30) * power;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
    el.style.setProperty('--dy', (Math.sin(angle) * dist * 0.5 + 24).toFixed(1) + 'px');
    el.style.setProperty('--sz', (2 + Math.random() * 3.2 * power).toFixed(1) + 'px');
  }
}

// Motion-blur afterimage: clones a fighter's current pose, strips interactive state,
// and fades it out in place — used for dashes, flips, and fast whiffed strikes.
const AFTERIMAGE_STRIP = ['hitflash', 'dashing', 'flipping', 'attack-punch', 'attack-kick',
  'attack-heavy', 'blocking', 'jump', 'special'];
export function spawnAfterimage(fighterEl, tint) {
  const ghost = fighterEl.cloneNode(true);
  ghost.removeAttribute('id');
  AFTERIMAGE_STRIP.forEach(c => ghost.classList.remove(c));
  ghost.classList.add('afterimage');
  if (tint) ghost.style.filter = `drop-shadow(0 0 10px ${tint}) blur(1px)`;
  ghost.style.transform = fighterEl.style.transform;
  ghost.style.left = fighterEl.style.left;
  ghost.style.top = fighterEl.style.top;
  ghost.style.zIndex = 4;
  fighterEl.parentNode.insertBefore(ghost, fighterEl);
  requestAnimationFrame(() => { ghost.style.opacity = '0'; });
  setTimeout(() => { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); }, 260);
}

export function pulseClass(el, cls, dur) {
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), dur);
}

export function flashKO(koFlashEl) {
  koFlashEl.classList.remove('show'); void koFlashEl.offsetWidth; koFlashEl.classList.add('show');
}
