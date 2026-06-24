import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CHUNK_SIZE, RENDER_DISTANCE, MAX_BUILDS_PER_FRAME, WATER_LEVEL, SNOW_LINE,
} from './config.js';
import { buildTerrainBuffers } from './terrain-geo.js';
import { makeHeightFn, mulberry32 } from './noise.js';

function hash3(a, b, c) {
  let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791));
  return h >>> 0;
}

// Couleur de sommet uniforme (RGB). En mode monochrome seule la luminance est
// lue ; en mode couleurs la teinte est conservee.
function tintRGB(geo, r, g, b) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = r; arr[i * 3 + 1] = g; arr[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return geo;
}

// Couleur du terrain selon l'altitude (rive / herbe / roche / neige).
function terrainColorFor(h, c) {
  if (h < WATER_LEVEL + 1.2) return c.setRGB(0.76, 0.70, 0.50);
  if (h < 20) return c.setRGB(0.30, 0.52, 0.26);
  if (h < SNOW_LINE) return c.setRGB(0.46, 0.43, 0.40);
  return c.setRGB(0.92, 0.95, 0.98);
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map(); // "cx,cz" -> THREE.Group
    this.pending = new Set();
    this.gen = 0;
    this.mode = 'procedural';
    this.seed = 1;
    this.getHeight = () => 0;
    this.showWire = true;
    this.showScatter = true;

    this.terrainMat = new THREE.MeshPhongMaterial({
      color: 0xffffff, vertexColors: true, flatShading: true, shininess: 0,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    this.wireMat = new THREE.MeshBasicMaterial({ color: 0x16283c, wireframe: true });

    this._initScatterAssets();

    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this._onWorkerChunk(e.data);
  }

  // --- Modeles d'arbres / rochers (geometries partagees, instanciees) -----
  _initScatterAssets() {
    const trunk = new THREE.CylinderGeometry(0.16, 0.24, 1.4, 5).translate(0, 0.7, 0);
    const cone1 = new THREE.ConeGeometry(1.05, 2.3, 6).translate(0, 2.0, 0);
    const cone2 = new THREE.ConeGeometry(0.72, 1.7, 6).translate(0, 3.1, 0);
    this.treeGeo = mergeGeometries([
      tintRGB(trunk, 0.34, 0.21, 0.11),
      tintRGB(cone1, 0.16, 0.40, 0.15),
      tintRGB(cone2, 0.22, 0.50, 0.20),
    ], false);
    this.treeMat = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 0 });

    this.rockGeo = tintRGB(new THREE.DodecahedronGeometry(0.8, 0), 0.44, 0.41, 0.38);
    this.rockMat = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 0 });
  }

  _slopeAt(x, z) {
    const e = 1.6;
    const hx = this.getHeight(x + e, z) - this.getHeight(x - e, z);
    const hz = this.getHeight(x, z + e) - this.getHeight(x, z - e);
    return Math.hypot(hx, hz) / (2 * e);
  }

  // Placement deterministe (seed,cx,cz) d'arbres (terrain plat, altitude moyenne)
  // et de rochers (pentes raides).
  _scatter(cx, cz) {
    const rng = mulberry32(hash3((this.seed ^ 0x9e37) | 0, cx, cz));
    const trees = [];
    const rocks = [];
    for (let k = 0; k < 18; k++) {
      const lx = rng() * CHUNK_SIZE;
      const lz = rng() * CHUNK_SIZE;
      const h = this.getHeight(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
      if (h < WATER_LEVEL + 0.8) continue;
      const slope = this._slopeAt(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz);
      if (h < SNOW_LINE && slope < 0.55 && rng() < 0.75) {
        trees.push({ x: lx, y: h, z: lz, s: 0.8 + rng() * 0.9, r: rng() * 6.283 });
      } else if (slope > 0.35 && rng() < 0.55) {
        rocks.push({ x: lx, y: h, z: lz, s: 0.6 + rng() * 1.3, r: rng() * 6.283 });
      }
    }
    return { trees, rocks };
  }

  _instanced(geo, mat, items) {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      e.set(0, it.r, 0);
      q.setFromEuler(e);
      pos.set(it.x, it.y, it.z);
      scl.set(it.s, it.s, it.s);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.kind = 'scatter';
    mesh.visible = this.showScatter;
    return mesh;
  }

  // --- Construction d'un chunk a partir de buffers ------------------------
  _buildChunk(cx, cz, positions, indices) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    // Couleur par sommet selon l'altitude (utilisee en mode couleurs).
    const cnt = positions.length / 3;
    const colArr = new Float32Array(cnt * 3);
    const c = new THREE.Color();
    for (let i = 0; i < cnt; i++) {
      terrainColorFor(positions[i * 3 + 1], c);
      colArr[i * 3] = c.r; colArr[i * 3 + 1] = c.g; colArr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));

    const group = new THREE.Group();
    group.add(new THREE.Mesh(geo, this.terrainMat)); // [0] remplissage (geo a disposer)
    const wire = new THREE.Mesh(geo, this.wireMat);
    wire.userData.kind = 'wire';
    wire.visible = this.showWire;
    group.add(wire);

    const sc = this._scatter(cx, cz);
    if (sc.trees.length) group.add(this._instanced(this.treeGeo, this.treeMat, sc.trees));
    if (sc.rocks.length) group.add(this._instanced(this.rockGeo, this.rockMat, sc.rocks));

    group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    this.scene.add(group);
    this.chunks.set(cx + ',' + cz, group);
  }

  _onWorkerChunk(d) {
    if (d.type !== 'chunk' || d.gen !== this.gen) return; // reponse perimee
    const key = d.cx + ',' + d.cz;
    if (!this.pending.has(key)) return;
    this.pending.delete(key);
    this._buildChunk(d.cx, d.cz, d.positions, d.indices);
  }

  _disposeChunk(group) {
    this.scene.remove(group);
    group.children[0].geometry.dispose(); // geometrie terrain (partagee fill+wire)
    // Les geometries d'arbres/rochers sont partagees globalement -> pas de dispose.
  }

  _reset() {
    this.gen++;
    for (const group of this.chunks.values()) this._disposeChunk(group);
    this.chunks.clear();
    this.pending.clear();
  }

  // --- API publique -------------------------------------------------------
  regenerate(seed) {
    this.seed = seed | 0;
    this.mode = 'procedural';
    this.getHeight = makeHeightFn(this.seed).getHeight;
    this.worker.postMessage({ type: 'init', seed: this.seed });
    this._reset();
  }

  // Bascule sur une heightmap personnalisee (image chargee ou peinte).
  setHeightmap(getHeightFn) {
    this.mode = 'custom';
    this.getHeight = getHeightFn;
    this._reset();
  }

  setWireframe(b) {
    this.showWire = b;
    for (const group of this.chunks.values()) {
      for (const c of group.children) if (c.userData.kind === 'wire') c.visible = b;
    }
  }

  setScatter(b) {
    this.showScatter = b;
    for (const group of this.chunks.values()) {
      for (const c of group.children) if (c.userData.kind === 'scatter') c.visible = b;
    }
  }

  update(playerPos) {
    const ccx = Math.floor(playerPos.x / CHUNK_SIZE);
    const ccz = Math.floor(playerPos.z / CHUNK_SIZE);

    for (const [key, group] of this.chunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - ccx) > RENDER_DISTANCE + 1 || Math.abs(cz - ccz) > RENDER_DISTANCE + 1) {
        this._disposeChunk(group);
        this.chunks.delete(key);
      }
    }

    const wanted = [];
    for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
      for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
        const cx = ccx + dx;
        const cz = ccz + dz;
        const key = cx + ',' + cz;
        if (!this.chunks.has(key) && !this.pending.has(key)) {
          wanted.push({ cx, cz, key, d: dx * dx + dz * dz });
        }
      }
    }
    wanted.sort((a, b) => a.d - b.d);

    let started = 0;
    for (const { cx, cz, key } of wanted) {
      if (started >= MAX_BUILDS_PER_FRAME) break;
      if (this.mode === 'procedural') {
        this.pending.add(key);
        this.worker.postMessage({ type: 'chunk', gen: this.gen, cx, cz });
      } else {
        const { positions, indices } = buildTerrainBuffers(this.getHeight, cx, cz);
        this._buildChunk(cx, cz, positions, indices);
      }
      started++;
    }
  }
}
