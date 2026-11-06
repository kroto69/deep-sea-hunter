import * as THREE from 'three';

// Surface dive boat, one shared habitat marker for players and the HUD.
export function createBoat(scene, { x = 0, z = 26, surfaceY = 36 } = {}) {
  const boat = new THREE.Group();
  boat.position.set(x, surfaceY, z);
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.85, flatShading: true });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2b6fa8, roughness: 0.8, flatShading: true });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xa9784a, roughness: 1, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fd4e8, roughness: 0.2, metalness: 0.2, flatShading: true });

  const hull = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.5, 7, 6, 1, false, 0, Math.PI), hullMat);
  hull.rotation.z = Math.PI / 2; hull.rotation.y = Math.PI / 2; hull.scale.set(1, 1, 0.8); boat.add(hull);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 1.95, 0.5, 6, 1, false, 0, Math.PI), trimMat);
  stripe.rotation.z = Math.PI / 2; stripe.rotation.y = Math.PI / 2; stripe.scale.set(1, 1, 0.8); stripe.position.y = 0.35; boat.add(stripe);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.18, 3.2), deckMat); deck.position.y = 0.5; boat.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 2.2), hullMat); cabin.position.set(-0.6, 1.3, 0); boat.add(cabin);
  const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.7, 2.25), glassMat); windowMesh.position.set(-0.6, 1.55, 0); boat.add(windowMesh);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 5), trimMat); mast.position.set(2.2, 2.6, 0); boat.add(mast);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ color: 0xff9f3c, side: THREE.DoubleSide }));
  flag.position.set(2.85, 4.2, 0); boat.add(flag);
  const ladderMat = new THREE.MeshStandardMaterial({ color: 0xb9c6cf, roughness: 0.7, flatShading: true });
  for (let i = 0; i < 5; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.12), ladderMat); rung.position.set(2.9, -0.3 - i * 0.55, 1.4); boat.add(rung);
  }
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.9, 0.08), ladderMat); rail.position.set(2.9, -1.45, 1.4 + side * 0.33); boat.add(rail);
  }
  scene.add(boat);

  const home = new THREE.Vector3(x, surfaceY + 0.5, z);
  return {
    group: boat,
    home,
    radius: 9,
    isInZone(position) {
      return Math.hypot(position.x - x, position.z - z) < this.radius && position.y > surfaceY - 9;
    },
    update(t) {
      boat.position.y = surfaceY + Math.sin(t * 0.9) * 0.22;
      boat.rotation.z = Math.sin(t * 0.7) * 0.02;
      boat.rotation.x = Math.cos(t * 0.6) * 0.015;
      flag.rotation.y = Math.sin(t * 2.2) * 0.35;
    },
    dispose() {
      boat.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
      scene.remove(boat);
    }
  };
}
