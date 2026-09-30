import * as THREE from 'three';

// One pooled point-sprite system. Fire uses additive blending, smoke normal.
export class Particles {
  constructor(scene, max, { additive = true } = {}) {
    this.max = max;
    this.next = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.uniforms = { uScale: { value: 400 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        attribute float size; attribute vec4 color; varying vec4 vColor; uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: additive ? `
        varying vec4 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor.rgb * a * vColor.a, 1.0);
        }` : `
        varying vec4 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.1, d);
          gl_FragColor = vec4(vColor.rgb, vColor.a * a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  setViewport(height, fov) {
    this.uniforms.uScale.value = height / (2 * Math.tan((fov * Math.PI) / 360));
  }

  // o: {x,y,z, vx,vy,vz, life, size, endSize, color:[r,g,b], endColor, alpha, drag, gravity}
  emit(o) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = o.x; this.pos[i * 3 + 1] = o.y; this.pos[i * 3 + 2] = o.z;
    this.vel[i * 3] = o.vx || 0; this.vel[i * 3 + 1] = o.vy || 0; this.vel[i * 3 + 2] = o.vz || 0;
    this.life[i] = 0;
    this.maxLife[i] = o.life;
    this.s0[i] = o.size;
    this.s1[i] = o.endSize ?? o.size * 0.2;
    const c = o.color, e = o.endColor || o.color;
    this.c0[i * 3] = c[0]; this.c0[i * 3 + 1] = c[1]; this.c0[i * 3 + 2] = c[2];
    this.c1[i * 3] = e[0]; this.c1[i * 3 + 1] = e[1]; this.c1[i * 3 + 2] = e[2];
    this.a0[i] = o.alpha ?? 1;
    this.drag[i] = o.drag ?? 0;
    this.grav[i] = o.gravity ?? 0;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const ml = this.maxLife[i];
      if (ml <= 0) continue;
      const l = (this.life[i] += dt);
      if (l >= ml) {
        this.maxLife[i] = 0;
        this.size[i] = 0;
        this.col[i * 4 + 3] = 0;
        continue;
      }
      const t = l / ml;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      for (let c = 0; c < 3; c++) this.col[i * 4 + c] = this.c0[i * 3 + c] + (this.c1[i * 3 + c] - this.c0[i * 3 + c]) * t;
      this.col[i * 4 + 3] = this.a0[i] * (1 - t) * Math.min(1, l * 20);
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }

  clear() {
    this.maxLife.fill(0);
    this.size.fill(0);
  }
}
