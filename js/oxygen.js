// Oxygen budget. Max capacity, depth-scaled drain, low warning, refill at boat.
export class Oxygen {
  constructor(max = 100) {
    this.max = max;
    this.value = max;
    this.empty = false;
  }

  update(dt, { depth, boosting, swimming, refilling }) {
    if (this.empty) return;
    if (refilling) {
      this.value = Math.min(this.max, this.value + dt * 35);
      return;
    }
    // Base drain ~0.42/s at surface, ~3x at the deepest point.
    const depthFactor = 0.5 + Math.max(0, Math.min(1, depth / 35)) * 2.5;
    const effort = (boosting ? 1.8 : 1) * (swimming ? 1.15 : 0.85);
    this.value -= dt * 0.42 * depthFactor * effort;
    if (this.value <= 0) {
      this.value = 0;
      this.empty = true;
    }
  }

  get fraction() { return this.value / this.max; }
  get low() { return this.fraction < 0.25; }

  refill() { this.value = this.max; this.empty = false; }

  reset() { this.value = this.max; this.empty = false; }
}
