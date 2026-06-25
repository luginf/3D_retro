import * as THREE from 'three';

// Commandes tactiles (smartphone / tablette) :
// - joystick virtuel (bas gauche) pour se deplacer,
// - glissement sur l'ecran pour regarder,
// - boutons (saut, tir, monter/descendre, pause).
// Les controles sont dessines sur des canvas basse resolution puis agrandis
// (image-rendering: pixelated) pour coller a la resolution du slider "Pixels".
const LOOK_SENS = 0.0042;
const JOY_RADIUS = 55;
const PITCH_LIMIT = 1.5;
const JOY = 132;
const KNOB = 58;
const BTN = 64;
const PAUSE = 48;

function drawDisc(ctx, n, fill, stroke, glyph, glyphColor) {
  ctx.clearRect(0, 0, n, n);
  const c = n / 2;
  const r = n / 2 - 1;
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(1, Math.round(n * 0.08));
  ctx.strokeStyle = stroke;
  ctx.beginPath(); ctx.arc(c, c, r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
  if (glyph) {
    ctx.fillStyle = glyphColor || '#cfe6f5';
    ctx.font = `bold ${Math.round(n * 0.5)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, c, c + n * 0.04);
  }
}

export class TouchControls {
  constructor(camera, player, lookTarget, callbacks = {}) {
    this.camera = camera;
    this.player = player;
    this.lookTarget = lookTarget;
    this.cb = callbacks;
    this.enabled = false;
    this.scale = 0.5; // resolution interne des controles (= slider Pixels)

    this.yaw = 0;
    this.pitch = 0;
    this.lookId = null;
    this.lastX = 0;
    this.lastY = 0;
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._controls = []; // { cv, size, opts, fixedSize }

    this._buildDOM();
    this._redraw();
    this._wireJoystick();
    this._wireLook();
  }

  _ctl(cls, size, opts, fixedSize) {
    const el = document.createElement('div');
    el.className = `touch-ctl ${cls}`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    const cv = document.createElement('canvas');
    cv.className = 'touch-bg';
    el.appendChild(cv);
    this._controls.push({ cv, size, opts, fixedSize: !!fixedSize });
    return el;
  }

  _buildDOM() {
    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.style.display = 'none';

    // Joystick : base + pommeau (canvas separe, deplace en transform).
    this.joyBase = this._ctl('touch-joy', JOY,
      { fill: 'rgba(10,28,46,0.5)', stroke: 'rgba(127,194,230,0.85)' });
    this.joyKnob = document.createElement('canvas');
    this.joyKnob.className = 'touch-knob-cv';
    this.joyKnob.style.width = `${KNOB}px`;
    this.joyKnob.style.height = `${KNOB}px`;
    this.joyKnob.style.left = '50%';
    this.joyKnob.style.top = '50%';
    this.joyKnob.style.transform = 'translate(-50%, -50%)';
    this.joyBase.appendChild(this.joyKnob);
    this._controls.push({ cv: this.joyKnob, size: KNOB, opts: { fill: 'rgba(127,194,230,0.9)', stroke: '#2f7fb5' }, fixedSize: true });
    this.root.appendChild(this.joyBase);

    this.btnFire = this._ctl('touch-fire', BTN, { fill: 'rgba(74,26,26,0.75)', stroke: '#bb3355', glyph: '●', glyphColor: '#ffd0c4' });
    this.btnJump = this._ctl('touch-jump', BTN, { fill: 'rgba(12,34,54,0.7)', stroke: '#2f7fb5', glyph: '↑' });
    this.btnUp = this._ctl('touch-up', BTN, { fill: 'rgba(12,34,54,0.7)', stroke: '#2f7fb5', glyph: '▲' });
    this.btnDown = this._ctl('touch-down', BTN, { fill: 'rgba(12,34,54,0.7)', stroke: '#2f7fb5', glyph: '▼' });
    this.btnPause = this._ctl('touch-pause', PAUSE, { fill: 'rgba(12,34,54,0.7)', stroke: '#2f7fb5', glyph: 'II' });
    this.root.appendChild(this.btnFire);
    this.root.appendChild(this.btnJump);
    this.root.appendChild(this.btnUp);
    this.root.appendChild(this.btnDown);
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

  // Redessine tous les canvas a la resolution interne courante (this.scale).
  _redraw() {
    for (const e of this._controls) {
      const n = Math.max(8, Math.round(e.size * this.scale));
      e.cv.width = n;
      e.cv.height = n;
      drawDisc(e.cv.getContext('2d'), n, e.opts.fill, e.opts.stroke, e.opts.glyph, e.opts.glyphColor);
    }
  }

  setPixelScale(s) {
    this.scale = s;
    this._redraw();
  }

  _hold(el, down, up) {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); down(); });
    el.addEventListener('pointerup', (e) => { e.preventDefault(); up(); });
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  // Suivi global par pointerId (sans setPointerCapture, capricieux sur mobile).
  _wireJoystick() {
    let joyId = null;
    const move = (cx, cy) => {
      const r = this.joyBase.getBoundingClientRect();
      let dx = cx - (r.left + r.width / 2);
      let dy = cy - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy) || 1;
      const cl = Math.min(len, JOY_RADIUS);
      dx = (dx / len) * cl;
      dy = (dy / len) * cl;
      this.joyKnob.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
      this.player.touch.r = dx / JOY_RADIUS;
      this.player.touch.f = -dy / JOY_RADIUS;
    };
    const reset = () => {
      joyId = null;
      this.joyKnob.style.transform = 'translate(-50%, -50%)';
      this.player.touch.r = 0;
      this.player.touch.f = 0;
    };
    this.joyBase.addEventListener('pointerdown', (e) => {
      if (!this.enabled || joyId !== null) return;
      e.preventDefault();
      e.stopPropagation();
      joyId = e.pointerId;
      move(e.clientX, e.clientY);
    });
    window.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) move(e.clientX, e.clientY); });
    window.addEventListener('pointerup', (e) => { if (e.pointerId === joyId) reset(); });
    window.addEventListener('pointercancel', (e) => { if (e.pointerId === joyId) reset(); });
  }

  _wireLook() {
    this.lookTarget.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.lookId !== null) return;
      this.lookId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    window.addEventListener('pointermove', (e) => {
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
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  setEnabled(b) {
    this.enabled = b;
    this.root.style.display = b ? 'block' : 'none';
    if (b) {
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
    this.btnUp.style.display = b ? 'block' : 'none';
    this.btnDown.style.display = b ? 'block' : 'none';
  }

  setCombat(b) {
    this.btnFire.style.display = b ? 'block' : 'none';
  }
}
