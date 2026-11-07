import * as THREE from 'three';
import { part, mergeParts } from './geo.js';

// Vertex sway shared by every plant. One uniform value drives the whole ocean.
function swayMaterial(timeUniform, strength) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = `uniform float uTime;\n` + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
       float phase = uTime * (0.65 + 0.15 * sin(iPos.x)) + iPos.x * 0.14 + iPos.z * 0.11;
       float current = 0.55 + 0.45 * sin(uTime * 0.35 + iPos.z * 0.02);
       float bend = pow(max(transformed.y, 0.0), 1.1) * ${strength.toFixed(3)} * current;
       transformed.x += sin(phase) * bend;
       transformed.z += cos(phase * 0.85) * bend * 0.6;`
    );
  };
  return mat;
}

function bladeCluster(rand, { blades, height, width, colors, spread = 0.28 }) {
  const parts = [];
  for (let i = 0; i < blades; i++) {
    const h = height * (0.65 + rand() * 0.7);
    const geo = new THREE.PlaneGeometry(width * 2, h, 1, 3);
    const p = geo.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const t = (p.getY(v) + h / 2) / h;
      p.setX(v, p.getX(v) * (1 - t * .92) + Math.sin(t * 2.4 + i) * width * t * 2);
      p.setZ(v, Math.sin(t * 3 + i) * width * t);
    }
    geo.computeVertexNormals();
    parts.push(part(
      geo,
      colors[i % colors.length],
      [(rand() - 0.5) * spread, h * 0.5, (rand() - 0.5) * spread],
      [(rand() - 0.5) * 0.24, rand() * Math.PI, (rand() - 0.5) * 0.24]
    ));
  }
  return mergeParts(parts);
}

function kelpCluster(rand) {
  const parts = [];
  const strands = 2;
  for (let i = 0; i < strands; i++) {
    const h = 3.2 + rand() * 3.4;
    const x = (rand() - 0.5) * 0.6;
    const z = (rand() - 0.5) * 0.6;
    parts.push(part(new THREE.ConeGeometry(0.1, h, 4, 2), 0x8fbf3a, [x, h * 0.5, z], [0, rand(), 0]));
    const fronds = 3;
    for (let f = 0; f < fronds; f++) {
      const fy = h * (0.35 + f / fronds * 0.6);
      const g = new THREE.SphereGeometry(.55, 4, 2);
      g.scale(1, .08, .38);
      parts.push(part(g, [0xb8d43a, 0x96c22e][f % 2],
        [x + 0.35, fy, z], [0.2 * (rand() - 0.5), rand() * Math.PI, 0.35]));
    }
  }
  return mergeParts(parts);
}

function algaeClump(rand) {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    parts.push(part(
      new THREE.IcosahedronGeometry(0.3 + rand() * 0.3, 0),
      [0x3ad46a, 0x5be07e, 0x22b855][i % 3],
      [(rand() - 0.5) * 0.7, 0.12 + rand() * 0.2, (rand() - 0.5) * 0.7],
      [rand(), rand(), rand()],
      [1, 0.45, 1]
    ));
  }
  return mergeParts(parts);
}

function anemoneClump(rand) {
  const parts = [];
  const base = 0.22 + rand() * 0.12;
  parts.push(part(new THREE.CylinderGeometry(base * 1.2, base * 1.6, 0.3, 6), 0xff6fae, [0, 0.15, 0]));
  const tips = [0xff8fc4, 0xff5fa2, 0xffb8dc];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
    const r = base * (0.4 + rand() * 0.9);
    const h = 0.35 + rand() * 0.45;
    parts.push(part(new THREE.ConeGeometry(0.045, h, 4), tips[i % 3],
      [Math.cos(a) * r, 0.3 + h * 0.5, Math.sin(a) * r],
      [Math.sin(a) * 0.45, a, Math.cos(a) * 0.45]));
  }
  return mergeParts(parts);
}

function rubbleClump(rand) {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    parts.push(part(
      new THREE.DodecahedronGeometry(0.2 + rand() * 0.22, 0),
      [0xffdca8, 0xf5c88f, 0xfff0cf][i % 3],
      [(rand() - 0.5) * 0.7, 0.06 + rand() * 0.1, (rand() - 0.5) * 0.7],
      [rand(), rand(), rand()],
      [1, 0.6, 1]
    ));
  }
  return mergeParts(parts);
}

export function createVegetation({ terrain, group, quality, rand, timeUniform }) {
  const disposables = [];
  const scale = quality === 'low' ? 0.16 : quality === 'medium' ? 0.36 : 0.7;

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const vec = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const color = new THREE.Color();

  function plant({ geo, count, strength, accept, sMin = 0.7, sMax = 1.4, hue = [0.25, 0.45] }) {
    const mat = swayMaterial(timeUniform, strength);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    group.add(mesh);
    disposables.push(geo, mat);

    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 40) {
      const x = (rand() - 0.5) * 178;
      const z = (rand() - 0.5) * 178;
      const zone = terrain.zoneAt(x, z);
      if (rand() > accept(zone.id)) continue;
      const s = sMin + rand() * (sMax - sMin);
      euler.set(0, rand() * Math.PI * 2, 0);
      quat.setFromEuler(euler);
      scl.set(s, s, s);
      vec.set(x, terrain.heightAt(x, z) + 0.02, z);
      matrix.compose(vec, quat, scl);
      mesh.setMatrixAt(placed, matrix);
      const tone = rand(); rand(); rand();
      color.setScalar(.82 + tone * .18);
      mesh.setColorAt(placed, color);
      placed++;
    }
    for (let i = placed; i < count; i++) {
      matrix.makeScale(0, 0, 0);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  // Seaweed: coral gardens and rocky reef
  plant({
    geo: bladeCluster(rand, { blades: 3, height: 2.4, width: 0.16, colors: [0x1fc27f, 0x35d98f, 0x14a86c] }),
    count: Math.round(220 * scale),
    strength: 0.28,
    accept: (z) => (z === 'coral' ? 0.75 : z === 'rocky' ? 0.6 : z === 'wreck' ? 0.35 : 0.08),
    sMin: 0.7, sMax: 1.5, hue: [0.28, 0.42]
  });

  // Seagrass meadow: dense short blades
  plant({
    geo: bladeCluster(rand, { blades: 6, height: 0.8, width: 0.06, colors: [0xa8e04a, 0xbdf058, 0x8ccf40], spread: 0.55 }),
    count: Math.round(480 * scale),
    strength: 0.16,
    accept: (z) => (z === 'seagrass' ? 0.92 : z === 'shallow' ? 0.2 : 0.05),
    sMin: 0.8, sMax: 1.6, hue: [0.18, 0.26]
  });

  // Kelp: taller, deeper water and around the wreck
  plant({
    geo: kelpCluster(rand),
    count: Math.round(110 * scale),
    strength: 0.42,
    accept: (z) => (z === 'kelp' ? 0.95 : z === 'rocky' ? 0.5 : z === 'wreck' ? 0.7 : z === 'deep' ? 0.3 : z === 'open' ? 0.18 : 0.12),
    sMin: 0.7, sMax: 1.2, hue: [0.2, 0.28]
  });

  // Ribbon and curled broadleaf groves share existing placement/animation path.
  for (const [i, colors] of [[0,[0x32e0b8,0x62f5cc]], [1,[0xffd166,0xc8e86a]], [2,[0xb98bff,0xe0a6ff]]]) {
    plant({
      geo: bladeCluster(rand, {blades: 5, height: 1.4+i*.8, width: .18+i*.07, colors, spread: .6}),
      count: Math.round(150*scale), strength: .12,
      accept: z => z === 'seagrass' || z === 'rocky' || z === 'kelp' ? .8 : .15,
      sMin: .7, sMax: 1.4
    });
  }

  // Anemones: bright soft accents tucked into reef rock and coral gardens.
  plant({
    geo: anemoneClump(rand),
    count: Math.round(85 * scale),
    strength: 0.06,
    accept: (z) => (z === 'coral' ? 0.7 : z === 'rocky' ? 0.55 : z === 'wreck' ? 0.4 : 0.12),
    sMin: 0.7, sMax: 1.5
  });

  // Coral rubble and shell grit where the reef breaks down into sand.
  plant({
    geo: rubbleClump(rand),
    count: Math.round(180 * scale),
    strength: 0,
    accept: (z) => (z === 'shallow' ? 0.8 : z === 'coral' ? 0.55 : z === 'seagrass' ? 0.35 : 0.18),
    sMin: 0.6, sMax: 1.5
  });

  // Algae clumps on rock and sand
  plant({
    geo: algaeClump(rand),
    count: Math.round(135 * scale),
    strength: 0.05,
    accept: (z) => (z === 'rocky' ? 0.6 : z === 'deep' ? 0.35 : z === 'shallow' ? 0.35 : z === 'coral' ? 0.3 : 0.15),
    sMin: 0.6, sMax: 1.5, hue: [0.22, 0.36]
  });

  return {
    update() {},
    dispose() { disposables.forEach(d => d.dispose()); }
  };
}
