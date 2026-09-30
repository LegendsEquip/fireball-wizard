import * as THREE from 'three';
import { floorY, resolveWalker, hasLineOfSight } from './world.js';

const geos = {
  body: new THREE.SphereGeometry(0.34, 12, 10),
  head: new THREE.SphereGeometry(0.24, 12, 10),
  ear: new THREE.ConeGeometry(0.08, 0.36, 6),
  eye: new THREE.SphereGeometry(0.04, 8, 6),
  nose: new THREE.ConeGeometry(0.05, 0.16, 6),
  leg: new THREE.CylinderGeometry(0.07, 0.06, 0.45, 7),
  arm: new THREE.CylinderGeometry(0.055, 0.05, 0.42, 7),
  cloth: new THREE.CylinderGeometry(0.3, 0.36, 0.22, 10, 1, true),
  shaft: new THREE.CylinderGeometry(0.022, 0.022, 1.7, 6),
  tip: new THREE.ConeGeometry(0.06, 0.22, 6),
  bar: new THREE.PlaneGeometry(0.8, 0.08),
};
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5530 });
const clothMat = new THREE.MeshStandardMaterial({ color: 0x5a3b24, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9, flatShading: true });
const ironMat = new THREE.MeshStandardMaterial({ color: 0x9a9aa0, roughness: 0.4, metalness: 0.7, flatShading: true });
const barBack = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false });
const barFill = new THREE.MeshBasicMaterial({ color: 0xe0503f, depthWrite: false });

export class Goblin {
  constructor(scene, pos, { chief = false } = {}) {
    this.scene = scene;
    this.chief = chief;
    this.baseColor = new THREE.Color(chief ? 0x5d7a3a : 0x6f8f45);
    this.skin = new THREE.MeshStandardMaterial({ color: this.baseColor, roughness: 0.8, flatShading: true, emissive: 0x000000 });
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const torso = new THREE.Mesh(geos.body, this.skin);
    torso.scale.set(1, 1.1, 0.85);
    torso.position.y = 0.78;
    body.add(torso);
    const cloth = new THREE.Mesh(geos.cloth, clothMat);
    cloth.position.y = 0.5;
    body.add(cloth);
    const head = new THREE.Group();
    head.position.set(0, 1.22, 0.06);
    body.add(head);
    head.add(new THREE.Mesh(geos.head, this.skin));
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(geos.ear, this.skin);
      ear.position.set(s * 0.27, 0.05, -0.02);
      ear.rotation.z = -s * 1.25;
      ear.rotation.x = -0.2;
      head.add(ear);
      const eye = new THREE.Mesh(geos.eye, eyeMat);
      eye.position.set(s * 0.085, 0.03, 0.2);
      head.add(eye);
    }
    const nose = new THREE.Mesh(geos.nose, this.skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.03, 0.26);
    head.add(nose);
    this.legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.14, 0.45, 0);
      const leg = new THREE.Mesh(geos.leg, this.skin);
      leg.position.y = -0.22;
      pivot.add(leg);
      body.add(pivot);
      this.legs.push(pivot);
    }
    // Arm holding a spear
    this.arm = new THREE.Group();
    this.arm.position.set(0.32, 0.98, 0);
    body.add(this.arm);
    const arm = new THREE.Mesh(geos.arm, this.skin);
    arm.position.set(0, -0.18, 0.05);
    arm.rotation.x = 0.4;
    this.arm.add(arm);
    const spear = new THREE.Group();
    spear.position.set(0.02, -0.32, 0.16);
    spear.rotation.x = 0.15;
    this.arm.add(spear);
    spear.add(new THREE.Mesh(geos.shaft, woodMat));
    const tip = new THREE.Mesh(geos.tip, ironMat);
    tip.position.y = 0.95;
    spear.add(tip);

    // Health bar, shown once hurt
    this.bar = new THREE.Group();
    this.bar.position.y = 1.72;
    this.bar.add(new THREE.Mesh(geos.bar, barBack));
    this.barFill = new THREE.Mesh(geos.bar, barFill);
    this.barFill.position.z = 0.001;
    this.bar.add(this.barFill);
    this.bar.visible = false;
    root.add(this.bar);

    this.root = root;
    this.body = body;
    this.scale = chief ? 1.55 : 1;
    root.scale.setScalar(this.scale);
    if (chief) {
      // An iron helmet with a crest so the chief stands out
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), ironMat);
      helm.position.set(0, 0.04, 0);
      head.add(helm);
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.4), new THREE.MeshStandardMaterial({ color: 0xb02a1a, roughness: 0.7, flatShading: true }));
      crest.position.set(0, 0.28, 0);
      head.add(crest);
    }
    scene.add(root);

    this.pos = pos.clone();
    root.position.copy(pos);
    root.rotation.y = Math.random() * Math.PI * 2;
    this.home = pos.clone();
    this.state = 'idle'; // idle | chase
    this.wanderT = Math.random() * 3;
    this.wanderTo = pos.clone();
    this.senseT = Math.random() * 0.3;
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.yaw = 0;
    this.radius = 0.42 * this.scale;
    this.hitRadius = 0.45 * this.scale;
    this.maxHp = chief ? 220 : 40;
    this.hp = this.maxHp;
    this.fireResist = 0.25;
    this.speed = (chief ? 2.7 : 3.1) + Math.random() * 0.8;
    this.alive = true;
    this.deadT = 0;
    this.attackT = 0;
    this.windup = 0;
    this.flash = 0;
    this.burnT = 0;
    this.burnDps = 0;
    this.walkT = Math.random() * 10;
    this.damage = chief ? 16 : 7;
    this.points = chief ? 1000 : 100;
  }

  center(out = new THREE.Vector3()) {
    return out.copy(this.pos).setY(this.pos.y + 0.85 * this.scale);
  }

  // Upright capsule from the feet to the top of the head
  distanceTo(p) {
    const y = Math.min(this.pos.y + 1.25 * this.scale, Math.max(this.pos.y + 0.35 * this.scale, p.y));
    const dx = p.x - this.pos.x, dy = p.y - y, dz = p.z - this.pos.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Returns damage actually taken
  hurt(amount, from, quiet = false) {
    if (!this.alive) return 0;
    const dmg = amount * (1 - this.fireResist);
    this.hp -= dmg;
    if (!quiet) this.flash = 1;
    this.alert();
    this.bar.visible = true;
    if (from) {
      const push = this.pos.clone().sub(from).setY(0);
      if (push.lengthSq() > 1e-4) this.knock.add(push.normalize().multiplyScalar(Math.min(9, amount * 0.18)));
    }
    if (this.hp <= 0) {
      this.alive = false;
      this.bar.visible = false;
      this.fallDir = Math.random() < 0.5 ? -1 : 1;
    }
    return dmg;
  }

  alert() {
    this.state = 'chase';
  }

  // Lingering Burn: damage over time, handled by the game loop
  ignite(dps) {
    this.burnT = 3;
    this.burnDps = Math.max(this.burnDps || 0, dps);
  }

  update(dt, wiz, others, camera, onHitPlayer) {
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 5);
      this.skin.emissive.setRGB(this.flash * 1.2, this.flash * 0.5, this.flash * 0.15);
    }
    if (!this.alive) {
      this.deadT += dt;
      const t = Math.min(1, this.deadT / 0.5);
      this.body.rotation.x = -t * 1.45;
      this.body.rotation.z = this.fallDir * t * 0.3;
      if (this.deadT > 1.5) this.root.position.y = this.pos.y - (this.deadT - 1.5) * 0.6;
      this.skin.color.copy(this.baseColor).multiplyScalar(1 - t * 0.6);
      return this.deadT < 2.8;
    }

    const toP = wiz.pos.clone().sub(this.pos).setY(0);
    const dist = toP.length();
    const want = new THREE.Vector3();

    // Notice the wizard when close with a clear view; give up when far away
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.25;
      if (this.state === 'idle' && !wiz.dead && dist < 15 && hasLineOfSight(this.pos, wiz.pos)) {
        this.state = 'chase';
        for (const o of others) if (o.alive && o.pos.distanceTo(this.pos) < 9) o.alert();
      } else if (this.state === 'chase' && (dist > 45 || wiz.dead)) {
        this.state = 'idle';
      }
    }

    if (this.state === 'chase') {
      if (dist > 1.25 * this.scale && !wiz.dead) want.copy(toP).multiplyScalar(1 / dist);
    } else {
      // Mill about near home
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 4;
        this.wanderTo.copy(this.home).add(new THREE.Vector3((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5));
      }
      const w = this.wanderTo.clone().sub(this.pos).setY(0);
      if (w.length() > 0.5) want.copy(w.normalize()).multiplyScalar(0.35);
    }
    // Keep a little space from other goblins
    for (const o of others) {
      if (o === this || !o.alive) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1.2 && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        want.x += (dx / d) * (1.1 - d) * 1.5;
        want.z += (dz / d) * (1.1 - d) * 1.5;
      }
    }
    const slow = this.windup > 0 ? 0.25 : 1;
    this.vel.lerp(want.multiplyScalar(this.speed * slow), Math.min(1, dt * 6));
    this.pos.addScaledVector(this.vel, dt).addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 5));
    resolveWalker(this.pos, this.radius);
    this.pos.y = floorY(this.pos.x, this.pos.z);

    const face = this.state === 'chase' ? toP : this.vel;
    if (face.lengthSq() > 0.0001) {
      const target = Math.atan2(face.x, face.z);
      let d = target - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 8);
    }

    // Attack: wind up, then jab if the wizard is still in reach
    this.attackT = Math.max(0, this.attackT - dt);
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) {
        if (dist < 1.7 * this.scale && !wiz.dead) onHitPlayer(this.damage, this);
        this.attackT = 1.1;
      }
    } else if (this.state === 'chase' && dist < 1.5 * this.scale && this.attackT <= 0 && !wiz.dead) {
      this.windup = 0.5;
    }

    const speed = this.vel.length();
    this.walkT += dt * speed * 3.2;
    this.legs[0].rotation.x = Math.sin(this.walkT) * 0.7 * Math.min(1, speed);
    this.legs[1].rotation.x = -Math.sin(this.walkT) * 0.7 * Math.min(1, speed);
    this.body.position.y = Math.abs(Math.sin(this.walkT)) * 0.05;
    this.arm.rotation.x = this.windup > 0 ? 0.9 * (1 - this.windup / 0.5) - 0.6 : 0;

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    if (this.bar.visible) {
      this.bar.quaternion.copy(camera.quaternion).premultiply(this.root.quaternion.clone().invert());
      const k = Math.max(0, this.hp / this.maxHp);
      this.barFill.scale.x = k;
      this.barFill.position.x = -0.4 * (1 - k);
    }
    return true;
  }

  dispose() {
    this.scene.remove(this.root);
    this.skin.dispose();
  }
}
