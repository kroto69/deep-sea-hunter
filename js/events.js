import * as THREE from 'three';
import { part, mergeParts } from './world/geo.js';

// Reusable event manager: one active event, per-event cooldowns, conditions.
// Each event builds a small temporary group and gets disposed when it ends.
export class EventManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.events = [];
    this.active = null;
    this.activeT = 0;
    this.globalGap = 18;
    this.sinceLast = Infinity;
    this.history = [];
  }

  register(event) {
    this.events.push({
      cooldown: 90,
      duration: 20,
      weight: 1,
      minDepth: 0,
      zones: null,
      ...event,
      readyAt: 0
    });
    return this;
  }

  canRun(e, now) {
    if (this.active) return false;
    if (now < e.readyAt) return false;
    const depth = this.ctx.depth();
    if (depth < e.minDepth) return false;
    if (e.zones) {
      const zone = this.ctx.zone();
      if (!e.zones.includes(zone)) return false;
    }
    return !e.condition || e.condition(this.ctx, now);
  }

  force(id) {
    const e = this.events.find(x => x.id === id);
    if (!e || !this.canRun(e, this.ctx.time()) || this.sinceLast < this.globalGap) return false;
    this._start(e, this.ctx.time());
    return true;
  }

  update(dt, now) {
    this.sinceLast += dt;
    if (this.active) {
      this.activeT += dt;
      this.active.update?.(dt, this.activeT, now);
      if (this.activeT >= this.active.duration) this._end(now);
      return;
    }
    if (this.sinceLast < this.globalGap) return;

    // Rare events roll every couple of seconds; weights keep common ones common.
    this.rollTimer = (this.rollTimer || 0) + dt;
    if (this.rollTimer < 2) return;
    this.rollTimer = 0;

    const candidates = this.events.filter(e => this.canRun(e, now));
    if (!candidates.length) return;
    const total = candidates.reduce((s, e) => s + e.weight, 0);
    let pick = Math.random() * total;
    for (const e of candidates) {
      pick -= e.weight;
      if (pick <= 0) { this._start(e, now); return; }
    }
  }

  _start(e, now) {
    const instance = e.spawn(this.ctx);
    if (!instance) return;
    this.active = { instance, duration: instance.duration ?? e.duration, update: instance.update };
    this.activeT = 0;
    this.active.id = e.id;
    e.readyAt = now + e.cooldown;
    this.ctx.onStart?.(e, instance);
    this.history.push(e.id);
  }

  _end(now) {
    if (!this.active) return;
    this.active.instance.dispose?.();
    this.ctx.onEnd?.(this.active.id);
    this.active = null;
    this.sinceLast = 0;
    this.globalGap = 18 + Math.random() * 14;
  }
}

// ---------- Event content ----------
const rand = (a, b) => a + Math.random() * (b - a);

function schoolGeometry(color, finColor) {
  return mergeParts([
    part(new THREE.ConeGeometry(0.22, 0.8, 5), color, [0, 0, 0], [0, 0, Math.PI / 2]),
    part(new THREE.ConeGeometry(0.16, 0.3, 4), finColor, [-0.45, 0, 0], [0, 0, -Math.PI / 2]),
    part(new THREE.ConeGeometry(0.1, 0.26, 4), finColor, [0, 0.16, 0], [0, 0, 0])
  ]);
}

function mantaGeometry() {
  const parts = [
    part(new THREE.SphereGeometry(0.9, 8, 5), 0x2c3e4d, [0, 0, 0], [0, 0, 0], [1.4, 0.32, 1.5]),
    part(new THREE.ConeGeometry(0.16, 2.6, 4), 0x243542, [-1.6, 0, 0], [0, 0, Math.PI / 2])
  ];
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.ConeGeometry(0.55, 3.6, 4), 0x33495a,
      [0.2, 0, s * 1.6], [s * Math.PI / 2.4, 0, 0], [1, 1, 0.28]));
  }
  parts.push(part(new THREE.SphereGeometry(0.16, 5, 4), 0x1b2732, [-1.5, 0.08, 0.42]));
  parts.push(part(new THREE.SphereGeometry(0.16, 5, 4), 0x1b2732, [-1.5, 0.08, -0.42]));
  return mergeParts(parts);
}

function jellyGeometry() {
  return mergeParts([
    part(new THREE.SphereGeometry(0.5, 8, 5), 0x9f7fd8, [0, 0, 0], [0, 0, 0], [1, 0.7, 1]),
    ...Array.from({ length: 6 }, (_, i) => {
      const a = i / 6 * Math.PI * 2;
      return part(new THREE.ConeGeometry(0.06, 0.9, 3), 0xc9a6f0,
        [Math.cos(a) * 0.25, -0.5, Math.sin(a) * 0.25], [Math.PI, 0, 0]);
    })
  ]);
}

function seahorseGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    parts.push(part(new THREE.SphereGeometry(0.16 - i * 0.015, 5, 3), 0xd8a24a,
      [Math.sin(i * 0.5) * 0.2, i * 0.22, 0], [0, 0, i * 0.12]));
  }
  parts.push(part(new THREE.ConeGeometry(0.13, 0.5, 4), 0xe0b060, [0.32, 1.0, 0], [0, 0, -Math.PI / 3]));
  parts.push(part(new THREE.ConeGeometry(0.1, 0.3, 4), 0xc89040, [0, 1.15, 0], [0, 0, 0]));
  return mergeParts(parts);
}

function bubbleCluster(count, radius) {
  const geo = new THREE.SphereGeometry(0.09, 4, 3);
  const mat = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.55 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const data = [];
  for (let i = 0; i < count; i++) {
    data.push({
      x: (Math.random() - 0.5) * radius,
      y: Math.random() * 6,
      z: (Math.random() - 0.5) * radius,
      speed: 0.6 + Math.random() * 1.5,
      size: 0.5 + Math.random()
    });
  }
  return { mesh, data, geo, mat };
}

export function createEventContent({ scene, environment, ocean, fishSystem }) {
  const events = [];
  const disposable = (obj) => {
    scene.remove(obj);
    obj.traverse?.(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  };

  events.push({
    id: 'migration',
    label: 'MIGRATION · SARDINE RUN',
    cooldown: 110,
    duration: 26,
    weight: 3,
    minDepth: 6,
    spawn(ctx) {
      const group = new THREE.Group();
      const geo = schoolGeometry(0xbfd6e2, 0x7d97a8);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
      const count = ctx.quality === 'low' ? 14 : 24;
      const fish = [];
      const dir = Math.random() * Math.PI * 2;
      const start = new THREE.Vector3(
        Math.cos(dir) * -70, 10 + Math.random() * 8, Math.sin(dir) * -70
      );
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(start).add(new THREE.Vector3(rand(-6, 6), rand(-3, 3), rand(-6, 6)));
        mesh.rotation.y = -dir;
        group.add(mesh);
        fish.push({ mesh, phase: Math.random() * Math.PI * 2, speed: 4 + Math.random() * 1.5 });
      }
      scene.add(group);
      const vel = new THREE.Vector3(Math.cos(dir), 0, Math.sin(dir));
      return {
        duration: 26,
        update(dt, t) {
          for (const f of fish) {
            f.mesh.position.addScaledVector(vel, f.speed * dt);
            f.mesh.position.y += Math.sin(t * 1.6 + f.phase) * dt * 0.8;
            f.mesh.rotation.z = Math.sin(t * 8 + f.phase) * 0.15;
            const floor = environment.terrainHeight(f.mesh.position.x, f.mesh.position.z) + 2;
            f.mesh.position.y = Math.max(floor, Math.min(32, f.mesh.position.y));
          }
        },
        dispose() {
          scene.remove(group);
          geo.dispose(); mat.dispose();
        }
      };
    }
  });

  events.push({
    id: 'manta',
    label: 'MANTA RAY PASSING',
    cooldown: 150,
    duration: 30,
    weight: 2,
    minDepth: 8,
    spawn(ctx) {
      const geo = mantaGeometry();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      const dir = Math.random() < 0.5 ? 1 : -1;
      mesh.position.set(-dir * 80, 16, rand(-50, 50));
      mesh.scale.setScalar(2.4);
      scene.add(mesh);
      return {
        duration: 30,
        interest: mesh.position,
        update(dt, t) {
          mesh.position.x += dir * 5.2 * dt;
          mesh.position.y = 16 + Math.sin(t * 0.6) * 2.2;
          mesh.position.z += Math.cos(t * 0.4) * 1.6 * dt;
          mesh.rotation.y = dir > 0 ? 0 : Math.PI;
          mesh.rotation.z = Math.sin(t * 1.3) * 0.22;
          if (fishSystem.scareNearby) fishSystem.scareNearby(mesh.position, 14);
        },
        dispose() { disposable(mesh); }
      };
    }
  });

  events.push({
    id: 'jellyfish',
    label: 'JELLYFISH BLOOM',
    cooldown: 130,
    duration: 24,
    weight: 3,
    minDepth: 4,
    spawn(ctx) {
      const group = new THREE.Group();
      const geo = jellyGeometry();
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, flatShading: true, transparent: true, opacity: 0.75,
        emissive: 0x4a2f7a, emissiveIntensity: 0.4
      });
      const jellies = [];
      const count = ctx.quality === 'low' ? 6 : 11;
      const cx = (Math.random() - 0.5) * 90, cz = (Math.random() - 0.5) * 90;
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx + rand(-10, 10), 10 + rand(0, 12), cz + rand(-10, 10));
        mesh.scale.setScalar(rand(0.7, 1.4));
        group.add(mesh);
        jellies.push({ mesh, phase: Math.random() * Math.PI * 2, rise: rand(0.15, 0.4) });
      }
      scene.add(group);
      return {
        duration: 24,
        update(dt, t) {
          for (const j of jellies) {
            j.mesh.position.y += j.rise * dt;
            if (j.mesh.position.y > 31) j.mesh.position.y = 8;
            const s = 1 + Math.sin(t * 2.4 + j.phase) * 0.12;
            j.mesh.scale.y = s;
            j.mesh.rotation.y = t * 0.3 + j.phase;
          }
        },
        dispose() { scene.remove(group); geo.dispose(); mat.dispose(); }
      };
    }
  });

  events.push({
    id: 'current',
    label: 'STRONG CURRENT',
    cooldown: 80,
    duration: 16,
    weight: 4,
    spawn() {
      ocean.setStrength(2.4);
      return {
        duration: 16,
        update() {},
        dispose() { ocean.setStrength(1); }
      };
    }
  });

  events.push({
    id: 'wreckBubbles',
    label: 'ODD BUBBLES NEAR WRECK',
    cooldown: 100,
    duration: 18,
    weight: 3,
    zones: ['wreck'],
    spawn() {
      const cluster = bubbleCluster(60, 10);
      const wreck = environment.habitats.find(h => h.id === 'wreck') || { x: 6, z: 64 };
      cluster.mesh.position.set(wreck.x, environment.terrainHeight(wreck.x, wreck.z) + 1, wreck.z);
      scene.add(cluster.mesh);
      const m = new THREE.Matrix4();
      const s = new THREE.Vector3();
      const v = new THREE.Vector3();
      return {
        duration: 18,
        update(dt, t) {
          for (let i = 0; i < cluster.data.length; i++) {
            const b = cluster.data[i];
            b.y += b.speed * dt;
            if (b.y > 26) b.y = 0;
            v.set(b.x + Math.sin(t * 1.4 + i) * 0.4, b.y, b.z + Math.cos(t + i) * 0.4);
            s.setScalar(b.size);
            m.compose(v, new THREE.Quaternion(), s);
            cluster.mesh.setMatrixAt(i, m);
          }
          cluster.mesh.instanceMatrix.needsUpdate = true;
        },
        dispose() { scene.remove(cluster.mesh); cluster.geo.dispose(); cluster.mat.dispose(); }
      };
    }
  });

  events.push({
    id: 'rare',
    label: 'RARE SIGHTING · SEAHORSE',
    cooldown: 160,
    duration: 22,
    weight: 2,
    minDepth: 3,
    spawn() {
      const geo = seahorseGeometry();
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      const coral = environment.reef?.coralsOfType?.('branching')?.[0];
      mesh.position.set(
        coral ? coral.x + 1 : rand(-40, 40),
        environment.terrainHeight(coral ? coral.x : 0, coral ? coral.z : 0) + 2.2,
        coral ? coral.z + 1 : rand(-40, 40)
      );
      mesh.scale.setScalar(2.2);
      scene.add(mesh);
      return {
        duration: 22,
        update(dt, t) {
          mesh.position.y += Math.sin(t * 1.2) * dt * 0.4;
          mesh.rotation.y = Math.sin(t * 0.5) * 0.6;
        },
        dispose() { disposable(mesh); }
      };
    }
  });

  return events;
}
