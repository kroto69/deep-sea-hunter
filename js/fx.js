import * as THREE from 'three';

// Recycled bubble trail puffs emitted from the diver.
export class BubbleTrail {
  constructor(scene, capacity = 48) {
    this.capacity = capacity;
    this.cursor = 0;
    this.particles = [];
    const geo = new THREE.SphereGeometry(0.075, 5, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.6, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.matrix = new THREE.Matrix4();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) {
      this.particles.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
      this.mesh.setMatrixAt(i, this.zero);
    }
    scene.add(this.mesh);
    this.cooldown = 0;
  }

  emit(origin, velocity) {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    p.life = 1;
    p.pos.copy(origin);
    p.vel.set(
      velocity.x * 0.15 + (Math.random() - 0.5) * 0.4,
      0.7 + Math.random() * 0.6,
      velocity.z * 0.15 + (Math.random() - 0.5) * 0.4
    );
  }

  update(dt, origin, velocity, moving) {
    this.cooldown -= dt;
    if (moving && this.cooldown <= 0) {
      this.emit(origin, velocity);
      this.emit(origin, velocity);
      this.cooldown = 0.11;
    }
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= dt * 1.1;
      p.pos.addScaledVector(p.vel, dt);
      if (p.life <= 0) {
        this.mesh.setMatrixAt(i, this.zero);
      } else {
        const s = 0.4 + (1 - p.life) * 0.9;
        this.matrix.makeScale(s, s, s).setPosition(p.pos);
        this.mesh.setMatrixAt(i, this.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.material.opacity = 0.6;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// Sand kicked up from the seabed when the diver swims close to it.
export class SandPuff {
  constructor(scene, terrainHeight, capacity = 40) {
    this.capacity = capacity;
    this.cursor = 0;
    this.terrainHeight = terrainHeight;
    this.particles = [];
    const geo = new THREE.SphereGeometry(0.12, 4, 3);
    const mat = new THREE.MeshBasicMaterial({ color: 0xd8c79a, transparent: true, opacity: 0.5, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.matrix = new THREE.Matrix4();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) {
      this.particles.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
      this.mesh.setMatrixAt(i, this.zero);
    }
    scene.add(this.mesh);
    this.cooldown = 0;
  }

  emit(origin, velocity) {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    p.life = 1;
    p.pos.copy(origin);
    p.vel.set(
      (Math.random() - 0.5) * 1.2 - velocity.x * 0.15,
      0.25 + Math.random() * 0.5,
      (Math.random() - 0.5) * 1.2 - velocity.z * 0.15
    );
  }

  // emits only when hovering close to the floor, as in the spec
  update(dt, position, velocity, moving) {
    this.cooldown -= dt;
    const floor = this.terrainHeight(position.x, position.z);
    if (moving && this.cooldown <= 0 && position.y - floor < 3) {
      const origin = new THREE.Vector3(
        position.x + (Math.random() - 0.5) * 1.5,
        floor + 0.1,
        position.z + (Math.random() - 0.5) * 1.5
      );
      this.emit(origin, velocity);
      this.emit(origin, velocity);
      this.cooldown = 0.16;
    }
    for (let i = 0; i < this.capacity; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= dt * 0.9;
      p.vel.multiplyScalar(1 - dt * 1.5);
      p.pos.addScaledVector(p.vel, dt);
      if (p.life <= 0) {
        this.mesh.setMatrixAt(i, this.zero);
      } else {
        const s = 0.5 + (1 - p.life) * 1.6;
        this.matrix.makeScale(s, s * 0.7, s).setPosition(p.pos);
        this.mesh.setMatrixAt(i, this.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.material.opacity = 0.5;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
