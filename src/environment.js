import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Ciel en degrade + soleil + nuages + cycle jour/nuit. Le ciel et le soleil
// suivent la camera ; les nuages s'enroulent autour du joueur.
export class Environment {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this._camPos = new THREE.Vector3();

    this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
    scene.add(this.sun);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(this.ambient);

    this.sunDir = new THREE.Vector3(0.4, 0.8, 0.35).normalize();

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uSunDir: { value: this.sunDir }, uDay: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform vec3 uSunDir;
        uniform float uDay;
        void main() {
          vec3 d = normalize(vDir);
          float t = clamp(d.y * 0.6 + 0.4, 0.0, 1.0);
          // Degrade bleu jour, plus sombre la nuit, halo chaud autour du soleil.
          vec3 day = mix(vec3(0.55, 0.75, 0.92), vec3(0.20, 0.42, 0.74), t);
          vec3 night = vec3(0.03, 0.05, 0.12);
          float glow = pow(max(dot(d, normalize(uSunDir)), 0.0), 10.0) * 0.8;
          vec3 col = mix(night, day, uDay) + vec3(1.0, 0.82, 0.5) * glow * uDay;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 16, 16), this.skyMat);
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(16, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2c4 }),
    );
    this.sunMesh.frustumCulled = false;
    scene.add(this.sunMesh);

    this.clouds = [];
    this._initClouds();
  }

  _initClouds() {
    const parts = [];
    for (let i = 0; i < 4; i++) {
      parts.push(new THREE.IcosahedronGeometry(3, 0)
        .translate((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 7));
    }
    const geo = mergeGeometries(parts, false);
    const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 0 });
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Mesh(geo, mat);
      c.position.set((Math.random() - 0.5) * 600, 75 + Math.random() * 45, (Math.random() - 0.5) * 600);
      const s = 2 + Math.random() * 3;
      c.scale.set(s, s * 0.5, s);
      this.scene.add(c);
      this.clouds.push(c);
    }
  }

  setCloudsVisible(b) {
    for (const c of this.clouds) c.visible = b;
  }

  // Retourne le facteur jour (0 = nuit, 1 = plein jour) pour la teinte post.
  update(dt, timeOfDay) {
    const a = timeOfDay * Math.PI * 2 - Math.PI / 2;
    this.sunDir.set(Math.cos(a) * 0.6, Math.sin(a), 0.35).normalize();
    const sh = this.sunDir.y;
    const day = THREE.MathUtils.clamp(sh * 1.5 + 0.4, 0, 1);

    this.sun.position.copy(this.sunDir).multiplyScalar(100);
    this.sun.intensity = Math.max(0, sh) * 1.1 + 0.05;
    this.ambient.intensity = 0.12 + day * 0.3;
    this.skyMat.uniforms.uDay.value = day;

    this.camera.getWorldPosition(this._camPos);
    this.sky.position.copy(this._camPos);
    this.sunMesh.position.copy(this._camPos).addScaledVector(this.sunDir, 380);
    this.sunMesh.visible = sh > -0.05;

    for (const c of this.clouds) {
      c.position.x += dt * 4;
      const dx = c.position.x - this._camPos.x;
      if (dx > 350) c.position.x -= 700; else if (dx < -350) c.position.x += 700;
      const dz = c.position.z - this._camPos.z;
      if (dz > 350) c.position.z -= 700; else if (dz < -350) c.position.z += 700;
    }
    return day;
  }
}
