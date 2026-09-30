import * as THREE from 'three';

// A fixed set of point lights reused for fireballs and blasts. Adding and
// removing lights would force every material to recompile, so the count never
// changes; unused lights just sit at zero intensity.
export class LightPool {
  constructor(scene, count = 8) {
    this.slots = [];
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(0xff8a3a, 0, 16, 2);
      scene.add(light);
      this.slots.push({ light, owner: null, fade: 0, start: 0, t: 0 });
    }
  }

  // Borrow a light for something that moves (a fireball). Returns null if all are busy.
  acquire(owner) {
    let best = null;
    for (const s of this.slots) {
      if (!s.owner) { best = s; break; }
    }
    if (!best) {
      // steal the dimmest flash
      for (const s of this.slots) if (s.owner === 'flash' && (!best || s.light.intensity < best.light.intensity)) best = s;
    }
    if (!best) return null;
    best.owner = owner;
    best.fade = 0;
    return best;
  }

  release(slot) {
    if (!slot) return;
    slot.owner = null;
    slot.light.intensity = 0;
  }

  flash(pos, color, intensity, distance, duration) {
    const s = this.acquire('flash');
    if (!s) return;
    s.light.position.copy(pos);
    s.light.color.set(color);
    s.light.distance = distance;
    s.start = intensity;
    s.fade = duration;
    s.t = 0;
    s.light.intensity = intensity;
  }

  update(dt) {
    for (const s of this.slots) {
      if (s.owner !== 'flash') continue;
      s.t += dt;
      const k = 1 - s.t / s.fade;
      if (k <= 0) this.release(s);
      else s.light.intensity = s.start * k * k;
    }
  }

  clear() {
    for (const s of this.slots) this.release(s);
  }
}
