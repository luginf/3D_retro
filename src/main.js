import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { World } from './world.js';
import { Player } from './player.js';
import { makeDitherPass, makeDitherShader } from './dither.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { Environment } from './environment.js';
import { WindAudio } from './audio.js';
import { buildMenu } from './menu.js';
import { createHeightmapEditor } from './heightmap.js';
import { Combat } from './combat.js';
import { TouchControls } from './touch.js';
import { WATER_LEVEL, SNOW_LINE, HEIGHT_AMP } from './config.js';

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
  torch: true, azerty: IS_FR, timeOfDay: 0.3, pixelScale: 0.5, minimap: true, minimapDither: true,
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

// --- Mini-carte (incrustee bas-gauche, touche M) --------------------------
// Camera orthographique vue du dessus. Un materiau "heightfield" remplace tous
// les materiaux de la scene (scene.overrideMaterial) : couleur = temperature
// selon l'altitude (bleu froid/eau -> rouge chaud/sommets), independante de la
// lumiere/jour-nuit. Nuages masques (pas pertinents en vue de dessus). Rendue
// dans une cible basse resolution puis reaffichee via le meme tramage/palette/
// scanlines que l'ecran de jeu (viewport/scissor reduit, apres le composer) :
// meme "grain" retro que le reste de l'ecran.
const MINIMAP_RADIUS = 110; // demi-etendue (unites monde) visible sur la carte
const minimapCamera = new THREE.OrthographicCamera(
  -MINIMAP_RADIUS, MINIMAP_RADIUS, MINIMAP_RADIUS, -MINIMAP_RADIUS, 1, 1000,
);
minimapCamera.up.set(0, 0, -1); // nord (-Z, direction par defaut du joueur) en haut
const minimapEl = document.getElementById('minimap');
const minimapPlayerEl = document.getElementById('minimap-player');
const mmDir = new THREE.Vector3();

// Fleche du joueur : dessinee en pixel-art (escalier net, pointe fine) plutot qu'un
// triangle CSS lisse, pour rester coherente avec le rendu pixelise du reste du jeu.
const ARROW_W = minimapPlayerEl.width;
const ARROW_ROWS = [1, 1, 3, 3, 5, 5, 7, 7, 7]; // largeur (px) de chaque ligne, sommet -> base
const mmArrowCtx = minimapPlayerEl.getContext('2d');
mmArrowCtx.fillStyle = '#ffe9b0';
ARROW_ROWS.forEach((w, y) => mmArrowCtx.fillRect((ARROW_W - w) / 2, y, w, 1));

const minimapMat = new THREE.ShaderMaterial({
  uniforms: {
    uH0: { value: WATER_LEVEL - 10 }, // en dessous : bleu profond
    uH1: { value: WATER_LEVEL + 2 }, // niveau de l'eau -> debut des plaines
    uH2: { value: SNOW_LINE * 0.6 }, // plaines -> collines
    uH3: { value: SNOW_LINE }, // collines -> sommets
    uH4: { value: HEIGHT_AMP }, // rouge sature au-dela
  },
  vertexShader: /* glsl */ `
    varying float vHeight;
    void main() {
      #ifdef USE_INSTANCING
        vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
      #else
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      #endif
      vHeight = worldPosition.y;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uH0, uH1, uH2, uH3, uH4;
    varying float vHeight;
    void main() {
      vec3 c0 = vec3(0.02, 0.05, 0.25); // eau profonde
      vec3 c1 = vec3(0.10, 0.35, 0.65); // eau
      vec3 c2 = vec3(0.15, 0.55, 0.20); // plaines
      vec3 c3 = vec3(0.80, 0.55, 0.10); // collines
      vec3 c4 = vec3(0.85, 0.15, 0.10); // sommets
      vec3 col;
      if (vHeight < uH1) col = mix(c0, c1, smoothstep(uH0, uH1, vHeight));
      else if (vHeight < uH2) col = mix(c1, c2, smoothstep(uH1, uH2, vHeight));
      else if (vHeight < uH3) col = mix(c2, c3, smoothstep(uH2, uH3, vHeight));
      else col = mix(c3, c4, smoothstep(uH3, uH4, vHeight));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

// Cible basse resolution (rendu 3D de la carte avant post-traitement retro).
// Filtrage "nearest" -> pixels bien visibles une fois agrandie, comme le canvas principal.
const mmTarget = new THREE.WebGLRenderTarget(2, 2, {
  minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
});

// Meme recette de tramage/palette/scanlines que l'ecran de jeu (dither.js), mais en
// mode "couleurs" force (on veut voir le degrade de temperature, pas la palette bleue
// monochrome) et sans assombrissement jour/nuit (la carte doit rester lisible de nuit).
const minimapDitherMat = new THREE.ShaderMaterial(makeDitherShader());
minimapDitherMat.uniforms.tDiffuse.value = mmTarget.texture;
minimapDitherMat.uniforms.uColorMode.value = 1;
minimapDitherMat.uniforms.uBrightness.value = 1;
const mmQuad = new FullScreenQuad(minimapDitherMat);

function renderMinimap() {
  if (!settings.minimap) return;
  const size = minimapEl.clientWidth;
  if (!size) return;
  const left = minimapEl.offsetLeft;
  const bottom = innerHeight - minimapEl.offsetTop - minimapEl.clientHeight;

  const res = Math.max(2, Math.round(size * settings.pixelScale));
  if (mmTarget.width !== res) mmTarget.setSize(res, res);

  minimapCamera.position.set(player.position.x, player.position.y + 260, player.position.z);
  minimapCamera.lookAt(player.position.x, player.position.y, player.position.z);

  env.setCloudsVisible(false);
  scene.overrideMaterial = minimapMat;
  renderer.setRenderTarget(mmTarget);
  renderer.render(scene, minimapCamera);
  renderer.setRenderTarget(null);
  scene.overrideMaterial = null;
  env.setCloudsVisible(settings.clouds);

  // Tramage de la carte : reglage propre (settings.minimapDither), independant de
  // celui de l'ecran de jeu. Scanlines/vignette restent alignees sur l'ecran de jeu.
  minimapDitherMat.uniforms.uDither.value = settings.minimapDither ? 1 : 0;
  minimapDitherMat.uniforms.uSteps.value = settings.minimapDither ? 4 : 6;
  minimapDitherMat.uniforms.uScanline.value = dither.uniforms.uScanline.value;
  minimapDitherMat.uniforms.uVignette.value = dither.uniforms.uVignette.value;

  renderer.setScissorTest(true);
  renderer.setViewport(left, bottom, size, size);
  renderer.setScissor(left, bottom, size, size);
  mmQuad.render(renderer);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);

  camera.getWorldDirection(mmDir);
  const yaw = Math.atan2(mmDir.x, -mmDir.z) * 180 / Math.PI;
  minimapPlayerEl.style.transform = `translate(-50%, -50%) rotate(${yaw}deg)`;
}

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

  // Fleche de la mini-carte : chaque pixel dessine occupe la meme taille CSS
  // qu'un pixel du rendu principal, pour rester grossiere/nette au meme degre.
  const px = Math.max(1, Math.round(1 / v));
  minimapPlayerEl.style.width = `${ARROW_W * px}px`;
  minimapPlayerEl.style.height = `${ARROW_ROWS.length * px}px`;
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
    `F — voler&nbsp;&nbsp;|&nbsp;&nbsp;Echap — pause / reprise&nbsp;&nbsp;|&nbsp;&nbsp;M — mini-carte`;
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
    case 'minimap': minimapEl.classList.toggle('hidden', !v); break;
    case 'audio': wind.setEnabled(v); break;
    default: break; // dayNightAuto / timeOfDay / minimapDither : lus dans la boucle
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

// Touche F : bascule le mode vol. Touche M : bascule la mini-carte. (resynchronise le menu)
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'KeyF') { api.set('flying', !settings.flying); menu.refresh(); }
  if (e.code === 'KeyM') { api.set('minimap', !settings.minimap); menu.refresh(); }
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
  if (!isActive()) { composer.render(); renderMinimap(); return; }

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
  renderMinimap();
}
animate();
