import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MAX_ANIMALS = 10;
const SPAWN_INTERVAL = 2.4;
const SPAWN_RADIUS = 45;
const GUN_RANGE = 120;
const MELEE_RANGE = 3.6;
const MAG_SIZE = 8;
const RELOAD_TIME = 1.2;
const SWING_DUR = 0.4;

// Types d'animaux : PV, vitesse, degats au joueur, intervalle de taille, teinte.
const TYPES = {
  normal: { hp: 1, speed: 3.6, damage: 12, scale: [0.85, 1.4], color: 0xffffff },
  fast: { hp: 1, speed: 6.2, damage: 8, scale: [0.6, 0.85], color: 0xff9e86 },
  tough: { hp: 3, speed: 2.3, damage: 22, scale: [1.4, 1.9], color: 0x9fb6c8 },
};

function box(w, h, d, x, y, z) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}
function tint(geo, r, g, b) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = r; arr[i * 3 + 1] = g; arr[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return geo;
}

// Quadrupede low-poly. Tete en -Z pour que lookAt l'oriente vers la cible.
function buildBeastGeometry() {
  return mergeGeometries([
    tint(box(1.4, 0.8, 0.8, 0, 0.75, 0), 0.46, 0.28, 0.16),
    tint(box(0.55, 0.55, 0.55, 0, 0.85, -0.85), 0.38, 0.22, 0.12),
    tint(box(0.2, 0.7, 0.2, 0.45, 0.35, -0.45), 0.30, 0.18, 0.10),
    tint(box(0.2, 0.7, 0.2, -0.45, 0.35, -0.45), 0.30, 0.18, 0.10),
    tint(box(0.2, 0.7, 0.2, 0.45, 0.35, 0.45), 0.30, 0.18, 0.10),
    tint(box(0.2, 0.7, 0.2, -0.45, 0.35, 0.45), 0.30, 0.18, 0.10),
  ], false);
}

export class Combat {
  constructor(scene, camera, world, player) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.player = player;

    this.enabled = false;
    this.weapon = 'gun';
    this.swordEnabled = false; // epee desactivee pour le moment (code conserve)
    this.recoilT = 0;
    this.animals = []; // { mesh, type, hp, speed, damage }
    this.spawnTimer = SPAWN_INTERVAL;
    this.score = 0;
    this.health = 100;

    this.ammo = MAG_SIZE;
    this.reloading = false;
    this.reloadT = 0;

    this.beastGeo = buildBeastGeometry();
    this.beastMats = {};
    for (const t of Object.keys(TYPES)) {
      this.beastMats[t] = new THREE.MeshPhongMaterial({
        color: TYPES[t].color, vertexColors: true, flatShading: true, shininess: 0,
      });
    }

    this.raycaster = new THREE.Raycaster();
    this._dir = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this._tmp = new THREE.Vector3();

    this._buildViewmodels();
    this._buildEffects();

    this.hud = document.createElement('div');
    this.hud.id = 'combat-hud';
    this.hud.style.display = 'none';
    document.body.appendChild(this.hud);

    this.swingT = 0;
    this.flashT = 0;
    this.tracer = null;
    this.tracerT = 0;

    window.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    window.addEventListener('mousedown', (e) => {
      if (this.enabled && this.player.controls.isLocked && e.button === 2) this._attack();
    });
    window.addEventListener('wheel', () => {
      if (this.enabled && this.player.controls.isLocked) this._switchWeapon();
    }, { passive: true });
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code === 'Digit1') this._setWeapon('gun');
      else if (e.code === 'Digit2') this._setWeapon('sword');
      else if (e.code === 'KeyR') this._reload();
    });
  }

  // --- Armes en vue -------------------------------------------------------
  _buildViewmodels() {
    // Pistolet low-poly plus detaille : corps, canon, viseur, crosse, poignee
    // inclinee, chargeur.
    this.gunModel = new THREE.Mesh(
      mergeGeometries([
        tint(box(0.15, 0.17, 0.52, 0, 0, -0.12), 0.24, 0.25, 0.29), // corps/carcasse
        tint(box(0.07, 0.08, 0.5, 0, 0.03, -0.5), 0.15, 0.16, 0.19), // canon
        tint(box(0.05, 0.06, 0.1, 0, 0.13, -0.62), 0.12, 0.13, 0.15), // guidon
        tint(box(0.05, 0.05, 0.08, 0, 0.12, 0.05), 0.12, 0.13, 0.15), // hausse
        tint(box(0.16, 0.14, 0.2, 0, -0.02, 0.22), 0.20, 0.21, 0.25), // crosse
        tint(box(0.12, 0.28, 0.14, 0, -0.22, 0.06).rotateX(0.32), 0.18, 0.12, 0.08), // poignee
        tint(box(0.1, 0.2, 0.12, 0, -0.2, -0.12), 0.14, 0.14, 0.16), // chargeur
        tint(box(0.04, 0.1, 0.04, 0, -0.12, -0.16), 0.1, 0.1, 0.12), // detente
      ], false),
      new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 30 }),
    );
    this.gunModel.position.set(0.3, -0.27, -0.62);
    this.gunModel.rotation.set(0.03, -0.05, 0);
    this._gunBase = this.gunModel.position.clone();

    this.swordModel = new THREE.Mesh(
      mergeGeometries([
        tint(box(0.08, 1.1, 0.08, 0, 0.55, 0), 0.72, 0.76, 0.82), // lame vers le haut
        tint(box(0.32, 0.08, 0.1, 0, 0.0, 0), 0.35, 0.25, 0.12), // garde
        tint(box(0.09, 0.28, 0.09, 0, -0.2, 0), 0.30, 0.20, 0.10), // poignee
      ], false),
      new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 0 }),
    );
    this.swordModel.position.set(0.45, -0.55, -0.75);
    // Ordre YXZ : tangage (X) applique avant lacet (Y) -> balayage horizontal propre.
    this.swordModel.rotation.order = 'YXZ';
    this._swordRestX = 0.15;
    this._swordRestZ = -0.15; // lame pointee vers le haut au repos
    this.swordModel.rotation.set(this._swordRestX, 0, this._swordRestZ);

    this.gunModel.visible = false;
    this.swordModel.visible = false;
    this.camera.add(this.gunModel);
    this.camera.add(this.swordModel);
  }

  _buildEffects() {
    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
    );
    this.flash.position.set(0.3, -0.24, -1.05); // bout du canon
    this.flash.visible = false;
    this.camera.add(this.flash);
  }

  // --- Audio (sons procseduraux) -----------------------------------------
  _ensureAudio() {
    if (this.actx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    this.actx = new C();
    const len = Math.floor(this.actx.sampleRate * 0.2);
    this.noiseBuf = this.actx.createBuffer(1, len, this.actx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  _shotSound() {
    this._ensureAudio();
    if (this.actx.state === 'suspended') this.actx.resume();
    const t = this.actx.currentTime;
    const dest = this.actx.destination;

    const src = this.actx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = this.actx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const g = this.actx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(hp).connect(g).connect(dest);
    src.start(t);
    src.stop(t + 0.13);

    const o = this.actx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.1);
    const g2 = this.actx.createGain();
    g2.gain.setValueAtTime(0.3, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g2).connect(dest);
    o.start(t);
    o.stop(t + 0.13);
  }

  _blip(freq, dur, vol) {
    this._ensureAudio();
    if (this.actx.state === 'suspended') this.actx.resume();
    const t = this.actx.currentTime;
    const o = this.actx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = this.actx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.actx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _swoosh() {
    this._ensureAudio();
    if (this.actx.state === 'suspended') this.actx.resume();
    const t = this.actx.currentTime;
    const src = this.actx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.actx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(1800, t + 0.18);
    const g = this.actx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(bp).connect(g).connect(this.actx.destination);
    src.start(t);
    src.stop(t + 0.2);
  }

  // --- Etat ---------------------------------------------------------------
  setEnabled(b) {
    this.enabled = b;
    this.hud.style.display = b ? 'block' : 'none';
    if (b) {
      this.health = 100;
      this.score = 0;
      this.ammo = MAG_SIZE;
      this.reloading = false;
      this.spawnTimer = 1;
      this._updateWeaponModels();
    } else {
      this._clearAnimals();
      this.gunModel.visible = false;
      this.swordModel.visible = false;
    }
  }

  _switchWeapon() { if (this.swordEnabled) this._setWeapon(this.weapon === 'gun' ? 'sword' : 'gun'); }
  _setWeapon(w) {
    if (w === 'sword' && !this.swordEnabled) return; // epee desactivee
    this.weapon = w;
    this._updateWeaponModels();
  }

  // Declenchement public (utilise par les commandes tactiles).
  fire() { if (this.enabled) this._attack(); }
  _updateWeaponModels() {
    this.gunModel.visible = this.enabled && this.weapon === 'gun';
    this.swordModel.visible = this.enabled && this.weapon === 'sword';
  }

  _reload() {
    if (this.weapon !== 'gun' || this.reloading || this.ammo === MAG_SIZE) return;
    this.reloading = true;
    this.reloadT = RELOAD_TIME;
    this._blip(220, 0.08, 0.15);
  }

  // --- Animaux ------------------------------------------------------------
  _spawn() {
    const r = Math.random();
    const type = r < 0.55 ? 'normal' : r < 0.8 ? 'fast' : 'tough';
    const def = TYPES[type];

    const a = Math.random() * Math.PI * 2;
    const px = this.player.position.x + Math.cos(a) * SPAWN_RADIUS;
    const pz = this.player.position.z + Math.sin(a) * SPAWN_RADIUS;
    const mesh = new THREE.Mesh(this.beastGeo, this.beastMats[type]);
    mesh.position.set(px, this.world.getHeight(px, pz), pz);
    mesh.scale.setScalar(def.scale[0] + Math.random() * (def.scale[1] - def.scale[0]));

    // ~60% chassent le joueur, les autres errent dans le paysage.
    const behavior = Math.random() < 0.6 ? 'hunter' : 'wanderer';
    const obj = {
      mesh, type, hp: def.hp, speed: def.speed, damage: def.damage,
      behavior, heading: Math.random() * Math.PI * 2, wanderT: 0,
    };
    mesh.userData.ref = obj;
    this.scene.add(mesh);
    this.animals.push(obj);
  }

  _clearAnimals() {
    for (const o of this.animals) this.scene.remove(o.mesh);
    this.animals.length = 0;
  }

  _despawn(obj) {
    const i = this.animals.indexOf(obj);
    if (i === -1) return;
    this.animals.splice(i, 1);
    this.scene.remove(obj.mesh);
  }

  _killAnimal(obj) {
    if (this.animals.indexOf(obj) === -1) return;
    this._despawn(obj);
    this.score++;
  }

  _damageAnimal(obj, dmg) {
    obj.hp -= dmg;
    if (obj.hp <= 0) this._killAnimal(obj);
  }

  _hurtPlayer(n) {
    this.health -= n;
    if (this.health <= 0) {
      this.health = 100;
      this.score = 0;
      this.ammo = MAG_SIZE;
      this.reloading = false;
      this._clearAnimals();
    }
  }

  // --- Attaques -----------------------------------------------------------
  _attack() {
    if (this.weapon === 'gun') this._fireGun();
    else this._swing();
  }

  _fireGun() {
    if (this.reloading) return;
    if (this.ammo <= 0) { this._blip(120, 0.05, 0.12); this._reload(); return; }
    this.ammo--;
    this._shotSound();
    this.recoilT = 0.08;

    this.camera.getWorldPosition(this._origin);
    this.camera.getWorldDirection(this._dir);
    this.raycaster.set(this._origin, this._dir);
    this.raycaster.far = GUN_RANGE;
    const hits = this.raycaster.intersectObjects(this.animals.map((o) => o.mesh), false);

    this.flashT = 0.06;
    this.flash.visible = true;

    const end = this._tmp.copy(this._origin).addScaledVector(this._dir, GUN_RANGE);
    if (hits.length) {
      end.copy(hits[0].point);
      this._damageAnimal(hits[0].object.userData.ref, 1);
    }
    this._spawnTracer(this._origin, end);
  }

  _swing() {
    this.swingT = SWING_DUR;
    this._swoosh();
    this.camera.getWorldPosition(this._origin);
    this.camera.getWorldDirection(this._dir);
    this._dir.y = 0;
    this._dir.normalize();
    for (const o of [...this.animals]) {
      this._tmp.subVectors(o.mesh.position, this._origin);
      this._tmp.y = 0;
      const dist = this._tmp.length();
      if (dist < MELEE_RANGE && this._tmp.normalize().dot(this._dir) > 0.3) {
        this._damageAnimal(o, 2);
      }
    }
  }

  _spawnTracer(start, end) {
    if (this.tracer) { this.scene.remove(this.tracer); this.tracer.geometry.dispose(); }
    const geo = new THREE.BufferGeometry().setFromPoints([start.clone(), end.clone()]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfff2b0 }));
    this.scene.add(this.tracer);
    this.tracerT = 0.05;
  }

  // --- Boucle -------------------------------------------------------------
  update(dt) {
    if (!this.enabled) return;

    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }

    // Recul du pistolet.
    if (this._gunBase) {
      const k = this.recoilT > 0 ? this.recoilT / 0.08 : 0;
      this.gunModel.position.z = this._gunBase.z + k * 0.07;
      if (this.recoilT > 0) this.recoilT -= dt;
    }
    if (this.tracerT > 0) {
      this.tracerT -= dt;
      if (this.tracerT <= 0 && this.tracer) {
        this.scene.remove(this.tracer); this.tracer.geometry.dispose(); this.tracer = null;
      }
    }

    // Coup d'epee en deux temps : 1) bascule de la garde (lame haute) vers
    // l'avant (pointe en avant) ; 2) balayage lateral de la droite vers la gauche.
    if (this.swingT > 0) {
      this.swingT -= dt;
      const t = 1 - Math.max(this.swingT, 0) / SWING_DUR; // 0 -> 1
      const ss = (a) => a * a * (3 - 2 * a); // lissage
      const p1 = ss(Math.min(t / 0.4, 1)); // bascule vers l'avant
      const p2 = ss(Math.max((t - 0.4) / 0.6, 0)); // balayage droite -> gauche
      this.swordModel.rotation.x = this._swordRestX + (-Math.PI / 2 - this._swordRestX) * p1;
      this.swordModel.rotation.y = -0.9 + 1.8 * p2;
      this.swordModel.rotation.z = this._swordRestZ * (1 - p1);
      if (this.swingT <= 0) this.swordModel.rotation.set(this._swordRestX, 0, this._swordRestZ);
    }

    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.ammo = MAG_SIZE; this.reloading = false; this._blip(440, 0.06, 0.15); }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.animals.length < MAX_ANIMALS) {
      this._spawn();
      this.spawnTimer = SPAWN_INTERVAL;
    }

    const pp = this.player.position;
    for (const o of [...this.animals]) {
      const m = o.mesh;
      const dx = pp.x - m.position.x;
      const dy = pp.y - m.position.y;
      const dz = pp.z - m.position.z;
      const horiz = Math.hypot(dx, dz);

      // Degats seulement au vrai contact (distance 3D) : en vol, les monstres
      // au sol ne touchent pas le joueur.
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 2.0) {
        this._hurtPlayer(o.damage);
        this._killAnimal(o);
        continue;
      }
      // Trop loin -> disparait sans rapporter de points.
      if (horiz > 95) { this._despawn(o); continue; }

      if (o.behavior === 'hunter') {
        const inv = 1 / (horiz || 1);
        m.position.x += dx * inv * o.speed * dt;
        m.position.z += dz * inv * o.speed * dt;
        m.position.y = this.world.getHeight(m.position.x, m.position.z);
        m.lookAt(pp.x, m.position.y, pp.z);
      } else {
        // Errance : change de cap regulierement, ne vise pas le joueur.
        o.wanderT -= dt;
        if (o.wanderT <= 0) { o.heading = Math.random() * Math.PI * 2; o.wanderT = 2 + Math.random() * 3; }
        const hx = Math.cos(o.heading);
        const hz = Math.sin(o.heading);
        m.position.x += hx * o.speed * 0.6 * dt;
        m.position.z += hz * o.speed * 0.6 * dt;
        m.position.y = this.world.getHeight(m.position.x, m.position.z);
        m.lookAt(m.position.x + hx, m.position.y, m.position.z + hz);
      }
    }

    const w = this.weapon === 'gun' ? 'PISTOLET' : 'EPEE';
    const info = this.weapon === 'gun'
      ? (this.reloading ? 'RECHARGE...' : `Mun ${this.ammo}/${MAG_SIZE}`)
      : '∞';
    const swap = this.swordEnabled ? 'molette: arme · ' : '';
    this.hud.textContent =
      `⚔ ${w} (${info})  |  Score ${this.score}  |  PV ${this.health}` +
      `  ·  ${swap}clic droit: attaque · R: recharger`;
  }
}
