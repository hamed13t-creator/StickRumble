// js/effects.js — combat juice: procedural particles, blood splatter,
// motion-blur afterimages. Everything here is DOM+CSS driven, no canvas.
let fxLayer = null;

export function initEffects(layerEl) {
  fxLayer = layerEl;
}

function spawnEl(cls) {
  if (!fxLayer) return null;
  const el = document.createElement('div');
  el.className = cls;
  fxLayer.appendChild(el);
  const cleanup = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  el.addEventListener('animationend', cleanup, { once: true });
  setTimeout(cleanup, 1200); // ✅ longer safety window
  return el;
}

export function spawnSparks(x, y, color, count = 10, power = 1) {
  for (let i = 0; i < count; i++) {
    const el = spawnEl('spark');
    if (!el) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = (18 + Math.random() * 34) * power;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
    el.style.setProperty('--dy', (Math.sin(angle) * dist - 10 * power).toFixed(1) + 'px');
    el.style.setProperty('--sz', (2.5 + Math.random() * 4.5 * power).toFixed(1) + 'px'); // ✅ bigger variation
    el.style.opacity = (0.6 + Math.random() * 0.4).toFixed(2); // ✅ chaotic opacity
    el.style.background = color; el.style.color = color;
    el.style.transform = `rotate(${(Math.random() * 360).toFixed(1)}deg)`; // ✅ random rotation
  }
}

export function spawnStreaks(x, y, color, count = 4, power = 1) {
  for (let i = 0; i < count; i++) {
    const el = spawnEl('streak');
    if (!el) return;
    const angle = Math.random() * Math.PI * 2;
    const dist = (26 + Math.random() * 40) * power;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
    el.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(1) + 'px');
    el.style.setProperty('--ang', (angle * 180 / Math.PI).toFixed(1) + 'deg');
    el.style.setProperty('--sz', (10 + Math.random() * 18 * power).toFixed(1) + 'px'); // ✅ more variation
    el.style.background = color; el.style.color = color;
  }
}

export function spawnBlood(x, y, dirX, power = 1) {
  const count = Math.round(7 * power);
  for (let i = 0; i < count; i++) {
    const el = spawnEl('blood');
    if (!el) return;
    const angle = (dirX >= 0 ? -0.5 : Math.PI + 0.5) + (Math.random() - 0.5) * 1.6;
    const dist = (14 + Math.random() * 30) * power;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
    el.style.setProperty('--dy', (Math.sin(angle) * dist * 0.5 + 24).toFixed(1) + 'px');
    el.style.setProperty('--sz', (2 + Math.random() * 4.5 * power).toFixed(1) + 'px'); // ✅ bigger droplets
    if (Math.random() < 0.2) { // ✅ occasional spray streak
      el.classList.add('blood-streak');
    }
  }
}

const AFTERIMAGE_STRIP = ['hitflash', 'dashing', 'flipping', 'attack-punch', 'attack-kick',
  'attack-heavy', 'blocking', 'jump', 'special'];

export function spawnAfterimage(fighterEl, tint) {
  if (!fighterEl || !fighterEl.parentNode) return;
  for (let i = 0; i < 2; i++) { // ✅ multiple faint ghosts
    const ghost = fighterEl.cloneNode(true);
    ghost.removeAttribute('id');
    AFTERIMAGE_STRIP.forEach(c => ghost.classList.remove(c));
    ghost.classList.add('afterimage');
    ghost.style.opacity = (0.6 - i * 0.3).toFixed(2);
    if (tint) ghost.style.filter = `drop-shadow(0 0 ${8 + i * 4}px ${tint}) blur(${1 + i}px)`;
    ghost.style.transform = fighterEl.style.transform;
    ghost.style.left = fighterEl.style.left;
    ghost.style.top = fighterEl.style.top;
    ghost.style.zIndex = 4;
    fighterEl.parentNode.insertBefore(ghost, fighterEl);
    requestAnimationFrame(() => { ghost.style.opacity = '0'; });
    setTimeout(() => { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); }, 320 + i * 80);
  }
}

export function pulseClass(el, cls, dur) {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), dur);
}

export function flashKO(koFlashEl) {
  if (!koFlashEl) return;
  koFlashEl.classList.remove('show'); void koFlashEl.offsetWidth; koFlashEl.classList.add('show');
}

// ---------------- Batch 2: heavier impact effects ----------------
// Persistent blood on the street: splats land where blood falls and stay for the round
// (capped so a long round can't grow the DOM forever). Render-only.
let decalLayer = null;
const MAX_DECALS = 48;
export function initDecals(layerEl) { decalLayer = layerEl; }
export function clearDecals() { if (decalLayer) decalLayer.innerHTML = ''; }

export function spawnBloodDecal(x, groundY, dirX, power = 1) {
  if (!decalLayer) return;
  const n = 1 + Math.round(Math.random() * power);
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'bloodDecal';
    const w = (8 + Math.random() * 16) * power, h = w * (0.22 + Math.random() * 0.15);
    el.style.left = (x + dirX * (10 + Math.random() * 50 * power)).toFixed(1) + 'px';
    el.style.top = (groundY + 2 + Math.random() * 14).toFixed(1) + 'px';
    el.style.width = w.toFixed(1) + 'px'; el.style.height = h.toFixed(1) + 'px';
    el.style.setProperty('--rot', (Math.random() * 20 - 10).toFixed(1) + 'deg');
    decalLayer.appendChild(el);
    while (decalLayer.childElementCount > MAX_DECALS) decalLayer.firstElementChild.remove();
  }
}

// A heavy hit: more droplets, a few long spray arcs, and splats on the floor.
export function spawnBloodBurst(x, y, dirX, power, groundY) {
  spawnBlood(x, y, dirX, power * 1.6);
  for (let i = 0; i < Math.round(3 * power); i++) {
    const el = spawnEl('blood blood-arc');
    if (!el) break;
    const dist = 40 + Math.random() * 70 * power;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.setProperty('--dx', (dirX * dist).toFixed(1) + 'px');
    el.style.setProperty('--dy', (groundY - y + Math.random() * 10).toFixed(1) + 'px');
    el.style.setProperty('--sz', (3 + Math.random() * 3).toFixed(1) + 'px');
  }
  setTimeout(() => spawnBloodDecal(x, groundY, dirX, power), 380);
}

// Expanding shockwave ring + a bright star flash at the point of impact.
export function spawnImpact(x, y, color, power = 1) {
  const ring = spawnEl('impactRing');
  if (ring) {
    ring.style.left = x + 'px'; ring.style.top = y + 'px';
    ring.style.setProperty('--s', (0.8 + power * 0.6).toFixed(2));
    ring.style.borderColor = color;
  }
  const star = spawnEl('impactStar');
  if (star) {
    star.style.left = x + 'px'; star.style.top = y + 'px';
    star.style.setProperty('--s', (0.7 + power * 0.5).toFixed(2));
    star.style.setProperty('--r', (Math.random() * 90).toFixed(0) + 'deg');
  }
}

// Dust puffs rolling along the floor (knockdowns, landings, wall slides).
export function spawnDust(x, groundY, power = 1) {
  for (let i = 0; i < Math.round(5 * power); i++) {
    const el = spawnEl('dust');
    if (!el) break;
    const side = i % 2 ? 1 : -1;
    el.style.left = (x + side * Math.random() * 10).toFixed(1) + 'px';
    el.style.top = (groundY - 4).toFixed(1) + 'px';
    el.style.setProperty('--dx', (side * (20 + Math.random() * 40 * power)).toFixed(1) + 'px');
    el.style.setProperty('--sz', (10 + Math.random() * 14 * power).toFixed(1) + 'px');
  }
}

// Crowd shove: dark arms reach out of the crowd at the arena edge and push the fighter
// back into the fight. side: -1 = left edge, +1 = right edge.
export function spawnCrowdShove(x, y, side) {
  for (let i = 0; i < 4; i++) {
    const el = spawnEl('shoveArm');
    if (!el) break;
    const len = 60 + Math.random() * 30;
    // Arms start just outside the fighter (inside the crowd) and point back to centre.
    const sx = x + side * (len + 6), sy = y - 30 + i * 18 + (Math.random() * 8 - 4);
    el.style.left = sx.toFixed(1) + 'px';
    el.style.top = sy.toFixed(1) + 'px';
    el.style.width = len.toFixed(0) + 'px';
    el.style.setProperty('--r', ((side > 0 ? 180 : 0) + (Math.random() * 24 - 12)).toFixed(0) + 'deg');
    el.style.animationDelay = (i * 0.03).toFixed(2) + 's';
  }
}
