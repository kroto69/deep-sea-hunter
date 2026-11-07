import * as THREE from 'three';

// Dynamic ocean state: sun motion, currents, depth visibility.
// Everything that drifts in the water reads `current` from here.
export function createOcean({ scene, sun, environment, baseFog = 0.026 }) {
  const state = {
    current: new THREE.Vector2(0.5, 0.2),
    strength: 1,
    surfaceColor: new THREE.Color(0x1fb0d8),
    deepColor: new THREE.Color(0x0e4466)
  };
  const baseSun = new THREE.Vector3(20, 60, 10);
  const temp = new THREE.Color();
  let visibility = baseFog;

  function update(dt, t, depth) {
    // Slow sun sweep, keeps caustics and lighting from feeling static.
    const a = t * 0.02;
    sun.position.set(
      baseSun.x + Math.cos(a) * 46,
      baseSun.y + Math.sin(a * 0.7) * 7,
      baseSun.z + Math.sin(a) * 30
    );
    sun.intensity = 1.55 + Math.sin(t * 0.11) * 0.15;

    // Variable current: direction and speed both wobble on different periods.
    const angle = t * 0.045 + Math.sin(t * 0.13) * 0.9;
    const speed = (0.42 + Math.sin(t * 0.07) * 0.22) * state.strength;
    state.current.set(Math.cos(angle) * speed, Math.sin(angle) * speed);
    environment.setCurrent(state.current);

    // Depth-based visibility: murkier the deeper you go.
    const d = THREE.MathUtils.clamp(depth / 33, 0, 1);
    visibility += ((baseFog * (0.62 + d * 1.05)) - visibility) * Math.min(1, dt * 1.2);
    if (scene.fog) scene.fog.density = visibility;
    temp.copy(state.surfaceColor).lerp(state.deepColor, d * 0.85);
    scene.background.copy(temp);
    if (scene.fog) scene.fog.color.copy(temp);
  }

  return {
    state,
    update,
    setStrength(v) {
      state.strength = Math.max(0, v);
    }
  };
}
