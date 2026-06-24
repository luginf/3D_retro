// Worker : genere la geometrie des chunks (mode procedural) hors du thread
// principal pour eviter les saccades. Recoit un seed, renvoie des buffers
// transferables.
import { makeHeightFn } from './noise.js';
import { buildTerrainBuffers } from './terrain-geo.js';

let getHeight = null;

self.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'init') {
    getHeight = makeHeightFn(d.seed).getHeight;
    return;
  }
  if (d.type === 'chunk' && getHeight) {
    const { positions, indices } = buildTerrainBuffers(getHeight, d.cx, d.cz);
    self.postMessage(
      { type: 'chunk', gen: d.gen, cx: d.cx, cz: d.cz, positions, indices },
      [positions.buffer, indices.buffer],
    );
  }
};
