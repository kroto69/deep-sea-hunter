// Optional shoreline-style cleanup loop: interact only while close to debris.
export class CleanupMission {
  constructor(debris, hud, audio) {
    this.debris = debris;
    this.hud = hud;
    this.audio = audio;
    this.initialCount = debris.positions.length;
    this.cleaned = new Set();
    this.active = false;
  }

  nearest(position, radius = 3) {
    let best = null, bestD = radius * radius;
    for (const item of this.debris.positions) {
      if (this.cleaned.has(item)) continue;
      const dx = item.x - position.x, dz = item.z - position.z;
      const dy = item.y - position.y;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < bestD) { best = item; bestD = d2; }
    }
    return best;
  }

  interact(position) {
    const item = this.nearest(position);
    if (!item) return false;
    this.cleaned.add(item);
    this.debris.remove(item);
    this.audio?.refill();
    this.hud.notify(`DEBRIS REMOVED · ${this.cleaned.size}/${this.initialCount}`);
    return true;
  }
}
