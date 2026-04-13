class SoundSystem {
  constructor() {
    this.ac = null;
    this.sfxGain = null;
    this.bgmGain = null;
    this.bgmNodes = [];
    this.bgmOn = true;
    this._init();
  }

  _init() {
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.sfxGain = this.ac.createGain();
      this.bgmGain = this.ac.createGain();
      this.sfxGain.gain.value = 0.6;
      this.bgmGain.gain.value = 0.18;
      this.sfxGain.connect(this.ac.destination);
      this.bgmGain.connect(this.ac.destination);
    } catch (e) { console.warn('Web Audio API not supported'); }
  }

  _resume() {
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  }

  // ── キーストローク音（気持ちいいクリック）──────────────────
  playKey(correct) {
    if (!this.ac) return;
    this._resume();
    const t = this.ac.currentTime;

    if (correct) {
      // 高め・短い・心地いいクリック
      const osc = this.ac.createOscillator();
      const gain = this.ac.createGain();
      const filter = this.ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1200;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      osc.type = 'square';
      osc.frequency.setValueAtTime(900, t);
      osc.frequency.exponentialRampToValueAtTime(600, t + 0.04);
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.start(t);
      osc.stop(t + 0.07);
    } else {
      // 低め・ブザー感
      const osc = this.ac.createOscillator();
      const gain = this.ac.createGain();
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.type = 'sawtooth';
      osc.frequency.value = 180;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.start(t);
      osc.stop(t + 0.13);
    }
  }

  // ── コンボ達成音 ───────────────────────────────────────────
  playCombo(level) {
    if (!this.ac) return;
    this._resume();
    const scales = {
      10:  [523, 659, 784],
      25:  [523, 659, 784, 1047],
      50:  [523, 659, 784, 1047, 1319],
      100: [523, 659, 784, 1047, 1319, 1568],
    };
    const notes = scales[level] || scales[10];
    notes.forEach((freq, i) => {
      const t = this.ac.currentTime + i * 0.07;
      const osc = this.ac.createOscillator();
      const gain = this.ac.createGain();
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  // ── クリア音 ───────────────────────────────────────────────
  playClear() {
    if (!this.ac) return;
    this._resume();
    const melody = [523, 659, 784, 1047, 784, 1047, 1319];
    melody.forEach((freq, i) => {
      const t = this.ac.currentTime + i * 0.1;
      const osc = this.ac.createOscillator();
      const gain = this.ac.createGain();
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.31);
    });
  }

  // ── BGM（ロファイアンビエント）─────────────────────────────
  startBGM() {
    if (!this.ac || !this.bgmOn) return;
    this._resume();
    this.stopBGM();

    const chords = [
      [110, 138.6, 164.8, 220],   // Am
      [98,  123.5, 146.8, 196],   // G
      [87.3, 110, 130.8, 174.6],  // F
      [98,  123.5, 146.8, 196],   // G
    ];
    let step = 0;
    const barLen = 3.2;

    const playChord = () => {
      if (!this.bgmOn) return;
      const chord = chords[step % chords.length];
      const nodes = [];
      chord.forEach(freq => {
        const osc = this.ac.createOscillator();
        const gain = this.ac.createGain();
        const filter = this.ac.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.bgmGain);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, this.ac.currentTime);
        gain.gain.linearRampToValueAtTime(0.15, this.ac.currentTime + 0.3);
        gain.gain.linearRampToValueAtTime(0.1, this.ac.currentTime + barLen - 0.3);
        gain.gain.linearRampToValueAtTime(0, this.ac.currentTime + barLen);
        osc.start(this.ac.currentTime);
        osc.stop(this.ac.currentTime + barLen);
        nodes.push(osc);
      });
      this.bgmNodes = nodes;
      step++;
      this._bgmTimer = setTimeout(playChord, barLen * 1000);
    };
    playChord();
  }

  stopBGM() {
    clearTimeout(this._bgmTimer);
    this.bgmNodes.forEach(n => { try { n.stop(); } catch (e) {} });
    this.bgmNodes = [];
  }

  toggleBGM() {
    this.bgmOn = !this.bgmOn;
    if (this.bgmOn) this.startBGM();
    else this.stopBGM();
    return this.bgmOn;
  }
}
