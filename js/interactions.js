import * as THREE from 'three';
import { part, mergeParts } from './world/geo.js';

const rand = (a, b) => a + Math.random() * (b - a);

function chestGeometry() {
  return mergeParts([
    part(new THREE.BoxGeometry(1.2, 0.7, 0.8), 0x725032, [0, 0.35, 0]),
    part(new THREE.BoxGeometry(1.3, 0.12, 0.9), 0x946c3e, [0, 0.77, 0]),
    part(new THREE.BoxGeometry(0.18, 0.75, 0.85), 0xb39a60, [-0.42, 0.38, 0]),
    part(new THREE.BoxGeometry(0.18, 0.75, 0.85), 0xb39a60, [0.42, 0.38, 0]),
    part(new THREE.BoxGeometry(0.24, 0.2, 0.1), 0xd3b86a, [0, 0.5, 0.45])
  ]);
}

function trappedFishGeometry() {
  return mergeParts([
    part(new THREE.SphereGeometry(0.6, 7, 4), 0xe1bc45, [0, 0.7, 0], [0, 0, 0], [1.3, 0.7, 0.6]),
    part(new THREE.ConeGeometry(0.3, 0.6, 4), 0xf3d657, [-0.8, 0.7, 0], [0, 0, -Math.PI / 2])
  ]);
}

export class Interactions {
  constructor({ scene, camera, environment, ecosystem, progression, hud, audio }) {
    Object.assign(this, { scene, camera, environment, ecosystem, progression, hud, audio });
    this.items = [];
    this.flashTimer = 0;
    this.sonarTimer = 0;
    this.sonarCooldown = 0;
    this.photoCooldown = 0;
    this.t = 0;
    this.flashlightOn = false;
    this._buildItems();
    for (const [index, item] of this.items.entries()) {
      item.id = `item${index}`;
      if (progression.data.loot.includes(item.id)) {
        item.collected = true;
        item.mesh.visible = false;
        item.freeT = 4;
      }
    }

    this.light = new THREE.SpotLight(0xd4f1ff, 0, 28, Math.PI / 7, 0.5, 1.2);
    this.light.position.set(0.22, -0.1, -0.4);
    this.light.target.position.set(0, 0, -20);
    camera.add(this.light);
    camera.add(this.light.target);

    this.sonar = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0x65ffd2, side: THREE.DoubleSide, transparent: true, opacity: 0.65, depthWrite: false })
    );
    this.sonar.rotation.x = -Math.PI / 2;
    this.sonar.visible = false;
    scene.add(this.sonar);
  }

  _buildItems() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    this.sharedMat = mat;
    this.geometries = [];
    const chestGeo = chestGeometry();
    this.geometries.push(chestGeo);
    const chests = [[8, 64], [-52, 48], [50, -38]];
    chests.forEach(([x, z], i) => {
      const mesh = new THREE.Mesh(chestGeo, mat);
      mesh.position.set(x, this.environment.terrainHeight(x, z) + 0.1, z);
      mesh.rotation.y = i * 1.2;
      this.scene.add(mesh);
      this.items.push({ type: 'treasure', name: 'Treasure Chest', mesh, value: 60 + i * 30, collected: false });
    });

    const fishGeo = trappedFishGeometry();
    this.geometries.push(fishGeo);
    [[12, 59], [40, 44]].forEach(([x, z]) => {
      const group = new THREE.Group();
      const fish = new THREE.Mesh(fishGeo, mat);
      const net = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 8, 5),
        new THREE.MeshBasicMaterial({ color: 0x6c8b7e, wireframe: true, transparent: true, opacity: 0.75 })
      );
      net.scale.set(1.4, 0.8, 1.1);
      net.position.y = 0.7;
      group.add(fish, net);
      group.position.set(x, this.environment.terrainHeight(x, z) + 0.1, z);
      this.scene.add(group);
      this.items.push({ type: 'net', name: 'Trapped Reef Fish', mesh: group, fish, net, collected: false });
    });

    const specimenGeo = new THREE.IcosahedronGeometry(0.35, 0);
    this.geometries.push(specimenGeo);
    const specMat = new THREE.MeshStandardMaterial({ color: 0x73e4df, emissive: 0x2e928c, emissiveIntensity: 0.7, flatShading: true });
    this.specMat = specMat;
    const spots = [[-48, 44], [52, -48], [4, 68], [38, 52]];
    const names = ['Pearl Nautilus', 'Azure Coral Seed', 'Wreck Pearl', 'Golden Urchin'];
    // Two cave-only specimens: rewards for exploring the grottos with a dive light.
    for (const [i, g] of (this.environment.reef?.grottos || []).entries()) {
      spots.push([g.x, g.z, Math.max(this.environment.terrainHeight(g.x, g.z) + 1.2, g.y + 1.8), `Lantern Anemone ${i + 1}`]);
    }
    spots.forEach(([x, z, y, caveName], i) => {
      const mesh = new THREE.Mesh(specimenGeo, specMat);
      mesh.position.set(x, (y ?? this.environment.terrainHeight(x, z) + 0.6), z);
      this.scene.add(mesh);
      this.items.push({ type: 'specimen', name: caveName || names[i], mesh, baseY: mesh.position.y, collected: false });
    });
  }

  nearestAction(position, radius = 4) {
    let best = null, dist = radius * radius;
    for (const item of this.items) {
      if (item.collected) continue;
      const d = item.mesh.position.distanceToSquared(position);
      if (d < dist) { dist = d; best = item; }
    }
    if (!best) return null;
    const label = best.type === 'treasure' ? 'OPEN TREASURE'
      : best.type === 'net' ? 'FREE TRAPPED FISH' : `COLLECT ${best.name.toUpperCase()}`;
    return { item: best, label };
  }

  interact(position) {
    const action = this.nearestAction(position);
    if (!action) return false;
    const { item } = action;
    item.collected = true;
    this.progression.data.loot.push(item.id);
    if (item.type === 'treasure') {
      this.progression.addCash(item.value);
      this.hud.notify(`TREASURE · +${item.value} CREDITS`, 2.4);
      this.audio.coin();
      item.mesh.rotation.z = Math.PI / 10;
      item.mesh.scale.y = 0.65;
    } else if (item.type === 'net') {
      this.progression.addFreed();
      this.onRelease?.();
      this.progression.addCash(30);
      this.hud.notify('ANIMAL FREED · +30 CREDITS', 2.4);
      this.audio.unlockSound();
      item.net.visible = false;
      item.freeT = 0;
    } else {
      this.progression.addSpecimen(item.name);
      this.progression.addCash(45);
      this.hud.notify(`RARE SPECIMEN · ${item.name.toUpperCase()}`, 2.8);
      this.audio.unlockSound();
      item.mesh.visible = false;
    }
    return true;
  }

  photograph() {
    if (this.photoCooldown > 0) return false;
    this.photoCooldown = 0.8;
    this.audio.cameraShutter();
    this.flashTimer = 0.16;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    let best = null, bestScore = -Infinity;
    for (const sub of this.ecosystem.photoSubjects()) {
      const dir = sub.position.clone().sub(this.camera.position);
      const dist = dir.length();
      if (dist < 1 || dist > 22) continue;
      const dot = dir.normalize().dot(forward);
      if (dot < 0.84) continue;
      const score = dot * 3 - dist * 0.04;
      if (score > bestScore) { bestScore = score; best = sub; }
    }
    if (!best) {
      this.hud.notify('PHOTO · NO ANIMAL IN FRAME');
      return false;
    }
    this.progression.recordPhoto(best.name);
    this.onPhoto?.(best.name);
    this.hud.notify(`PHOTO · ${best.name.toUpperCase()}`, 2.4);
    return true;
  }

  scan() {
    if (this.sonarCooldown > 0) return false;
    this.sonarCooldown = 5;
    this.sonarTimer = 2;
    this.sonar.position.copy(this.camera.position);
    this.sonar.visible = true;
    this.audio.sonar();
    const count = this.ecosystem.photoSubjects().filter(s => s.position.distanceTo(this.camera.position) < 35).length;
    const objects = this.items.filter(i => !i.collected && i.mesh.position.distanceTo(this.camera.position) < 35).length;
    this.hud.notify(`SONAR · ${count} ANIMALS · ${objects} OBJECTS`, 2.5);
    return true;
  }

  toggleLight() {
    this.flashlightOn = !this.flashlightOn;
    this.light.intensity = this.flashlightOn ? 3.6 : 0;
    this.light.distance = 24 + this.progression.upgradeLevel('light') * 12;
    this.hud.notify(this.flashlightOn ? 'DIVE LIGHT ON' : 'DIVE LIGHT OFF');
    this.audio.ui();
    return this.flashlightOn;
  }

  update(dt) {
    this.t += dt;
    this.sonarCooldown = Math.max(0, this.sonarCooldown - dt);
    this.photoCooldown = Math.max(0, this.photoCooldown - dt);
    if (this.sonarTimer > 0) {
      this.sonarTimer -= dt;
      const p = 1 - this.sonarTimer / 2;
      this.sonar.scale.setScalar(1 + p * 34);
      this.sonar.material.opacity = (1 - p) * 0.6;
      if (this.sonarTimer <= 0) this.sonar.visible = false;
    }
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
    const flash = document.getElementById('photo-flash');
    if (flash) flash.style.opacity = String(this.flashTimer / 0.16 * 0.6);
    for (const item of this.items) {
      if (item.type === 'specimen' && !item.collected) {
        item.mesh.rotation.y += dt * 0.6;
        item.mesh.position.y = item.baseY + Math.sin(this.t * 1.6) * 0.15;
      } else if (item.type === 'net') {
        if (!item.collected) item.fish.rotation.z = Math.sin(this.t * 5) * 0.08;
        else {
          item.freeT += dt;
          item.fish.position.x += dt * 3;
          item.fish.position.y += dt * 0.5;
          if (item.freeT > 3) item.mesh.visible = false;
        }
      }
    }
  }

  dispose() {
    for (const item of this.items) {
      this.scene.remove(item.mesh);
      if (item.net) { item.net.geometry.dispose(); item.net.material.dispose(); }
    }
    this.geometries.forEach(g => g.dispose());
    this.sharedMat.dispose(); this.specMat.dispose();
    this.scene.remove(this.sonar);
    this.sonar.geometry.dispose(); this.sonar.material.dispose();
    this.camera.remove(this.light, this.light.target);
  }
}
