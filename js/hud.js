export class HUD {
  constructor() {
    this.oxygenBar = document.getElementById('oxygen-bar');
    this.oxygenValue = document.getElementById('oxygen-value');
    this.depthValue = document.getElementById('depth-value');
    this.fishCount = document.getElementById('fish-count');
    this.weaponStatus = document.getElementById('weapon-status');
    this.interactHint = document.getElementById('interact-hint');
    this.noticeEl = document.getElementById('notice');
    this.crosshair = document.getElementById('crosshair');
    this.gameOverOverlay = document.getElementById('gameover-overlay');
    this.gameOverFish = document.getElementById('go-fish');
    this.hintText = 'SURFACE';
    this.noticeTimer = 0;
    this.oxygenWarning = document.getElementById('oxygen-warning');
    this.pauseOverlay = document.getElementById('pause-overlay');
  }

  setOxygen(frac) {
    const value=Math.max(0,Math.min(1,frac));
    this.oxygenBar.style.width = `${value * 100}%`;
    this.oxygenValue.textContent=`${Math.round(value*100)}%`;
    this.oxygenBar.classList.toggle('low', frac < 0.25);
    this.oxygenWarning.classList.toggle('hidden', frac >= 0.25);
  }

  setDepth(d) {
    this.depthValue.textContent = Math.max(0, Math.round(d));
  }

  setCash(n) {
    if (this._cash === n) return;
    this._cash = n;
    const el = document.getElementById('cash-value');
    if (el) el.textContent = `${n} CR`;
  }

  setFish(n) {
    this.fishCount.textContent = `FISH: ${n}`;
  }

  setWeapon(text) {
    this.weaponStatus.textContent = text;
  }

  notify(text, seconds = 1.6) {
    this.noticeEl.textContent = text;
    this.noticeEl.classList.remove('hidden');
    this.noticeTimer = seconds;
  }

  setAiming(value) {
    this.crosshair.classList.toggle('aiming', value);
  }

  update(dt) {
    if (this.noticeTimer > 0) {
      this.noticeTimer -= dt;
      if (this.noticeTimer <= 0) this.noticeEl.classList.add('hidden');
    }
  }

  setInteract(visible, text = '') {
    if (text !== this.hintText) {
      this.hintText = text;
      this.interactHint.textContent = text ? `[E] ${text}` : '';
    }
    this.interactHint.classList.toggle('hidden', !visible);
  }

  showGameOver(fishCount) {
    this.gameOverFish.textContent = String(fishCount);
    this.gameOverOverlay.classList.remove('hidden');
  }

  hideGameOver() {
    this.gameOverOverlay.classList.add('hidden');
  }

  setPaused(paused) {
    this.pauseOverlay.classList.toggle('hidden', !paused);
  }
}
