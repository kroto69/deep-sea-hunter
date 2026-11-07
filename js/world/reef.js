import * as THREE from 'three';
import { part, mergeParts, propMaterial } from './geo.js';
import { limestoneGeometry, scallopGeometry } from './environment-art.js';
import { coralGeometry, coralFamilyGeometry, CORAL_VARIANTS } from './coral-art.js';

// Region density per coral type: how likely a colony picks that habitat.
const TYPE_DENSITY = {
  branching: { coral: 1.0, rocky: 0.35, shallow: 0.3, seagrass: 0.1, wreck: 0.3, open: 0.02 },
  brain: { coral: 0.8, rocky: 0.3, shallow: 0.35, seagrass: 0.1, wreck: 0.2, open: 0.02 },
  table: { coral: 0.7, rocky: 0.2, shallow: 0.2, seagrass: 0.05, wreck: 0.25, open: 0.01 },
  fan: { coral: 0.6, rocky: 0.5, shallow: 0.1, seagrass: 0.05, wreck: 0.35, open: 0.01 },
  tube: { coral: 0.55, rocky: 0.45, shallow: 0.05, seagrass: 0.0, wreck: 0.3, open: 0.01 },
  mushroom: { coral: 0.45, rocky: 0.2, shallow: 0.3, seagrass: 0.15, wreck: 0.1, open: 0.01 },
  anemone: { coral: 0.4, rocky: 0.35, shallow: 0.25, seagrass: 0.15, wreck: 0.15, open: 0.01 },
  dead: { coral: 0.25, rocky: 0.6, shallow: 0.25, seagrass: 0.2, wreck: 0.4, open: 0.08 }
};

// --- Coral generators: each returns one merged vertex-coloured geometry ---
const CORAL_BUILDERS = {
  branching(rand) {
    const parts = [];
    const branches = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < branches; i++) {
      const h = 0.9 + rand() * 1.6;
      const tilt = (rand() - 0.5) * 0.95;
      parts.push(part(
        new THREE.ConeGeometry(0.1 + rand() * 0.08, h, 5),
        [0xff4f7b, 0xff8a3d, 0xff3d8f][i % 3],
        [(rand() - 0.5) * 0.5, h * 0.5, (rand() - 0.5) * 0.5],
        [tilt, rand() * Math.PI, tilt * 0.6],
        [1, 1, 1]
      ));
    }
    return mergeParts(parts);
  },
  brain(rand) {
    const parts = [];
    const r = 0.7 + rand() * 0.5;
    parts.push(part(new THREE.SphereGeometry(r, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      0x3fe0a0, [0, 0, 0], [0, 0, 0], [1, 0.62, 1]));
    for (let i = 0; i < 5; i++) {
      const a = rand() * Math.PI * 2;
      const d = r * 0.45 * rand();
      parts.push(part(new THREE.SphereGeometry(r * 0.4, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2),
        [0x9bffcf, 0x2fcf8a][i % 2],
        [Math.cos(a) * d, r * 0.1, Math.sin(a) * d], [0, 0, 0], [1, 0.5, 1]));
    }
    return mergeParts(parts);
  },
  table(rand) {
    const h = 0.5 + rand() * 0.7;
    const r = 0.9 + rand() * 0.8;
    return mergeParts([
      part(new THREE.CylinderGeometry(0.1, 0.16, h, 5), 0x9a7a4a, [0, h * 0.5, 0]),
      part(new THREE.CylinderGeometry(r, r * 0.86, 0.14, 8), 0xffb636, [0, h, 0], [0, rand() * 1.2, 0.05]),
      part(new THREE.CylinderGeometry(r * 0.55, r * 0.5, 0.1, 7), 0xffd56a, [r * 0.7, h * 0.72, r * 0.3], [0, 0, 0.12])
    ]);
  },
  fan(rand) {
    const h = 1.0 + rand() * 1.2;
    const parts = [part(new THREE.CylinderGeometry(0.06, 0.1, h, 4), 0xb0602a, [0, h * 0.5, 0])];
    for (let i = 0; i < 4; i++) {
      parts.push(part(
        new THREE.OctahedronGeometry(0.8, 0),
        0xff6a1f,
        [(rand() - 0.5) * 0.5, h + (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.3],
        [0, rand() * Math.PI, 0],
        [1.1, 0.9, 0.12]
      ));
    }
    return mergeParts(parts);
  },
  tube(rand) {
    const parts = [];
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const h = 0.7 + rand() * 1.2;
      parts.push(part(
        new THREE.CylinderGeometry(0.16, 0.2, h, 6, 1, true),
        [0xa64dff, 0xd27bff, 0x7f3dff][i % 3],
        [(rand() - 0.5) * 0.5, h * 0.5, (rand() - 0.5) * 0.5],
        [(rand() - 0.5) * 0.25, 0, (rand() - 0.5) * 0.25]
      ));
    }
    return mergeParts(parts);
  },
  mushroom(rand) {
    const parts = [];
    const n = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const h = 0.35 + rand() * 0.5;
      const a = rand() * Math.PI * 2;
      const d = rand() * 0.5;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      parts.push(part(new THREE.CylinderGeometry(0.07, 0.09, h, 4), 0xc0a070, [x, h * 0.5, z]));
      parts.push(part(new THREE.CylinderGeometry(0.36, 0.42, 0.1, 7), 0xfff0a8, [x, h, z], [0, rand(), 0]));
    }
    return mergeParts(parts);
  },
  anemone(rand) {
    const parts = [part(new THREE.CylinderGeometry(0.42, 0.34, 0.24, 7), 0xa03a6a, [0, 0.12, 0])];
    const tentacles = 14;
    for (let i = 0; i < tentacles; i++) {
      const a = (i / tentacles) * Math.PI * 2 + rand() * 0.3;
      const d = 0.14 + rand() * 0.24;
      parts.push(part(
        new THREE.CylinderGeometry(0.03, 0.015, 0.55 + rand() * 0.35, 4),
        [0xb0e060, 0xe070b0, 0x70e0c0][i % 3],
        [Math.cos(a) * d, 0.5, Math.sin(a) * d],
        [Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35]
      ));
    }
    return mergeParts(parts);
  },
  dead(rand) {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const len = 0.6 + rand() * 1.1;
      parts.push(part(
        new THREE.ConeGeometry(0.07, len, 4),
        [0xdedad0, 0xbdb8ac][i % 2],
        [(rand() - 0.5) * 0.7, len * 0.35, (rand() - 0.5) * 0.7],
        [Math.PI * 0.5 * rand(), rand() * Math.PI, Math.PI * (0.15 + rand() * 0.4)]
      ));
    }
    return mergeParts(parts);
  }
};

function rockGeometry(rand) {
  const variation = rand();
  // Keep shared placement RNG stream unchanged while replacing old three-rock pile.
  for (let i = 1; i < 24; i++) rand();
  return limestoneGeometry(variation * Math.PI);
}

function stoneGeometry(rand) {
  return mergeParts([
    part(new THREE.DodecahedronGeometry(0.22, 0), 0x8b8478, [0, 0.08, 0], [rand(), rand(), rand()], [1, 0.6, 1]),
    part(new THREE.DodecahedronGeometry(0.14, 0), 0xa09484, [0.24, 0.04, 0.1], [rand(), rand(), rand()], [1, 0.7, 1])
  ]);
}

function shellGeometry() {
  return scallopGeometry();
}

export function createReef({ terrain, group, quality, rand }) {
  const disposables = [];
  const meshes = [];
  const instanced = [];
  const scale = quality === 'low' ? 0.22 : quality === 'medium' ? 0.48 : 1.0;

  const placementMode = new Map(); // habitat id -> density table accessor

  function makeInstanced(geo, count, material, opts = {}) {
    const mat = material || propMaterial({ flatShading: opts.flatShading !== false });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    group.add(mesh);
    disposables.push(geo, mat);
    instanced.push(mesh);
    return mesh;
  }

  // --- Rocks & stones ---
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const vec = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const color = new THREE.Color();

  const rockGeo = rockGeometry(rand);
  const rockCount = Math.round(90 * scale);
  const rocks = makeInstanced(rockGeo, rockCount);
  let placed = 0;
  let guard = 0;
  while (placed < rockCount && guard++ < rockCount * 30) {
    const x = (rand() - 0.5) * 175;
    const z = (rand() - 0.5) * 175;
    const zone = terrain.zoneAt(x, z);
    const density = zone.id === 'rocky' ? 0.85 : zone.id === 'coral' ? 0.3 : zone.id === 'wreck' ? 0.25 : 0.14;
    if (rand() > density) continue;
    const s = (zone.id === 'rocky' ? 1.3 : 0.6) + rand() * 2.4;
    euler.set((rand() - 0.5) * 0.16, rand() * Math.PI, (rand() - 0.5) * 0.16);
    quat.setFromEuler(euler);
    scl.set(s, s * (0.6 + rand() * 0.6), s);
    vec.set(x, terrain.heightAt(x, z) + s * 0.2, z);
    matrix.compose(vec, quat, scl);
    rocks.setMatrixAt(placed, matrix);
    color.setScalar(0.86 + rand() * 0.14);
    rocks.setColorAt(placed, color);
    placed++;
  }
  for (let i = placed; i < rockCount; i++) {
    matrix.makeScale(0, 0, 0);
    rocks.setMatrixAt(i, matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;

  // Small stones / pebbles scattered on sand
  const stoneCount = Math.round(240 * scale);
  const stones = makeInstanced(stoneGeometry(rand), stoneCount, propMaterial({ roughness: 1 }));
  for (let i = 0; i < stoneCount; i++) {
    const x = (rand() - 0.5) * 180;
    const z = (rand() - 0.5) * 180;
    const s = 0.5 + rand() * 1.3;
    euler.set(0, rand() * Math.PI, 0);
    quat.setFromEuler(euler);
    scl.set(s, s * (0.7 + rand() * 0.5), s);
    vec.set(x, terrain.heightAt(x, z) + 0.05, z);
    matrix.compose(vec, quat, scl);
    stones.setMatrixAt(i, matrix);
    color.setScalar(0.84 + rand() * 0.16);
    stones.setColorAt(i, color);
  }
  stones.instanceMatrix.needsUpdate = true;
  if (stones.instanceColor) stones.instanceColor.needsUpdate = true;

  // Shells + dead coral fragments littering sandy flats
  const shellCount = Math.round(70 * scale);
  const shells = makeInstanced(shellGeometry(), shellCount, propMaterial({ roughness: 0.8 }));
  for (let i = 0; i < shellCount; i++) {
    const x = (rand() - 0.5) * 170;
    const z = (rand() - 0.5) * 170;
    const s = 0.6 + rand() * 1.0;
    euler.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4);
    quat.setFromEuler(euler);
    scl.setScalar(s);
    vec.set(x, terrain.heightAt(x, z) + 0.03, z);
    matrix.compose(vec, quat, scl);
    shells.setMatrixAt(i, matrix);
    color.setScalar(0.9 + rand() * 0.1);
    shells.setColorAt(i, color);
  }
  shells.instanceMatrix.needsUpdate = true;
  if (shells.instanceColor) shells.instanceColor.needsUpdate = true;

  // --- Coral colonies: clustered placement, one InstancedMesh per type ---
  const coralMeshes = {};
  const coralPositions = Object.create(null);
  const colonyBudget = {
    branching: Math.round(30 * scale),
    brain: Math.round(22 * scale),
    table: Math.round(18 * scale),
    fan: Math.round(20 * scale),
    tube: Math.round(18 * scale),
    mushroom: Math.round(20 * scale),
    anemone: Math.round(18 * scale),
    dead: Math.round(18 * scale)
  };

  for (const [type, count] of Object.entries(colonyBudget)) {
    const geo = CORAL_BUILDERS[type](rand);
    const mesh = makeInstanced(geo, count);
    const density = TYPE_DENSITY[type];
    const points = [];
    let i = 0;
    let attempts = 0;
    while (i < count && attempts++ < count * 60) {
      // Colony centres
      if (points.length === 0 || rand() < 0.45) {
        let cx = 0, cz = 0, ok = false;
        for (let tries = 0; tries < 40 && !ok; tries++) {
          cx = (rand() - 0.5) * 175;
          cz = (rand() - 0.5) * 175;
          const zone = terrain.zoneAt(cx, cz);
          const w = terrain.zoneWeights(cx, cz).find(z => z.h.id === zone.id)?.w ?? 0.2;
          if (rand() < (density[zone.id] ?? 0.02) * (0.5 + w)) ok = true;
        }
        if (!ok) continue;
        points.length = 0;
        const members = 2 + Math.floor(rand() * 5);
        for (let m = 0; m < members; m++) {
          const x = cx + (rand() - 0.5) * 6.5;
          const z = cz + (rand() - 0.5) * 6.5;
          points.push({ x, z });
        }
      }
      const p = points.pop();
      if (!p) continue;
      const x = p.x, z = p.z;
      const s = (0.55 + rand() * 0.9) * (terrain.zoneAt(x, z).id === 'coral' ? 1.15 : 1);
      euler.set(0, rand() * Math.PI * 2, 0);
      quat.setFromEuler(euler);
      scl.set(s, s * (0.85 + rand() * 0.35), s);
      vec.set(x, terrain.heightAt(x, z) + 0.02, z);
      matrix.compose(vec, quat, scl);
      mesh.setMatrixAt(i, matrix);
      const tone = rand(); rand(); rand(); rand();
      color.setScalar(0.85 + tone * 0.15);
      mesh.setColorAt(i, color);
      coralPositions[type] = coralPositions[type] || [];
      coralPositions[type].push({ x, z, s });
      i++;
    }
    for (let k = i; k < count; k++) {
      matrix.makeScale(0, 0, 0);
      mesh.setMatrixAt(k, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    coralMeshes[type] = mesh;
  }

  // Mixed-species gardens, grouped around shared reef anchors rather than uniform scatter.
  // Nine families, one instanced draw each: boulders, plates, fans, tubes, softs.
  const FAMILIES = ['staghorn','brain','table','plate','fan','tube','mushroom','boulder','soft'];
  for (const [familyIndex, family] of FAMILIES.entries()) {
    const count = quality === 'low' ? 1 : quality === 'medium' ? 3 : 1;
    const mesh = makeInstanced(coralFamilyGeometry(family), count);
    mesh.name = family;
    for (let i = 0; i < count; i++) {
      const garden = i % 3;
      const cx = [42, -32, 8][garden], cz = [-38, -38, 57][garden];
      const angle = familyIndex * 2.399 + i * .65;
      const radius = 2.5 + (familyIndex % 7) * 1.6 + Math.floor(i / 3) * 3.2;
      const x = cx + Math.cos(angle) * radius, z = cz + Math.sin(angle) * radius;
      const size = .6 + ((familyIndex * 7 + i * 3) % 9) * .1;
      vec.set(x, terrain.heightAt(x, z), z);
      quat.setFromEuler(euler.set(0, angle + familyIndex, 0));
      matrix.compose(vec, quat, scl.setScalar(size));
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // --- Cave arches in the rocky habitat (one merged draw per arch) ---
  const caveSites = [];
  const archMat = propMaterial({ roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.7;
    const cx = -50 + Math.cos(a) * 26;
    const cz = 46 + Math.sin(a) * 26;
    caveSites.push({ x: cx, z: cz });
    const baseY = terrain.heightAt(cx, cz);
    const archParts = [];
    for (let r = 0; r < 7; r++) {
      const t = (r / 6 - 0.5) * Math.PI;
      const x = Math.sin(t) * 5.4;
      const z = 0;
      const y = 1.0 + Math.cos(t) * 7.2;
      const s = 2.3 + rand() * 1.1;
      archParts.push(part(
        new THREE.CylinderGeometry(s * 0.82, s, s * 1.8, 5),
        [0x8d9087, 0x7b8580, 0x96988b][r % 3],
        [x, y, z],
        [(rand() - 0.5) * 0.12, rand() * Math.PI, -t],
        [1, 0.65, 1.3]
      ));
    }
    const archGeo = mergeParts(archParts);
    const arch = new THREE.Mesh(archGeo, archMat);
    arch.name = 'caveArch';
    arch.position.set(cx, baseY - 0.4, cz);
    arch.rotation.y = a;
    group.add(arch);
    meshes.push(arch);
    disposables.push(archGeo);
  }
  disposables.push(archMat);

  // --- Explorable grottos: dome of rock chunks with a walk-in entrance and a
  //     skylight gap, so the dive light matters and exits stay visible. ---
  const grottos = [];
  const grottoSpots = [[-58, 34, 0.9], [-38, 58, 2.4]];
  for (const [gx, gz, entranceAngle] of grottoSpots) {
    const baseY = Math.min(
      terrain.heightAt(gx, gz),
      terrain.heightAt(gx + 5, gz), terrain.heightAt(gx - 5, gz),
      terrain.heightAt(gx, gz + 5), terrain.heightAt(gx, gz - 5)
    ) - 0.5;
    const radius = 7.2, height = 9;
    const parts = [];
    const chunks = 9;
    for (let i = 0; i < chunks; i++) {
      const a = (i / chunks) * Math.PI * 2;
      const gap = Math.abs(THREE.MathUtils.euclideanModulo(a - entranceAngle + Math.PI, Math.PI * 2) - Math.PI);
      if (gap < 0.55) continue; // entrance passage
      const s = 2.1 + rand() * 0.9;
      const bulge = 1 + Math.sin(i * 2.1) * 0.12;
      const h = height * (0.85 + rand() * 0.3);
      parts.push(part(
        new THREE.CylinderGeometry(s * 0.8, s, h, 5),
        [0x8d9087, 0x7b8580, 0x96988b][i % 3],
        [Math.cos(a) * radius * bulge, h * 0.5 - 1.2, Math.sin(a) * radius * bulge],
        [(rand() - 0.5) * 0.1, a, (rand() - 0.5) * 0.1],
        [1, 1, 0.9]
      ));
      // Inner shelf ledge for coral and small life.
      if (i % 3 === 0) {
        parts.push(part(new THREE.CylinderGeometry(s * 0.6, s * 0.5, 0.35, 5), 0x9aa093,
          [Math.cos(a) * (radius - 2.3), 2.3 + rand() * 1.8, Math.sin(a) * (radius - 2.3)], [0, a, 0]));
      }
    }
    // Roof ring with a skylight hole in the middle.
    const roofRing = 7;
    for (let i = 0; i < roofRing; i++) {
      const a = (i / roofRing) * Math.PI * 2 + 0.3;
      const s = 2.4 + rand() * 0.8;
      parts.push(part(new THREE.CylinderGeometry(s * 0.7, s, 3.6, 5),
        [0x828b86, 0x929a8d, 0x747d7a][i % 3],
        [Math.cos(a) * radius * 0.72, height - 1.2, Math.sin(a) * radius * 0.72],
        [0.3 * Math.sign(Math.cos(a)), a, 0.3 * Math.sign(Math.sin(a))], [1, 1, 1.25]));
    }
    const grottoGeo = mergeParts(parts);
    const grotto = new THREE.Mesh(grottoGeo, archMat);
    grotto.name = 'grotto';
    grotto.position.set(gx, baseY, gz);
    group.add(grotto);
    meshes.push(grotto);
    disposables.push(grottoGeo);
    grottos.push({ x: gx, z: gz, y: baseY, radius, height, entranceAngle, glowY: baseY + 2.6 });
  }

  // --- Shipwreck (one merged draw) ---
  const wreckParts = [];
  const hullColor = 0x5d4835;
  const hullColor2 = 0x4a3828;
  const hx = 6, hz = 64;
  const wreckY = terrain.heightAt(hx, hz);
  const hullGeo = new THREE.CylinderGeometry(3.2, 2.2, 17, 7, 1, true, 0, Math.PI);
  wreckParts.push(part(hullGeo, hullColor, [0, 1.6, 0], [0, 0.15, Math.PI / 2], [1, 1, 0.85]));
  for (let i = 0; i < 6; i++) {
    wreckParts.push(part(
      new THREE.BoxGeometry(0.28, 0.3, 5.2),
      i % 2 ? hullColor2 : 0x6a5340,
      [-6 + i * 2.3, 2.0, 0],
      [0, 0.15 + (i - 3) * 0.02, 0.12]
    ));
  }
  wreckParts.push(part(new THREE.CylinderGeometry(0.22, 0.3, 9, 5), 0x5a4a3a, [1.5, 6.2, 0], [0.18, 0, 0.35]));
  wreckParts.push(part(new THREE.BoxGeometry(5.4, 0.22, 0.22), 0x6a5340, [1.4, 8.6, 0], [0, 0, 0.1]));
  wreckParts.push(part(new THREE.BoxGeometry(1.6, 1.4, 1.2), 0x6a5340, [-4.5, 3.2, 0.4], [0, 0.3, -0.2]));
  const wreckGeo = mergeParts(wreckParts);
  const wreckMat = propMaterial({ roughness: 0.95 });
  const wreck = new THREE.Mesh(wreckGeo, wreckMat);
  wreck.name = 'wreck';
  wreck.position.set(hx, wreckY - 0.6, hz);
  wreck.rotation.y = 0.4;
  group.add(wreck);
  meshes.push(wreck);
  disposables.push(wreckGeo, wreckMat);

  // --- Placement queries used by other systems ---
  function coralsOfType(type) { return coralPositions[type] || []; }
  function nearestCoral(position, radius = 12, types = Object.keys(coralPositions)) {
    let best = null, bestD = radius * radius;
    for (const type of types) {
      for (const c of coralPositions[type] || []) {
        const dx = c.x - position.x, dz = c.z - position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD) { bestD = d2; best = { type, ...c }; }
      }
    }
    return best;
  }

  return {
    coralMeshes,
    coralsOfType,
    nearestCoral,
    caveSites,
    grottos,
    wreck: { x: hx, z: hz, y: wreckY },
    update() {},
    dispose() {
      disposables.forEach(d => d.dispose());
    }
  };
}
