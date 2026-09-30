import { MAP_BOUNDS, mapCells, hasLineOfSight, ROOMS } from './world.js';

// The cave map fills in as you see it. One map cell is one world unit.
// Map up is toward the exit (+z) and map right is world -x, which matches
// the view when the wizard faces up the map.
const S = 3; // pixels per cell on the offscreen map
const { X1, Z1 } = MAP_BOUNDS;

export class CaveMap {
  constructor(mini, full) {
    this.mini = mini;
    this.full = full;
    const { w, h, cells } = mapCells();
    this.w = w;
    this.h = h;
    this.cells = cells;
    this.seen = new Uint8Array(w * h);
    this.base = document.createElement('canvas');
    this.base.width = w * S;
    this.base.height = h * S;
    this.bctx = this.base.getContext('2d');
    this.revealT = 0;
    this.radius = 14;
  }

  reset() {
    this.seen.fill(0);
    this.bctx.clearRect(0, 0, this.base.width, this.base.height);
  }

  toMap(x, z) {
    return { x: (X1 - x) * S, y: (Z1 - z) * S };
  }

  cellIndex(x, z) {
    const i = Math.floor(X1 - x), j = Math.floor(Z1 - z);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }

  isSeen(x, z) {
    const k = this.cellIndex(x, z);
    return k >= 0 && this.seen[k] === 1;
  }

  // Reveal the walkable cells the wizard can see from here
  update(dt, pos) {
    this.revealT -= dt;
    if (this.revealT > 0) return;
    this.revealT = 0.2;
    const R = this.radius;
    const ci = Math.floor(X1 - pos.x), cj = Math.floor(Z1 - pos.z);
    const g = this.bctx;
    for (let j = cj - R; j <= cj + R; j++) {
      for (let i = ci - R; i <= ci + R; i++) {
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const k = j * this.w + i;
        if (this.seen[k] || !this.cells[k]) continue;
        const di = i - ci, dj = j - cj;
        if (di * di + dj * dj > R * R) continue;
        const wx = X1 - i - 0.5, wz = Z1 - j - 0.5;
        if (!hasLineOfSight(pos, { x: wx, z: wz })) continue;
        this.seen[k] = 1;
        const edge = !this.cells[k - 1] || !this.cells[k + 1] || !this.cells[k - this.w] || !this.cells[k + this.w];
        g.fillStyle = edge ? '#c9b08c' : '#6f5d4d';
        g.fillRect(i * S, j * S, S, S);
      }
    }
  }

  drawMarkers(g, scale, markers) {
    for (const m of markers) {
      if (!m.always && !this.isSeen(m.x, m.z)) continue;
      const p = this.toMap(m.x, m.z);
      g.fillStyle = m.color;
      g.strokeStyle = '#120c09';
      g.lineWidth = 1.5 / scale;
      g.beginPath();
      if (m.shape === 'diamond') {
        const r = m.size / scale;
        g.moveTo(p.x, p.y - r); g.lineTo(p.x + r, p.y); g.lineTo(p.x, p.y + r); g.lineTo(p.x - r, p.y); g.closePath();
      } else {
        g.arc(p.x, p.y, m.size / scale, 0, Math.PI * 2);
      }
      g.fill();
      g.stroke();
    }
  }

  drawArrow(g, x, y, angle, size) {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    g.fillStyle = '#ff8f2e';
    g.strokeStyle = '#1a0f08';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -size);
    g.lineTo(size * 0.7, size * 0.8);
    g.lineTo(0, size * 0.4);
    g.lineTo(-size * 0.7, size * 0.8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  // Small map in the corner that turns with the wizard
  drawMini(wiz, markers) {
    const c = this.mini, g = c.getContext('2d');
    const W = c.width, H = c.height, r = W / 2;
    g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath();
    g.arc(r, r, r - 2, 0, Math.PI * 2);
    g.fillStyle = 'rgba(12,9,8,0.78)';
    g.fill();
    g.clip();
    const zoom = (W / 190) * 1.25;
    const p = this.toMap(wiz.pos.x, wiz.pos.z);
    g.translate(r, r);
    g.rotate(wiz.yaw);
    g.scale(zoom, zoom);
    g.translate(-p.x, -p.y);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.base, 0, 0);
    this.drawMarkers(g, zoom, markers);
    g.restore();
    this.drawArrow(g, r, r, 0, 8);
    g.beginPath();
    g.arc(r, r, r - 2, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(233,185,73,0.6)';
    g.lineWidth = 2;
    g.stroke();
  }

  // Full-screen map, map-up toward the exit
  drawFull(wiz, markers) {
    const c = this.full, g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    const scale = Math.min((W * 0.9) / this.base.width, (H * 0.86) / this.base.height);
    const ox = (W - this.base.width * scale) / 2, oy = (H - this.base.height * scale) / 2 + H * 0.02;
    g.save();
    g.translate(ox, oy);
    g.scale(scale, scale);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.base, 0, 0);
    this.drawMarkers(g, scale, markers);
    g.restore();
    // Names of rooms you have seen
    g.textAlign = 'center';
    g.font = `600 ${Math.max(12, Math.round(15 * scale / 1.6))}px "Barlow Semi Condensed", "Arial Narrow", sans-serif`;
    for (const room of ROOMS) {
      if (!this.isSeen(room.x, room.z)) continue;
      const p = this.toMap(room.x, room.z);
      const x = ox + p.x * scale, y = oy + (p.y + room.r * S + 6) * scale;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.strokeText(room.name, x, y);
      g.fillStyle = '#f1e6d8';
      g.fillText(room.name, x, y);
    }
    const p = this.toMap(wiz.pos.x, wiz.pos.z);
    this.drawArrow(g, ox + p.x * scale, oy + p.y * scale, -wiz.yaw, 11);
  }
}
