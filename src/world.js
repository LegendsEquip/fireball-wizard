import * as THREE from 'three';
import { fbm3, hash3 } from './noise.js';

// The test cave is a lumpy dome. Its outline is a radius that varies with
// angle, plus three tunnel mouths where goblins come in.
export const CEILING = 9;
export const MOUTHS = [0.35, 2.45, 4.35];
export const PILLARS = [
  { x: 6.5, z: 3.5, r: 1.5 },
  { x: -7.5, z: -2.5, r: 1.8 },
  { x: 1.5, z: -9, r: 1.3 },
  { x: -4, z: 9.5, r: 1.4 },
  { x: 10.5, z: -6.5, r: 1.2 },
];

const MOUTH_DEPTH = 7;
const MOUTH_WIDTH = 0.1; // radians
const MOUTH_TOP = 4.4;

export function roomRadius(theta) {
  return 19 + 2.6 * Math.sin(3 * theta + 0.7) + 1.6 * Math.sin(5 * theta + 2.1) + 0.9 * Math.sin(9 * theta + 0.3);
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function mouthAmount(theta) {
  let m = 0;
  for (const a of MOUTHS) {
    const d = angDiff(theta, a) / MOUTH_WIDTH;
    m = Math.max(m, Math.exp(-d * d));
  }
  return m;
}

const heightFactor = (y) => {
  // 1 below the tunnel roof, easing to 0 above it
  const t = Math.min(1, Math.max(0, (MOUTH_TOP - y) / 1.6));
  return t * t * (3 - 2 * t);
};

// Horizontal wall distance at a given angle and height.
export function wallRadius(theta, y) {
  const R = roomRadius(theta) + MOUTH_DEPTH * mouthAmount(theta) * heightFactor(y);
  const k = Math.min(1, Math.max(0, y / CEILING));
  return R * Math.sqrt(Math.max(0, 1 - k * k));
}

export function floorY(x, z) {
  return fbm3(x * 0.15, 0.5, z * 0.15, 3) * 0.22;
}

// Keep a walker (player or goblin) inside the cave and out of pillars.
export function resolveWalker(pos, radius) {
  for (const p of PILLARS) {
    const dx = pos.x - p.x, dz = pos.z - p.z;
    const d = Math.hypot(dx, dz), min = p.r + radius;
    if (d < min && d > 1e-4) {
      pos.x = p.x + (dx / d) * min;
      pos.z = p.z + (dz / d) * min;
    }
  }
  const th = Math.atan2(pos.z, pos.x);
  const d = Math.hypot(pos.x, pos.z);
  const max = wallRadius(th, 0.5) - radius - 1.1;
  if (d > max) {
    pos.x *= max / d;
    pos.z *= max / d;
  }
}

// True when a point (with a small radius) is inside rock.
export function isBlocked(pos, radius = 0) {
  if (pos.y - radius < floorY(pos.x, pos.z)) return true;
  if (pos.y + radius > CEILING - 0.3) return true;
  const th = Math.atan2(pos.z, pos.x);
  const d = Math.hypot(pos.x, pos.z);
  if (d + radius > wallRadius(th, pos.y) - 0.6) return true;
  for (const p of PILLARS) {
    if (Math.hypot(pos.x - p.x, pos.z - p.z) < p.r + radius * 0.7) return true;
  }
  return false;
}

// Where a mouth opens, for spawning goblins just inside the tunnel.
export function mouthPoint(i, depth) {
  const a = MOUTHS[i];
  const r = roomRadius(a) + depth;
  return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
}

function rockColor(x, y, z, out) {
  const n = fbm3(x * 0.35, y * 0.35, z * 0.35, 4);
  const v = 0.8 + n * 0.5;
  out.setRGB(0.3 * v, 0.255 * v, 0.225 * v);
  // Moss on the lower walls and floor edges
  const moss = fbm3(x * 0.18 + 40, y * 0.3, z * 0.18, 3);
  if (y < 2.2 && moss > 0.12) {
    const m = Math.min(1, (moss - 0.12) * 4) * (1 - y / 2.2);
    out.lerp(new THREE.Color(0.16, 0.27, 0.1), m * 0.85);
  }
  return out;
}

function buildDome() {
  const segA = 200, segV = 34;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  for (let j = 0; j <= segV; j++) {
    const v = j / segV;
    const phi = v * (Math.PI / 2);
    const y = CEILING * Math.sin(phi);
    for (let i = 0; i <= segA; i++) {
      const th = (i / segA) * Math.PI * 2;
      let r = wallRadius(th, y);
      let x = Math.cos(th) * r, z = Math.sin(th) * r;
      const n = fbm3(x * 0.22, y * 0.22, z * 0.22, 4);
      const push = n * 1.5 * (1 - v * 0.6);
      r = Math.max(0.2, r + push);
      x = Math.cos(th) * r;
      z = Math.sin(th) * r;
      const yy = j === 0 ? -0.4 : y + n * 0.6 * v;
      pos.push(x, yy, z);
      rockColor(x, yy, z, c);
      col.push(c.r, c.g, c.b);
    }
  }
  const row = segA + 1;
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segA; i++) {
      const a = j * row + i, b = a + 1, d = a + row, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildFloor() {
  const g = new THREE.PlaneGeometry(72, 72, 160, 160);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const col = [];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const y = floorY(x, z);
    p.setY(i, y);
    const n = fbm3(x * 0.4, 3, z * 0.4, 4);
    const v = 0.75 + n * 0.45;
    c.setRGB(0.24 * v, 0.2 * v, 0.175 * v);
    // Moss creeps in near the walls
    const th = Math.atan2(z, x), d = Math.hypot(x, z);
    const edge = Math.max(0, 1 - (roomRadius(th) - d) / 5);
    const moss = fbm3(x * 0.2 + 40, 1, z * 0.2, 3);
    if (moss > 0.05 && edge > 0) c.lerp(new THREE.Color(0.14, 0.24, 0.09), Math.min(1, (moss - 0.05) * 5) * edge * 0.9);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function buildPillar(p) {
  const d = Math.hypot(p.x, p.z);
  const h = CEILING * Math.sqrt(Math.max(0.05, 1 - (d / roomRadius(Math.atan2(p.z, p.x))) ** 2)) + 1.5;
  const g = new THREE.CylinderGeometry(p.r * 0.75, p.r * 1.25, h, 16, 14, true);
  const pos = g.attributes.position;
  const col = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i) + h / 2, z = pos.getZ(i);
    // pinch the middle so it reads as a stalactite meeting a stalagmite
    const t = y / h;
    const pinch = 1 - 0.35 * Math.exp(-(((t - 0.55) / 0.2) ** 2));
    const n = fbm3((x + p.x) * 0.5, y * 0.4, (z + p.z) * 0.5, 3);
    const s = pinch * (1 + n * 0.35);
    x *= s; z *= s;
    pos.setXYZ(i, x, y - 0.3, z);
    rockColor(x + p.x, y, z + p.z, c);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function addSpikes(scene, mat) {
  // Decorative stalagmites along the walls and stalactites overhead
  const cone = new THREE.ConeGeometry(1, 1, 7, 1);
  for (let k = 0; k < 70; k++) {
    const th = hash3(k, 1, 2) * Math.PI * 2;
    if (mouthAmount(th) > 0.05) continue;
    const up = k % 2 === 0;
    const R = roomRadius(th);
    const d = R - 1.5 - hash3(k, 4, 1) * (up ? 3 : 9);
    const x = Math.cos(th) * d, z = Math.sin(th) * d;
    const h = 0.6 + hash3(k, 7, 3) * (up ? 1.8 : 2.4);
    const w = h * (0.22 + hash3(k, 2, 9) * 0.12);
    const m = new THREE.Mesh(cone, mat);
    m.scale.set(w, h, w);
    if (up) {
      m.position.set(x, floorY(x, z) + h / 2 - 0.05, z);
    } else {
      const ceil = CEILING * Math.sqrt(Math.max(0, 1 - (d / R) ** 2));
      if (ceil < 3.5) continue;
      m.position.set(x, ceil - h / 2 + 0.2, z);
      m.rotation.x = Math.PI;
    }
    m.rotation.y = hash3(k, 5, 5) * 6;
    scene.add(m);
  }
}

function addCrystals(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x5fd3ff, emissive: 0x2a9fd6, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.1, flatShading: true });
  const geo = new THREE.OctahedronGeometry(1, 0);
  const spots = [1.3, 3.4, 5.4];
  for (const [n, th] of spots.entries()) {
    const d = roomRadius(th) - 2.2;
    const cx = Math.cos(th) * d, cz = Math.sin(th) * d;
    const group = new THREE.Group();
    group.position.set(cx, floorY(cx, cz), cz);
    for (let k = 0; k < 7; k++) {
      const m = new THREE.Mesh(geo, mat);
      const h = 0.5 + hash3(n, k, 3) * 1.1;
      m.scale.set(0.16 + h * 0.08, h, 0.16 + h * 0.08);
      m.position.set((hash3(n, k, 1) - 0.5) * 1.2, h * 0.7, (hash3(n, k, 2) - 0.5) * 1.2);
      m.rotation.set((hash3(n, k, 4) - 0.5) * 0.9, hash3(n, k, 5) * 3, (hash3(n, k, 6) - 0.5) * 0.9);
      group.add(m);
    }
    scene.add(group);
    const light = new THREE.PointLight(0x58c8ff, 9, 13, 2);
    light.position.set(cx - Math.cos(th) * 1.2, 1.4, cz - Math.sin(th) * 1.2);
    scene.add(light);
  }
}

function addMouths(scene) {
  // Black backs for the tunnel mouths so they read as passages into darkness
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  for (const a of MOUTHS) {
    const r = roomRadius(a) + MOUTH_DEPTH - 1.2;
    const m = new THREE.Mesh(new THREE.CircleGeometry(3, 20), mat);
    m.position.set(Math.cos(a) * r, 1.9, Math.sin(a) * r);
    m.lookAt(0, 1.9, 0);
    scene.add(m);
  }
}

function addTorches(scene) {
  // Wall torches: a bracket, a flame point and a warm light that flickers
  const torches = [];
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2616, roughness: 0.9, flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.5, metalness: 0.6, flatShading: true });
  for (const th of [0.95, 1.9, 3.0, 3.9, 5.0, 5.9]) {
    if (mouthAmount(th) > 0.05) continue;
    const r = roomRadius(th) - 1.4;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const g = new THREE.Group();
    g.position.set(x, 2.6, z);
    g.lookAt(0, 2.6, 0);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.7, 6), wood);
    stick.rotation.x = -0.5;
    stick.position.set(0, 0, 0.12);
    g.add(stick);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.07, 0.14, 8, 1, true), iron);
    cup.position.set(0, 0.3, 0.3);
    g.add(cup);
    scene.add(g);
    const flame = new THREE.Vector3(0, 0.42, 0.3).applyMatrix4(g.matrixWorld.clone().compose(g.position, g.quaternion, g.scale));
    const light = new THREE.PointLight(0xff9a50, 14, 16, 2);
    light.position.copy(flame).multiplyScalar(0.94).setY(flame.y + 0.2);
    scene.add(light);
    torches.push({ flame, light, seed: th * 10 });
  }
  return torches;
}

export function buildWorld(scene) {
  const rock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(buildDome(), rock));
  const floorMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true });
  const floor = new THREE.Mesh(buildFloor(), floorMat);
  scene.add(floor);
  for (const p of PILLARS) {
    const m = new THREE.Mesh(buildPillar(p), rock);
    m.position.set(p.x, 0, p.z);
    scene.add(m);
  }
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x4a3f38, roughness: 0.95, flatShading: true });
  addSpikes(scene, spikeMat);
  addCrystals(scene);
  addMouths(scene);
  const torches = addTorches(scene);
  return { floor, torches };
}
