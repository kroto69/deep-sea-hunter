import * as THREE from 'three';

// Merge [{geo, matrix, color}] into one non-indexed geometry with baked vertex colours.
// Keeps each coral/debris type at a single draw call when instanced.
export function mergeParts(parts) {
  const positions = [];
  const colors = [];
  const tmp = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  for (const part of parts) {
    const src = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    if (part.matrix) src.applyMatrix4(part.matrix);
    normalMatrix.getNormalMatrix(part.matrix || new THREE.Matrix4());

    const pos = src.attributes.position;
    const srcCol = part.color == null ? src.attributes.color : null;
    const baseColor = new THREE.Color(part.color ?? 0xffffff);
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i);
      positions.push(tmp.x, tmp.y, tmp.z);
      if (srcCol) colors.push(srcCol.getX(i), srcCol.getY(i), srcCol.getZ(i));
      else {
        const facet = 0.72 + Math.max(0, tmp.normalize().y) * 0.28;
        // Warm, contrast-preserving facet shading (not a darkening multiply).
        col.copy(baseColor).multiplyScalar(facet).lerp(baseColor, 0.55);
        colors.push(col.r, col.g, col.b);
      }
    }
    src.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeVertexNormals();
  return merged;
}

// Small helper so coral/debris builders stay declarative.
export function part(geo, color, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale)
  );
  return { geo, color, matrix: m };
}


// Standard vertex-colour material for merged procedural props.
export function propMaterial({ flatShading = true, roughness = 0.95 } = {}) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading, roughness });
}
