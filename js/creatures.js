import * as THREE from 'three';
import { part, mergeParts, propMaterial } from './world/geo.js';

const rand = (a, b) => a + Math.random() * (b - a);

function sphere(color, radius, pos, scale = [1, 1, 1]) {
  return part(new THREE.SphereGeometry(radius, 6, 4), color, pos, [0, 0, 0], scale);
}

function buildTurtle() {
  return mergeParts([
    sphere(0x4a6a3e, 0.9, [0, 0, 0], [1.25, 0.55, 1]),
    sphere(0x6d8a52, 0.34, [1.05, 0.02, 0], [1.1, 0.9, 1]),
    part(new THREE.ConeGeometry(0.12, 0.3, 4), 0x6d8a52, [-1.1, 0.05, 0], [0, 0, Math.PI / 2]),
    ...[-1, 1].flatMap(s => [
      part(new THREE.BoxGeometry(0.8, 0.08, 0.34), 0x5c7a48, [0.35, -0.1, s * 0.85], [0, s * 0.4, 0.15]),
      part(new THREE.BoxGeometry(0.42, 0.07, 0.26), 0x5c7a48, [-0.85, -0.08, s * 0.62], [0, s * 0.5, -0.1])
    ])
  ]);
}

function buildCrab() {
  const parts = [sphere(0xc0503a, 0.4, [0, 0.22, 0], [1.15, 0.6, 1])];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      parts.push(part(new THREE.CylinderGeometry(0.03, 0.02, 0.4, 3), 0x9a3a28,
        [s * 0.32, 0.16, -0.16 + i * 0.16], [0, 0, s * 0.9]));
    }
    parts.push(part(new THREE.CylinderGeometry(0.05, 0.04, 0.34, 4), 0xd06a4a, [s * 0.44, 0.24, 0.28], [0.3, 0, s * 1.1]));
    parts.push(part(new THREE.BoxGeometry(0.16, 0.1, 0.14), 0xe08a6a, [s * 0.6, 0.36, 0.42]));
  }
  return mergeParts(parts);
}

function buildLobster() {
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push(part(new THREE.CylinderGeometry(0.14, 0.11, 0.26, 6), 0xa8402c, [0.12 + i * 0.22, 0.16, 0], [0, 0, Math.PI / 2]));
  parts.push(part(new THREE.ConeGeometry(0.1, 0.5, 5), 0xb05038, [-0.36, 0.16, 0], [0, 0, Math.PI / 2]));
  parts.push(part(new THREE.CylinderGeometry(0.1, 0.06, 0.34, 6), 0xa8402c, [1.1, 0.17, 0], [0, 0, Math.PI / 2]));
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.CylinderGeometry(0.04, 0.02, 0.34, 4), 0xc0604a, [0.32, 0.16, s * 0.16], [s * 0.6, 0, 0.4]));
    parts.push(part(new THREE.CylinderGeometry(0.03, 0.015, 0.6, 4), 0xc86850, [1.35, 0.2, s * 0.1], [0, 0, -0.5]));
  }
  return mergeParts(parts);
}

function buildOctopus() {
  const parts = [sphere(0xb64f7b, 0.42, [0, 0.25, 0], [1, 0.9, 0.8])];
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, bend = 0.4 + (i % 3) * 0.1;
    const x = Math.cos(a), z = Math.sin(a);
    for (let j = 0; j < 3; j++) {
      const r0 = 0.18 + j * 0.24, r1 = r0 + 0.24;
      const p0 = [x * r0, 0.2 - j * 0.07, z * r0];
      const p1 = [x * r1 + Math.sin(a) * bend * (j + 1) * 0.12, 0.16 - j * 0.12, z * r1];
      const delta = new THREE.Vector3(...p1).sub(new THREE.Vector3(...p0));
      const geo = new THREE.CylinderGeometry(0.065 - j * 0.012, 0.085 - j * 0.012, delta.length(), 5);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), delta.clone().normalize()));
      geo.translate(...new THREE.Vector3(...p0).addScaledVector(delta, .5).toArray());
      parts.push(part(geo, j % 2 ? 0xe58bae : 0xc86b91));
      geo.dispose();
      parts.push(part(new THREE.SphereGeometry(.045, 4, 3), 0xf0c3cf, p1, [0, 0, 0], [1, .35, 1]));
    }
  }
  return mergeParts(parts);
}

function buildMoray() {
  const parts = [];
  for (let i = 0; i < 7; i++) parts.push(sphere(i % 2 ? 0x5a7040 : 0x6d854c, 0.2 - i * 0.012,
    [i * 0.3, Math.sin(i * 0.6) * 0.1, 0], [1.2, 1, 1]));
  parts.push(part(new THREE.ConeGeometry(0.1, 0.4, 4), 0x4a6034, [-0.28, 0.12, 0], [0, 0, Math.PI / 2]));
  return mergeParts(parts);
}

function buildStarfish() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    parts.push(part(new THREE.ConeGeometry(0.11, 0.42, 4), 0xe0603a,
      [Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2], [Math.PI / 2, -a, 0]));
  }
  parts.push(sphere(0xf08a5a, 0.14, [0, 0.06, 0], [1, 0.5, 1]));
  return mergeParts(parts);
}

function buildUrchin() {
  const parts = [sphere(0x2a2a3a, 0.2, [0, 0.16, 0])];
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI;
    parts.push(part(new THREE.ConeGeometry(0.022, 0.26, 3), 0x4a2a5a,
      [Math.sin(b) * Math.cos(a) * 0.18, 0.16 + Math.cos(b) * 0.18, Math.sin(b) * Math.sin(a) * 0.18], [b, a, 0]));
  }
  return mergeParts(parts);
}

function buildCucumber() {
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push(sphere(0x7a6a4a, 0.18 - i * 0.015,
    [i * 0.24 - 0.36, 0.14, 0], [1.1, 0.9, 1]));
  return mergeParts(parts);
}

function buildShrimp() {
  const parts = [];
  for (let i = 0; i < 4; i++) parts.push(sphere(0xe8a0a0, 0.07 - i * 0.008, [i * 0.1, 0.08, 0], [1.2, 1, 0.9]));
  parts.push(part(new THREE.ConeGeometry(0.05, 0.16, 3), 0xf0c0b0, [-0.14, 0.08, 0], [0, 0, Math.PI / 2]));
  parts.push(part(new THREE.CylinderGeometry(0.008, 0.004, 0.24, 3), 0xf0d0c0, [0.22, 0.1, 0], [0, 0, -0.4]));
  return mergeParts(parts);
}


function buildStingray() {
  return mergeParts([
    part(new THREE.SphereGeometry(0.8, 8, 3), 0x8e8264, [0, 0, 0], [0, 0, 0], [1.5, 0.16, 1.25]),
    part(new THREE.ConeGeometry(0.1, 2.2, 4), 0x776c52, [-1.7, 0.02, 0], [0, 0, Math.PI / 2], [1, 1, 0.5]),
    part(new THREE.ConeGeometry(0.16, 0.5, 4), 0xb0a687, [0.9, 0.05, 0], [Math.PI / 2, 0, 0])
  ]);
}

function buildShark() {
  return mergeParts([
    part(new THREE.ConeGeometry(0.55, 2.6, 6), 0x6c828c, [0, 0, 0], [0, 0, -Math.PI / 2], [1, 1, 1]),
    part(new THREE.ConeGeometry(0.6, 0.9, 4), 0x5a7079, [-1.35, 0.2, 0], [0, 0, Math.PI / 2], [1, 1, 0.14]),
    part(new THREE.ConeGeometry(0.34, 0.8, 4), 0x5a7079, [0.1, 0.62, 0], [0, 0, 0], [1, 1, 0.18]),
    part(new THREE.ConeGeometry(0.26, 0.55, 4), 0x5a7079, [0.25, -0.05, 0.55], [1.1, 0, 0], [1, 1, 0.16]),
    part(new THREE.ConeGeometry(0.26, 0.55, 4), 0x5a7079, [0.25, -0.05, -0.55], [-1.1, 0, 0], [1, 1, 0.16])
  ]);
}

function buildManta() {
  return mergeParts([
    part(new THREE.SphereGeometry(1, 8, 3), 0x4c6470, [0, 0, 0], [0, 0, 0], [1.4, 0.14, 1.7]),
    part(new THREE.ConeGeometry(0.07, 2.4, 4), 0x3f545e, [-1.6, 0.02, 0], [0, 0, Math.PI / 2]),
    part(new THREE.ConeGeometry(0.14, 0.45, 4), 0x556d79, [0.85, 0.1, 0], [0.4, 0, 0]),
    part(new THREE.ConeGeometry(0.14, 0.45, 4), 0x556d79, [0.85, 0.1, 0], [0.4, 0, 0], [1, 1, -1])
  ]);
}

function buildSnail() {
  const parts = [part(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 7), 0xd8c9a8, [0.1, 0.1, 0], [0, 0, Math.PI / 2])];
  for (let i = 0; i < 4; i++) {
    const r = 0.26 - i * 0.05;
    parts.push(part(new THREE.TorusGeometry(r, 0.06, 4, 8), [0xd8956a, 0xc9835c, 0xe0a878, 0xcf8f66][i],
      [-0.16 + i * 0.05, 0.24 + i * 0.09, 0], [Math.PI / 2, 0, 0.2 * i]));
  }
  parts.push(sphere(0xe8d8b8, 0.09, [0.34, 0.08, 0], [1.2, 0.8, 1]));
  return mergeParts(parts);
}

function buildClam() {
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(part(new THREE.SphereGeometry(0.34, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xd9c4b4,
      [0, 0.02, 0], [s > 0 ? 0.18 : Math.PI - 0.18, 0, 0], [1.15, 0.6, 1]));
  }
  for (let i = 0; i < 5; i++) {
    parts.push(part(new THREE.BoxGeometry(0.5, 0.02, 0.05), 0xbfa596, [0, 0.13, -0.2 + i * 0.1], [0, 0, 0], [1, 1, 1]));
  }
  return mergeParts(parts);
}


export const CREATURE_NAMES = {
  turtle: 'Sea Turtle', crab: 'Reef Crab', lobster: 'Lobster', octopus: 'Octopus',
  moray: 'Moray Eel', starfish: 'Starfish', urchin: 'Sea Urchin',
  cucumber: 'Sea Cucumber', shrimp: 'Cleaner Shrimp', stingray: 'Stingray',
  shark: 'Reef Shark', manta: 'Manta Ray', snail: 'Sea Snail', clam: 'Giant Clam'
};

export function createCreatures({ group, world, player, quality, rand: seededRand }) {
  const terrain = world.terrainHeight, zoneAt = world.zoneAt;
  const scale = quality === 'low' ? 0.28 : quality === 'medium' ? 0.45 : 0.65;
  const disposables = [];
  const entities = [];
  const sharedMat = propMaterial({ roughness: 0.9 });
  disposables.push(sharedMat);
  const geos = {
    turtle: buildTurtle(), crab: buildCrab(), lobster: buildLobster(), octopus: buildOctopus(),
    moray: buildMoray(), starfish: buildStarfish(), urchin: buildUrchin(), cucumber: buildCucumber(), shrimp: buildShrimp(),
    stingray: buildStingray(), shark: buildShark(), manta: buildManta(), snail: buildSnail(), clam: buildClam()
  };
  Object.values(geos).forEach(g => disposables.push(g));

  function scatterStatic(geo, count, accept) {
    const mesh = new THREE.InstancedMesh(geo, sharedMat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 60) {
      const x = (seededRand() - 0.5) * 170, z = (seededRand() - 0.5) * 170;
      if (!accept(zoneAt(x, z).id)) continue;
      e.set((seededRand() - 0.5) * 0.3, seededRand() * Math.PI * 2, (seededRand() - 0.5) * 0.3);
      q.setFromEuler(e); s.setScalar(0.8 + seededRand() * 0.9); v.set(x, terrain(x, z) + 0.05, z);
      m.compose(v, q, s); mesh.setMatrixAt(placed, m);
      c.setHSL(0.06 + seededRand() * 0.1, 0.2 + seededRand() * 0.3, 0.55 + seededRand() * 0.2);
      mesh.setColorAt(placed++, c);
    }
    for (let i = placed; i < count; i++) { m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m); }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
  scatterStatic(geos.starfish, Math.round(10 * scale), z => z === 'shallow' || z === 'seagrass' || z === 'coral');
  scatterStatic(geos.urchin, Math.round(12 * scale), z => z === 'rocky' || z === 'coral');
  scatterStatic(geos.clam, Math.round(14 * scale), z => z === 'shallow' || z === 'coral' || z === 'seagrass');

  function addEntity(kind, geo, opts, zones, hover, initialScale = 1) {
    const mesh = new THREE.Mesh(geo, sharedMat);
    for (let i = 0; i < 60; i++) {
      const x = (seededRand() - 0.5) * 165, z = (seededRand() - 0.5) * 165;
      if (!zones.includes(zoneAt(x, z).id)) continue;
      mesh.position.set(x, terrain(x, z) + hover, z);
      break;
    }
    mesh.scale.setScalar(initialScale);
    group.add(mesh);
    entities.push({ mesh, kind, ...opts, name: CREATURE_NAMES[kind] || kind, zones, state: 'WANDER', target: new THREE.Vector3(), phase: seededRand() * Math.PI * 2, turn: 1 + seededRand() * 3 });
  }

  for (let i = 0; i < Math.max(1, Math.round(2 * scale)); i++) addEntity('turtle', geos.turtle, { speed: 1.1 }, ['rocky', 'open', 'wreck'], 6, 1.4);
  for (let i = 0; i < Math.max(2, Math.round(7 * scale)); i++) addEntity('crab', geos.crab, { speed: 0.7 }, ['shallow', 'seagrass', 'rocky'], 0, 1.1);
  for (let i = 0; i < Math.max(1, Math.round(3 * scale)); i++) addEntity('lobster', geos.lobster, { speed: 0.45 }, ['rocky', 'coral'], 0, 1.2);
  for (let i = 0; i < Math.max(1, Math.round(2 * scale)); i++) addEntity('octopus', geos.octopus, { speed: 0.35 }, ['rocky', 'coral'], 0.2, 1.1);
  for (let i = 0; i < Math.max(1, Math.round(4 * scale)); i++) addEntity('moray', geos.moray, { speed: 0.2 }, ['coral', 'wreck', 'rocky'], 1.1, 1.2);
  for (let i = 0; i < Math.max(1, Math.round(4 * scale)); i++) addEntity('cucumber', geos.cucumber, { speed: 0.16 }, ['shallow', 'seagrass', 'open'], 0.05, 1);
  for (let i = 0; i < Math.max(2, Math.round(9 * scale)); i++) addEntity('shrimp', geos.shrimp, { speed: 1.4 }, ['coral', 'wreck', 'rocky'], 0.8, 1.6);
  for (let i = 0; i < Math.max(1, Math.round(4 * scale)); i++) addEntity('stingray', geos.stingray, { speed: 1.5, glide: true }, ['shallow', 'seagrass', 'open'], 2.2, 1.5);
  for (let i = 0; i < Math.max(1, Math.round(2 * scale)); i++) addEntity('shark', geos.shark, { speed: 2.4, glide: true }, ['deep', 'open', 'wreck'], 7, 1.7);
  for (let i = 0; i < Math.max(1, Math.round(2 * scale)); i++) addEntity('manta', geos.manta, { speed: 1.9, glide: true }, ['deep', 'open'], 9, 2.6);
  for (let i = 0; i < Math.max(2, Math.round(7 * scale)); i++) addEntity('snail', geos.snail, { speed: 0.12 }, ['rocky', 'coral', 'shallow'], 0.02, 1.1);

  const tmp = new THREE.Vector3();
  function update(dt, t) {
    const pp = player.camera.position;
    for (const e of entities) {
      const p = e.mesh.position;
      if (p.distanceTo(pp) > 70) continue;
      const floor = terrain(p.x, p.z);
      e.turn -= dt;
      switch (e.kind) {
        case 'stingray':
        case 'shark':
        case 'manta':
        case 'turtle':
          if (e.turn <= 0 || p.distanceTo(e.target) < 2) {
            e.target.set(rand(-70, 70), rand(6, 26), rand(-70, 70)); e.turn = rand(4, 9);
          }
          tmp.copy(e.target).sub(p);
          if (tmp.lengthSq() > 0.01) {
            tmp.normalize(); p.addScaledVector(tmp, e.speed * dt);
            const yaw = Math.atan2(-tmp.z, tmp.x);
            e.mesh.rotation.y += THREE.MathUtils.euclideanModulo(yaw - e.mesh.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
          }
          const lift = e.kind === 'manta' ? 4 : e.kind === 'shark' ? 5 : 2;
          p.y = THREE.MathUtils.clamp(p.y + Math.sin(t * 1.6 + e.phase) * dt * 0.2, floor + lift, 30);
          e.mesh.rotation.z = Math.sin(t * (e.kind === 'manta' ? 0.9 : 1.2) + e.phase) * 0.12;
          if (e.kind === 'manta' || e.kind === 'stingray') {
            e.baseScale ??= e.mesh.scale.x;
            e.mesh.scale.y = e.baseScale * (0.85 + Math.sin(t * 1.6 + e.phase) * 0.15);
          }
          break;
        case 'snail':
          if (e.turn <= 0) { e.target.set(p.x + rand(-2, 2), 0, p.z + rand(-2, 2)); e.turn = rand(6, 12); }
          tmp.copy(e.target).sub(p); tmp.y = 0;
          if (tmp.lengthSq() > 0.02) {
            tmp.normalize(); p.addScaledVector(tmp, e.speed * dt);
            e.mesh.rotation.y = Math.atan2(-tmp.z, tmp.x);
          }
          p.y = floor + 0.16;
          break;
        case 'crab':
        case 'lobster':
          if (p.distanceTo(pp) < 9) e.state = 'FLEEING'; else if (e.turn <= 0) e.state = 'WANDER';
          if (e.turn <= 0) { e.target.set(p.x + rand(-8, 8), p.y, p.z + rand(-8, 8)); e.turn = rand(2, 5); }
          if (e.state === 'FLEEING') e.target.copy(p).sub(pp).normalize().multiplyScalar(8).add(p);
          tmp.copy(e.target).sub(p); tmp.y = 0;
          if (tmp.lengthSq() > 0.05) {
            tmp.normalize(); p.addScaledVector(tmp, e.speed * (e.state === 'FLEEING' ? 3.2 : 1) * dt);
            e.mesh.rotation.y = Math.atan2(-tmp.z, tmp.x);
          }
          p.y = floor + 0.05;
          p.x = THREE.MathUtils.clamp(p.x, -86, 86); p.z = THREE.MathUtils.clamp(p.z, -86, 86);
          e.mesh.rotation.z = Math.sin(t * 6 + e.phase) * 0.06;
          break;
        case 'cucumber':
          if (e.turn <= 0) { e.target.set(p.x + rand(-3, 3), 0, p.z + rand(-3, 3)); e.turn = rand(4, 8); }
          tmp.copy(e.target).sub(p); tmp.y = 0;
          if (tmp.lengthSq() > 0.02) p.addScaledVector(tmp.normalize(), e.speed * dt);
          p.y = floor + 0.12 + Math.sin(t * 1.4 + e.phase) * 0.02;
          break;
        case 'octopus': {
          // Den hides from divers: tucks down and shrinks into the rocks.
          e.hide = THREE.MathUtils.lerp(e.hide || 0, p.distanceTo(pp) < 9 ? 1 : 0, Math.min(1, dt * 2));
          if (e.baseScale === undefined) e.baseScale = e.mesh.scale.x;
          e.mesh.scale.setScalar(e.baseScale * (1 - e.hide * 0.45));
          p.y = floor + 0.25 - e.hide * 0.2 + Math.sin(t * 1.1 + e.phase) * 0.08;
          e.mesh.rotation.y += dt * 0.12 * Math.sin(t * 0.6 + e.phase);
          break;
        }
        case 'moray': {
          e.hide = THREE.MathUtils.lerp(e.hide || 0, p.distanceTo(pp) < 7 ? 1 : 0, Math.min(1, dt * 2.5));
          if (e.baseScale === undefined) e.baseScale = e.mesh.scale.x;
          e.mesh.scale.setScalar(e.baseScale * (1 - e.hide * 0.55));
          e.mesh.rotation.y = Math.sin(t * 0.7 + e.phase) * 0.4;
          e.mesh.rotation.z = Math.sin(t * 1.3 + e.phase) * 0.08;
          break;
        }
        case 'shrimp':
          if (p.distanceTo(pp) < 12) e.state = 'FLEEING'; else if (e.turn <= 0) e.state = 'HOVER';
          if (e.turn <= 0) { e.target.set(p.x + rand(-2.5, 2.5), p.y + rand(-1, 1.5), p.z + rand(-2.5, 2.5)); e.turn = rand(1, 3); }
          tmp.copy(e.target).sub(p);
          if (tmp.lengthSq() > 0.02) p.addScaledVector(tmp.normalize(), e.speed * (e.state === 'FLEEING' ? 2.4 : 0.35) * dt);
          p.y = THREE.MathUtils.clamp(p.y, floor + 0.3, floor + 4);
          break;
      }
    }
  }

  function photoSubjects() {
    return entities.map(e => ({ name: e.name, position: e.mesh.position, radius: 1.5 }));
  }

  return {
    entities,
    photoSubjects,
    update,
    dispose() { disposables.forEach(d => d.dispose()); }
  };
}
