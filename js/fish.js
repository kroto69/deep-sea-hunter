import * as THREE from 'three';
import { part, mergeParts } from './world/geo.js';

const rand = (min, max) => min + Math.random() * (max - min);

// Reef species: shape/colour/scale, swim speed, detection radius, behaviour.
export const FISH_SPECIES = [
  { id: 'clownfish', name: 'Clownfish', color: 0xf47725, fin: 0x17191c, size: 0.75, speed: 2.1, detect: 13, shape: 'oval', school: true, habitats: ['coral', 'shallow'], count: 8 },
  { id: 'bluetang', name: 'Blue Tang', color: 0x168bd0, fin: 0xf5d83c, size: 1.05, speed: 3.2, detect: 18, shape: 'disk', school: true, habitats: ['coral', 'wreck'], count: 7 },
  { id: 'angelfish', name: 'Angelfish', color: 0xe5bd45, fin: 0x183c71, size: 1.15, speed: 1.8, detect: 15, shape: 'tall', school: false, habitats: ['coral', 'rocky'], count: 5 },
  { id: 'butterfly', name: 'Butterflyfish', color: 0xffda43, fin: 0x262b32, size: 0.8, speed: 2.8, detect: 16, shape: 'disk', school: true, habitats: ['coral', 'shallow'], count: 6 },
  { id: 'parrotfish', name: 'Parrotfish', color: 0x24b79b, fin: 0xf06b93, size: 1.4, speed: 1.5, detect: 20, shape: 'oval', school: false, habitats: ['seagrass', 'coral'], count: 5 },
  { id: 'grouper', name: 'Grouper', color: 0x6b5a3e, fin: 0x8a7550, size: 1.9, speed: 1.15, detect: 22, shape: 'bulk', school: false, predator: true, habitats: ['rocky', 'wreck'], count: 3 },
  { id: 'barracuda', name: 'Barracuda', color: 0x9fb2bd, fin: 0x53646f, size: 2.1, speed: 3.8, detect: 26, shape: 'long', school: true, predator: true, habitats: ['open'], count: 4 },
  { id: 'damselfish', name: 'Damselfish', color: 0x4b9ed0, fin: 0x6ec6b4, size: .58, speed: 2.8, detect: 10, shape: 'disk', school: true, habitats: ['coral'], count: 10 },
  { id: 'chromis', name: 'Blue Chromis', color: 0x55bdb1, fin: 0x9bd8ce, size: .62, speed: 3.1, detect: 11, shape: 'oval', school: true, habitats: ['coral','seagrass'], count: 9 },
  { id: 'wrasse', name: 'Rainbow Wrasse', color: 0x82ad68, fin: 0xd8a76a, size: .88, speed: 2.5, detect: 13, shape: 'long', school: false, habitats: ['coral','rocky'], count: 5 },
  { id: 'lionfish', name: 'Lionfish', color: 0xa77583, fin: 0xd8b7a0, size: 1.1, speed: 1.3, detect: 14, shape: 'tall', school: false, predator: true, habitats: ['rocky','deep'], count: 2 },
  { id: 'tuna', name: 'Bluefin Tuna', color: 0x517e96, fin: 0xb6cad0, size: 1.7, speed: 4.0, detect: 24, shape: 'long', school: true, habitats: ['open','deep'], count: 3 },
  { id: 'cardinalfish', name: 'Flame Cardinalfish', color: 0xd94e45, fin: 0xffb36b, size: .62, speed: 1.9, detect: 9, shape: 'oval', school: true, habitats: ['wreck','rocky'], count: 8 },
  { id: 'moorishidol', name: 'Moorish Idol', color: 0xf2d85a, fin: 0x20232e, size: .95, speed: 2.6, detect: 14, shape: 'disk', school: true, habitats: ['coral','shallow'], count: 5 },
  { id: 'triggerfish', name: 'Picasso Triggerfish', color: 0x45bca8, fin: 0xe7ba4f, size: 1.05, speed: 1.8, detect: 16, shape: 'bulk', school: false, habitats: ['coral','wreck'], count: 4 },
  { id: 'pufferfish', name: 'Porcupine Pufferfish', color: 0xd6bd68, fin: 0x354b48, size: 1.0, speed: 1.1, detect: 10, shape: 'bulk', school: false, habitats: ['coral','shallow'], count: 3 },
  { id: 'seahorse', name: 'Tiger-Tail Seahorse', color: 0xe7a74e, fin: 0xc87549, size: .72, speed: .8, detect: 7, shape: 'tall', school: false, habitats: ['seagrass','kelp'], count: 3 },
  { id: 'sardine', name: 'Sardine', color: 0x82b9c2, fin: 0xd8dfbc, size: .48, speed: 3.5, detect: 11, shape: 'long', school: true, habitats: ['open','kelp'], count: 14 },
  { id: 'squid', name: 'Reef Squid', color: 0xa87eab, fin: 0xe3b9da, size: .9, speed: 2.6, detect: 13, shape: 'squid', school: true, habitats: ['open','wreck','deep'], count: 4 }
];

// Geometry/material cache: every fish of a species shares GPU resources.
const speciesCache = new Map();

function speciesAssets(spec) {
  let assets = speciesCache.get(spec.id);
  if (assets) return assets;
  const parts = [];
  const long = spec.shape === 'long';
  let bodyGeo;
  if (spec.shape === 'squid') {
    bodyGeo = new THREE.ConeGeometry(.48, 1.7, 6);
    bodyGeo.rotateZ(-Math.PI / 2);
    parts.push(part(bodyGeo, spec.color, [.08, .1, 0], [0, 0, 0], [1, 1.15, .8]));
    parts.push(part(new THREE.SphereGeometry(.42, 6, 4), spec.fin, [.75, 0, 0], [0, 0, 0], [1.15, .55, .8]));
    const eye = new THREE.SphereGeometry(.07, 5, 4);
    for (const side of [-1, 1]) parts.push(part(eye, 0x101820, [.78, .1, side * .26]));
    eye.dispose();
    for (let i = 0; i < 8; i++) {
      const a = -1.3 + i * .12;
      parts.push(part(new THREE.CylinderGeometry(.018, .045, .75 + (i % 2) * .18, 4), spec.fin,
        [-.78, -.18, (i - 3.5) * .075], [0, 0, a]));
    }
  } else {
    bodyGeo = spec.shape === 'tall'
      ? new THREE.OctahedronGeometry(.7, 0)
      : long
        ? new THREE.ConeGeometry(.42, 2.4, 6)
        : new THREE.IcosahedronGeometry(.72, 0);
    if (long) bodyGeo.rotateZ(Math.PI / 2);
    if (spec.shape === 'disk') bodyGeo.scale(.72, 1.1, .55);
    else if (spec.shape === 'tall') bodyGeo.scale(1, 1.3, .7);
    else if (spec.shape === 'bulk') bodyGeo.scale(1.15, .95, .9);
    else if (spec.shape === 'oval') bodyGeo.scale(1.2, .75, .58);
    parts.push(part(bodyGeo, spec.color));

    const tail = new THREE.ConeGeometry(.42, .75, 4);
    tail.rotateZ(-Math.PI / 2);
    parts.push(part(tail, spec.fin, [long ? -1.2 : -1.0, 0, 0]));
    tail.dispose();

    const dorsal = new THREE.ConeGeometry(.28, .75, 4);
    dorsal.rotateZ(Math.PI / 2);
    parts.push(part(dorsal, spec.fin, [-.05, long ? .3 : .55, 0], [0, 0, 0], [.6, .7, .8]));
    dorsal.dispose();
    const pectoral = new THREE.ConeGeometry(.24, .58, 4);
    pectoral.rotateZ(-Math.PI / 2);
    for (const side of [-1, 1]) {
      parts.push(part(pectoral, spec.fin, [0, -.15, side * .35], [0, 0, side * .35], [.6, .7, .8]));
      parts.push(part(new THREE.SphereGeometry(.07, 5, 4), 0x101820,
        [long ? .85 : .48, .12, side * .26]));
    }
    pectoral.dispose();
    if (spec.id === 'lionfish') {
      for (let i = 0; i < 9; i++) {
        const a = -.95 + i * .24;
        parts.push(part(new THREE.ConeGeometry(.055, .72 + (i % 3) * .12, 3),
          i % 2 ? 0xf2e1ca : 0x542f42, [-.05, .65, 0], [a, 0, a]));
      }
      for (let i = 0; i < 5; i++) {
        parts.push(part(new THREE.BoxGeometry(.09, 1.25, .035), i % 2 ? 0xf0dfca : 0x573746,
          [-.25 + i * .13, -.02, .16], [0, 0, .1]));
      }
    } else if (spec.id === 'tuna') {
      for (let i = 0; i < 5; i++) {
        parts.push(part(new THREE.ConeGeometry(.1, .28, 3), i % 2 ? 0xd1b455 : 0x7599a6,
          [-.4 - i * .15, .3, 0], [0, 0, -.3]))
      }
    } else if (spec.id === 'pufferfish') {
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI * 2 / 10;
        parts.push(part(new THREE.ConeGeometry(.045, .24, 3), 0x665944,
          [Math.cos(a) * .62, .12 + Math.sin(a) * .4, Math.sin(a) * .4], [0, a, -a]));
      }
    }
  }
  const merged = mergeParts(parts);
  for (const p of parts) p.geo.dispose();
  assets = {
    bodyGeo: merged,
    bodyMat: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .8 })
  };
  speciesCache.set(spec.id, assets);
  return assets;
}

function makeFish(spec) {
  const a = speciesAssets(spec);
  const fish = new THREE.Group();
  fish.add(new THREE.Mesh(a.bodyGeo, a.bodyMat));
  fish.scale.setScalar(spec.size);
  return { fish, tail: fish };
}

export class FishSystem {
  constructor(scene, player, world, { quality = 'high' } = {}) {
    this.scene = scene;
    this.player = player;
    this.world = world;
    this.terrainHeight = world.terrainHeight;
    this.collected = 0;
    this.onCollect = null;
    this.clock = 0;
    this.fish = [];
    this.fx = [];
    this.dying = [];

    const density = quality === 'low' ? 0.2 : quality === 'medium' ? 0.35 : 0.55;
    const habitats = world.habitats || [];
    const habitatById = Object.fromEntries(habitats.map(h => [h.id, h]));

    for (const spec of FISH_SPECIES) {
      const n = Math.max(1, Math.round(spec.count * density));
      for (let i = 0; i < n; i++) {
        const model = makeFish(spec);
        const spot = this._spawnSpot(spec, habitatById);
        model.fish.position.copy(spot);
        scene.add(model.fish);
        this.fish.push({
          ...model, spec,
          state: spec.school ? 'SCHOOLING' : 'WANDERING',
          target: spot.clone(),
          turn: rand(2, 7),
          phase: rand(0, Math.PI * 2),
          speedScale: rand(0.8, 1.2),
          injured: 0,
          alive: true
        });
      }
    }
  }

  get predators() {
    return this.fish.filter(f => f.alive && f.spec.predator);
  }

  _spawnSpot(spec, habitatById) {
    const habId = spec.habitats[Math.floor(Math.random() * spec.habitats.length)];
    const hab = habitatById[habId];
    const r = hab ? hab.r * 0.75 : 45;
    const cx = hab ? hab.x : 0;
    const cz = hab ? hab.z : 0;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (Math.abs(x) > 88 || Math.abs(z) > 88) continue;
      const floor = this.terrainHeight(x, z);
      const y = Math.min(30, floor + 2.5 + Math.random() * (habId === 'open' ? 14 : 8));
      if (y > floor + 1.5) return new THREE.Vector3(x, y, z);
    }
    return new THREE.Vector3(0, 12, 0);
  }

  update(dt) {
    this.clock += dt;
    const playerPos = this.player.camera.position;
    const debris = this.world.debris?.positions;
    const reef = this.world.reef;
    const predators = this.predators;

    // Per-species centroid: schooling fish head for their group, cheaply.
    const centroids = new Map();
    for (const f of this.fish) {
      if (!f.alive || !f.spec.school) continue;
      const c = centroids.get(f.spec.id) || { v: new THREE.Vector3(), n: 0 };
      c.v.add(f.fish.position); c.n++;
      centroids.set(f.spec.id, c);
    }
    for (const c of centroids.values()) c.v.divideScalar(c.n);

    for (const f of this.fish) {
      if (!f.alive) continue;
      const pos = f.fish.position;
      const away = pos.distanceTo(playerPos);

      // Distance-based activation: distant fish keep drifting without full AI.
      if (away > 85) {
        f.simpleTimer = (f.simpleTimer || 0) + dt;
        if (f.simpleTimer > 0.25) {
          f.simpleTimer = 0;
          pos.addScaledVector(f.target.clone().sub(pos).normalize(), f.spec.speed * 0.25 * dt);
          f.fish.rotation.z = Math.sin(this.clock * 5 + f.phase) * 0.025;
        }
        continue;
      }

      const playerSpeed = this.player.velocity.length();
      f.feedT = Math.max(0, (f.feedT || 0) - dt);
      f.huntCd = Math.max(0, (f.huntCd || 0) - dt);
      f.chaseT = Math.max(0, (f.chaseT || 0) - dt);
      f.fleeBurst = Math.max(0, (f.fleeBurst || 0) - dt);

      if (f.injured > 0) {
        f.injured -= dt;
        f.state = 'INJURED';
        if (f.injured <= 0) { f.state = f.spec.school ? 'SCHOOLING' : 'WANDERING'; f.turn = 0.1; }
      } else {
        // Prey watch: any nearby predator wins over every other urge.
        f.threatPos = null;
        if (!f.spec.predator) {
          let best = f.spec.detect * 1.3;
          for (const p of predators) {
            if (!p.alive) continue;
            const d = p.fish.position.distanceTo(pos);
            if (d < best) { best = d; f.threatPos = p.fish.position; }
          }
        }

        const hideable = f.spec.id === 'clownfish' || f.spec.id === 'butterfly';
        const coral = hideable && reef ? reef.nearestCoral(pos, 16) : null;
        const panic = away < f.spec.detect * (playerSpeed > 4 ? 1.5 : 1);

        if (f.fleeBurst > 0 || f.threatPos) f.state = 'FLEEING';
        else if (f.state === 'FLEEING' && away > f.spec.detect * 1.8 && f.fleeBurst <= 0) {
          f.state = f.spec.school ? 'SCHOOLING' : 'WANDERING';
        } else if (f.spec.predator && f.huntCd <= 0 && f.state !== 'HUNTING') {
          const prey = this._nearestPrey(f, 20);
          if (prey) { f.state = 'HUNTING'; f.prey = prey; f.chaseT = 4; f.huntCd = 12 + rand(0, 6); }
        } else if (f.state !== 'HUNTING') {
          if (hideable && coral && away > 4.5 && away < f.spec.detect) f.state = 'HIDING';
          else if (panic) f.state = 'FLEEING';
          else if (f.state === 'HIDING' && (away > f.spec.detect * 1.6 || !coral)) {
            f.state = f.spec.school ? 'SCHOOLING' : 'WANDERING';
          }
        }
      }

      f.turn -= dt;
      if (f.state === 'INJURED') {
        pos.y -= dt * 0.4;
        f.fish.rotation.z = Math.sin(this.clock * 22) * 0.35;
      } else if (f.turn <= 0 || f.state === 'FLEEING' || f.state === 'HUNTING' || f.state === 'FEEDING' || f.state === 'HIDING') {
        f.fish.rotation.z = 0;
        switch (f.state) {
          case 'FLEEING': {
            const src = f.fleeBurst > 0 && f.impactSource ? f.impactSource : f.threatPos || playerPos;
            f.target.copy(pos).sub(src).normalize().multiplyScalar(26).add(pos);
            f.target.y = THREE.MathUtils.clamp(pos.y + rand(-4, 5), this.terrainHeight(pos.x, pos.z) + 2, 30);
            break;
          }
          case 'HUNTING': {
            const prey = f.prey;
            if (prey && prey.alive && f.chaseT > 0) {
              f.target.copy(prey.fish.position);
            } else {
              f.state = 'WANDERING';
              f.huntCd = 10 + rand(0, 8);
              f.turn = 0.1;
            }
            break;
          }
          case 'HIDING': {
            const c = reef ? reef.nearestCoral(pos, 18) : null;
            if (c) f.target.set(c.x, this.terrainHeight(c.x, c.z) + 1.1, c.z);
            break;
          }
          case 'FEEDING': {
            if (f.feedT <= 0 || !f.feedSpot) {
              f.state = f.spec.school ? 'SCHOOLING' : 'WANDERING';
              f.turn = 0.1;
              break;
            }
            f.target.copy(f.feedSpot);
            break;
          }
          case 'SCHOOLING': {
            if (centroids.has(f.spec.id)) {
              const c = centroids.get(f.spec.id).v;
              f.target.set(c.x + rand(-5, 5), THREE.MathUtils.clamp(c.y + rand(-2, 2), 4, 28), c.z + rand(-5, 5));
            } else {
              f.state = 'WANDERING';
            }
            break;
          }
          default: {
            const a = rand(0, Math.PI * 2), r = rand(4, 16);
            f.target.set(pos.x + Math.cos(a) * r, rand(5, 25), pos.z + Math.sin(a) * r);
            f.target.x = THREE.MathUtils.clamp(f.target.x, -86, 86);
            f.target.z = THREE.MathUtils.clamp(f.target.z, -86, 86);
            // Occasional nibble on coral or the seabed.
            if (Math.random() < 0.22) {
              const spot = this._feedSpot(f, reef);
              if (spot) {
                f.state = 'FEEDING';
                f.feedSpot = spot;
                f.feedT = 1.6 + rand(0, 1.6);
              }
            }
            break;
          }
        }
        f.turn = f.state === 'FLEEING' || f.state === 'HUNTING' ? 1 : rand(3, 8);
      }

      const nearBottom = f.state === 'HIDING' || f.state === 'FEEDING';
      const floor = this.terrainHeight(pos.x, pos.z) + (nearBottom ? 0.6 : 2.2) * f.spec.size;
      if (!nearBottom && pos.y < floor + 3) f.target.y = Math.max(f.target.y, floor + 5);

      const direction = f.target.clone().sub(pos);
      if (direction.lengthSq() > 0.01) {
        direction.normalize();

        // Pollution avoidance: fish give debris a wide berth.
        if (debris) {
          for (let i = 0; i < debris.length; i++) {
            const d = debris[i];
            const dx = pos.x - d.x, dz = pos.z - d.z, dy = pos.y - d.y;
            const dist2 = dx * dx + dz * dz + dy * dy;
            if (dist2 < 9) {
              const inv = 1 / Math.sqrt(dist2 + 0.001);
              direction.x += dx * inv * 0.8;
              direction.y += dy * inv * 0.5;
              direction.z += dz * inv * 0.8;
            }
          }
          direction.normalize();
        }

        const stateScale = f.state === 'FLEEING' ? 2.2
          : f.state === 'HUNTING' ? 1.8
          : f.state === 'HIDING' ? 0.45
          : f.state === 'FEEDING' ? 0.55
          : 1;
        const speed = f.spec.speed * f.speedScale * stateScale * (1 + (f.fleeBurst || 0) * 1.6);
        pos.addScaledVector(direction, speed * dt);
        const desiredYaw = Math.atan2(-direction.z, direction.x);
        let delta = ((desiredYaw - f.fish.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        f.fish.rotation.y += delta * Math.min(1, dt * 3);
      }

      pos.x = THREE.MathUtils.clamp(pos.x, -86, 86);
      pos.z = THREE.MathUtils.clamp(pos.z, -86, 86);
      pos.y = Math.max(this.terrainHeight(pos.x, pos.z) + (nearBottom ? 0.6 : 2.2) * f.spec.size, Math.min(pos.y, 34));
      f.fish.rotation.z += Math.sin(this.clock * 9 * f.speedScale + f.phase) * dt * .08;
      f.fish.position.y += Math.sin(this.clock * 2 + f.phase) * 0.003;
    }

    this._updateEffects(dt);
  }

  _nearestPrey(predator, radius) {
    let best = null, bestD = radius * radius;
    for (const f of this.fish) {
      if (!f.alive || f.spec.predator) continue;
      if (f.spec.size > predator.spec.size * 0.7) continue;
      const d = f.fish.position.distanceToSquared(predator.fish.position);
      if (d < bestD) { best = f; bestD = d; }
    }
    return best;
  }

  // Somewhere to peck: coral head if nearby, else a patch of seabed.
  _feedSpot(f, reef) {
    const pos = f.fish.position;
    const coral = reef ? reef.nearestCoral(pos, 22) : null;
    if (coral) {
      return new THREE.Vector3(coral.x, this.terrainHeight(coral.x, coral.z) + 0.9, coral.z);
    }
    const a = rand(0, Math.PI * 2), r = rand(2, 7);
    const x = THREE.MathUtils.clamp(pos.x + Math.cos(a) * r, -85, 85);
    const z = THREE.MathUtils.clamp(pos.z + Math.sin(a) * r, -85, 85);
    return new THREE.Vector3(x, this.terrainHeight(x, z) + 0.6, z);
  }

  // Spear shot nearby scares fish off, even outside their detect radius.
  scareNearby(point, radius = 18) {
    for (const f of this.fish) {
      if (!f.alive || f.state === 'INJURED') continue;
      if (f.fish.position.distanceTo(point) < radius) {
        f.state = 'FLEEING';
        f.fleeBurst = 1;
        f.impactSource = point.clone();
        f.turn = 0.05;
      }
    }
  }

  // Segment-sphere test against every living fish. Returns nearest hit or null.
  hitSegment(from, to, radius) {
    const seg = new THREE.Vector3().subVectors(to, from);
    const segLenSq = seg.lengthSq();
    if (segLenSq === 0) return null;
    let best = null;
    let bestT = Infinity;
    const toCenter = new THREE.Vector3();
    const closest = new THREE.Vector3();
    for (const f of this.fish) {
      if (!f.alive || this.canCatch?.(f.spec) === false) continue;
      const r = radius * f.spec.size;
      toCenter.subVectors(f.fish.position, from);
      const t = THREE.MathUtils.clamp(toCenter.dot(seg) / segLenSq, 0, 1);
      closest.copy(from).addScaledVector(seg, t);
      if (closest.distanceTo(f.fish.position) <= r && t < bestT) {
        bestT = t;
        best = f;
      }
    }
    return best;
  }

  collect(f) {
    if (!f || !f.alive) return;
    f.alive = false;
    f.state = 'INJURED';
    this.collected += 1;
    this._spawnHitFeedback(f.fish.position);
    f.fish.rotation.z = Math.PI / 2;
    f.deathT = 0;
    // Clone shared species materials so fading one fish does not fade its school.
    f.ownMaterials = [];
    f.fish.traverse(o => {
      if (o.material) {
        o.material = o.material.clone();
        o.material.transparent = true;
        f.ownMaterials.push(o.material);
      }
    });
    this.dying.push(f);
    if (this.onCollect) this.onCollect(f.spec, this.collected);
  }

  _spawnHitFeedback(position) {
    const geo = new THREE.SphereGeometry(0.5, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.9 });
    const burst = new THREE.Mesh(geo, mat);
    burst.position.copy(position);
    this.scene.add(burst);
    this.fx.push({ burst, t: 0 });
  }

  _updateEffects(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const e = this.fx[i];
      e.t += dt;
      e.burst.scale.setScalar(1 + e.t * 5);
      e.burst.material.opacity = Math.max(0, 0.9 - e.t * 2.5);
      if (e.t > 0.4) {
        this.scene.remove(e.burst);
        e.burst.geometry.dispose();
        e.burst.material.dispose();
        this.fx.splice(i, 1);
      }
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const f = this.dying[i];
      f.deathT += dt;
      f.fish.position.y -= dt * 0.8;
      const fade = Math.max(0, 1 - f.deathT / 1.2);
      for (const m of f.ownMaterials) m.opacity = fade;
      if (f.deathT > 1.2) {
        this.scene.remove(f.fish);
        for (const m of f.ownMaterials) m.dispose();
        const idx = this.fish.indexOf(f);
        if (idx >= 0) this.fish.splice(idx, 1);
        this.dying.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const f of this.fish) {
      this.scene.remove(f.fish);
    }
    this.fish.length = 0;

  }
}
