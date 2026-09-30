import * as THREE from 'three';
import { isBlocked, floorY } from './world.js';

// Base stats. Boons will modify copies of these in step 2.
export const FIREBALL = { radius: 0.26, speed: 24, damage: 28, blast: 2.6, selfDamage: 6, cooldown: 0.6, big: false };
export const GREAT_FIREBALL = { radius: 0.55, speed: 16, damage: 75, blast: 5.2, selfDamage: 22, cooldown: 8, big: true };

const coreGeo = new THREE.SphereGeometry(1, 16, 12);
const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4 });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff7a1f, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.2)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const flashMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const flashMat2 = new THREE.SpriteMaterial({ map: glowTex, color: 0xff6a18, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const ringGeo = new THREE.RingGeometry(0.8, 1, 48);
ringGeo.rotateX(-Math.PI / 2);
const scorchTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd.addColorStop(0.55, 'rgba(10,6,4,0.6)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const scorchGeo = new THREE.PlaneGeometry(1, 1);
scorchGeo.rotateX(-Math.PI / 2);

class Fireball {
  constructor(sys, stats, from, dir) {
    this.stats = stats;
    this.pos = from.clone();
    this.vel = dir.clone().multiplyScalar(stats.speed);
    this.age = 0;
    this.group = new THREE.Group();
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.scale.setScalar(stats.radius * 0.55);
    this.glow = new THREE.Mesh(coreGeo, glowMat);
    this.glow.scale.setScalar(stats.radius * 1.3);
    this.group.add(core, this.glow);
    this.group.position.copy(this.pos);
    sys.scene.add(this.group);
    this.light = sys.lights.acquire(this);
    if (this.light) {
      this.light.light.color.set(0xff8a3a);
      this.light.light.distance = stats.big ? 22 : 15;
      this.light.light.intensity = stats.big ? 70 : 30;
    }
  }
}

export class FireSystem {
  constructor(scene, lights, fire, smoke, sfx) {
    this.scene = scene;
    this.lights = lights;
    this.fire = fire;
    this.smoke = smoke;
    this.sfx = sfx;
    this.balls = [];
    this.flashes = [];
    this.scorches = [];
  }

  cast(stats, from, dir) {
    this.balls.push(new Fireball(this, stats, from, dir));
    // Muzzle puff
    for (let i = 0; i < (stats.big ? 26 : 10); i++) {
      this.fire.emit({
        x: from.x, y: from.y, z: from.z,
        vx: dir.x * 4 + (Math.random() - 0.5) * 3, vy: dir.y * 4 + (Math.random() - 0.5) * 3, vz: dir.z * 4 + (Math.random() - 0.5) * 3,
        life: 0.25 + Math.random() * 0.2, size: stats.big ? 0.7 : 0.4, endSize: 0.05,
        color: [1, 0.85, 0.5], endColor: [1, 0.3, 0.05], drag: 4,
      });
    }
  }

  // ctx: { enemies, wizard, onEnemyHit(enemy, dmg), onSelfHit(dmg), shake(amount) }
  update(dt, ctx) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.age += dt;
      const steps = Math.max(1, Math.ceil((b.vel.length() * dt) / 0.2));
      let hit = null;
      for (let s = 0; s < steps && !hit; s++) {
        b.pos.addScaledVector(b.vel, dt / steps);
        for (const e of ctx.enemies) {
          if (!e.alive) continue;
          if (e.distanceTo(b.pos) < e.hitRadius + b.stats.radius) { hit = { enemy: e }; break; }
        }
        if (!hit && isBlocked(b.pos, b.stats.radius * 0.6)) hit = {};
      }
      if (!hit && b.age > 3.5) hit = {};
      b.group.position.copy(b.pos);
      const f = 0.85 + Math.random() * 0.3;
      b.glow.scale.setScalar(b.stats.radius * 1.3 * f);
      if (b.light) b.light.light.position.copy(b.pos);
      // Trail
      const r = b.stats.radius;
      for (let k = 0; k < (b.stats.big ? 5 : 3); k++) {
        this.fire.emit({
          x: b.pos.x + (Math.random() - 0.5) * r, y: b.pos.y + (Math.random() - 0.5) * r, z: b.pos.z + (Math.random() - 0.5) * r,
          vx: (Math.random() - 0.5) * 1.2, vy: 0.6 + Math.random(), vz: (Math.random() - 0.5) * 1.2,
          life: 0.25 + Math.random() * 0.25, size: r * 2.6, endSize: r * 0.4,
          color: [1, 0.78, 0.35], endColor: [0.9, 0.18, 0.02], drag: 2,
        });
      }
      if (Math.random() < 0.35) {
        this.smoke.emit({
          x: b.pos.x, y: b.pos.y, z: b.pos.z, vx: 0, vy: 0.8, vz: 0,
          life: 0.9, size: r * 2, endSize: r * 5, color: [0.12, 0.1, 0.09], alpha: 0.35, drag: 1,
        });
      }
      if (hit) {
        this.explode(b.pos, b.stats, hit.enemy, ctx);
        this.scene.remove(b.group);
        this.lights.release(b.light);
        this.balls.splice(i, 1);
      }
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        this.scene.remove(f.mesh);
        f.mesh.material.dispose();
        this.flashes.splice(i, 1);
        continue;
      }
      const e = 1 - (1 - k) * (1 - k);
      f.mesh.scale.setScalar(f.from + (f.to - f.from) * e);
      f.mesh.material.opacity = f.alpha * (1 - k);
    }

    for (let i = this.scorches.length - 1; i >= 0; i--) {
      const s = this.scorches[i];
      s.t += dt;
      if (s.t > 12) {
        this.scene.remove(s.mesh);
        s.mesh.material.dispose();
        this.scorches.splice(i, 1);
      } else if (s.t > 8) s.mesh.material.opacity = 1 - (s.t - 8) / 4;
    }
  }

  explode(pos, stats, direct, ctx) {
    const R = stats.blast;
    // Damage: full at the centre, 40% at the edge. The wizard is not immune.
    for (const e of ctx.enemies) {
      if (!e.alive) continue;
      const d = e.distanceTo(pos);
      if (e === direct || d < R) {
        const k = e === direct ? 1 : 1 - 0.6 * (d / R);
        ctx.onEnemyHit(e, stats.damage * k, pos);
      }
    }
    const wd = ctx.wizard.center(TMP).distanceTo(pos);
    if (wd < R && !ctx.wizard.dead) ctx.onSelfHit(stats.selfDamage * (1 - wd / R));

    // Visuals
    this.addFlash(pos, flashMat, R * 0.5, R * 2.0, 0.3, 1);
    this.addFlash(pos, flashMat2, R * 0.8, R * 3.2, 0.55, 0.8);
    const fy = floorY(pos.x, pos.z);
    if (pos.y - fy < R) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffc080, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.position.set(pos.x, fy + 0.06, pos.z);
      this.scene.add(ring);
      this.flashes.push({ mesh: ring, t: 0, dur: 0.45, from: 0.2, to: R, alpha: 0.9 });
      const scorch = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      scorch.scale.setScalar(R * 1.3);
      scorch.position.set(pos.x, fy + 0.03, pos.z);
      scorch.rotation.y = Math.random() * 6;
      this.scene.add(scorch);
      this.scorches.push({ mesh: scorch, t: 0 });
      if (this.scorches.length > 40) {
        const old = this.scorches.shift();
        this.scene.remove(old.mesh);
        old.mesh.material.dispose();
      }
    }
    this.lights.flash(pos, 0xff9040, stats.big ? 600 : 180, R * 6, stats.big ? 0.7 : 0.4);

    const n = stats.big ? 110 : 45;
    for (let i = 0; i < n; i++) {
      const v = randDir().multiplyScalar((0.4 + Math.random()) * R * 3);
      this.fire.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: v.x, vy: v.y + 1.5, vz: v.z,
        life: 0.35 + Math.random() * 0.45, size: R * 0.35, endSize: 0.04,
        color: [1, 0.85, 0.45], endColor: [0.8, 0.15, 0.02], drag: 3.5, gravity: 2,
      });
    }
    for (let i = 0; i < n / 2; i++) {
      const v = randDir().multiplyScalar(R * 7 * (0.5 + Math.random()));
      this.fire.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: v.x, vy: v.y + 3, vz: v.z,
        life: 0.5 + Math.random() * 0.5, size: 0.08, endSize: 0.02,
        color: [1, 0.9, 0.6], endColor: [1, 0.4, 0.1], drag: 1.2, gravity: 9,
      });
    }
    for (let i = 0; i < (stats.big ? 16 : 7); i++) {
      const v = randDir().multiplyScalar(R * 0.8);
      this.smoke.emit({
        x: pos.x + v.x * 0.3, y: pos.y + v.y * 0.3, z: pos.z + v.z * 0.3, vx: v.x, vy: Math.abs(v.y) + 1.2, vz: v.z,
        life: 1.4 + Math.random(), size: R * 0.6, endSize: R * 1.6, color: [0.07, 0.06, 0.055], alpha: 0.32, drag: 1.5,
      });
    }

    const camD = ctx.cameraPos.distanceTo(pos);
    ctx.shake(Math.max(0, (stats.big ? 0.9 : 0.4) * (1 - camD / 30)));
    this.sfx.explode(stats.big, Math.max(0.15, 1 - camD / 40));
  }

  addFlash(pos, baseMat, from, to, dur, alpha) {
    const m = new THREE.Sprite(baseMat.clone());
    m.position.copy(pos);
    this.scene.add(m);
    this.flashes.push({ mesh: m, t: 0, dur, from, to, alpha });
  }

  clear() {
    for (const b of this.balls) { this.scene.remove(b.group); this.lights.release(b.light); }
    for (const f of this.flashes) { this.scene.remove(f.mesh); f.mesh.material.dispose(); }
    for (const s of this.scorches) { this.scene.remove(s.mesh); s.mesh.material.dispose(); }
    this.balls = [];
    this.flashes = [];
    this.scorches = [];
  }
}

const TMP = new THREE.Vector3();
function randDir() {
  const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a));
}
