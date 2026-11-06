// Graphics presets. Chosen once at boot; counts and DPR scale with it.
export const QUALITY_PRESETS = {
  low: { dpr: 1.2, fogDensity: 0.038, far: 180, particles: 0.35 },
  medium: { dpr: 1.5, fogDensity: 0.030, far: 240, particles: 0.7 },
  high: { dpr: 2.0, fogDensity: 0.026, far: 300, particles: 1.0 }
};

export function detectQuality() {
  const q = new URLSearchParams(location.search).get('quality');
  if (q && QUALITY_PRESETS[q]) return q;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const mem = navigator.deviceMemory || 4;
  if (coarse && mem <= 4) return 'low';
  if (coarse) return 'medium';
  return 'high';
}
