import * as THREE from 'three';
import { floorY, hasLineOfSight } from './world.js';

// Pets are found in cages. Blast a cage open and its pet joins you for the
// rest of the run. One pet at a time: freeing another sends the first home.

export const PETS = {
  fairies: { name: 'Fairies', blurb: 'Light up the caves around you and reveal more of the map' },
  drake: { name: 'Ember Drake', blurb: 'Shoots small fireballs at goblins. Its fire never hurts you' },
  cat: { name: 'Cave Cat', blurb: '+20% move speed, and pounces on goblins that get close' },
  turtle: { name: 'Shell Turtle', blurb: 'A magic shield that soaks 20 damage and recharges after 8 s' },
};

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true, ...extra });

function drakeModel() {
  const g = new THREE.Group();
  const scale = new THREE.Group();
  scale.scale.setScalar(0.55);
  g.add(scale);
  const hide = std(0xc2451e, { emissive: 0x3a0c00 });
  const belly = std(0xf0a040, { emissive: 0x6a2800 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), hide);
  body.scale.set(0.8, 0.75, 1.3);
  scale.add(body);
  const tummy = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), belly);
  tummy.scale.set(0.7, 0.6, 1.1);
  tummy.position.set(0, -0.08, 0.02);
  scale.add(tummy);
  const head = new THREE.Group();
  head.position.set(0, 0.25, 0.45);
  scale.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), hide));
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 8), hide);
  snout.rotation.x = Math.PI / 2;
  snout.position.z = 0.25;
  head.add(snout);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), std(0xf2e2c0));
    horn.position.set(s * 0.1, 0.18, -0.08);
    horn.rotation.x = -0.6;
    head.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    eye.position.set(s * 0.11, 0.06, 0.15);
    head.add(eye);
  }
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.15, 0.9, 0.25, -0.1, 0.7, -0.05, -0.35, 0, 0, -0.3], 3));
  wingGeo.setIndex([0, 1, 2, 0, 2, 3]);
  wingGeo.computeVertexNormals();
  const wingMat = std(0x8a2a14, { side: THREE.DoubleSide, emissive: 0x2a0800 });
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, wingMat);
    w.position.set(s * 0.2, 0.15, 0);
    w.scale.x = s;
    scale.add(w);
    wings.push(w);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 7), hide);
  tail.rotation.x = -Math.PI / 2 - 0.3;
  tail.position.set(0, 0, -0.6);
  scale.add(tail);
  return { group: g, animate: (t) => { for (const [i, w] of wings.entries()) w.rotation.z = (i ? -1 : 1) * Math.sin(t * 14) * 0.6; }, mouth: head };
}

function catModel() {
  const g = new THREE.Group();
  const fur = std(0x3b3640);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), fur);
  body.scale.set(0.8, 0.8, 1.6);
  body.position.y = 0.32;
  g.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.5, 0.32);
  g.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), fur));
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), fur);
    ear.position.set(s * 0.09, 0.14, -0.02);
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xc8ff5a }));
    eye.position.set(s * 0.06, 0.03, 0.13);
    head.add(eye);
  }
  const legs = [];
  for (const [x, z] of [[-0.1, 0.18], [0.1, 0.18], [-0.1, -0.18], [0.1, -0.18]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.26, 6), fur);
    leg.position.set(x, 0.13, z);
    g.add(leg);
    legs.push(leg);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.5, 6), fur);
  tail.position.set(0, 0.5, -0.38);
  tail.rotation.x = -0.6;
  g.add(tail);
  return { group: g, animate: (t, moving) => { legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 14 + (i % 2) * Math.PI) * 0.6 * moving; }); tail.rotation.z = Math.sin(t * 3) * 0.3; } };
}

function turtleModel() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(0x3f7a4a, { emissive: 0x0a2a30 }));
  shell.scale.set(1, 0.7, 1.15);
  g.add(shell);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.04, 6, 18), std(0xb5a26a));
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1, 1.15, 1);
  g.add(rim);
  const skin = std(0x9bbf7a);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), skin);
  head.position.set(0, 0.02, 0.45);
  g.add(head);
  const flippers = [];
  for (const [x, z] of [[-0.3, 0.2], [0.3, 0.2], [-0.28, -0.25], [0.28, -0.25]]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), skin);
    f.scale.set(1.6, 0.4, 1);
    f.position.set(x, -0.02, z);
    g.add(f);
    flippers.push(f);
  }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(glow);
  return { group: g, animate: (t) => { flippers.forEach((f, i) => { f.rotation.y = Math.sin(t * 4 + i) * 0.5; }); } };
}

function fairiesModel() {
  const g = new THREE.Group();
  const orbs = [];
  const core = new THREE.MeshBasicMaterial({ color: 0xf4fff0 });
  const halo = new THREE.MeshBasicMaterial({ color: 0x9dffc8, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 3; i++) {
    const o = new THREE.Group();
    o.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), core));
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), halo);
    o.add(h);
    g.add(o);
    orbs.push(o);
  }
  return {
    group: g,
    orbs,
    animate: (t) => {
      orbs.forEach((o, i) => {
        const a = t * 1.8 + (i * Math.PI * 2) / 3;
        o.position.set(Math.cos(a) * 0.55, Math.sin(t * 3 + i * 2) * 0.2, Math.sin(a) * 0.55);
        o.children[1].scale.setScalar(0.85 + 0.3 * Math.sin(t * 9 + i));
      });
    },
  };
}

const MODELS = { drake: drakeModel, cat: catModel, turtle: turtleModel, fairies: fairiesModel };

// ---------- Cage ----------
export class Cage {
  constructor(scene, kind, pos) {
    this.scene = scene;
    this.kind = kind;
    this.isCage = true;
    this.alive = true; // "alive" until blasted open, so fireballs can hit it
    this.hitRadius = 0.9;
    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    const iron = std(0x3a3a40, { metalness: 0.7, roughness: 0.45 });
    const stone = std(0x4a4038);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.2, 14), stone);
    base.position.y = 0.1;
    this.group.add(base);
    this.bars = new THREE.Group();
    const barGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const bar = new THREE.Mesh(barGeo, iron);
      bar.position.set(Math.cos(a) * 0.75, 1, Math.sin(a) * 0.75);
      this.bars.add(bar);
    }
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.45, 12), iron);
    top.position.y = 2;
    this.bars.add(top);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 6, 20), iron);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.78;
    this.bars.add(ring);
    this.lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.1), std(0xc9a24a, { metalness: 0.8, roughness: 0.3, emissive: 0x3a2400 }));
    this.lock.position.set(0, 1.0, 0.8);
    this.bars.add(this.lock);
    this.group.add(this.bars);
    this.pet = MODELS[kind]();
    this.pet.group.position.y = kind === 'cat' ? 0.2 : 0.9;
    this.group.add(this.pet.group);
    scene.add(this.group);
  }

  center(out = new THREE.Vector3()) {
    return out.copy(this.pos).setY(this.pos.y + 1);
  }

  distanceTo(p) {
    const y = Math.min(this.pos.y + 1.8, Math.max(this.pos.y + 0.2, p.y));
    return Math.hypot(p.x - this.pos.x, p.y - y, p.z - this.pos.z);
  }

  ignite() {}

  // Blasted open: bars gone, the pet is handed to the caller
  open() {
    this.alive = false;
    this.group.remove(this.bars);
    this.group.remove(this.pet.group);
    return this.pet;
  }

  update(t, wizPos) {
    if (!this.alive) return;
    this.pet.animate(t, 0);
    // Face the wizard, begging to be let out
    this.group.rotation.y = Math.atan2(wizPos.x - this.pos.x, wizPos.z - this.pos.z);
    this.lock.material.emissiveIntensity = 1 + Math.sin(t * 4) * 0.8;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

// ---------- Pet companion ----------
export class Pet {
  constructor(scene, kind, model, from) {
    this.scene = scene;
    this.kind = kind;
    this.info = PETS[kind];
    this.model = model;
    this.group = model.group;
    this.group.position.copy(from);
    scene.add(this.group);
    this.pos = from.clone();
    this.cool = 1;
    this.shield = kind === 'turtle' ? 20 : 0;
    this.shieldMax = 20;
    this.sinceHit = 99;
    this.pounce = null;
    this.moving = 0;
  }

  // Where the pet wants to be, relative to the wizard's facing
  anchor(wiz, t) {
    const f = wiz.forward(), r = wiz.right();
    const p = wiz.pos.clone();
    switch (this.kind) {
      case 'drake': return p.addScaledVector(r, -1.0).addScaledVector(f, -0.2).setY(wiz.pos.y + 2.1 + Math.sin(t * 2) * 0.15);
      case 'cat': return p.addScaledVector(r, -0.9).addScaledVector(f, -0.9).setY(floorY(p.x, p.z));
      case 'turtle': return p.addScaledVector(r, -1.1).addScaledVector(f, -0.6).setY(wiz.pos.y + 1.3 + Math.sin(t * 1.5) * 0.1);
      default: return p.setY(wiz.pos.y + 2.4);
    }
  }

  // hooks: { goblins, castPet(from, target), bite(goblin, dmg), light }
  update(dt, t, wiz, hooks) {
    const target = this.anchor(wiz, t);
    if (this.pounce) {
      // Cat leap: out to the goblin and back
      this.pounce.t += dt;
      const k = this.pounce.t / 0.45;
      const to = this.pounce.goblin.pos;
      const hop = Math.sin(Math.min(1, k) * Math.PI) * 0.8;
      this.pos.lerpVectors(this.pounce.from, to, Math.min(1, k * 1.2)).setY(floorY(this.pos.x, this.pos.z) + hop);
      if (!this.pounce.hit && k > 0.7) {
        this.pounce.hit = true;
        if (this.pounce.goblin.alive) hooks.bite(this.pounce.goblin, 12);
      }
      if (k >= 1) this.pounce = null;
    } else {
      const before = this.pos.clone();
      this.pos.lerp(target, Math.min(1, dt * (this.kind === 'cat' ? 6 : 4)));
      const moved = before.distanceTo(this.pos) / Math.max(dt, 1e-4);
      this.moving += (Math.min(1, moved / 3) - this.moving) * Math.min(1, dt * 8);
    }
    this.group.position.copy(this.pos);
    this.group.rotation.y = wiz.yaw;
    this.model.animate(t, this.moving);

    this.cool -= dt;
    this.sinceHit += dt;
    if (this.kind === 'drake' && this.cool <= 0) {
      const g = nearestFoe(hooks.goblins, wiz.pos, 18);
      if (g) {
        this.cool = 1.3;
        hooks.castPet(this.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), g);
      }
    }
    if (this.kind === 'cat' && this.cool <= 0 && !this.pounce) {
      const g = nearestFoe(hooks.goblins, wiz.pos, 3.2);
      if (g) {
        this.cool = 1.6;
        this.pounce = { goblin: g, from: this.pos.clone(), t: 0, hit: false };
      }
    }
    if (this.kind === 'turtle' && this.shield < this.shieldMax && this.sinceHit > 8) {
      this.shield = this.shieldMax;
      hooks.shieldUp();
    }
    if (this.kind === 'fairies' || this.kind === 'drake') {
      hooks.light.position.copy(this.pos).setY(this.pos.y + (this.kind === 'fairies' ? 1.2 : 0.3));
    }
  }

  // Turtle shield soaks damage first; returns what gets through
  absorb(amount) {
    this.sinceHit = 0;
    if (this.kind !== 'turtle' || this.shield <= 0) return amount;
    const soaked = Math.min(this.shield, amount);
    this.shield -= soaked;
    return amount - soaked;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

function nearestFoe(goblins, from, range) {
  let best = null, bestD = range;
  for (const g of goblins) {
    if (!g.alive || g.state !== 'chase') continue;
    const d = g.pos.distanceTo(from);
    if (d < bestD && hasLineOfSight(from, g.pos)) { bestD = d; best = g; }
  }
  return best;
}
