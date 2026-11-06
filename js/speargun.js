import * as THREE from 'three';

const ROPE_POINTS = 17;
const ROPE_MAX = 70;

export class Speargun {
  constructor(camera, scene, fishSystem, world = {}) {
    this.camera = camera;
    this.scene = scene;
    this.fishSystem = fishSystem;
    this.terrainHeight = world.terrainHeight || (() => 0);
    this.onImpact = world.onImpact || null;
    this.cooldown = 0;
    this.reload = 0.75;
    this.aiming = false;
    this.spear = null;
    this.recoil = 0;
    this.ropeTime = 0;
    this.muzzle = new THREE.Vector3();
    this.ropeScratch = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.returnQuat = new THREE.Quaternion();
    this.shaftUp = new THREE.Vector3(0, 1, 0);
    this.root = new THREE.Group();
    camera.add(this.root);
    this.root.position.set(0.42, -0.32, -0.72);
    this.root.rotation.set(-0.08, -0.08, -0.04);
    this.restPos = this.root.position.clone();

    const dark = new THREE.MeshStandardMaterial({ color: 0x1d2b35, flatShading: true });
    const metal = new THREE.MeshStandardMaterial({ color: 0xa7c7d4, metalness: 0.6, roughness: 0.3, flatShading: true });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98d62, flatShading: true });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 1.05), dark);
    body.position.z = -0.38;
    this.root.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 6), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -1.12;
    this.root.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.42, 0.15), dark);
    grip.position.set(0, -0.24, -0.18);
    grip.rotation.x = -0.25;
    this.root.add(grip);

    // Diver's hands on the gun; rope leaves from the left hand's reel.
    const handGeo = new THREE.BoxGeometry(0.13, 0.1, 0.2);
    const leftHand = new THREE.Mesh(handGeo, skin);
    leftHand.position.set(0, -0.06, -0.86);
    this.root.add(leftHand);
    const rightHand = new THREE.Mesh(handGeo, skin);
    rightHand.position.set(0, -0.26, -0.14);
    this.root.add(rightHand);
    this.muzzleLocal = new THREE.Vector3(0, -0.06, -0.98);

    // Reel drum on the gun body.
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 7), metal);
    reel.rotation.z = Math.PI / 2;
    reel.position.set(0.08, -0.04, -0.78);
    this.root.add(reel);

    this.rope = this._makeRope();
    // Projectile resources are allocated once and reused for every shot.
    this.shaftGeo = new THREE.CylinderGeometry(0.018, 0.018, 2.2, 5);
    this.shaftMat = new THREE.MeshBasicMaterial({ color: 0xd9f3ff });
    this.shaft = new THREE.Mesh(this.shaftGeo, this.shaftMat);
    this.shaft.visible = false;
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    this.trailMat = new THREE.LineBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55 });
    this.trail = new THREE.Line(this.trailGeo, this.trailMat);
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    this.reticle = document.getElementById('crosshair');
  }

  // One persistent line mesh: reused every shot, never rebuilt per frame.
  _makeRope() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(ROPE_POINTS * 3);
    const colors = new Float32Array(ROPE_POINTS * 3);
    const dark = new THREE.Color(0x1e272b), light = new THREE.Color(0x536a70);
    for (let i = 0; i < ROPE_POINTS; i++) {
      const c = i % 3 === 0 ? light : dark;
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 1 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    this.scene.add(line);
    return line;
  }

  setAim(value) {
    this.aiming = value;
    this.root.position.x = value ? 0.16 : 0.42;
    this.root.position.y = value ? -0.24 : -0.32;
    this.root.scale.setScalar(value ? 1.08 : 1);
    this.reticle.style.opacity = value ? '1' : '0.65';
  }

  fire() {
    if (this.cooldown > 0 || this.spear) return false;
    this.cooldown = this.reload;
    this.recoil = 1;
    this.camera.updateMatrixWorld();
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    // Preserve existing crosshair-aligned shot and hit-test trajectory.
    const origin = this.camera.getWorldPosition(new THREE.Vector3()).addScaledVector(direction, 1.3);

    const mesh = this.shaft;
    mesh.quaternion.setFromUnitVectors(this.shaftUp, direction);
    mesh.position.copy(origin);
    mesh.visible = true;
    this.scene.add(mesh);
    this.trail.visible = true;
    this.scene.add(this.trail);

    this.spear = {
      mesh, direction, distance: 0, speed: 42, max: ROPE_MAX,
      state: 'flying', hold: 0, trail: this.trail,
      history: Array.from({ length: 8 }, () => mesh.position.clone())
    };
    this.rope.visible = true;
    this.rope.geometry.setDrawRange(0, ROPE_POINTS);
    this._pushTrail(this.spear);
    this._updateRope();
    return true;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.ropeTime += dt;
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt * 5);
      this.root.position.z = this.restPos.z + this.recoil * 0.16;
      this.root.rotation.x = -0.08 - this.recoil * 0.12;
    }
    if (!this.spear) return;
    const s = this.spear;
    this.camera.updateMatrixWorld();
    const muzzle = this.root.localToWorld(this.muzzle.copy(this.muzzleLocal));

    if (s.state === 'flying') {
      const step = s.speed * dt;
      const previous = this.ropeScratch[2].copy(s.mesh.position);
      s.mesh.position.addScaledVector(s.direction, step);
      s.distance += step;
      const tether = this.ropeScratch[0].copy(s.mesh.position).sub(muzzle);
      const atLimit = tether.length() >= s.max;
      if (atLimit) s.mesh.position.copy(muzzle).add(tether.setLength(s.max));
      this._pushTrail(s);
      const hit = this.fishSystem.hitSegment(previous, s.mesh.position, 0.9);
      const floor = this.terrainHeight(s.mesh.position.x, s.mesh.position.z) + 0.15;
      if (hit) {
        this.fishSystem.collect(hit);
        this.onImpact?.(true, s.mesh.position);
        this._beginReturn(0.12);
      } else if (s.mesh.position.y <= floor || s.distance >= s.max || atLimit) {
        this.onImpact?.(false, s.mesh.position);
        this._beginReturn(0.08);
      }
    } else {
      if (s.hold > 0) {
        s.hold -= dt;
      } else {
        const toMuzzle = this.ropeScratch[0].copy(muzzle).sub(s.mesh.position);
        const dist = toMuzzle.length();
        if (dist < 1.1) {
          this._retract();
          return;
        }
        toMuzzle.multiplyScalar(1 / dist);
        s.mesh.position.addScaledVector(toMuzzle, Math.min(dist, 30 * dt));
        this.returnQuat.setFromUnitVectors(this.shaftUp, toMuzzle);
        s.mesh.quaternion.slerp(this.returnQuat, Math.min(1, dt * 9));
        this._pushTrail(s);
      }
    }
    const tether = this.ropeScratch[0].copy(s.mesh.position).sub(muzzle);
    if (tether.length() > s.max) {
      s.mesh.position.copy(muzzle).add(tether.setLength(s.max));
      this._beginReturn(0);
    }
    this._updateRope(muzzle);
  }

  _pushTrail(s) {
    const recycled = s.history.pop();
    s.history.unshift(recycled.copy(s.mesh.position));
    const pos = s.trail.geometry.attributes.position;
    for (let i = 0; i < s.history.length; i++) {
      const h = s.history[i];
      pos.setXYZ(i, h.x, h.y, h.z);
    }
    pos.needsUpdate = true;
  }

  _beginReturn(hold) {
    const s = this.spear;
    s.state = 'returning';
    s.hold = hold;
  }

  // Rope is a fixed-size polyline: taut when extended, sagging when slack.
  _updateRope(muzzle = null) {
    if (!this.spear) { this.rope.visible = false; return; }
    const s = this.spear;
    const from = muzzle || this.root.localToWorld(this.muzzle.copy(this.muzzleLocal));
    const to = s.mesh.position;
    const span = from.distanceTo(to);
    const slack = Math.max(0, 1 - span / (s.max * 0.55));
    const sag = slack * 1.6 + 0.04;
    const pos = this.rope.geometry.attributes.position;
    const forward = this.ropeScratch[0].copy(to).sub(from).normalize();
    const side = this.ropeScratch[1].set(-forward.z, 0, forward.x);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const sway = Math.sin(this.ropeTime * 1.7) * 0.03 * span * slack;
    for (let i = 0; i < ROPE_POINTS; i++) {
      const t = i / (ROPE_POINTS - 1);
      const bow = Math.sin(Math.PI * t);
      pos.setXYZ(i,
        from.x + (to.x - from.x) * t + side.x * sway * bow,
        from.y + (to.y - from.y) * t - sag * bow * bow,
        from.z + (to.z - from.z) * t + side.z * sway * bow);
    }
    pos.needsUpdate = true;
    this.rope.visible = true;
  }

  _retract() {
    const s = this.spear;
    this.scene.remove(s.mesh);
    s.mesh.visible = false;
    this.scene.remove(s.trail);
    s.trail.visible = false;
    this.spear = null;
    this.rope.visible = false;
    this.rope.geometry.setDrawRange(0, 0);
  }

  status() {
    if (this.spear) return this.spear.state === 'returning' ? 'SPEARGUN: RETRIEVING' : 'SPEARGUN: FIRED';
    if (this.cooldown > 0) return 'SPEARGUN: RELOADING';
    return 'SPEARGUN: READY';
  }

  reset() { if (this.spear) this._retract(); }

  dispose() {
    if (this.spear) this._retract();
    this.scene.remove(this.rope);
    this.rope.geometry.dispose();
    this.rope.material.dispose();
    this.shaftGeo.dispose();
    this.shaftMat.dispose();
    this.trailGeo.dispose();
    this.trailMat.dispose();
  }
}
