import * as THREE from 'three';
import { floorY, resolveWalker, isBlocked } from './world.js';

const ROBE = 0x3b2a6b;
const ROBE_DARK = 0x2a1d4f;
const SKIN = 0xc9967a;
const TRIM = 0xc9a24a;

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, flatShading: true, ...extra });
}

function buildModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Robe: a flared lathe
  const robeProfile = [
    [0.0, 0.0], [0.55, 0.02], [0.5, 0.25], [0.42, 0.6], [0.34, 0.95], [0.3, 1.15], [0.26, 1.3], [0.14, 1.42], [0, 1.44],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const robe = new THREE.Mesh(new THREE.LatheGeometry(robeProfile, 18), std(ROBE));
  body.add(robe);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.035, 6, 24), std(TRIM, { metalness: 0.4, roughness: 0.5 }));
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.05;
  body.add(hem);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.045, 6, 20), std(0x5a3a22));
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.92;
  body.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.04), std(TRIM, { metalness: 0.6, roughness: 0.4 }));
  buckle.position.set(0, 0.92, 0.35);
  body.add(buckle);

  // Cape over the shoulders
  const cape = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), std(ROBE_DARK));
  cape.scale.set(1.05, 0.7, 0.85);
  cape.position.y = 1.28;
  body.add(cape);

  // Head, beard and hat
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), std(SKIN));
  head.position.y = 1.56;
  body.add(head);
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 8), std(0xdcd6cf, { roughness: 1 }));
  beard.rotation.x = Math.PI;
  beard.position.set(0, 1.3, 0.12);
  body.add(beard);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.4), std(0xcfc8c0, { roughness: 1 }));
  hair.position.y = 1.55;
  body.add(hair);

  const hat = new THREE.Group();
  hat.position.y = 1.68;
  body.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.55, 0.035, 28), std(ROBE));
  hat.add(brim);
  const coneGeo = new THREE.ConeGeometry(0.28, 0.95, 18, 8);
  coneGeo.translate(0, 0.475, 0);
  const cp = coneGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const y = cp.getY(i);
    cp.setZ(i, cp.getZ(i) - 0.42 * Math.pow(y / 0.95, 2.4));
    cp.setY(i, y - 0.08 * Math.pow(y / 0.95, 3));
  }
  coneGeo.computeVertexNormals();
  hat.add(new THREE.Mesh(coneGeo, std(ROBE)));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.035, 6, 20), std(0x6b4726));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.06;
  hat.add(band);

  // Left arm hangs, right arm holds the staff forward
  const sleeveGeo = new THREE.CylinderGeometry(0.07, 0.13, 0.6, 10);
  const leftArm = new THREE.Mesh(sleeveGeo, std(ROBE));
  leftArm.position.set(-0.33, 1.05, 0.02);
  leftArm.rotation.z = -0.25;
  body.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.3, 1.3, 0.02);
  body.add(rightArm);
  const rSleeve = new THREE.Mesh(sleeveGeo, std(ROBE));
  rSleeve.position.set(0, -0.26, 0.12);
  rSleeve.rotation.x = 0.75;
  rightArm.add(rSleeve);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), std(SKIN));
  hand.position.set(0.02, -0.46, 0.34);
  rightArm.add(hand);

  const staff = new THREE.Group();
  staff.position.copy(hand.position);
  rightArm.add(staff);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.9, 8), std(0x4a3322, { roughness: 0.9 }));
  shaft.position.y = 0.25;
  staff.add(shaft);
  for (const s of [-1, 1]) {
    const claw = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 5, 10, Math.PI), std(0x3a271a));
    claw.position.y = 1.2;
    claw.rotation.y = s > 0 ? 0 : Math.PI / 2;
    staff.add(claw);
  }
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  orb.position.y = 1.24;
  staff.add(orb);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff7a1f, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  orb.add(glow);
  const orbLight = new THREE.PointLight(0xff9a4a, 4, 9, 2);
  orb.add(orbLight);

  return { root, body, rightArm, staff, orb, glow, orbLight, robe };
}

export class Wizard {
  constructor(scene) {
    this.model = buildModel();
    scene.add(this.model.root);
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0.05;
    this.radius = 0.45;
    this.baseSpeed = 6.2;
    this.speed = 6.2;
    this.maxHp = 100;
    this.reset();
  }

  // Apply boon multipliers (see boons.js) and any pet speed bonus
  applyBuild(b, speedBonus = 1) {
    const oldMax = this.maxHp;
    this.maxHp = Math.round(100 * b.hp);
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - oldMax));
    this.speed = this.baseSpeed * b.move * speedBonus;
    this.sizeScale = b.scale;
    this.model.root.scale.setScalar(b.scale);
    this.radius = 0.45 * b.scale;
  }

  reset() {
    this.maxHp = 100;
    this.speed = this.baseSpeed;
    this.sizeScale = 1;
    this.radius = 0.45;
    this.model.root.scale.setScalar(1);
    this.pos.set(0, 0, -6);
    this.yaw = 0;
    this.pitch = -0.08;
    this.hp = this.maxHp;
    this.cool = 0;
    this.bigCool = 0;
    this.castKick = 0;
    this.walkT = 0;
    this.moving = 0;
    this.hurtT = 0;
    this.dead = false;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  right(out = new THREE.Vector3()) {
    return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  aimDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  staffTip(out = new THREE.Vector3()) {
    this.model.orb.updateWorldMatrix(true, false);
    return this.model.orb.getWorldPosition(out);
  }

  center(out = new THREE.Vector3()) {
    return out.copy(this.pos).setY(this.pos.y + 0.9 * this.sizeScale);
  }

  look(dx, dy, sens) {
    this.yaw -= dx * sens;
    this.pitch = Math.min(0.85, Math.max(-0.55, this.pitch - dy * sens));
  }

  update(dt, keys, time) {
    const f = this.forward(), r = this.right();
    const move = new THREE.Vector3();
    if (keys.KeyW) move.add(f);
    if (keys.KeyS) move.sub(f);
    if (keys.KeyD) move.add(r);
    if (keys.KeyA) move.sub(r);
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize().multiplyScalar(this.speed * dt);
    this.pos.add(move);
    resolveWalker(this.pos, this.radius);
    this.pos.y = floorY(this.pos.x, this.pos.z);

    this.moving += ((moving ? 1 : 0) - this.moving) * Math.min(1, dt * 10);
    this.walkT += dt * 9 * this.moving;
    this.cool = Math.max(0, this.cool - dt);
    this.bigCool = Math.max(0, this.bigCool - dt);
    this.castKick = Math.max(0, this.castKick - dt * 5);
    this.hurtT = Math.max(0, this.hurtT - dt);

    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    m.body.position.y = Math.abs(Math.sin(this.walkT)) * 0.06 * this.moving;
    m.body.rotation.z = Math.sin(this.walkT) * 0.04 * this.moving;
    m.body.rotation.x = 0.06 * this.moving;
    // Staff tilts with aim and thrusts forward on a cast
    m.rightArm.rotation.x = -this.pitch * 0.6 - this.castKick * 0.5;
    const flick = 0.85 + 0.15 * Math.sin(time * 13) * Math.sin(time * 7.7);
    const ready = this.cool <= 0 ? 1 : 0.55;
    m.glow.scale.setScalar((1 + this.castKick * 1.4) * flick);
    m.orbLight.intensity = (3 + this.castKick * 14) * flick * ready;
  }
}

// Third-person camera: behind and above the right shoulder, pulled in when a wall is close.
export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.dist = 4.6;
    this.shake = 0;
    this._pivot = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  update(wiz, dt) {
    const pivot = this._pivot.copy(wiz.pos).add(wiz.right().multiplyScalar(1.2));
    pivot.y += 1.85;
    const dir = wiz.aimDir(this._dir);
    // Back off along the aim until rock is hit
    let d = this.dist;
    const p = this._p;
    for (let s = 0.3; s <= this.dist; s += 0.15) {
      p.copy(pivot).addScaledVector(dir, -s);
      if (isBlocked(p, 0.25)) { d = Math.max(1.0, s - 0.3); break; }
    }
    this.camera.position.copy(pivot).addScaledVector(dir, -d);
    if (this.shake > 0) {
      const k = this.shake * this.shake;
      this.camera.position.x += (Math.random() - 0.5) * k * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * k * 0.6;
      this.camera.position.z += (Math.random() - 0.5) * k * 0.6;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    this.camera.lookAt(p.copy(pivot).addScaledVector(dir, 10));
  }

  addShake(a) {
    this.shake = Math.min(1, this.shake + a);
  }
}
