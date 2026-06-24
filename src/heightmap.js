import { HEIGHT_AMP } from './config.js';

const RES = 128; // resolution interne de la heightmap

// Construit une fonction de hauteur a partir d'un tableau de gris (0..1).
// La carte couvre une zone monde centree sur l'origine.
export function makeHeightmapSampler(data, size, unitsPerPixel, amplitude) {
  const half = (size * unitsPerPixel) / 2;
  return function (x, z) {
    let u = (x + half) / unitsPerPixel;
    let v = (z + half) / unitsPerPixel;
    u = Math.min(Math.max(u, 0), size - 1);
    v = Math.min(Math.max(v, 0), size - 1);
    const x0 = Math.floor(u);
    const z0 = Math.floor(v);
    const x1 = Math.min(x0 + 1, size - 1);
    const z1 = Math.min(z0 + 1, size - 1);
    const fx = u - x0;
    const fz = v - z0;
    const h00 = data[z0 * size + x0];
    const h10 = data[z0 * size + x1];
    const h01 = data[z1 * size + x0];
    const h11 = data[z1 * size + x1];
    const h0 = h00 + (h10 - h00) * fx;
    const h1 = h01 + (h11 - h01) * fx;
    return (h0 + (h1 - h0) * fz) * amplitude;
  };
}

// Editeur de heightmap (overlay) : peinture au pinceau, chargement d'image,
// reglages d'echelle/amplitude. onApply recoit une fonction getHeight prete.
export function createHeightmapEditor(onApply) {
  const overlay = document.createElement('div');
  overlay.id = 'hm-editor';
  overlay.innerHTML = `
    <div class="hm-panel">
      <div class="hm-title">EDITEUR DE RELIEF</div>
      <canvas class="hm-canvas" width="${RES}" height="${RES}"></canvas>
      <div class="hm-row"><span>Pinceau</span>
        <button data-act="raise" class="hm-on">Lever</button>
        <button data-act="lower">Creuser</button>
      </div>
      <div class="hm-row"><span>Taille</span><input data-act="brush" type="range" min="4" max="40" value="16"></div>
      <div class="hm-row"><span>Amplitude</span><input data-act="amp" type="range" min="20" max="160" value="60"></div>
      <div class="hm-row"><span>Echelle</span><input data-act="scale" type="range" min="10" max="60" value="25"></div>
      <div class="hm-row">
        <button data-act="noise">Bruit</button>
        <button data-act="clear">Effacer</button>
      </div>
      <div class="hm-row">
        <label class="hm-file hm-file-wide">⭳ Importer une image
          <input data-act="img" type="file" accept="image/*" hidden></label>
      </div>
      <div class="hm-row hm-actions">
        <button data-act="apply" class="hm-apply">Appliquer</button>
        <button data-act="cancel">Fermer</button>
      </div>
      <div class="hm-hint">Blanc = montagnes, noir = vallees — peins ou importe une image</div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.style.display = 'none';

  const canvas = overlay.querySelector('.hm-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let raise = true;
  let brush = 16;
  let amp = 60;
  let scale = 25;
  let painting = false;

  function fillMid() {
    ctx.fillStyle = '#202020';
    ctx.fillRect(0, 0, RES, RES);
  }
  fillMid();

  function paintAt(ev) {
    const r = canvas.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * RES;
    const py = ((ev.clientY - r.top) / r.height) * RES;
    const g = ctx.createRadialGradient(px, py, 0, px, py, brush);
    const c = raise ? '255,255,255' : '0,0,0';
    g.addColorStop(0, `rgba(${c},0.5)`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, brush, 0, Math.PI * 2);
    ctx.fill();
  }

  canvas.addEventListener('pointerdown', (e) => { painting = true; paintAt(e); });
  canvas.addEventListener('pointermove', (e) => { if (painting) paintAt(e); });
  window.addEventListener('pointerup', () => { painting = false; });

  function randomNoise() {
    fillMid();
    for (let i = 0; i < 40; i++) {
      const px = Math.random() * RES;
      const py = Math.random() * RES;
      const rad = 8 + Math.random() * 30;
      const up = Math.random() < 0.6;
      const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
      const c = up ? '255,255,255' : '0,0,0';
      g.addColorStop(0, `rgba(${c},0.6)`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, RES, RES);
    }
  }

  function apply() {
    const img = ctx.getImageData(0, 0, RES, RES).data;
    const data = new Float32Array(RES * RES);
    // Vraie luminance (gere aussi les images couleur).
    for (let i = 0; i < RES * RES; i++) {
      data[i] = (0.299 * img[i * 4] + 0.587 * img[i * 4 + 1] + 0.114 * img[i * 4 + 2]) / 255;
    }
    onApply(makeHeightmapSampler(data, RES, scale / 10, amp));
    hide();
  }

  function loadImage(file) {
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, RES, RES);
      // Conserve le ratio (contain), centre l'image.
      const r = Math.min(RES / img.width, RES / img.height);
      const w = img.width * r;
      const h = img.height * r;
      ctx.drawImage(img, (RES - w) / 2, (RES - h) / 2, w, h);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  }

  overlay.addEventListener('click', (e) => {
    const act = e.target.getAttribute('data-act');
    if (!act) return;
    if (act === 'raise' || act === 'lower') {
      raise = act === 'raise';
      overlay.querySelector('[data-act="raise"]').classList.toggle('hm-on', raise);
      overlay.querySelector('[data-act="lower"]').classList.toggle('hm-on', !raise);
    } else if (act === 'noise') randomNoise();
    else if (act === 'clear') fillMid();
    else if (act === 'apply') apply();
    else if (act === 'cancel') hide();
  });
  overlay.addEventListener('input', (e) => {
    const act = e.target.getAttribute('data-act');
    if (act === 'brush') brush = +e.target.value;
    else if (act === 'amp') amp = +e.target.value;
    else if (act === 'scale') scale = +e.target.value;
  });
  overlay.querySelector('[data-act="img"]').addEventListener('change', (e) => {
    if (e.target.files[0]) loadImage(e.target.files[0]);
  });

  function show() { overlay.style.display = 'flex'; }
  function hide() { overlay.style.display = 'none'; }

  return { show, hide };
}

export { HEIGHT_AMP };
