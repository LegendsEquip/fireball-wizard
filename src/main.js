import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, isBlocked, mouthPoint, MOUTHS } from './world.js';
import { Wizard, ChaseCamera } from './wizard.js';
import { Goblin } from './goblin.js';
import { FireSystem, FIREBALL, GREAT_FIREBALL } from './fireball.js';
import { Particles } from './particles.js';
import { LightPool } from './lights.js';
import { Sfx } from './audio.js';

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

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.72);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const fire = new Particles(scene, 4000, { additive: true });
const smoke = new Particles(scene, 1200, { additive: false });
const lights = new LightPool(scene, 8);
const sfx = new Sfx();
const fx = new FireSystem(scene, lights, fire, smoke, sfx);
const wizard = new Wizard(scene);
const chase = new ChaseCamera(camera);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const ph = h * renderer.getPixelRatio();
  fire.setViewport(ph, camera.fov);
  smoke.setViewport(ph, camera.fov);
}
window.addEventListener('resize', resize);
resize();

// ---------- Game state ----------
const game = {
  state: 'title', // title | playing | paused | dead
  goblins: [],
  score: 0,
  kills: 0,
  wave: 0,
  toSpawn: 0,
  spawnT: 0,
  waveDelay: 0,
  time: 0,
};
let best = 0;
try { best = Number(localStorage.getItem('fw-best-wave')) || 0; } catch (e) { /* storage blocked */ }

function resetRun() {
  for (const g of game.goblins) g.dispose();
  game.goblins = [];
  fx.clear();
  fire.clear();
  smoke.clear();
  lights.clear();
  wizard.reset();
  game.score = 0;
  game.kills = 0;
  game.wave = 0;
  game.toSpawn = 0;
  game.waveDelay = 1.5;
  hud.hpShown = wizard.hp;
}

function nextWave() {
  game.wave += 1;
  game.toSpawn = 3 + game.wave * 2;
  game.spawnT = 0.5;
  banner(`Wave ${game.wave}`);
  $('waveLbl').textContent = `Wave ${game.wave}`;
  sfx.wave();
}

function spawnGoblin() {
  const i = Math.floor(Math.random() * MOUTHS.length);
  const p = mouthPoint(i, 3 + Math.random() * 2);
  p.x += (Math.random() - 0.5) * 1.2;
  p.z += (Math.random() - 0.5) * 1.2;
  const g = new Goblin(scene, p);
  g.speed += game.wave * 0.12;
  game.goblins.push(g);
}

// ---------- Input ----------
const keys = {};
let mouseDown = false;
let locked = false;
let fallbackAim = false;

addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); if (game.state === 'playing') castGreat(); }
  if (e.code === 'Escape' && game.state === 'playing' && fallbackAim) pause();
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
  if (!locked && game.state === 'playing' && !fallbackAim) pause();
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

function castWith(stats) {
  const from = wizard.staffTip(new THREE.Vector3());
  const target = aimPoint(new THREE.Vector3());
  const dir = target.sub(from);
  if (dir.lengthSq() < 0.01) dir.copy(camera.getWorldDirection(tmpA));
  dir.normalize();
  // Nudge the spawn forward so it clears the staff
  from.addScaledVector(dir, 0.2);
  fx.cast(stats, from, dir);
  wizard.castKick = 1;
  sfx.cast(stats.big);
}

function castFire() {
  if (wizard.cool > 0 || wizard.dead) return;
  wizard.cool = FIREBALL.cooldown;
  castWith(FIREBALL);
}
function castGreat() {
  if (wizard.bigCool > 0 || wizard.dead) return;
  wizard.bigCool = GREAT_FIREBALL.cooldown;
  castWith(GREAT_FIREBALL);
  chase.addShake(0.15);
}

// ---------- Damage ----------
function hurtPlayer(amount, self) {
  if (wizard.dead || amount <= 0.2) return;
  wizard.hp = Math.max(0, wizard.hp - amount);
  wizard.hurtT = 0.5;
  hud.hurtFlash = Math.min(1, hud.hurtFlash + 0.4 + amount / 30);
  popText(self ? `−${Math.round(amount)} burn` : `−${Math.round(amount)}`, wizard.center(new THREE.Vector3()).setY(wizard.pos.y + 2), self ? 'self' : 'self');
  sfx.playerHurt();
  chase.addShake(0.2);
  if (wizard.hp <= 0) die();
}

function hitEnemy(g, amount, from) {
  const wasAlive = g.alive;
  const dmg = g.hurt(amount, from);
  if (dmg > 0) popText(`${Math.round(dmg)}`, g.center(new THREE.Vector3()).setY(g.pos.y + 1.9));
  if (wasAlive && !g.alive) {
    game.kills += 1;
    game.score += 100;
    sfx.goblinDie();
  } else if (dmg > 0) sfx.goblinHurt();
}

function die() {
  wizard.dead = true;
  game.state = 'dead';
  if (document.pointerLockElement) document.exitPointerLock();
  const reached = game.wave;
  if (reached > best) {
    best = reached;
    try { localStorage.setItem('fw-best-wave', String(best)); } catch (e) { /* storage blocked */ }
  }
  $('deadStats').textContent = `Wave ${game.wave} · ${game.kills} goblins · ${game.score.toLocaleString('en-US')} score`;
  $('dead').hidden = false;
  setTimeout(() => {
    $('dead').hidden = true;
    showTitle();
  }, 3200);
}

// ---------- HUD ----------
const hud = { hpShown: 100, hurtFlash: 0 };
const pops = [];

function banner(text) {
  const b = $('banner');
  b.textContent = text;
  b.classList.add('show');
  clearTimeout(banner.t);
  banner.t = setTimeout(() => b.classList.remove('show'), 1600);
}

function popText(text, worldPos, cls = '') {
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.textContent = text;
  $('pops').appendChild(el);
  pops.push({ el, pos: worldPos.clone(), t: 0 });
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

// ---------- Screens ----------
function showTitle() {
  game.state = 'title';
  $('hud').hidden = true;
  $('paused').hidden = true;
  $('title').hidden = false;
  $('best').textContent = best ? `Best: wave ${best}` : '';
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

$('play').addEventListener('click', startRun);
$('resume').addEventListener('click', resume);
$('quit').addEventListener('click', () => { resetRun(); showTitle(); });

// ---------- Main loop ----------
const clock = new THREE.Clock();
const titleCam = { t: 0 };

function update(dt) {
  game.time += dt;
  const playing = game.state === 'playing';

  if (playing) {
    wizard.update(dt, keys, game.time);
    if (mouseDown) castFire();

    // Waves
    const alive = game.goblins.filter((g) => g.alive).length;
    if (game.toSpawn > 0) {
      game.spawnT -= dt;
      if (game.spawnT <= 0) {
        spawnGoblin();
        game.toSpawn -= 1;
        game.spawnT = Math.max(0.35, 1.3 - game.wave * 0.08);
      }
    } else if (alive === 0) {
      game.waveDelay -= dt;
      if (game.waveDelay <= 0) {
        nextWave();
        game.waveDelay = 3;
      }
    }
  } else if (game.state === 'dead' || game.state === 'title') {
    wizard.update(dt, {}, game.time);
  }

  if (game.state !== 'paused') {
    for (let i = game.goblins.length - 1; i >= 0; i--) {
      const g = game.goblins[i];
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
      const f = 0.8 + 0.2 * Math.sin(game.time * 11 + t.seed) * Math.sin(game.time * 7.3 + t.seed * 2);
      t.light.intensity = 14 * f;
      if (Math.random() < 0.6) {
        fire.emit({
          x: t.flame.x + (Math.random() - 0.5) * 0.1, y: t.flame.y, z: t.flame.z + (Math.random() - 0.5) * 0.1,
          vx: (Math.random() - 0.5) * 0.3, vy: 0.9 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.3,
          life: 0.35 + Math.random() * 0.25, size: 0.32, endSize: 0.06, color: [1, 0.75, 0.35], endColor: [0.9, 0.2, 0.03], drag: 1,
        });
      }
    }
    fire.update(dt);
    smoke.update(dt);
    lights.update(dt);
  }

  if (game.state === 'title') {
    // Slow orbit behind the wizard on the title screen
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
window.__fw = { game, wizard, castFire, castGreat, startRun, update, camera, fx };
