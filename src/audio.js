// Ambiance de vent 100% procedurale (WebAudio) : bruit blanc filtre passe-bas
// module par un LFO. Aucun fichier audio requis.
export class WindAudio {
  constructor() {
    this.ctx = null;
    this.gain = null;
    this.enabled = false;
  }

  _ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 450;

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(filter.frequency);

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;

    src.connect(filter).connect(this.gain).connect(this.ctx.destination);
    src.start();
    lfo.start();
  }

  setEnabled(b) {
    this._ensure();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.enabled = b;
    this.gain.gain.linearRampToValueAtTime(b ? 0.12 : 0, this.ctx.currentTime + 0.6);
  }
}
