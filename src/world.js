import * as THREE from 'three';
import { fbm3, hash3 } from './noise.js';

// Level 1: rooms joined by tunnels. The walkable space is a 2D signed
// distance field (negative inside, positive inside rock), baked into a grid
// once at load. Floor and ceiling meshes are heightfields built from it, and
// every collision check samples the same grid, so what you see is what you hit.

export const ROOMS = [
  { id: 'start', name: 'Cave Mouth', x: 0, z: 0, r: 8, h: 6.5, enemies: 0 },
  { id: 'mossy', name: 'Mossy Cavern', x: 0, z: 30, r: 13, h: 10, enemies: 4, moss: true, pillars: [[5, 3, 1.4], [-6, -4, 1.6]] },
  { id: 'camp', name: 'Goblin Camp', x: -32, z: 56, r: 12, h: 8, enemies: 6, pillars: [[3, -4, 1.2]] },
  { id: 'narrow', name: 'Narrow Cut', x: 30, z: 54, r: 6.5, h: 4.8, enemies: 3 },
  { id: 'echo', name: 'Echo Hall', x: -30, z: 92, r: 11, h: 11, enemies: 5, crystals: true, pillars: [[-3, 2, 1.5]] },
  { id: 'forge', name: 'Dwarf Forge', x: 32, z: 90, r: 13, h: 11, enemies: 6, forge: true, pillars: [[0, 0, 1.8]] },
  { id: 'vault', name: 'Treasure Vault', x: 60, z: 104, r: 6.5, h: 5.5, enemies: 2, chest: true, crystals: true },
  { id: 'hall', name: "Warden's Hall", x: 0, z: 124, r: 15, h: 12, enemies: 5, chief: true, pillars: [[-7, 4, 1.6], [7, 4, 1.6]] },
  { id: 'exit', name: 'The Way Out', x: 0, z: 152, r: 6, h: 7, enemies: 0, exit: true },
];
const byId = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

const TUNNELS = [
  ['start', 'mossy', 2.1], ['mossy', 'camp', 2.1], ['mossy', 'narrow', 1.8], ['camp', 'echo', 2.1],
  ['narrow', 'forge', 1.7], ['forge', 'vault', 1.9], ['echo', 'hall', 2.2], ['forge', 'hall', 2.1], ['hall', 'exit', 2.0],
].map(([a, b, w], i) => {
  const A = byId[a], B = byId[b];
  const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
  const bend = (hash3(i, 3, 7) - 0.5) * 9;
  const mid = { x: (A.x + B.x) / 2 - (dz / len) * bend, z: (A.z + B.z) / 2 + (dx / len) * bend };
  return { a: A, b: B, w, pts: [{ x: A.x, z: A.z }, mid, { x: B.x, z: B.z }] };
});

const PILLARS = ROOMS.flatMap((r) => (r.pillars || []).map(([dx, dz, pr]) => ({ x: r.x + dx, z: r.z + dz, r: pr })));

// ---------- Grid ----------
const X0 = -56, X1 = 80, Z0 = -20, Z1 = 170, CELL = 0.5;
const NX = Math.round((X1 - X0) / CELL) + 1, NZ = Math.round((Z1 - Z0) / CELL) + 1;
const sdfG = new Float32Array(NX * NZ);
const floorG = new Float32Array(NX * NZ);
const ceilG = new Float32Array(NX * NZ);
export const MAP_BOUNDS = { X0, X1, Z0, Z1 };

function segDist(px, pz, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (pz - a.z) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - a.x - vx * t, pz - a.z - vz * t);
}

function smin(a, b, k) {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
}

function rawSdf(x, z) {
  let d = 1e9;
  for (const r of ROOMS) {
    const th = Math.atan2(z - r.z, x - r.x);
    const rr = r.r * (1 + 0.09 * Math.sin(3 * th + r.x) + 0.06 * Math.sin(5 * th + r.z));
    d = smin(d, Math.hypot(x - r.x, z - r.z) - rr, 3);
  }
  for (const t of TUNNELS) {
    const s = Math.min(segDist(x, z, t.pts[0], t.pts[1]), segDist(x, z, t.pts[1], t.pts[2]));
    d = smin(d, s - t.w, 2);
  }
  d += fbm3(x * 0.11, 7, z * 0.11, 3) * 1.6 + fbm3(x * 0.45, 3, z * 0.45, 2) * 0.45;
  for (const p of PILLARS) {
    const pd = Math.hypot(x - p.x, z - p.z);
    if (pd < p.r + 1) d = Math.max(d, p.r - pd + fbm3(x * 0.8, 1, z * 0.8, 2) * 0.3);
  }
  return d;
}

function rawCeil(x, z) {
  let c = 0;
  for (const r of ROOMS) {
    const k = Math.min(1, Math.hypot(x - r.x, z - r.z) / (r.r * 1.15));
    c = Math.max(c, 3.9 + (r.h - 3.9) * Math.sqrt(1 - k * k));
  }
  for (const t of TUNNELS) {
    const s = Math.min(segDist(x, z, t.pts[0], t.pts[1]), segDist(x, z, t.pts[1], t.pts[2]));
    if (s < t.w + 3) c = Math.max(c, 4.4);
  }
  return c + fbm3(x * 0.3, 11, z * 0.3, 2) * 0.5;
}

for (let j = 0; j < NZ; j++) {
  for (let i = 0; i < NX; i++) {
    const x = X0 + i * CELL, z = Z0 + j * CELL, k = j * NX + i;
    sdfG[k] = rawSdf(x, z);
    floorG[k] = fbm3(x * 0.15, 0.5, z * 0.15, 3) * 0.22;
    ceilG[k] = rawCeil(x, z);
  }
}

function sample(grid, x, z) {
  const fx = Math.max(0, Math.min(NX - 1.001, (x - X0) / CELL));
  const fz = Math.max(0, Math.min(NZ - 1.001, (z - Z0) / CELL));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const k = j * NX + i;
  return (grid[k] * (1 - u) + grid[k + 1] * u) * (1 - v) + (grid[k + NX] * (1 - u) + grid[k + NX + 1] * u) * v;
}

export const sdf = (x, z) => sample(sdfG, x, z);
export const floorY = (x, z) => sample(floorG, x, z);
export const ceilY = (x, z) => sample(ceilG, x, z);

// Keep a walker (player or goblin) out of the rock.
export function resolveWalker(pos, radius) {
  for (let it = 0; it < 3; it++) {
    const s = sdf(pos.x, pos.z) + radius + 0.25;
    if (s <= 0) return;
    const e = 0.3;
    let gx = sdf(pos.x + e, pos.z) - sdf(pos.x - e, pos.z);
    let gz = sdf(pos.x, pos.z + e) - sdf(pos.x, pos.z - e);
    const gl = Math.hypot(gx, gz) || 1;
    pos.x -= (gx / gl) * s;
    pos.z -= (gz / gl) * s;
  }
}

// True when a point (with a small radius) is inside rock.
export function isBlocked(pos, radius = 0) {
  if (sdf(pos.x, pos.z) > -radius * 0.5 - 0.15) return true;
  if (pos.y - radius * 0.5 < floorY(pos.x, pos.z)) return true;
  if (pos.y + radius * 0.5 > ceilY(pos.x, pos.z) - 0.2) return true;
  return false;
}

// Clear line of sight across the floor plan between two points.
export function hasLineOfSight(a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.ceil(d / 0.5);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (sdf(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) > -0.1) return false;
  }
  return true;
}

export function roomAt(x, z) {
  let best = null, bestK = 1.1;
  for (const r of ROOMS) {
    const k = Math.hypot(x - r.x, z - r.z) / r.r;
    if (k < bestK) { bestK = k; best = r; }
  }
  return best;
}

// A random walkable spot inside a room, away from its walls.
export function spotInRoom(room, seed, margin = 1.5) {
  for (let n = 0; n < 40; n++) {
    const a = hash3(seed, n, 1) * Math.PI * 2, d = Math.sqrt(hash3(seed, n, 2)) * room.r * 0.75;
    const x = room.x + Math.cos(a) * d, z = room.z + Math.sin(a) * d;
    if (sdf(x, z) < -margin) return new THREE.Vector3(x, floorY(x, z), z);
  }
  return new THREE.Vector3(room.x, 0, room.z);
}

// Walkable cells for the map, one per world unit
export function mapCells() {
  const w = X1 - X0, h = Z1 - Z0;
  const cells = new Uint8Array(w * h);
  // Map orientation: column i runs from X1 downward, row j from Z1 downward
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cells[j * w + i] = sdf(X1 - i - 0.5, Z1 - j - 0.5) < -0.2 ? 1 : 0;
  return { w, h, cells };
}

// ---------- Meshes ----------
const wallRise = (s) => Math.min(22, 2.2 * s + 2.8 * s * s);
const ceilDrop = (s) => 1.2 * s + 2.2 * s * s;

function roomTint(x, z) {
  const r = roomAt(x, z);
  return r || {};
}

function buildSurface(ceiling) {
  const pos = new Float32Array(NX * NZ * 3);
  const col = new Float32Array(NX * NZ * 3);
  const c = new THREE.Color();
  const moss = new THREE.Color(0.14, 0.25, 0.09);
  const ember = new THREE.Color(0.42, 0.16, 0.06);
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      const x = X0 + i * CELL, z = Z0 + j * CELL;
      const s = sdfG[k];
      let y;
      if (ceiling) y = s <= 0 ? ceilG[k] : Math.max(-3, ceilG[k] - ceilDrop(s));
      else y = s <= 0 ? floorG[k] : floorG[k] + wallRise(s);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      const n = fbm3(x * 0.35, y * 0.35, z * 0.35, 3);
      const v = (ceiling ? 0.6 : s <= 0 ? 0.8 : 0.95) + n * 0.45;
      c.setRGB(0.3 * v, 0.255 * v, 0.225 * v);
      const tint = roomTint(x, z);
      const m = fbm3(x * 0.18 + 40, y * 0.3, z * 0.18, 3);
      if (!ceiling && m > (tint.moss ? -0.1 : 0.2) && y < 2.5) {
        c.lerp(moss, Math.min(1, (m - (tint.moss ? -0.1 : 0.2)) * 3) * (tint.moss ? 0.9 : 0.6));
      }
      if (tint.forge && !ceiling && s <= 0 && n > 0.25) c.lerp(ember, 0.6);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  }
  const idx = [];
  for (let j = 0; j < NZ - 1; j++) {
    for (let i = 0; i < NX - 1; i++) {
      // Skip quads buried deep in rock on both surfaces
      const k = j * NX + i;
      if (sdfG[k] > 5 && sdfG[k + 1] > 5 && sdfG[k + NX] > 5 && sdfG[k + NX + 1] > 5) continue;
      const a = k, b = k + 1, d = k + NX, e = k + NX + 1;
      if (ceiling) idx.push(a, b, d, b, e, d);
      else idx.push(a, d, b, b, d, e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Where the wall is, walking out from a room's centre at an angle
function wallPoint(room, a, inset) {
  for (let d = room.r * 0.4; d < room.r * 2; d += 0.25) {
    const x = room.x + Math.cos(a) * d, z = room.z + Math.sin(a) * d;
    if (sdf(x, z) > -inset) return { x, z };
  }
  return null;
}

function addSpikes(scene, mat) {
  const cone = new THREE.ConeGeometry(1, 1, 7, 1);
  let k = 0;
  for (const room of ROOMS) {
    for (let n = 0; n < Math.round(room.r * 1.4); n++, k++) {
      const up = n % 2 === 0;
      const a = hash3(k, 1, 2) * Math.PI * 2;
      const p = wallPoint(room, a, up ? 0.9 : 2.5 + hash3(k, 4, 1) * 3);
      if (!p) continue;
      const h = 0.6 + hash3(k, 7, 3) * (up ? 1.6 : 2.2);
      const w = h * (0.22 + hash3(k, 2, 9) * 0.12);
      const m = new THREE.Mesh(cone, mat);
      m.scale.set(w, h, w);
      if (up) m.position.set(p.x, floorY(p.x, p.z) + h / 2 - 0.05, p.z);
      else {
        const ceil = ceilY(p.x, p.z);
        if (ceil < 4.5) continue;
        m.position.set(p.x, ceil - h / 2 + 0.3, p.z);
        m.rotation.x = Math.PI;
      }
      m.rotation.y = hash3(k, 5, 5) * 6;
      scene.add(m);
    }
  }
}

function addCrystals(scene, glowSources) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x5fd3ff, emissive: 0x2a9fd6, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.1, flatShading: true });
  const geo = new THREE.OctahedronGeometry(1, 0);
  let n = 0;
  for (const room of ROOMS) {
    if (!room.crystals) continue;
    for (let c = 0; c < 3; c++, n++) {
      const a = (c / 3) * Math.PI * 2 + hash3(n, 9, 9);
      const p = wallPoint(room, a, 1.6);
      if (!p) continue;
      const group = new THREE.Group();
      group.position.set(p.x, floorY(p.x, p.z), p.z);
      for (let k = 0; k < 7; k++) {
        const m = new THREE.Mesh(geo, mat);
        const h = 0.5 + hash3(n, k, 3) * 1.1;
        m.scale.set(0.16 + h * 0.08, h, 0.16 + h * 0.08);
        m.position.set((hash3(n, k, 1) - 0.5) * 1.2, h * 0.7, (hash3(n, k, 2) - 0.5) * 1.2);
        m.rotation.set((hash3(n, k, 4) - 0.5) * 0.9, hash3(n, k, 5) * 3, (hash3(n, k, 6) - 0.5) * 0.9);
        group.add(m);
      }
      scene.add(group);
      glowSources.push({ pos: new THREE.Vector3(p.x + (room.x - p.x) * 0.1, 1.4, p.z + (room.z - p.z) * 0.1), color: 0x58c8ff, intensity: 10, flicker: 0 });
    }
  }
}

function addTorches(scene, glowSources) {
  const torches = [];
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2616, roughness: 0.9, flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.5, metalness: 0.6, flatShading: true });
  const stickGeo = new THREE.CylinderGeometry(0.05, 0.035, 0.7, 6);
  const cupGeo = new THREE.CylinderGeometry(0.12, 0.07, 0.14, 8, 1, true);
  let n = 0;
  for (const room of ROOMS) {
    const count = room.forge ? 5 : room.r > 9 ? 3 : 2;
    for (let c = 0; c < count; c++, n++) {
      const a = (c / count) * Math.PI * 2 + 0.6 + hash3(n, 2, 2) * 0.5;
      const p = wallPoint(room, a, 1.0);
      if (!p) continue;
      const g = new THREE.Group();
      g.position.set(p.x, 2.6, p.z);
      g.lookAt(room.x, 2.6, room.z);
      g.updateMatrixWorld();
      const stick = new THREE.Mesh(stickGeo, wood);
      stick.rotation.x = -0.5;
      stick.position.set(0, 0, 0.12);
      g.add(stick);
      const cup = new THREE.Mesh(cupGeo, iron);
      cup.position.set(0, 0.3, 0.3);
      g.add(cup);
      scene.add(g);
      const flame = new THREE.Vector3(0, 0.42, 0.3).applyMatrix4(g.matrixWorld);
      const t = { flame, seed: n * 3.7 };
      torches.push(t);
      glowSources.push({ pos: flame.clone().setY(flame.y + 0.3), color: room.forge ? 0xff7a30 : 0xff9a50, intensity: 16, flicker: 1, seed: t.seed });
    }
  }
  return torches;
}

function addChest(scene, room) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a73a, roughness: 0.35, metalness: 0.8, flatShading: true });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), wood);
  base.position.y = 0.3;
  g.add(base);
  const lid = new THREE.Group();
  lid.position.set(0, 0.6, -0.4);
  const lidMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 10, 1, false, 0, Math.PI), wood);
  lidMesh.rotation.z = Math.PI / 2;
  lidMesh.position.z = 0.4;
  lid.add(lidMesh);
  g.add(lid);
  for (const x of [-0.45, 0.45]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.84), gold);
    band.position.set(x, 0.3, 0);
    g.add(band);
  }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = 0.7;
  g.add(glow);
  const p = spotInRoom(room, 99, 2.5);
  g.position.copy(p);
  g.lookAt(room.x, p.y, room.z - 20);
  scene.add(g);
  return { group: g, lid, glow, pos: p, opened: false, room };
}

function addExit(scene, room, glowSources) {
  const g = new THREE.Group();
  const p = new THREE.Vector3(room.x, floorY(room.x, room.z), room.z + 1);
  g.position.copy(p);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 10, 40), new THREE.MeshBasicMaterial({ color: 0xbfe8ff }));
  ring.position.y = 1.8;
  g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.45, 40), new THREE.MeshBasicMaterial({ color: 0x6fc6ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.y = 1.8;
  g.add(disc);
  scene.add(g);
  glowSources.push({ pos: p.clone().setY(2), color: 0x8fd8ff, intensity: 30, flicker: 0 });
  return { group: g, ring, disc, pos: p, room };
}

export function buildWorld(scene) {
  const rock = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
  scene.add(new THREE.Mesh(buildSurface(false), rock));
  scene.add(new THREE.Mesh(buildSurface(true), rock));
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x4a3f38, roughness: 0.95, flatShading: true });
  addSpikes(scene, spikeMat);
  const glowSources = [];
  addCrystals(scene, glowSources);
  const torches = addTorches(scene, glowSources);
  const chest = addChest(scene, byId.vault);
  const exit = addExit(scene, byId.exit, glowSources);
  return { torches, glowSources, chest, exit, start: byId.start };
}
