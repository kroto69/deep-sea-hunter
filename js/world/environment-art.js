import * as THREE from 'three';

export const PALETTE = Object.freeze({
  ocean: 0x123e56, turquoise: 0x518f91, sand: 0xd6c6a1,
  deepSand: 0xa0a58f, stone: 0x8d9087, stoneShade: 0x626f70,
  grass: 0x758973, shell: 0xe2d3bb
});

// Closed, stratified eight-sided outcrop: broad foot, ledge, offset crown.
export function limestoneGeometry(variation = 0) {
  const rings = [[-0.35, 0.78], [0.05, 1.12], [0.48, 0.98], [0.8, 0.57]];
  const vertices = [], indices = [];
  for (let r = 0; r < rings.length; r++) {
    const [y, radius] = rings[r];
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const edge = 1 + Math.sin(i * 2.3 + variation) * 0.12;
      vertices.push(Math.cos(a) * radius * edge + r * 0.055,
        y + Math.sin(i * 1.7 + variation) * 0.045,
        Math.sin(a) * radius * edge * 0.76);
      if (r < 3) {
        const n = r * 8 + i, next = r * 8 + (i + 1) % 8;
        indices.push(n, n + 8, next, next, n + 8, next + 8);
      }
    }
  }
  for (let i = 1; i < 7; i++) indices.push(0, i, i + 1, 24, 24 + i + 1, 24 + i);
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  indexed.setIndex(indices);
  const geo = indexed.toNonIndexed(); indexed.dispose();
  geo.computeVertexNormals();
  const colors = [], p = geo.attributes.position;
  const low = new THREE.Color(PALETTE.stoneShade), high = new THREE.Color(PALETTE.stone), color = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    color.copy(low).lerp(high, THREE.MathUtils.clamp((y + 0.35) / 1.15, 0, 1));
    for (let j = 0; j < 3; j++) colors.push(color.r, color.g, color.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

// Ribbed scallop fan, raised center ridge and closed underside; 32 triangles.
export function scallopGeometry() {
  const positions = [], colors = [];
  const cream = new THREE.Color(PALETTE.shell), shade = new THREE.Color(0xb6a18c);
  const edge = i => {
    const a = -1.28 + i / 16 * 2.56;
    const radius = i % 2 ? 0.26 : 0.245;
    return [Math.sin(a) * radius, i % 2 ? 0.035 : 0.012, Math.cos(a) * radius];
  };
  for (let i = 0; i < 16; i++) {
    const a = edge(i), b = edge(i + 1);
    positions.push(0, 0.055, 0, ...b, ...a, 0, 0, 0, ...a, ...b);
    for (let j = 0; j < 6; j++) {
      const c = j < 3 && i % 2 ? cream : shade;
      colors.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}
