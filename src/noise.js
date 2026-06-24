import { createNoise2D } from 'simplex-noise';
import { HEIGHT_AMP } from './config.js';

// RNG deterministe (mulberry32) : meme seed => meme monde.
export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fabrique une fonction de hauteur procedurale seedee (utilisable des deux
// cotes : thread principal pour le joueur, worker pour la geometrie).
export function makeHeightFn(seed) {
  const noise2D = createNoise2D(mulberry32(seed));
  function getHeight(x, z) {
    let amp = 1;
    let freq = 0.006;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < 5; o++) {
      sum += noise2D(x * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    let n = (sum / norm + 1) / 2;
    n = Math.pow(n, 1.9);
    return n * HEIGHT_AMP;
  }
  return { getHeight, noise2D };
}
