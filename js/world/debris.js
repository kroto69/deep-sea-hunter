import * as THREE from 'three';
import { part, mergeParts, propMaterial } from './geo.js';

// Pollution assets. Each builder returns one merged vertex-coloured geometry.
const DEBRIS_BUILDERS = {
  bottle(rand) {
    return mergeParts([
      part(new THREE.CylinderGeometry(0.09, 0.09, 0.42, 6), 0x38e0f0, [0, 0.21, 0]),
      part(new THREE.CylinderGeometry(0.09, 0.05, 0.14, 6), 0x38e0f0, [0, 0.47, 0]),
      part(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 6), 0x0f4a6a, [0, 0.58, 0])
    ]);
  },
  bag(rand) {
    const g = new THREE.IcosahedronGeometry(0.32, 0);
    g.scale(1, 1.35, 0.35);
    return mergeParts([
      part(g, 0x9ff5ff, [0, 0.32, 0], [0.2, rand() * 3, 0.1]),
      part(new THREE.ConeGeometry(0.14, 0.2, 4), 0x6ee6ff, [0, 0.66, 0], [0.2, 0, 0])
    ]);
  },
  can(rand) {
    return mergeParts([
      part(new THREE.CylinderGeometry(0.115, 0.115, 0.34, 8), 0xff4d4d, [0, 0.17, 0], [0, 0, 0.35]),
      part(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 8), 0xfff0f0, [0.06, 0.17, 0], [0, 0, 0.35])
    ]);
  },
  tire(rand) {
    const g = new THREE.TorusGeometry(0.46, 0.18, 6, 10);
    return mergeParts([part(g, 0x2a2a2e, [0, 0.18, 0], [Math.PI / 2, 0, rand()], [1, 1, 0.7])]);
  },
  net(rand) {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      parts.push(part(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 3), 0x5ce6c8,
        [(rand() - 0.5) * 0.9, 0.06 + rand() * 0.14, (rand() - 0.5) * 0.9],
        [Math.PI / 2, rand() * Math.PI, rand() * 0.5]));
    }
    for (let i = 0; i < 3; i++) {
      parts.push(part(new THREE.TorusGeometry(0.3 + rand() * 0.25, 0.02, 3, 7), 0x9cf7e4,
        [(rand() - 0.5) * 0.6, 0.05, (rand() - 0.5) * 0.6], [Math.PI / 2 + (rand() - 0.5) * 0.5, rand(), 0]));
    }
    return mergeParts(parts);
  },
  line(rand) {
    return mergeParts([
      part(new THREE.TorusGeometry(0.4, 0.012, 3, 10), 0xd8e0d0, [0, 0.03, 0], [Math.PI / 2, 0, 0]),
      part(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 3), 0xd8e0d0, [0.4, 0.12, 0], [0, 0, 0.9])
    ]);
  },
  barrel(rand) {
    return mergeParts([
      part(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 8), 0x7a5a3a, [0, 0.45, 0], [0, 0, 0.25]),
      part(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 8), 0x8a6a4a, [0.1, 0.2, 0], [0, 0, 0.25]),
      part(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 8), 0x8a6a4a, [0.2, 0.7, 0], [0, 0, 0.25])
    ]);
  },
  crate(rand) {
    const parts = [part(new THREE.BoxGeometry(0.7, 0.5, 0.6), 0x8a6a40, [0, 0.25, 0], [0.1, rand(), 0.08])];
    for (let i = 0; i < 3; i++) {
      parts.push(part(new THREE.BoxGeometry(0.74, 0.06, 0.06), 0x6a4e2c,
        [0, 0.08 + i * 0.19, 0.3], [0.1, 0, 0.08]));
    }
    return mergeParts(parts);
  },
  wood(rand) {
    const parts = [];
    for (let i = 0; i < 3; i++) {
      parts.push(part(new THREE.BoxGeometry(0.14, 0.12, 1.2 + rand() * 0.8), [0x7a5a38, 0x8a6a44][i % 2],
        [(rand() - 0.5) * 0.5, 0.08 + rand() * 0.1, (rand() - 0.5) * 0.5],
        [0, rand() * Math.PI, (rand() - 0.5) * 0.2]));
    }
    return mergeParts(parts);
  },
  trap(rand) {
    const parts = [];
    const s = 0.5;
    parts.push(part(new THREE.BoxGeometry(s, s * 0.6, s), 0x9a7a4a, [0, s * 0.3, 0], [0, rand(), 0]));
    for (let i = 0; i < 4; i++) {
      parts.push(part(new THREE.TorusGeometry(s * 0.3, 0.02, 3, 6), 0xb0906a,
        [(rand() - 0.5) * s * 0.6, s * 0.3, (rand() - 0.5) * s * 0.6], [Math.PI / 2, 0, 0]));
    }
    return mergeParts(parts);
  }
};

// Which debris types make good cover / habitat for small animals.
const SHELTER_TYPES = { tire: 0.9, net: 0.7, trap: 0.8, crate: 0.8, barrel: 0.6, wood: 0.5 };

export function createDebris({ terrain, group, quality, rand, timeUniform }) {
  const disposables = [];
  const staticPositions = [];
  const shelters = [];
  const floating = [];
  const scale = quality === 'low' ? 0.35 : quality === 'medium' ? 0.6 : 1.1;

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const vec = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const color = new THREE.Color();

  const types = Object.keys(DEBRIS_BUILDERS);
  const geos = {};
  const mats = {};
  for (const t of types) {
    geos[t] = DEBRIS_BUILDERS[t](rand);
    mats[t] = propMaterial({ roughness: 1 });
    disposables.push(geos[t], mats[t]);
  }

  const meshByType = Object.create(null);
  const indexByItem = new Map();
  const removed = new Set();

  // Clustered placement: garbage piles up, it does not rain evenly.
  const clusters = Math.max(4, Math.round(9 * scale));
  const perType = {};
  for (const t of types) perType[t] = { count: 0, items: [] };

  for (let c = 0; c < clusters; c++) {
    const cx = (rand() - 0.5) * 165;
    const cz = (rand() - 0.5) * 165;
    const items = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < items; i++) {
      const t = types[Math.floor(rand() * types.length)];
      const x = cx + (rand() - 0.5) * 6;
      const z = cz + (rand() - 0.5) * 6;
      const s = 0.8 + rand() * 0.6;
      const y = terrain.heightAt(x, z);
      perType[t].items.push({ x, y, z, s, rot: rand() * Math.PI * 2 });
      const item = { x, y, z, type: t, radius: 0.9 * s };
      staticPositions.push(item);
      if (SHELTER_TYPES[t]) shelters.push({ x, y, z, type: t, chance: SHELTER_TYPES[t] });
    }
  }

  // Build one InstancedMesh per debris type from the collected transforms.
  for (const t of types) {
    const items = perType[t].items;
    const mesh = new THREE.InstancedMesh(geos[t], mats[t], Math.max(1, items.length));
    meshByType[t] = mesh;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      euler.set(0, it.rot, 0);
      quat.setFromEuler(euler);
      scl.setScalar(it.s);
      vec.set(it.x, it.y, it.z);
      matrix.compose(vec, quat, scl);
      mesh.setMatrixAt(i, matrix);
      indexByItem.set(staticPositions.find(p => p.x === it.x && p.z === it.z && p.type === t), { mesh, index: i, item: it });
      color.setHSL(0.08, 0.08, 0.55 + rand() * 0.25);
      mesh.setColorAt(i, color);
    }
    for (let i = items.length; i < mesh.count; i++) {
      matrix.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  // Floating debris: a few pieces drift with the current, getting recycled.
  const floatCount = Math.max(3, Math.round(6 * scale));
  const floatTypes = ['bag', 'bottle', 'line', 'crate'];
  for (let i = 0; i < floatCount; i++) {
    const t = floatTypes[i % floatTypes.length];
    const mesh = new THREE.Mesh(geos[t], mats[t]);
    const s = 0.9 + rand() * 0.7;
    mesh.scale.setScalar(s);
    mesh.position.set((rand() - 0.5) * 150, 6 + rand() * 24, (rand() - 0.5) * 150);
    mesh.rotation.set(rand() * 0.6, rand() * 3, rand() * 0.6);
    group.add(mesh);
    floating.push({
      mesh,
      baseY: mesh.position.y,
      speed: 0.25 + rand() * 0.5,
      phase: rand() * Math.PI * 2,
      dir: rand() * Math.PI * 2
    });
  }

  const CURRENT = new THREE.Vector2(0.55, 0.26); // world current, plants use the same feel

  function update(dt, t, worldCurrent) {
    const cx = worldCurrent ? worldCurrent.x : CURRENT.x;
    const cz = worldCurrent ? worldCurrent.y : CURRENT.y;
    for (const f of floating) {
      f.mesh.position.x += cx * f.speed * dt;
      f.mesh.position.z += cz * f.speed * dt;
      f.mesh.position.y = f.baseY + Math.sin(t * 0.8 + f.phase) * 0.5;
      f.mesh.rotation.y += dt * 0.15 * f.speed;
      if (f.mesh.position.x > 88) f.mesh.position.x = -88;
      if (f.mesh.position.z > 88) f.mesh.position.z = -88;
    }
  }

  return {
    update,
    current: CURRENT,
    positions: staticPositions,
    shelters,
    remove(item) {
      if (removed.has(item)) return false;
      const entry = indexByItem.get(item);
      if (!entry) return false;
      removed.add(item);
      const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
      entry.mesh.setMatrixAt(entry.index, hidden);
      entry.mesh.instanceMatrix.needsUpdate = true;
      const i = staticPositions.indexOf(item);
      if (i >= 0) staticPositions.splice(i, 1);
      return true;
    },
    dispose() { disposables.forEach(d => d.dispose()); }
  };
}
