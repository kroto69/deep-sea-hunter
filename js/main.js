import * as THREE from 'three';
import { createScene } from './scene.js';
import { createEnvironment } from './environment.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { createEcosystem } from './ecosystem.js';
import { Speargun } from './speargun.js';
import { Oxygen } from './oxygen.js';
import { createBoat } from './boat.js';
import { GameAudio } from './audio.js';
import { BubbleTrail, SandPuff } from './fx.js';
import { detectQuality, QUALITY_PRESETS } from './quality.js';
import { CleanupMission } from './cleanup.js';
import { createOcean } from './ocean.js';
import { EventManager, createEventContent } from './events.js';
import { Progression } from './progression.js';
import { Interactions } from './interactions.js';
import { Hub } from './hub.js';
import { OnlineGame } from './online.js';
import { initWalletLogin } from './wallet-login.js';
import { createTutorial } from './tutorial.js';
import { createWelcome } from './welcome.js';

const quality = detectQuality();
const preset = QUALITY_PRESETS[quality];
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: quality !== 'low', powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr));
renderer.setSize(window.innerWidth, window.innerHeight);
// Filmic response + sRGB keeps reef hues saturated instead of washing to grey.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const { scene, camera, sun } = createScene(renderer, preset);
const environment = createEnvironment(scene, { quality });
const ocean = createOcean({ scene, sun, environment, baseFog: preset.fog });
const player = new Player(camera, environment.terrainHeight);
const ecosystem = createEcosystem(scene, player, environment, quality);
const fishSystem = ecosystem.fish;
scene.add(camera);
const speargun = new Speargun(camera, scene, fishSystem, {
  terrainHeight: environment.terrainHeight,
  onImpact: (hit, position) => {
    fishSystem.scareNearby(position, hit ? 22 : 14);
    if (hit) player.addShake(0.15);
  }
});
const boat = createBoat(scene, { x: 0, z: 26 });
const bubbles = new BubbleTrail(scene, quality === 'low' ? 24 : 48);
const sand = new SandPuff(scene, environment.terrainHeight, quality === 'low' ? 16 : 32);
const progression = new Progression();
const oxygen = new Oxygen(progression.oxygenCapacity());
const audio = new GameAudio();
const SPAWN = new THREE.Vector3(0, 24, 20);
camera.position.copy(SPAWN);

const hud = new HUD();
const events = new EventManager({
  quality,
  depth: () => Math.max(0, 36 - camera.position.y),
  zone: () => environment.zoneAt(camera.position.x, camera.position.z).id,
  time: () => simulationTime,
  onStart: (e) => { hud.notify(e.label, 3.2); audio.ui(); },
  onEnd: () => {}
});
for (const ev of createEventContent({ scene, environment, ocean, fishSystem })) events.register(ev);
const cleanupMission = new CleanupMission(environment.debris, hud, audio);
const interactions = new Interactions({
  scene, camera, environment, ecosystem, progression, hud, audio
});
speargun.reload = 0.75 * progression.reloadMultiplier();

const hub = new Hub({
  progression, hud, audio, oxygen,
  onRefill: () => {
    oxygen.max = progression.oxygenCapacity();
    oxygen.value = Math.min(oxygen.value, oxygen.max);
    speargun.reload = 0.75 * progression.reloadMultiplier();
    hud.setOxygen(oxygen.fraction);
    hud.setCash(progression.cash);
  },
  onDive: (zone) => {
    camera.position.set(zone.pos[0], zone.pos[1], zone.pos[2]);
    player.velocity.set(0, 0, 0);
    oxygen.refill();
    oxygen.max = progression.oxygenCapacity();
    const first = progression.visitZone(zone.id);
    progression.data.zone = zone.id;
    progression.save();
    hud.notify(`DIVE · ${zone.name.toUpperCase()}${first ? ' · +50 CR' : ''}`, 3);
    hud.setCash(progression.cash);
    audio.refill();
  }
});
const online = new OnlineGame({hub,progression,hud,fishSystem,camera,environment});
interactions.onPhoto = name => online.conservation('photo', name);
interactions.onRelease = () => online.conservation('release', 'turtle');
let paused = false;
let gameOver = false;
let refilling = false;
let lowBeepTimer = 0;

fishSystem.onCollect = (spec, total) => {
  hud.setFish(total);
  hud.notify(`CAUGHT: ${spec.name.toUpperCase()}`);
  if (online.active) online.capture(spec).catch(error => online.showError(error));
  else progression.addFish(spec);
  hud.setCash(progression.cash);
  audio.hit();
};

const input = new Input(player, {
  onPause: () => togglePause(),
  onFire: () => {
    if (paused || gameOver || hub.open || !document.getElementById('tutorial').classList.contains('hidden') || !document.getElementById('welcome').classList.contains('hidden')) return;
    if (speargun.fire()) {
      fishSystem.scareNearby(camera.position, 18);
      player.addShake(0.2);
      audio.shot();
      audio.reload();
    }
  },
  onAim: (v) => {
    speargun.setAim(v);
    hud.setAiming(v);
  },
  onInteract: () => { if (document.getElementById('tutorial').classList.contains('hidden') && document.getElementById('welcome').classList.contains('hidden')) tryInteract(); },
  onPhoto: () => { if (!hub.open && !paused && !gameOver) interactions.photograph(); },
  onSonar: () => { if (!hub.open && !paused && !gameOver) interactions.scan(); },
  onLight: () => { if (!hub.open && !paused && !gameOver) interactions.toggleLight(); }
});

function togglePause() {
  if (document.getElementById('tutorial').classList.contains('hidden') === false) return;
  if (hub.open) { hub.close(); return; }
  if (gameOver || !progression.data.tutorialComplete && document.getElementById('welcome').classList.contains('hidden') === false) return;
  paused = !paused;
  hud.setPaused(paused);
  if (paused && document.pointerLockElement) document.exitPointerLock();
}

document.getElementById('pause-overlay').addEventListener('click', e => {
  if (e.target.closest('button')) return;
  if (paused) togglePause();
});
document.getElementById('pause-tutorial').addEventListener('click', () => tutorial.open({ resume: true }));
document.getElementById('pause-hub').addEventListener('click', () => { paused = false; hud.setPaused(false); hub.show(); });
document.getElementById('restart-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  location.reload();
});

function tryInteract() {
  if (gameOver || paused) return false;
  if (hub.open) { hub.close(); return true; }
  if (boat.isInZone(camera.position)) {
    if (document.pointerLockElement) document.exitPointerLock();
    hub.show();
    audio.ui();
    return true;
  }
  if (interactions.interact(camera.position)) {
    hud.setCash(progression.cash);
    return true;
  }
  if (cleanupMission.interact(camera.position)) {
    progression.addDebris();
    hud.setCash(progression.cash);
    audio.ui();
    return true;
  }
  return false;
}

function endDive() {
  gameOver = true;
  speargun.reset();
  hud.showGameOver(fishSystem.collected);
  audio.death();
  if (document.pointerLockElement) document.exitPointerLock();
}

const unlockAudio = () => {
  audio.init();
  audio.resume();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// Background music toggle (Deep Ocean, 60%). The track itself starts in
// audio.init() on the first gesture above.
const musicBtn = document.getElementById('music-toggle');
if (musicBtn) musicBtn.addEventListener('click', () => {
  const on = audio.toggleMusic();
  musicBtn.textContent = on ? 'MUSIC ON' : 'MUSIC OFF';
  musicBtn.setAttribute('aria-pressed', String(on));
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr));
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && !paused && !gameOver && document.getElementById('welcome').classList.contains('hidden')) togglePause();
});

const tutorial = createTutorial({ progression, hud, hub, getPaused:()=>paused, setPaused:value=>{paused=value;} });
const walletLogin = initWalletLogin({online, hud});
const welcome = createWelcome({progression, hub, online, walletLogin, tutorial});
window.dshWelcome = welcome;
window.addEventListener('dsh-wallet-change', welcome.render);
window.addEventListener('dsh-session-change', welcome.render);

const clock = new THREE.Clock();
let simulationTime = 0;
window.__dsh = {
  scene, camera, player, fishSystem, ecosystem, speargun, hud, oxygen, boat,
  audio, renderer, environment, quality, cleanupMission, ocean, events, progression, interactions, hub, online
};

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (!paused && !gameOver && !hub.open) {
    simulationTime += dt;
    const t = simulationTime;
    input.update();
    player.update(dt);
    ocean.update(dt, t, Math.max(0, 36 - camera.position.y));
    environment.update(dt, t);
    ecosystem.update(dt, t);
    speargun.update(dt);
    boat.update(t);
    events.update(dt, simulationTime);

    // Camera feedback for nearby large animals.
    let big = events.active?.instance?.interest || null;
    let bigDist = big ? camera.position.distanceTo(big) : Infinity;
    for (const e of ecosystem.creatures.entities) {
      if (e.kind !== 'turtle') continue;
      const d = camera.position.distanceTo(e.mesh.position);
      if (d < bigDist) { bigDist = d; big = e.mesh.position; }
    }
    if (big && bigDist < 9) player.addShake(dt * (9 - bigDist) * 0.25);

    const inZone = boat.isInZone(camera.position);
    const wasRefilling = refilling;
    refilling = inZone;
    if (refilling && !wasRefilling) audio.refill();

    const depth = Math.max(0, 36 - camera.position.y);
    oxygen.update(dt, {
      depth,
      boosting: player.boosting,
      swimming: player.velocity.lengthSq() > 1,
      refilling
    });
    const speed = player.velocity.length();
    bubbles.update(dt, camera.position, player.velocity, speed > 1.2);
    sand.update(dt, camera.position, player.velocity, speed > 2.5);

    if (oxygen.empty) endDive();
    if (oxygen.low && !oxygen.empty) {
      lowBeepTimer -= dt;
      if (lowBeepTimer <= 0) { audio.alarm(); lowBeepTimer = 1.1; }
    } else lowBeepTimer = 0;

    audio.setDepth(depth);
    hud.setOxygen(oxygen.fraction);
    hud.setDepth(depth);
    hud.setWeapon(speargun.status());
    const action = interactions.nearestAction(camera.position, 3);
    const debrisNearby = cleanupMission.nearest(camera.position, 3);
    const hint = inZone ? 'BOAT HUB'
      : action ? action.label
      : debrisNearby ? 'CLEAN DEBRIS' : '';
    hud.setInteract(!!hint, hint);
    interactions.update(dt);
    hud.setCash(online.active ? Number(online.profile?.balance || 0) : progression.cash);
    hud.update(dt);
    document.getElementById('vignette').style.opacity = String(0.45 + (1 - oxygen.fraction) * 0.35);
  }

  renderer.render(scene, camera);
}

animate();
