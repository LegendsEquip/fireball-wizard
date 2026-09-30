import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, isBlocked, hasLineOfSight, roomAt, spotInRoom, ROOMS } from './world.js';
import { Wizard, ChaseCamera } from './wizard.js';
import { Goblin } from './goblin.js';
import { FireSystem, FIREBALL, GREAT_FIREBALL } from './fireball.js';
import { Particles } from './particles.js';
import { LightPool } from './lights.js';
import { Sfx } from './audio.js';
import { CaveMap } from './map.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');

// ---------- Renderer and scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050407);
scene.fog = new THREE.FogExp2(0x07060a, 0.022);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight(0x55648a, 0x2a1d14, 1.1));
// A faint lantern glow from the camera so the wizard's back is never a silhouette
const lantern = new THREE.PointLight(0xffc896, 5, 10, 2);
camera.add(lantern);
scene.add(camera);

const world = buildWorld(scene);

// Torches and crystals share a few lights, handed to whichever are nearest
const glowLights = [];
for (let i = 0; i < 5; i++) {
  const l = new THREE.PointLight(0xff9a50, 0, 17, 2);
  scene.add(l);
  glowLights.push({ light: l, src: null });
}
let glowT = 0;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const fire = new Particles(scene, 4000, { additive: true });
const smoke = new Particles(scene, 1200, { additive: false });
const lights = new LightPool(scene, 6);
const sfx = new Sfx();
const fx = new FireSystem(scene, lights, fire, smoke, sfx);
const wizard = new Wizard(scene);
const chase = new ChaseCamera(camera);
const caveMap = new CaveMap($('minimap'), $('fullmap'));

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const ph = h * renderer.getPixelRatio();
  fire.setViewport(ph, camera.fov);
  smoke.setViewport(ph, camera.fov);
  $('fullmap').width = w;
  $('fullmap').height = h;
}
window.addEventListener('resize', resize);
resize();

// ---------- Game state ----------
const game = {
  state: 'title', // title | playing | map | paused | dead | cleared
  goblins: [],
  score: 0,
  kills: 0,
  time: 0,
  runTime: 0,
  room: null,
  visited: new Set(),
};
let best = 0;
try { best = Number(localStorage.getItem('fw-best-score')) || 0; } catch (e) { /* storage blocked */ }

function populate() {
  let seed = 1;
  for (const room of ROOMS) {
    for (let n = 0; n < room.enemies; n++) game.goblins.push(new Goblin(scene, spotInRoom(room, seed++ * 17)));
    if (room.chief) game.goblins.push(new Goblin(scene, spotInRoom(room, 777, 3), { chief: true }));
  }
}

function resetChest() {
  const c = world.chest;
  c.opened = false;
  c.lid.rotation.x = 0;
  c.glow.material.opacity = 0;
}

function resetRun() {
  for (const g of game.goblins) g.dispose();
  game.goblins = [];
  fx.clear();
  fire.clear();
  smoke.clear();
  lights.clear();
  wizard.reset();
  wizard.pos.set(world.start.x, 0, world.start.z - 3);
  game.score = 0;
  game.kills = 0;
  game.runTime = 0;
  game.room = null;
  game.visited.clear();
  caveMap.reset();
  resetChest();
  populate();
}

// ---------- Input ----------
const keys = {};
let mouseDown = false;
let locked = false;
let fallbackAim = false;

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); if (game.state === 'playing') castGreat(); }
  if (e.code === 'KeyM' || e.code === 'Tab') {
    e.preventDefault();
    if (game.state === 'playing') openMap();
    else if (game.state === 'map') closeMap();
  }
  if (e.code === 'Escape') {
    if (game.state === 'map') closeMap();
    else if (game.state === 'playing' && fallbackAim) pause();
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  mouseDown = true;
  if (game.state === 'playing' && !locked && !fallbackAim) requestLock();
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
addEventListener('mousemove', (e) => {
  if (game.state !== 'playing') return;
  if (locked || fallbackAim) wizard.look(e.movementX, e.movementY, 0.0024);
});
addEventListener('contextmenu', (e) => e.preventDefault());

function requestLock() {
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => { fallbackAim = true; });
  } catch (e) {
    fallbackAim = true;
  }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && !fallbackAim && (game.state === 'playing' || game.state === 'map')) {
    if (game.state === 'map') closeMap();
    pause();
  }
});
document.addEventListener('pointerlockerror', () => { fallbackAim = true; });

// ---------- Casting and aim ----------
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

function aimPoint(out) {
  // March from the camera through the crosshair until we hit a goblin or rock
  const origin = camera.position;
  const dir = camera.getWorldDirection(tmpA);
  const start = origin.distanceTo(wizard.pos) * 0.6;
  const p = tmpB;
  for (let s = start; s < 70; s += 0.2) {
    p.copy(origin).addScaledVector(dir, s);
    for (const g of game.goblins) {
      if (g.alive && g.distanceTo(p) < g.hitRadius) return out.copy(p);
    }
    if (isBlocked(p, 0.05)) return out.copy(p);
  }
  return out.copy(origin).addScaledVector(dir, 70);
}

// Pick the goblin the wizard is facing: within 30 units, inside a 20 degree
// cone around the aim, and in plain view.
function autoTarget() {
  const fwd = camera.getWorldDirection(tmpA).setY(0).normalize();
  let best = null, bestScore = Infinity;
  for (const g of game.goblins) {
    if (!g.alive) continue;
    const dx = g.pos.x - wizard.pos.x, dz = g.pos.z - wizard.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 30 || d < 0.01) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fwd.x + dz * fwd.z) / d)));
    if (ang > 0.35) continue;
    if (!hasLineOfSight(wizard.pos, g.pos)) continue;
    const score = ang * 25 + d * 0.15;
    if (score < bestScore) { bestScore = score; best = g; }
  }
  return best;
}

function castAt(stats, target) {
  const from = wizard.staffTip(new THREE.Vector3());
  let dir;
  if (target) {
    // Lead the target a little so moving goblins still get hit
    const c = target.center(new THREE.Vector3());
    const t = c.distanceTo(from) / stats.speed;
    c.addScaledVector(target.vel, t * 0.8);
    dir = c.sub(from);
  } else {
    dir = aimPoint(new THREE.Vector3()).sub(from);
  }
  if (dir.lengthSq() < 0.01) dir.copy(camera.getWorldDirection(tmpA));
  dir.normalize();
  from.addScaledVector(dir, 0.2);
  fx.cast(stats, from, dir);
  wizard.castKick = 1;
  sfx.cast(stats.big);
}

function castFire(target = null) {
  if (wizard.cool > 0 || wizard.dead) return;
  wizard.cool = FIREBALL.cooldown;
  castAt(FIREBALL, target);
}
function castGreat() {
  if (wizard.bigCool > 0 || wizard.dead) return;
  wizard.bigCool = GREAT_FIREBALL.cooldown;
  castAt(GREAT_FIREBALL, null);
  chase.addShake(0.15);
}

// ---------- Damage ----------
function hurtPlayer(amount, self) {
  if (wizard.dead || amount <= 0.2) return;
  wizard.hp = Math.max(0, wizard.hp - amount);
  wizard.hurtT = 0.5;
  hud.hurtFlash = Math.min(1, hud.hurtFlash + 0.4 + amount / 30);
  popText(self ? `−${Math.round(amount)} burn` : `−${Math.round(amount)}`, wizard.center(new THREE.Vector3()).setY(wizard.pos.y + 2), 'self');
  sfx.playerHurt();
  chase.addShake(0.2);
  if (wizard.hp <= 0) die();
}

function hitEnemy(g, amount, from) {
  const wasAlive = g.alive;
  const dmg = g.hurt(amount, from);
  if (dmg > 0) popText(`${Math.round(dmg)}`, g.center(new THREE.Vector3()).setY(g.pos.y + 1.9 * g.scale));
  if (wasAlive && !g.alive) {
    game.kills += 1;
    game.score += g.points;
    sfx.goblinDie();
  } else if (dmg > 0) sfx.goblinHurt();
}

function saveBest() {
  if (game.score > best) {
    best = game.score;
    try { localStorage.setItem('fw-best-score', String(best)); } catch (e) { /* storage blocked */ }
  }
}

function die() {
  wizard.dead = true;
  game.state = 'dead';
  if (document.pointerLockElement) document.exitPointerLock();
  saveBest();
  $('deadStats').textContent = `${game.kills} goblins · ${game.score.toLocaleString('en-US')} score · ${game.visited.size} of ${ROOMS.length} rooms found`;
  $('dead').hidden = false;
  setTimeout(() => {
    $('dead').hidden = true;
    showTitle();
  }, 3200);
}

function clearLevel() {
  game.state = 'cleared';
  if (document.pointerLockElement) document.exitPointerLock();
  const bonus = 2000;
  game.score += bonus;
  saveBest();
  const mins = Math.floor(game.runTime / 60), secs = Math.floor(game.runTime % 60);
  $('clearedStats').textContent = `${game.kills} goblins · ${game.score.toLocaleString('en-US')} score (including a ${bonus.toLocaleString('en-US')} exit bonus) · ${mins}:${String(secs).padStart(2, '0')}`;
  $('hud').hidden = true;
  $('cleared').hidden = false;
}

// ---------- HUD ----------
const hud = { hurtFlash: 0 };
const pops = [];

function banner(text) {
  const b = $('banner');
  b.textContent = text;
  b.classList.add('show');
  clearTimeout(banner.t);
  banner.t = setTimeout(() => b.classList.remove('show'), 1800);
}

function popText(text, worldPos, cls = '') {
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.textContent = text;
  $('pops').appendChild(el);
  pops.push({ el, pos: worldPos.clone(), t: 0 });
}

function mapMarkers() {
  const m = [];
  const c = world.chest;
  if (!c.opened) m.push({ x: c.pos.x, z: c.pos.z, color: '#e9b949', size: 5, shape: 'diamond' });
  m.push({ x: world.exit.pos.x, z: world.exit.pos.z, color: '#8fd8ff', size: 6 });
  for (const g of game.goblins) {
    if (g.alive && g.pos.distanceTo(wizard.pos) < 22) m.push({ x: g.pos.x, z: g.pos.z, color: g.state === 'chase' ? '#ff5a3c' : '#b8453a', size: g.chief ? 4.5 : 3 });
  }
  return m;
}

function updateHud(dt) {
  const hpK = wizard.hp / wizard.maxHp;
  $('hpFill').style.width = `${hpK * 100}%`;
  $('hpChip').style.width = `${hpK * 100}%`;
  $('hpNum').textContent = `${Math.ceil(wizard.hp)} / ${wizard.maxHp}`;
  $('score').textContent = game.score.toLocaleString('en-US');
  $('kills').textContent = `Kills ${game.kills}`;
  const f = 1 - wizard.cool / FIREBALL.cooldown, g = 1 - wizard.bigCool / GREAT_FIREBALL.cooldown;
  $('slotFire').style.setProperty('--p', f.toFixed(3));
  $('slotBig').style.setProperty('--p', g.toFixed(3));
  $('slotFire').classList.toggle('ready', wizard.cool <= 0);
  $('slotBig').classList.toggle('ready', wizard.bigCool <= 0);
  hud.hurtFlash = Math.max(0, hud.hurtFlash - dt * 1.6);
  const low = hpK < 0.3 ? 0.25 + 0.15 * Math.sin(game.time * 6) : 0;
  $('hurt').style.opacity = Math.max(hud.hurtFlash, low).toFixed(3);
  caveMap.drawMini(wizard, mapMarkers());

  const w = window.innerWidth, h = window.innerHeight;
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.t += dt;
    if (p.t > 1) { p.el.remove(); pops.splice(i, 1); continue; }
    const v = tmpA.copy(p.pos);
    v.y += p.t * 0.8;
    v.project(camera);
    if (v.z > 1) { p.el.style.opacity = 0; continue; }
    p.el.style.left = `${(v.x * 0.5 + 0.5) * w}px`;
    p.el.style.top = `${(-v.y * 0.5 + 0.5) * h}px`;
    p.el.style.opacity = String(1 - p.t * p.t);
  }
}

function updateRoom() {
  const r = roomAt(wizard.pos.x, wizard.pos.z);
  if (r === game.room) return;
  game.room = r;
  $('roomName').textContent = r ? r.name : 'Tunnels';
  if (r && !game.visited.has(r.id)) {
    game.visited.add(r.id);
    if (r.id !== 'start') banner(r.name);
  }
}

// ---------- Treasure and the exit ----------
function updateProps(dt) {
  const c = world.chest;
  if (!c.opened && wizard.pos.distanceTo(c.pos) < 1.8 && !wizard.dead) {
    c.opened = true;
    game.score += 500;
    wizard.hp = Math.min(wizard.maxHp, wizard.hp + 40);
    popText('+500 treasure · +40 HP', c.pos.clone().setY(c.pos.y + 1.6));
    sfx.wave();
    for (let i = 0; i < 40; i++) {
      fire.emit({
        x: c.pos.x, y: c.pos.y + 0.7, z: c.pos.z,
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 3,
        life: 0.8 + Math.random() * 0.5, size: 0.12, endSize: 0.03, color: [1, 0.9, 0.5], endColor: [1, 0.7, 0.2], gravity: 5,
      });
    }
  }
  if (c.opened) {
    c.lid.rotation.x = Math.max(-1.9, c.lid.rotation.x - dt * 5);
    c.glow.material.opacity = Math.max(0, c.glow.material.opacity > 0 ? c.glow.material.opacity - dt * 0.4 : 0);
  }
  const ex = world.exit;
  ex.ring.rotation.z += dt * 0.6;
  ex.disc.material.opacity = 0.3 + 0.1 * Math.sin(game.time * 3);
  if (Math.random() < 0.5) {
    const a = Math.random() * Math.PI * 2;
    fire.emit({
      x: ex.pos.x + Math.cos(a) * 1.5, y: ex.pos.y + 1.8 + Math.sin(a) * 1.5, z: ex.pos.z,
      vx: 0, vy: 0.5, vz: 0, life: 1, size: 0.15, endSize: 0.02, color: [0.6, 0.85, 1], endColor: [0.2, 0.5, 1],
    });
  }
  if (game.state === 'playing' && wizard.pos.distanceTo(ex.pos) < 1.8) clearLevel();
}

function updateGlowLights() {
  glowT -= 1;
  if (glowT > 0) return;
  glowT = 15;
  const near = world.glowSources
    .map((s) => ({ s, d: s.pos.distanceToSquared(wizard.pos) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, glowLights.length);
  glowLights.forEach((g, i) => {
    const s = near[i] && near[i].s;
    g.src = s;
    if (s) {
      g.light.position.copy(s.pos);
      g.light.color.set(s.color);
    }
  });
}

// ---------- Screens ----------
function showTitle() {
  game.state = 'title';
  $('hud').hidden = true;
  $('paused').hidden = true;
  $('cleared').hidden = true;
  $('bigmap').hidden = true;
  $('title').hidden = false;
  $('best').textContent = best ? `Best score: ${best.toLocaleString('en-US')}` : '';
  resetRun();
}

function startRun() {
  sfx.init();
  resetRun();
  $('title').hidden = true;
  $('hud').hidden = false;
  game.state = 'playing';
  requestLock();
}

function pause() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  mouseDown = false;
  $('paused').hidden = false;
}

function resume() {
  $('paused').hidden = true;
  game.state = 'playing';
  if (!fallbackAim) requestLock();
}

function openMap() {
  game.state = 'map';
  mouseDown = false;
  $('bigmap').hidden = false;
  caveMap.drawFull(wizard, mapMarkers());
}

function closeMap() {
  $('bigmap').hidden = true;
  if (game.state === 'map') game.state = 'playing';
}

$('play').addEventListener('click', startRun);
$('resume').addEventListener('click', resume);
$('quit').addEventListener('click', () => showTitle());
$('clearedBtn').addEventListener('click', () => showTitle());

// ---------- Main loop ----------
const clock = new THREE.Clock();
const titleCam = { t: 0 };
const frozen = () => game.state === 'paused' || game.state === 'map' || game.state === 'cleared';

function update(dt) {
  game.time += dt;
  const playing = game.state === 'playing';

  if (playing) {
    game.runTime += dt;
    wizard.update(dt, keys, game.time);
    if (mouseDown) castFire(null);
    else if (wizard.cool <= 0) {
      const t = autoTarget();
      if (t) castFire(t);
    }
    caveMap.update(dt, wizard.pos);
    updateRoom();
  } else if (game.state === 'dead' || game.state === 'title') {
    wizard.update(dt, {}, game.time);
  }

  if (!frozen()) {
    for (let i = game.goblins.length - 1; i >= 0; i--) {
      const g = game.goblins[i];
      // Goblins far from the wizard stand still to save work
      if (g.alive && g.state === 'idle' && g.pos.distanceToSquared(wizard.pos) > 50 * 50) continue;
      const keep = g.update(dt, wizard, game.goblins, camera, (dmg) => { sfx.goblinJab(); hurtPlayer(dmg, false); });
      if (!keep) { g.dispose(); game.goblins.splice(i, 1); }
    }
    fx.update(dt, {
      enemies: game.goblins,
      wizard,
      cameraPos: camera.position,
      onEnemyHit: hitEnemy,
      onSelfHit: (d) => hurtPlayer(d, true),
      shake: (a) => chase.addShake(a),
    });
    for (const t of world.torches) {
      if (t.flame.distanceToSquared(wizard.pos) > 45 * 45 || Math.random() > 0.6) continue;
      fire.emit({
        x: t.flame.x + (Math.random() - 0.5) * 0.1, y: t.flame.y, z: t.flame.z + (Math.random() - 0.5) * 0.1,
        vx: (Math.random() - 0.5) * 0.3, vy: 0.9 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.3,
        life: 0.35 + Math.random() * 0.25, size: 0.32, endSize: 0.06, color: [1, 0.75, 0.35], endColor: [0.9, 0.2, 0.03], drag: 1,
      });
    }
    updateGlowLights();
    for (const g of glowLights) {
      if (!g.src) { g.light.intensity = 0; continue; }
      const s = g.src;
      const f = s.flicker ? 0.8 + 0.2 * Math.sin(game.time * 11 + s.seed) * Math.sin(game.time * 7.3 + s.seed * 2) : 1;
      g.light.intensity = s.intensity * f;
    }
    updateProps(dt);
    fire.update(dt);
    smoke.update(dt);
    lights.update(dt);
  }

  if (game.state === 'title') {
    // Slow sway behind the wizard on the title screen
    titleCam.t += dt * 0.12;
    wizard.yaw = Math.sin(titleCam.t) * 0.6;
    wizard.pitch = 0.08;
  }
  chase.update(wizard, dt);
  if (game.state === 'playing' || game.state === 'dead') updateHud(dt);
}

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  composer.render();
  requestAnimationFrame(frame);
}

showTitle();
frame();

// Exposed for automated checks
window.__fw = { game, wizard, castFire, castGreat, startRun, update, camera, fx, caveMap, openMap, closeMap };
