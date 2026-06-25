import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 9;
const RUN_SPEED = 16;
const GRAVITY = 26;
const JUMP_SPEED = 9;

// Sur un terrain heightmap, le joueur suit la surface : pas de murs a gerer,
// juste la gravite et le collage au sol.
export class Player {
  constructor(camera, domElement, world) {
    this.camera = camera;
    this.world = world;
    this.controls = new PointerLockControls(camera, domElement);

    this.position = new THREE.Vector3(); // pieds
    this.velocity = new THREE.Vector3();
    this.onGround = false;
    this.flying = false;

    // Entrees tactiles (joystick + boutons), additionnees au clavier.
    this.touch = { f: 0, r: 0, up: 0, jump: false };

    this.keys = Object.create(null);
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);

    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
  }

  spawn(x, z) {
    this.position.set(x + 0.5, this.world.getHeight(x, z) + 2, z + 0.5);
    this.velocity.set(0, 0, 0);
    this._syncCamera();
  }

  setFlying(b) {
    this.flying = b;
    this.velocity.set(0, 0, 0);
  }

  update(dt) {
    if (!this.controls.isLocked) return;
    dt = Math.min(dt, 0.05);

    const f = (this.keys['KeyW'] || this.keys['KeyZ'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0) + this.touch.f;
    const r = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['KeyQ'] ? 1 : 0) + this.touch.r;

    if (this.flying) {
      this._fly(f, r, dt);
      return;
    }

    this.camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    this._forward.normalize();
    this._right.crossVectors(this._forward, this._up).normalize();

    this._wish.set(0, 0, 0)
      .addScaledVector(this._forward, f)
      .addScaledVector(this._right, r);
    if (this._wish.lengthSq() > 0) this._wish.normalize();

    const speed = this.keys['ShiftLeft'] || this.keys['ShiftRight'] ? RUN_SPEED : WALK_SPEED;
    const p = this.position;

    p.x += this._wish.x * speed * dt;
    p.z += this._wish.z * speed * dt;

    this.velocity.y -= GRAVITY * dt;
    if ((this.keys['Space'] || this.touch.jump) && this.onGround) {
      this.velocity.y = JUMP_SPEED;
      this.onGround = false;
    }
    p.y += this.velocity.y * dt;

    const ground = this.world.getHeight(p.x, p.z);
    if (p.y <= ground) {
      p.y = ground;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    this._syncCamera();
  }

  // Vol libre : sans gravite, on se deplace dans la direction du regard
  // (Espace = monter, Ctrl/C = descendre, Maj = boost).
  _fly(f, r, dt) {
    this.camera.getWorldDirection(this._forward);
    this._right.crossVectors(this._forward, this._up).normalize();
    const up = (this.keys['Space'] ? 1 : 0)
      - (this.keys['ControlLeft'] || this.keys['KeyC'] ? 1 : 0)
      + this.touch.up;

    this._wish.set(0, 0, 0)
      .addScaledVector(this._forward, f)
      .addScaledVector(this._right, r);
    this._wish.y += up;
    if (this._wish.lengthSq() > 0) this._wish.normalize();

    const speed = (this.keys['ShiftLeft'] || this.keys['ShiftRight'] ? RUN_SPEED : WALK_SPEED) * 1.8;
    this.position.addScaledVector(this._wish, speed * dt);
    this.velocity.set(0, 0, 0);
    this.onGround = false;
    this._syncCamera();
  }

  _syncCamera() {
    this.camera.position.set(this.position.x, this.position.y + EYE_HEIGHT, this.position.z);
  }
}
