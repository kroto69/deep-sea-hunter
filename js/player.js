import * as THREE from 'three';

export class Player {
  constructor(camera, terrainHeight = () => 0) {
    this.camera = camera;
    this.terrainHeight = terrainHeight;
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.baseSpeed = 8;
    this.boostSpeed = 16;
    this.accel = 5;
    this.damping = 2.8;
    this.currentSpeed = this.baseSpeed;
    this.viewYaw = 0;
    this.viewPitch = 0;
    this.desired = new THREE.Vector3();
    this.minY = 1.2;   // don't sink into seabed
    this.maxY = 36;    // don't breach surface
    this.bounds = 95;  // horizontal play area bound

    this.moveInput = new THREE.Vector2(); // x: strafe, y: forward
    this.verticalInput = 0;               // -1..1
    this.boost = false;
    this.boosting = false;
  }

  rotate(dx, dy) {
    this.yaw -= dx * 0.0025;
    this.pitch -= dy * 0.0025;
    const lim = Math.PI / 2 - 0.05;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  // Keep callers compatible; comfort camera never shakes. Gun recoil stays on gun.
  addShake() {}

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    this.boosting = this.boost;
    this.currentSpeed += ((this.boosting ? this.boostSpeed : this.baseSpeed) - this.currentSpeed) * (1 - Math.exp(-3 * dt));

    const yawStep = (this.yaw - this.viewYaw) * (1 - Math.exp(-22 * dt));
    this.viewYaw += yawStep;
    this.viewPitch += (this.pitch - this.viewPitch) * (1 - Math.exp(-22 * dt));

    // Forward follows aim pitch; strafe stays level. UP/DOWN adds world-Y thrust.
    const length = Math.max(1, this.moveInput.length());
    const x = this.moveInput.x / length, z = this.moveInput.y / length;
    const sin = Math.sin(this.viewYaw), cos = Math.cos(this.viewYaw);
    const pitchCos = Math.cos(this.viewPitch);
    const desired = this.desired.set(cos * x - sin * z * pitchCos,
      THREE.MathUtils.clamp(Math.sin(this.viewPitch) * z + this.verticalInput, -1, 1),
      -sin * x - cos * z * pitchCos).multiplyScalar(this.currentSpeed);
    const moving = this.moveInput.lengthSq() > 0.0001;
    // Exact exponential response and displacement; no second braking pass.
    for (const axis of ['x', 'y', 'z']) {
      const active = axis === 'y' ? this.verticalInput !== 0 || Math.abs(desired.y) > 0.0001 : moving;
      const rate = active ? this.accel : this.damping;
      const decay = Math.exp(-rate * dt);
      const old = this.velocity[axis], target = desired[axis];
      this.velocity[axis] = target + (old - target) * decay;
      this.camera.position[axis] += target * dt + (old - target) * (1 - decay) / rate;
    }

    // Bounds
    const p = this.camera.position;
    for (const axis of ['x', 'z']) {
      const clamped = THREE.MathUtils.clamp(p[axis], -this.bounds, this.bounds);
      if (clamped !== p[axis]) this.velocity[axis] = 0;
      p[axis] = clamped;
    }
    const floor = this.terrainHeight(p.x, p.z) + this.minY;
    const clampedY = Math.max(floor, Math.min(this.maxY, p.y));
    if (clampedY !== p.y) this.velocity.y = 0;
    p.y = clampedY;

    // Stable horizon: only deliberate look input changes camera orientation.
    this.camera.rotation.set(this.viewPitch, this.viewYaw, 0, 'YXZ');
  }
}
