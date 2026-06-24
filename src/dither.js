import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Matrice de Bayer NxN sous forme de texture de seuils (tramage ordonne).
function makeBayerTexture(n) {
  let m = [[0]];
  let size = 1;
  while (size < n) {
    const ns = size * 2;
    const nm = Array.from({ length: ns }, () => new Array(ns));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = m[y][x] * 4;
        nm[y][x] = v;
        nm[y][x + size] = v + 2;
        nm[y + size][x] = v + 3;
        nm[y + size][x + size] = v + 1;
      }
    }
    m = nm;
    size = ns;
  }
  const data = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) data[y * n + x] = Math.floor(((m[y][x] + 0.5) / (n * n)) * 255);
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

// Passe finale : luminance -> (tramage) -> palette de bleus, + teinte jour/nuit,
// + scanlines et vignette CRT (toutes activables).
export function makeDitherPass() {
  const N = 8;
  const shader = {
    uniforms: {
      tDiffuse: { value: null },
      uBayer: { value: makeBayerTexture(N) },
      uBayerSize: { value: N },
      uDither: { value: 1 },
      uColorMode: { value: 0 },
      uSteps: { value: 4 },
      uContrast: { value: 1.35 },
      uScanline: { value: 1 },
      uVignette: { value: 1 },
      uBrightness: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform sampler2D uBayer;
      uniform float uBayerSize, uDither, uColorMode, uSteps, uContrast;
      uniform float uScanline, uVignette, uBrightness;
      uniform vec3 uTint;
      varying vec2 vUv;

      vec3 paletteColor(float t) {
        vec3 c0 = vec3(0.04, 0.10, 0.18);
        vec3 c1 = vec3(0.08, 0.27, 0.43);
        vec3 c2 = vec3(0.18, 0.50, 0.71);
        vec3 c3 = vec3(0.50, 0.76, 0.90);
        vec3 c4 = vec3(0.91, 0.96, 0.99);
        if (t < 0.25) return mix(c0, c1, t / 0.25);
        if (t < 0.50) return mix(c1, c2, (t - 0.25) / 0.25);
        if (t < 0.75) return mix(c2, c3, (t - 0.50) / 0.25);
        return mix(c3, c4, (t - 0.75) / 0.25);
      }

      void main() {
        vec3 src = texture2D(tDiffuse, vUv).rgb;

        // Tramage active : seuil de Bayer ; sinon seuil neutre (bandes nettes).
        float threshold = uDither > 0.5
          ? texture2D(uBayer, gl_FragCoord.xy / uBayerSize).r
          : 0.5;

        vec3 col;
        if (uColorMode > 0.5) {
          // Mode couleurs : quantification par canal (conserve la teinte).
          vec3 c = src * uBrightness;
          c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
          col = clamp(floor(c * uSteps + threshold) / uSteps, 0.0, 1.0) * uTint;
        } else {
          // Mode monochrome : luminance -> palette de bleus.
          float lum = clamp(dot(src, vec3(0.299, 0.587, 0.114)) * uBrightness, 0.0, 1.0);
          lum = clamp((lum - 0.5) * uContrast + 0.5, 0.0, 1.0);
          float v = clamp(floor(lum * uSteps + threshold) / uSteps, 0.0, 1.0);
          col = paletteColor(v) * uTint;
        }

        if (uScanline > 0.5) col *= 0.82 + 0.18 * sin(gl_FragCoord.y * 3.14159265);
        if (uVignette > 0.5) col *= mix(1.0, 0.35, smoothstep(0.35, 0.85, length(vUv - 0.5)));

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  };
  return new ShaderPass(shader);
}
