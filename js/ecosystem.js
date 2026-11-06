import { FishSystem } from './fish.js';
import { createCreatures } from './creatures.js';

export function createEcosystem(scene, player, environment, quality) {
  const fish = new FishSystem(scene, player, environment, { quality });
  const creatures = createCreatures({
    group: environment.group,
    world: {
      terrainHeight: environment.terrainHeight,
      zoneAt: environment.zoneAt,
      debris: environment.debris
    },
    player,
    quality,
    rand: environment.rand
  });
  return {
    fish,
    creatures,
    photoSubjects() {
      const fish = this.fish.fish.filter(f => f.alive)
        .map(f => ({ name: f.spec.name, position: f.fish.position, radius: f.spec.size }));
      return fish.concat(this.creatures.photoSubjects());
    },
    update(dt, t) {
      fish.update(dt);
      creatures.update(dt, t);
    },
    dispose() { fish.dispose(); creatures.dispose(); }
  };
}
