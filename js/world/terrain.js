import * as THREE from 'three';
import { makeNoise2D, mulberry32 } from './noise.js';
import { PALETTE } from './environment-art.js';

// Six habitat anchors. Heights are world Y (sea surface sits at Y=36).
export const HABITATS = [
  { id: 'shallow', name: 'Shallow Sandy Reef', x: -45, z: -45, r: 58, floor: 23, spread: 1.2 },
  { id: 'coral', name: 'Dense Coral Garden', x: 48, z: -42, r: 52, floor: 15, spread: 1.0 },
  { id: 'seagrass', name: 'Seagrass Meadow', x: 42, z: 48, r: 52, floor: 19, spread: 1.1 },
  { id: 'rocky', name: 'Rocky Caves', x: -50, z: 46, r: 54, floor: 9, spread: 1.4 },
  { id: 'wreck', name: 'Shipwreck', x: 6, z: 64, r: 36, floor: 13, spread: 0.8 },
  { id: 'kelp', name: 'Kelp Forest', x: 68, z: -68, r: 35, floor: 11, spread: 1.1 },
  { id: 'deep', name: 'Deep Ocean', x: 68, z: 68, r: 34, floor: 3, spread: 0.65 }
];
const OPEN_FLOOR = 2.5;
export const WORLD_SIZE = 200;

export function createTerrain(quality = 'high') {
  const rand = mulberry32(20260214);
  const { noise, fbm } = makeNoise2D(7331);

  // Deterministic depressions / craters
  const craters = [];
  for (let i = 0; i < 7; i++) {
    craters.push({
      x: (rand() - 0.5) * 170,
      z: (rand() - 0.5) * 170,
      r: 6 + rand() * 9,
      d: 1.6 + rand() * 2.6
    });
  }

  // Inverse-distance weights with a sharp falloff, plus an 'open water' term that
  // takes over once the nearest habitat anchor is far away. Keeps habitats readable
  // (shallow really is shallow) while blending naturally at the seams.
  const OPEN = { id: 'open', name: 'Open Water', floor: OPEN_FLOOR, spread: 0.6 };
  function zoneWeights(x, z) {
    const out = [];
    let total = 0;
    let minD = Infinity;
    for (const h of HABITATS) {
      const d = Math.hypot(x - h.x, z - h.z) / h.r;
      if (d < minD) minD = d;
      const w = 1 / (d * d * d * d + 1e-4);
      out.push({ h, w });
      total += w;
    }
    const openD = Math.max(0, minD * minD * minD * minD - 0.5);
    const openW = openD * 2.6 + 0.02;
    out.push({ h: OPEN, w: openW });
    total += openW;
    for (const o of out) o.w /= total;
    return out;
  }

  function baseHeight(x, z) {
    let h = 0;
    for (const { h: hab, w } of zoneWeights(x, z)) h += hab.floor * w;
    return h;
  }

  function heightAt(x, z) {
    const weights = zoneWeights(x, z);
    let spread = 0;
    for (const { h: hab, w } of weights) spread += (hab.spread ?? 1) * w;

    let h = baseHeight(x, z);
    h += (fbm(x * 0.018 + 11.3, z * 0.018 - 4.1, 4) - 0.5) * 9 * spread;
    h += (fbm(x * 0.075, z * 0.075, 3) - 0.5) * 1.5;
    h += Math.sin(x * 0.55 + z * 0.22) * 0.09;   // sand ripples
    h += Math.cos(z * 0.42 - x * 0.18) * 0.07;

    for (const c of craters) {
      const dx = x - c.x, dz = z - c.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < c.r) {
        const t = 1 - d / c.r;
        h -= c.d * t * t * (3 - 2 * t);
      }
    }

    // Rock walls close the world off past the playable radius
    const d = Math.sqrt(x * x + z * z);
    if (d > 88) h += (d - 88) * 0.55;

    return h;
  }

  function zoneAt(x, z) {
    let best = null, bestW = -1;
    for (const { h, w } of zoneWeights(x, z)) {
      if (w > bestW) { bestW = w; best = h; }
    }
    return best;
  }

  // --- Mesh ---
  const seg = quality === 'low' ? 40 : quality === 'medium' ? 52 : 64;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(PALETTE.sand);
  const deepSand = new THREE.Color(PALETTE.deepSand);
  const rockTint = new THREE.Color(PALETTE.stone);
  const grassTint = new THREE.Color(PALETTE.grass);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);

    // slope estimate for rocky patches
    const sx = heightAt(x + 1.5, z) - heightAt(x - 1.5, z);
    const sz = heightAt(x, z + 1.5) - heightAt(x, z - 1.5);
    const slope = Math.min(1, Math.hypot(sx, sz) / 3.2);
    const depthT = THREE.MathUtils.clamp((22 - y) / 20, 0, 1);
    const zone = zoneAt(x, z);

    c.copy(sand).lerp(deepSand, depthT * 0.8);
    if (zone.id === 'seagrass') c.lerp(grassTint, 0.28);
    if (zone.id === 'deep') c.lerp(new THREE.Color(0x617982), 0.42);
    if (zone.id === 'kelp') c.lerp(new THREE.Color(0x819071), 0.22);
    if (zone.id === 'rocky') c.lerp(rockTint, 0.3 + slope * 0.5);
    else c.lerp(rockTint, slope * 0.65);

    // Broad mineral bands read at phone scale, without adding mesh detail.
    const grain = (noise(x * 0.12, z * 0.12) - 0.5) * 0.035;
    colors[i * 3] = THREE.MathUtils.clamp(c.r + grain, 0, 1);
    colors[i * 3 + 1] = THREE.MathUtils.clamp(c.g + grain, 0, 1);
    colors[i * 3 + 2] = THREE.MathUtils.clamp(c.b + grain, 0, 1);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, flatShading: true
  });

  // Animated caustic bands, injected into the sand shader: no extra draw calls.
  const timeUniform = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = 'varying vec3 vCausticPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n vCausticPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
    );
    shader.fragmentShader = 'uniform float uTime;\nvarying vec3 vCausticPos;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float ca = sin(vCausticPos.x * 0.55 + uTime * 0.9) * sin(vCausticPos.z * 0.48 - uTime * 0.7);
       ca += sin((vCausticPos.x + vCausticPos.z) * 0.33 + uTime * 1.3) * 0.6;
       float ripple = sin(vCausticPos.x * 2.8 + vCausticPos.z * 1.1 + sin(vCausticPos.z * 0.3));
       diffuseColor.rgb *= 1.0 + ripple * 0.025;
       float caustic = smoothstep(0.35, 1.25, ca) * 0.14;
       diffuseColor.rgb += caustic * vec3(0.45, 0.72, 0.9);`
    );
  };

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = false;

  return {
    mesh,
    heightAt,
    zoneAt,
    zoneWeights,
    craters,
    habitats: HABITATS,
    update(t) { timeUniform.value = t; },
    dispose() { geo.dispose(); material.dispose(); }
  };
}
