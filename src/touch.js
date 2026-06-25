import * as THREE from 'three';

// Commandes tactiles pour smartphone / tablette :
// - joystick virtuel (bas gauche) pour se deplacer,
// - glissement sur l'ecran (cote droit) pour regarder,
// - boutons (saut, tir, monter/descendre en vol).
// Pas de pointer lock : on oriente la camera directement.
const LOOK_SENS = 0.0042;
const JOY_RADIUS = 55;
const PITCH_LIMIT = 1.5;

export class TouchControls {
  constructor(camera, player, lookTarget, callbacks = {}) {
    this.camera = camera;
    this.player = player;
    this.lookTarget = lookTarget; // element ou capter le glissement (le canvas)
    this.cb = callbacks;
    this.enabled = false;

    this.yaw = 0;
    this.pitch = 0;
    this.lookId = null;
    this.lastX = 0;
    this.lastY = 0;
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

    this._buildDOM();
    this._wireJoystick();
    this._wireLook();
  }

  _btn(label, cls) {
    const b = document.createElement('button');
    b.className = `touch-btn ${cls || ''}`;
    b.textContent = label;
    return b;
  }

  _buildDOM() {
    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.style.display = 'none';

    // Joystick.
    this.joyBase = document.createElement('div');
    this.joyBase.className = 'touch-joy';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'touch-knob';
    this.joyBase.appendChild(this.joyKnob);
    this.root.appendChild(this.joyBase);

    // Boutons d'action (bas droite).
    this.btnJump = this._btn('⤒', 'touch-jump');
    this.btnFire = this._btn('●', 'touch-fire');
    this.btnUp = this._btn('▲', 'touch-up');
    this.btnDown = this._btn('▼', 'touch-down');
    this.root.appendChild(this.btnFire);
    this.root.appendChild(this.btnJump);
    this.root.appendChild(this.btnUp);
    this.root.appendChild(this.btnDown);

    // Pause (haut gauche).
    this.btnPause = this._btn('II', 'touch-pause');
    this.root.appendChild(this.btnPause);

    this.btnFire.style.display = 'none';
    this.btnUp.style.display = 'none';
    this.btnDown.style.display = 'none';

    document.body.appendChild(this.root);

    this._hold(this.btnJump, () => { this.player.touch.jump = true; }, () => { this.player.touch.jump = false; });
    this._hold(this.btnUp, () => { this.player.touch.up = 1; }, () => { this.player.touch.up = 0; });
    this._hold(this.btnDown, () => { this.player.touch.up = -1; }, () => { this.player.touch.up = 0; });
    this.btnFire.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.cb.onFire?.(); });
    this.btnPause.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.cb.onPause?.(); });
  }

  _hold(el, down, up) {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); down(); });
    el.addEventListener('pointerup', (e) => { e.preventDefault(); up(); });
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  _wireJoystick() {
    let active = false;
    const rect = () => this.joyBase.getBoundingClientRect();
    const set = (cx, cy) => {
      const r = rect();
      let dx = cx - (r.left + r.width / 2);
      let dy = cy - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, JOY_RADIUS);
      dx = (dx / len) * cl;
      dy = (dy / len) * cl;
      this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.player.touch.r = dx / JOY_RADIUS;
      this.player.touch.f = -dy / JOY_RADIUS;
    };
    const reset = () => {
      active = false;
      this.joyKnob.style.transform = 'translate(0,0)';
      this.player.touch.r = 0;
      this.player.touch.f = 0;
    };
    this.joyBase.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      active = true;
      this.joyBase.setPointerCapture(e.pointerId);
      set(e.clientX, e.clientY);
    });
    this.joyBase.addEventListener('pointermove', (e) => { if (active) set(e.clientX, e.clientY); });
    this.joyBase.addEventListener('pointerup', reset);
    this.joyBase.addEventListener('pointercancel', reset);
  }

  _wireLook() {
    const t = this.lookTarget;
    t.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.lookId !== null) return;
      this.lookId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    t.addEventListener('pointermove', (e) => {
      if (!this.enabled || e.pointerId !== this.lookId) return;
      this.yaw -= (e.clientX - this.lastX) * LOOK_SENS;
      this.pitch -= (e.clientY - this.lastY) * LOOK_SENS;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this._euler.set(this.pitch, this.yaw, 0);
      this.camera.quaternion.setFromEuler(this._euler);
    });
    const end = (e) => { if (e.pointerId === this.lookId) this.lookId = null; };
    t.addEventListener('pointerup', end);
    t.addEventListener('pointercancel', end);
  }

  setEnabled(b) {
    this.enabled = b;
    this.root.style.display = b ? 'block' : 'none';
    if (b) {
      // Reprend l'orientation actuelle de la camera.
      this._euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.yaw = this._euler.y;
      this.pitch = this._euler.x;
    } else {
      this.player.touch.f = 0;
      this.player.touch.r = 0;
      this.player.touch.up = 0;
      this.player.touch.jump = false;
    }
  }

  setFlying(b) {
    this.btnUp.style.display = b ? 'flex' : 'none';
    this.btnDown.style.display = b ? 'flex' : 'none';
  }

  setCombat(b) {
    this.btnFire.style.display = b ? 'flex' : 'none';
  }
}
