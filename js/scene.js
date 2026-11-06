import * as THREE from 'three';

export function createScene(renderer, { fogDensity = 0.026, far = 300 } = {}) {
  const scene = new THREE.Scene();

  const SKY = 0x1c7fa8;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.FogExp2(0x1c7fa8, fogDensity);

  const camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.1, far
  );

  // Lighting: warm sun from above, cool fill from the deep
  const hemi = new THREE.HemisphereLight(0xc4efff, 0x2f6a68, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xe8f7ff, 1.7);
  sun.position.set(20, 60, 10);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0x5b9fb5, 0.7);
  scene.add(ambient);
  // Soft bounce from the sandy floor so the seabed is not black from below
  const bounce = new THREE.DirectionalLight(0xe0c79a, 0.5);
  bounce.position.set(-10, -30, -20);
  scene.add(bounce);
  // Warm key from the reef side keeps coral reds from going grey in blue light.
  const warm = new THREE.DirectionalLight(0xffd9a8, 0.35);
  warm.position.set(-40, 12, 30);
  scene.add(warm);

  return { scene, camera, sun, hemi, ambient };
}
