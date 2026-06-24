import { CHUNK_SIZE, SEGMENTS } from './config.js';

// Construit les tampons (positions + indices) d'un chunk a partir d'une
// fonction de hauteur quelconque. Sans dependance Three.js -> utilisable dans
// le worker comme sur le thread principal. Les sommets sont en coords LOCALES
// (le mesh sera positionne a l'origine du chunk).
export function buildTerrainBuffers(getHeight, cx, cz) {
  const N = SEGMENTS;
  const step = CHUNK_SIZE / N;
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;

  const positions = new Float32Array((N + 1) * (N + 1) * 3);
  let p = 0;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      positions[p++] = i * step;
      positions[p++] = getHeight(originX + i * step, originZ + j * step);
      positions[p++] = j * step;
    }
  }

  const indices = new Uint32Array(N * N * 6);
  let t = 0;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      const b = a + 1;
      const c = a + (N + 1);
      const d = c + 1;
      // Ordre choisi pour des normales orientees vers le haut (+Y).
      indices[t++] = a; indices[t++] = c; indices[t++] = b;
      indices[t++] = b; indices[t++] = c; indices[t++] = d;
    }
  }

  return { positions, indices };
}
