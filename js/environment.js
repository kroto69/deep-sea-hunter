import * as THREE from 'three';
import { createTerrain, HABITATS } from './world/terrain.js';
import { createReef } from './world/reef.js';
import { createVegetation } from './world/vegetation.js';
import { createDebris } from './world/debris.js';
import { mulberry32 } from './world/noise.js';

export const SEA_LEVEL = 36;

export function createEnvironment(scene, { quality = 'high' } = {}) {
  const rand = mulberry32(4242);
  const group = new THREE.Group();
  scene.add(group);

  // Shared uniform for every swaying shader in the world (one value, all plants).
  const timeUniform = { value: 0 };
  const disposables = [];
  const current = new THREE.Vector2(0.55, 0.26);

  const terrain = createTerrain(quality);
  group.add(terrain.mesh);

  const reef = createReef({ terrain, group, quality, rand });
  const vegetation = createVegetation({ terrain, group, quality, rand, timeUniform });
  const debris = createDebris({ terrain, group, quality, rand, timeUniform });

  // --- Atmosphere: bubbles, suspended particles, organic motes, light rays ---
  const bubbleCount = quality === 'low' ? 60 : quality === 'medium' ? 110 : 160;
  const bGeo = new THREE.BufferGeometry();
  const bPos = new Float32Array(bubbleCount * 3);
  const bubbleData = [];
  for (let i = 0; i < bubbleCount; i++) {
    bubbleData.push({
      x: (rand() - 0.5) * 170,
      z: (rand() - 0.5) * 170,
      y: rand() * SEA_LEVEL,
      speed: 0.5 + rand() * 1.2,
      wobble: rand() * Math.PI * 2
    });
  }
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  const bMat = new THREE.PointsMaterial({
    color: 0xbfe8ff, size: 0.35, transparent: true, opacity: 0.6, depthWrite: false
  });
  const bubbles = new THREE.Points(bGeo, bMat);
  group.add(bubbles);
  disposables.push(bGeo, bMat);

  const moteCount = quality === 'low' ? 140 : quality === 'medium' ? 240 : 380;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    pPos[i * 3] = (rand() - 0.5) * 180;
    pPos[i * 3 + 1] = rand() * SEA_LEVEL;
    pPos[i * 3 + 2] = (rand() - 0.5) * 180;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xdff4ff, size: 0.08, transparent: true, opacity: 0.45, depthWrite: false
  });
  const particles = new THREE.Points(pGeo, pMat);
  group.add(particles);
  disposables.push(pGeo, pMat);

  // Organic motes: larger, slower, warmer — reads as plankton
  const organicCount = quality === 'low' ? 65 : 120;
  const oGeo = new THREE.BufferGeometry();
  const oPos = new Float32Array(organicCount * 3);
  for (let i = 0; i < organicCount; i++) {
    oPos[i * 3] = (rand() - 0.5) * 160;
    oPos[i * 3 + 1] = 2 + rand() * 30;
    oPos[i * 3 + 2] = (rand() - 0.5) * 160;
  }
  oGeo.setAttribute('position', new THREE.BufferAttribute(oPos, 3));
  const oMat = new THREE.PointsMaterial({
    color: 0xfff0c0, size: 0.18, transparent: true, opacity: 0.3, depthWrite: false
  });
  const organic = new THREE.Points(oGeo, oMat);
  group.add(organic);
  disposables.push(oGeo, oMat);

  // Bioluminescent motes inside the grottos: no lights, just additive points.
  const glowData = [];
  const grottos = reef.grottos || [];
  for (const g of grottos) {
    for (let i = 0; i < (quality === 'low' ? 18 : 32); i++) {
      const a = rand() * Math.PI * 2, d = 1.5 + rand() * (g.radius - 3.2);
      glowData.push({ x: g.x + Math.cos(a) * d, y: g.y + 1.2 + rand() * 4.5, z: g.z + Math.sin(a) * d, phase: rand() * 6.28 });
    }
  }
  let glow = null;
  if (glowData.length) {
    const gGeo = new THREE.BufferGeometry();
    gGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(glowData.length * 3), 3));
    const gMat = new THREE.PointsMaterial({
      color: 0x5fffe0, size: 0.6, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    glow = new THREE.Points(gGeo, gMat);
    group.add(glow);
    disposables.push(gGeo, gMat);
  }

  const rayMat = new THREE.MeshBasicMaterial({
    color: 0xbff0ff, transparent: true, opacity: 0.1,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const rays = new THREE.Group();
  const rayCount = quality === 'low' ? 3 : quality === 'medium' ? 5 : 8;
  for (let i = 0; i < rayCount; i++) {
    const rGeo = new THREE.PlaneGeometry(2 + rand() * 3, 40);
    const ray = new THREE.Mesh(rGeo, rayMat);
    ray.position.set((rand() - 0.5) * 120, 16, (rand() - 0.5) * 120);
    ray.rotation.z = 0.3 + rand() * 0.2;
    ray.rotation.y = rand() * Math.PI;
    rays.add(ray);
    disposables.push(rGeo);
  }
  group.add(rays);
  disposables.push(rayMat);

  function updateBubbles(dt) {
    const p = bGeo.attributes.position;
    for (let i = 0; i < bubbleCount; i++) {
      const b = bubbleData[i];
      b.y += b.speed * dt;
      b.x += current.x * dt * 0.5;
      b.z += current.y * dt * 0.5;
      if (b.y > SEA_LEVEL - 1) {
        b.y = 1;
        b.x = (rand() - 0.5) * 170;
        b.z = (rand() - 0.5) * 170;
      }
      p.setXYZ(i, b.x + Math.sin(b.y * 0.5 + b.wobble) * 0.5, b.y, b.z);
    }
    p.needsUpdate = true;
  }

  function update(dt, t) {
    timeUniform.value = t;
    if (glow) {
      const p = glow.geometry.attributes.position;
      for (let i = 0; i < glowData.length; i++) {
        const g = glowData[i];
        p.setXYZ(i, g.x + Math.sin(t * 0.5 + g.phase) * 0.6, g.y + Math.sin(t * 0.8 + g.phase) * 0.4, g.z + Math.cos(t * 0.45 + g.phase) * 0.6);
      }
      p.needsUpdate = true;
    }
    terrain.update(t);
    reef.update?.(dt, t);
    vegetation.update?.(dt, t);
    debris.update?.(dt, t, current);
    particles.position.x = Math.sin(t * 0.05) * 2;
    particles.position.z = Math.cos(t * 0.04) * 2;
    updateBubbles(dt);
    particles.rotation.y = t * 0.01;
    organic.rotation.y = -t * 0.006;
    for (let i = 0; i < rays.children.length; i++) {
      rays.children[i].material.opacity = 0.07 + Math.abs(Math.sin(t * 0.3 + i)) * 0.08;
    }
  }

  function dispose() {
    reef.dispose?.();
    vegetation.dispose?.();
    debris.dispose?.();
    terrain.dispose();
    disposables.forEach(d => d.dispose());
    scene.remove(group);
  }

  return {
    rand,
    reef,
    vegetation,
    debris,
    terrainHeight: terrain.heightAt,
    zoneAt: terrain.zoneAt,
    habitats: HABITATS,
    seaLevel: SEA_LEVEL,
    current,
    setCurrent(v) {
      current.copy(v);
    },
    update,
    dispose,
    group
  };
}
