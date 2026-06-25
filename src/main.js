import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { World } from './world.js';
import { Player } from './player.js';
import { makeDitherPass } from './dither.js';
import { Environment } from './environment.js';
import { WindAudio } from './audio.js';
import { buildMenu } from './menu.js';
import { createHeightmapEditor } from './heightmap.js';
import { Combat } from './combat.js';
import { TouchControls } from './touch.js';
import { WATER_LEVEL } from './config.js';

// Tactile par defaut si l'entree principale est "grossiere" (doigt) : vise
// telephones / tablettes, pas les PC a ecran tactile avec souris.
const IS_TOUCH = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
const IS_FR = (navigator.language || '').toLowerCase().startsWith('fr');

const FOG_GREY = 0x808080;

// --- Reglages (persistes en localStorage) --------------------------------
const DEFAULTS = {
  wireframe: true, dither: true, colorMode: false, scanlines: true, vignette: true,
  trees: true, water: true, clouds: true, audio: false,
  dayNightAuto: true, hud: true, flying: false, combat: false, touch: IS_TOUCH,
  torch: true, azerty: IS_FR, timeOfDay: 0.3, pixelScale: 0.5,
};
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('vw-settings') || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
function saveSettings() {
  try { localStorage.setItem('vw-settings', JSON.stringify(settings)); } catch { /* ignore */ }
}
const settings = loadSettings();

// --- Seed depuis l'URL ---------------------------------------------------
const urlSeed = parseInt(new URLSearchParams(location.search).get('seed') || '', 10);
let seed = Number.isFinite(urlSeed) ? urlSeed : Math.floor(Math.random() * 1e6);
function updateUrlSeed(s) {
  const u = new URL(location.href);
  u.searchParams.set('seed', s);
  history.replaceState(null, '', u);
}
updateUrlSeed(seed);

// --- Scene / rendu -------------------------------------------------------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(FOG_GREY, 60, 200);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 1000);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(settings.pixelScale);
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// --- Monde / joueur / environnement --------------------------------------
const world = new World(scene);
world.setWireframe(settings.wireframe);
world.setScatter(settings.trees);
world.regenerate(seed);

const player = new Player(camera, renderer.domElement, world);
player.spawn(0, 0);
world.update(player.position);

const env = new Environment(scene, camera);
env.setCloudsVisible(settings.clouds);

const combat = new Combat(scene, camera, world, player);

const touch = new TouchControls(camera, player, renderer.domElement, {
  onFire: () => combat.fire(),
  onPause: () => pauseGame(),
});

// --- Eau -----------------------------------------------------------------
const waterMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying float vShade;
    void main() {
      vec3 p = position;
      float w = sin((p.x + uTime * 2.0) * 0.3) * 0.18 + cos((p.z - uTime * 1.5) * 0.25) * 0.18;
      p.y += w;
      vShade = 0.46 + w * 0.22;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying float vShade;
    void main() {
      vec3 col = mix(vec3(0.10, 0.35, 0.62), vec3(0.22, 0.55, 0.80), vShade);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(500, 500, 48, 48).rotateX(-Math.PI / 2), waterMat);
water.position.y = WATER_LEVEL;
water.visible = settings.water;
scene.add(water);

// --- Post-traitement -----------------------------------------------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const dither = makeDitherPass();
composer.addPass(dither);

// Resolution interne (taille des pixels + granularite du tramage).
function applyPixelScale(v) {
  renderer.setPixelRatio(v);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(v);
  composer.setSize(innerWidth, innerHeight);
  touch.setPixelScale(v); // controles tactiles a la meme resolution
}

// --- Audio + editeur de heightmap ----------------------------------------
const wind = new WindAudio();
const editor = createHeightmapEditor((getHeightFn) => {
  world.setHeightmap(getHeightFn);
  player.spawn(0, 0);
});

// --- DOM -----------------------------------------------------------------
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const startEl = overlay.querySelector('.start');
const helpEl = overlay.querySelector('p');
let started = false;
let lastUnlock = 0;
let touchActive = false; // etat "en jeu" en mode tactile (sans pointer lock)

// Aide adaptee a la disposition clavier (memes touches physiques, libelles differents).
function updateControlsHelp(azerty) {
  const mv = azerty ? 'ZQSD' : 'WASD';
  const turn = azerty ? 'A / E' : 'Q / E';
  helpEl.innerHTML =
    `${mv} / flèches — se deplacer&nbsp;&nbsp;|&nbsp;&nbsp;Souris — regarder<br />` +
    `${turn} — pivoter&nbsp;&nbsp;|&nbsp;&nbsp;Espace — sauter&nbsp;&nbsp;|&nbsp;&nbsp;Maj — courir<br />` +
    `F — voler&nbsp;&nbsp;|&nbsp;&nbsp;Echap — pause / reprise`;
}

// Le jeu tourne si la souris est verrouillee (bureau) ou si le mode tactile est actif.
function isActive() {
  return settings.touch ? touchActive : player.controls.isLocked;
}

function enterGame() {
  if (settings.touch) {
    touchActive = true;
    started = true;
    overlay.classList.add('hidden');
    touch.setEnabled(true);
  } else {
    player.controls.lock();
  }
  if (settings.audio) wind.setEnabled(true);
}

function pauseGame() {
  if (settings.touch) {
    touchActive = false;
    touch.setEnabled(false);
    overlay.classList.remove('hidden');
    if (started) startEl.textContent = 'PAUSE — toucher pour reprendre';
  } else {
    player.controls.unlock();
  }
}

overlay.addEventListener('click', enterGame);
player.controls.addEventListener('lock', () => { overlay.classList.add('hidden'); started = true; });
player.controls.addEventListener('unlock', () => {
  overlay.classList.remove('hidden');
  lastUnlock = performance.now();
  // Echap -> pause : la boucle gele tant que la souris n'est pas reverrouillee.
  if (started) startEl.textContent = 'PAUSE — Échap ou clic pour reprendre';
});

// Echap bascule la pause. La reprise se fait sur le RELACHEMENT (keyup) d'Echap :
// demander le verrouillage pendant le keydown d'Echap echoue, car c'est la touche
// que le navigateur utilise pour sortir du pointer lock (il relock puis ressort).
// La garde (400 ms) ignore le keyup de l'appui qui vient justement de mettre en pause.
addEventListener('keyup', (e) => {
  if (e.code === 'Escape' && started && !player.controls.isLocked
      && performance.now() - lastUnlock > 400) {
    enterGame();
  }
});

// --- Application des reglages ---------------------------------------------
function applySetting(k, v) {
  switch (k) {
    case 'wireframe': world.setWireframe(v); break;
    case 'trees': world.setScatter(v); break;
    case 'water': water.visible = v; break;
    case 'clouds': env.setCloudsVisible(v); break;
    case 'dither':
      dither.uniforms.uDither.value = v ? 1 : 0;
      // Sans tramage : plus de niveaux pour des degrades plus riches.
      dither.uniforms.uSteps.value = v ? 4 : 6;
      break;
    case 'colorMode': dither.uniforms.uColorMode.value = v ? 1 : 0; break;
    case 'scanlines': dither.uniforms.uScanline.value = v ? 1 : 0; break;
    case 'vignette': dither.uniforms.uVignette.value = v ? 1 : 0; break;
    case 'hud': hud.style.display = v ? 'block' : 'none'; break;
    case 'flying': player.setFlying(v); touch.setFlying(v); break;
    case 'combat': combat.setEnabled(v); touch.setCombat(v); break;
    case 'touch': applyTouchMode(v); break;
    case 'torch': env.setTorch(v); break;
    case 'azerty': updateControlsHelp(v); break;
    case 'pixelScale': applyPixelScale(v); break;
    case 'audio': wind.setEnabled(v); break;
    default: break; // dayNightAuto / timeOfDay : lus dans la boucle
  }
}

// Bascule du mode tactile : on remet le jeu en pause proprement et on synchronise
// l'affichage des boutons selon vol / combat.
function applyTouchMode(v) {
  if (v) {
    if (player.controls.isLocked) player.controls.unlock();
    touch.setFlying(settings.flying);
    touch.setCombat(settings.combat);
  } else {
    touchActive = false;
    touch.setEnabled(false);
  }
}
// Application initiale (sauf audio : necessite un geste utilisateur).
for (const k of Object.keys(settings)) if (k !== 'audio') applySetting(k, settings[k]);

// --- API pour le menu ----------------------------------------------------
const api = {
  get: (k) => settings[k],
  set: (k, v) => { settings[k] = v; applySetting(k, v); saveSettings(); },
  currentSeed: () => seed,
  regenerate: (s) => { seed = s; updateUrlSeed(s); world.regenerate(s); player.spawn(0, 0); },
  randomSeed: () => { seed = Math.floor(Math.random() * 1e6); updateUrlSeed(seed); world.regenerate(seed); player.spawn(0, 0); return seed; },
  openEditor: () => editor.show(),
};
const menu = buildMenu(api);

// Touche F : bascule le mode vol (et resynchronise le menu).
addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && e.target.tagName !== 'INPUT') {
    api.set('flying', !settings.flying);
    menu.refresh();
  }
});

// --- Resize --------------------------------------------------------------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// --- Boucle --------------------------------------------------------------
const clock = new THREE.Clock();
const nightTint = new THREE.Color(0.7, 0.68, 0.92);
const dayTint = new THREE.Color(1, 1, 1);
let hudTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // Pause : hors jeu (Echap au clavier, ou pause tactile). On rend la scene
  // mais on ne met rien a jour (joueur, monde, combat, jour/nuit figes).
  if (!isActive()) { composer.render(); return; }

  if (settings.dayNightAuto) settings.timeOfDay = (settings.timeOfDay + dt * 0.003) % 1;

  player.update(dt);
  world.update(player.position);
  combat.update(dt);

  water.position.x = player.position.x;
  water.position.z = player.position.z;
  waterMat.uniforms.uTime.value += dt;

  const day = env.update(dt, settings.timeOfDay);
  dither.uniforms.uBrightness.value = 0.58 + day * 0.42; // nuit moins sombre
  dither.uniforms.uTint.value.copy(nightTint).lerp(dayTint, day);

  hudTimer += dt;
  if (settings.hud && hudTimer > 0.25) {
    const p = player.position;
    hud.textContent =
      `${settings.flying ? '[VOL] ' : ''}x ${p.x.toFixed(0)} y ${p.y.toFixed(0)} z ${p.z.toFixed(0)} | ` +
      `chunks ${world.chunks.size} | fps ${(1 / dt).toFixed(0)}`;
    hudTimer = 0;
  }

  composer.render();
}
animate();
