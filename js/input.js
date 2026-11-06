// Input: desktop keyboard/mouse + mobile touch. Exposes normalized state to Player.

export class Input {
  constructor(player, callbacks) {
    this.player = player;
    this.callbacks = callbacks; // { onPause, onFire, onAim }
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    this.keys = {};
    this.joystickVec = { x: 0, y: 0 };
    this.joyPointerId = null;
    this.lookPointerId = null;
    this.lastLook = { x: 0, y: 0 };
    this.buttonState = { up: false, down: false, boost: false, fire: false };

    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    this._bindDesktop();
    if (this.isTouch) this._bindMobile();
  }

  _bindDesktop() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.repeat) return;
      if (e.code === 'Escape') this.callbacks.onPause();
      if (e.code === 'KeyE') this.callbacks.onInteract();
      if (e.code === 'KeyP') this.callbacks.onPhoto?.();
      if (e.code === 'KeyR') this.callbacks.onSonar?.();
      if (e.code === 'KeyF') this.callbacks.onLight?.();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    const canvas = document.getElementById('game');
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas && !this.isTouch) {
        canvas.requestPointerLock();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.player.rotate(e.movementX, e.movementY);
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) this.callbacks.onFire();
      if (e.button === 2) this.callbacks.onAim(true);
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.callbacks.onAim(false);
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _bindMobile() {
    document.getElementById('mobile-ui').classList.remove('hidden');

    const joyZone = document.getElementById('joystick-zone');
    const joyBase = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    const lookZone = document.getElementById('look-zone');

    const joyRect = () => joyBase.getBoundingClientRect();

    joyZone.addEventListener('pointerdown', (e) => {
      if (this.joyPointerId !== null) return;
      this.joyPointerId = e.pointerId;
      try { joyZone.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      this._updateJoystick(e, joyRect(), knob);
    });
    joyZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyPointerId) return;
      this._updateJoystick(e, joyRect(), knob);
    });
    const joyEnd = (e) => {
      if (e.pointerId !== this.joyPointerId) return;
      this.joyPointerId = null;
      this.joystickVec = { x: 0, y: 0 };
      knob.style.transform = 'translate(-50%, -50%)';
    };
    joyZone.addEventListener('pointerup', joyEnd);
    joyZone.addEventListener('pointercancel', joyEnd);
    joyZone.addEventListener('lostpointercapture', joyEnd);

    lookZone.addEventListener('pointerdown', (e) => {
      if (this.lookPointerId !== null) return;
      this.lookPointerId = e.pointerId;
      try { lookZone.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      this.lastLook = { x: e.clientX, y: e.clientY };
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookPointerId) return;
      this.player.rotate(e.clientX - this.lastLook.x, e.clientY - this.lastLook.y);
      this.lastLook = { x: e.clientX, y: e.clientY };
    });
    const lookEnd = (e) => {
      if (e.pointerId !== this.lookPointerId) return;
      this.lookPointerId = null;
    };
    lookZone.addEventListener('pointerup', lookEnd);
    lookZone.addEventListener('pointercancel', lookEnd);
    lookZone.addEventListener('lostpointercapture', lookEnd);

    // Buttons: hold-to-act
    const bind = (id, name) => {
      const el = document.getElementById(id);
      const pointers = new Set();
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        pointers.add(e.pointerId);
        try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or ended pointer */ }
        this.buttonState[name] = true;
        if (name === 'fire') this.callbacks.onFire();
      });
      const off = (e) => { pointers.delete(e.pointerId); this.buttonState[name] = pointers.size > 0; };
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
      window.addEventListener('blur', () => pointers.clear());
      document.addEventListener('visibilitychange', () => { if (document.hidden) pointers.clear(); });
    };
    bind('btn-up', 'up');
    bind('btn-down', 'down');
    bind('btn-boost', 'boost');
    bind('btn-fire', 'fire');

    const aimBtn = document.getElementById('btn-aim');
    aimBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.callbacks.onAim(true);
    });
    const aimOff = () => this.callbacks.onAim(false);
    aimBtn.addEventListener('pointerup', aimOff);
    aimBtn.addEventListener('pointercancel', aimOff);
    aimBtn.addEventListener('pointerleave', aimOff);

    const tap = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        fn();
      });
    };
    tap('btn-act', () => this.callbacks.onInteract());
    tap('btn-light', () => this.callbacks.onLight?.());
    tap('btn-scan', () => this.callbacks.onSonar?.());
    tap('btn-photo', () => this.callbacks.onPhoto?.());
  }

  _updateJoystick(e, rect, knob) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = rect.width / 2;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = dx / len * max; dy = dy / len * max; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.joystickVec = { x: dx / max, y: -dy / max }; // y inverted: up = forward
  }

  reset() {
    this.keys = {};
    this.joystickVec = { x: 0, y: 0 };
    this.joyPointerId = this.lookPointerId = null;
    for (const name of Object.keys(this.buttonState)) this.buttonState[name] = false;
    const knob = document.getElementById('joystick-knob');
    if (knob) knob.style.transform = 'translate(-50%, -50%)';
    this.callbacks.onAim(false);
    this.update();
  }

  update() {
    const p = this.player;
    if (this.isTouch) {
      p.moveInput.set(this.joystickVec.x, this.joystickVec.y);
      p.verticalInput = (this.buttonState.up ? 1 : 0) + (this.buttonState.down ? -1 : 0);
      p.boost = this.buttonState.boost;
    } else {
      const k = this.keys;
      p.moveInput.set(
        (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0),
        (k['KeyW'] ? 1 : 0) - (k['KeyS'] ? 1 : 0)
      );
      p.verticalInput = (k['Space'] ? 1 : 0) + (k['ControlLeft'] || k['ControlRight'] ? -1 : 0);
      p.boost = !!(k['ShiftLeft'] || k['ShiftRight']);
    }
  }
}
