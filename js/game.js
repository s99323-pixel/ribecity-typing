// ── パーティクルシステム ────────────────────────────────────
class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._loop();
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  spawn(x, y, color, count = 6, speed = 4) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.5 + Math.random());
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - 1.5,
        life: 1,
        decay: 0.04 + Math.random() * 0.03,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  spawnBurst(x, y) {
    const colors = ['#e2b714', '#fff', '#f0c040', '#ffe066', '#ffaa00'];
    colors.forEach(c => this.spawn(x, y, c, 8, 7));
  }

  _loop() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= p.decay;
      this.ctx.globalAlpha = Math.max(0, p.life);
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.globalAlpha = 1;
    requestAnimationFrame(() => this._loop());
  }
}

// ── メインゲーム ────────────────────────────────────────────
class TypingGame {
  constructor() {
    this.difficulty = 'easy';
    this.quote = null;
    this.charIndex = 0;
    this.errors = 0;
    this.totalTyped = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.startTime = null;
    this.isRunning = false;
    this.composing = false;
    this.usedQuotes = { easy: [], medium: [], hard: [] };

    this.sound = new SoundSystem();
    this._bindDOM();
    this._bindEvents();
    this.ps = new ParticleSystem(document.getElementById('particle-canvas'));
    this._newQuote();
  }

  // ── DOM ──────────────────────────────────────────────────
  _bindDOM() {
    this.$display   = document.getElementById('quote-display');
    this.$input     = document.getElementById('typing-input');
    this.$wpm       = document.getElementById('wpm');
    this.$acc       = document.getElementById('acc');
    this.$combo     = document.getElementById('combo-display');
    this.$category  = document.getElementById('category');
    this.$results   = document.getElementById('results');
    this.$rWpm      = document.getElementById('r-wpm');
    this.$rAcc      = document.getElementById('r-acc');
    this.$rCombo    = document.getElementById('r-combo');
    this.$bgmBtn    = document.getElementById('bgm-btn');
    this.$progress  = document.getElementById('progress-bar');
  }

  // ── イベント ─────────────────────────────────────────────
  _bindEvents() {
    // 難易度ボタン
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.difficulty = btn.dataset.diff;
        this._newQuote();
      });
    });

    // 入力
    this.$input.addEventListener('compositionstart', () => this.composing = true);
    this.$input.addEventListener('compositionend', () => {
      this.composing = false;
      this._validate();
    });
    this.$input.addEventListener('input', () => {
      if (!this.composing) this._validate();
    });
    this.$input.addEventListener('keydown', e => {
      if (!this.startTime && !this.composing) this._startTimer();
    });

    // Tab でリスタート
    document.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); this._newQuote(); }
      if (e.key === 'Escape') this._closeResults();
    });

    // BGM
    this.$bgmBtn.addEventListener('click', () => {
      const on = this.sound.toggleBGM();
      this.$bgmBtn.textContent = on ? '🎵 BGM: ON' : '🔇 BGM: OFF';
    });

    // 結果画面
    document.getElementById('next-btn').addEventListener('click', () => this._newQuote());
    document.getElementById('restart-btn').addEventListener('click', () => this._newQuote());
  }

  // ── 新しい名言 ───────────────────────────────────────────
  _newQuote() {
    const pool = QUOTES[this.difficulty];
    let available = pool.filter((_, i) => !this.usedQuotes[this.difficulty].includes(i));
    if (available.length === 0) {
      this.usedQuotes[this.difficulty] = [];
      available = pool;
    }
    const idx = Math.floor(Math.random() * available.length);
    const realIdx = pool.indexOf(available[idx]);
    this.usedQuotes[this.difficulty].push(realIdx);

    this.quote = pool[realIdx];
    this.charIndex = 0;
    this.errors = 0;
    this.totalTyped = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.startTime = null;
    this.isRunning = false;

    this.$input.value = '';
    this.$input.disabled = false;
    this.$input.focus();
    this.$category.textContent = `📌 ${this.quote.category}`;
    this._closeResults();
    this._renderQuote();
    this._updateStats(0, 100);
    this._updateCombo(0);
    this._updateProgress(0);
  }

  // ── 表示 ────────────────────────────────────────────────
  _renderQuote(currentValue = '') {
    const text = this.quote.text;
    this.$display.innerHTML = text.split('').map((ch, i) => {
      let cls = 'char pending';
      if (i < currentValue.length) {
        cls = currentValue[i] === ch ? 'char correct' : 'char incorrect';
      } else if (i === currentValue.length) {
        cls = 'char cursor';
      }
      return `<span class="${cls}" data-i="${i}">${ch}</span>`;
    }).join('');
  }

  // ── 検証 ────────────────────────────────────────────────
  _validate() {
    if (!this.isRunning) { this._startTimer(); }

    const val  = this.$input.value;
    const text = this.quote.text;

    // 入力超過を防ぐ
    if (val.length > text.length) {
      this.$input.value = val.slice(0, text.length);
      return;
    }

    this._renderQuote(val);
    this._updateProgress(val.length / text.length);

    const lastIdx = val.length - 1;
    if (lastIdx >= 0) {
      const correct = val[lastIdx] === text[lastIdx];
      this.sound.playKey(correct);

      if (correct) {
        this.combo++;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        this.totalTyped++;
        this._updateCombo(this.combo);
        this._spawnParticleAtChar(lastIdx, '#e2b714');
        this._checkComboMilestone(this.combo);
      } else {
        this.errors++;
        this.combo = 0;
        this._updateCombo(0);
        this._spawnParticleAtChar(lastIdx, '#ca4754');
        this.$display.classList.add('shake');
        setTimeout(() => this.$display.classList.remove('shake'), 300);
      }
    }

    const elapsed = (Date.now() - this.startTime) / 60000;
    const wpm = elapsed > 0 ? Math.round((this.totalTyped / 5) / elapsed) : 0;
    const acc = this.totalTyped + this.errors > 0
      ? Math.round((this.totalTyped / (this.totalTyped + this.errors)) * 100)
      : 100;
    this._updateStats(wpm, acc);

    // クリア判定
    if (val === text) this._complete(wpm, acc);
  }

  // ── タイマー ─────────────────────────────────────────────
  _startTimer() {
    this.startTime = Date.now();
    this.isRunning = true;
    this.sound.startBGM();
  }

  // ── クリア ───────────────────────────────────────────────
  _complete(wpm, acc) {
    this.isRunning = false;
    this.$input.disabled = true;
    this.sound.playClear();

    // 画面全体にパーティクル爆発
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight * 0.6;
        this.ps.spawnBurst(x, y);
      }, i * 120);
    }

    setTimeout(() => {
      this.$rWpm.textContent   = wpm;
      this.$rAcc.textContent   = `${acc}%`;
      this.$rCombo.textContent = this.maxCombo;
      this.$results.classList.remove('hidden');
    }, 600);
  }

  _closeResults() { this.$results.classList.add('hidden'); }

  // ── パーティクル ──────────────────────────────────────────
  _spawnParticleAtChar(idx, color) {
    const span = this.$display.querySelector(`[data-i="${idx}"]`);
    if (!span) return;
    const r = span.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    this.ps.spawn(x, y, color, 5, 4);
  }

  // ── コンボマイルストーン ──────────────────────────────────
  _checkComboMilestone(combo) {
    const milestones = [10, 25, 50, 100];
    if (milestones.includes(combo)) {
      this.sound.playCombo(combo);
      this.$combo.classList.add('milestone');
      setTimeout(() => this.$combo.classList.remove('milestone'), 600);
    }
  }

  // ── UI更新 ───────────────────────────────────────────────
  _updateStats(wpm, acc) {
    this.$wpm.textContent = wpm;
    this.$acc.textContent = `${acc}%`;
  }

  _updateCombo(n) {
    this.$combo.textContent = n >= 3 ? `🔥 ${n} combo` : '';
  }

  _updateProgress(ratio) {
    this.$progress.style.width = `${ratio * 100}%`;
  }
}

// ── 起動 ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  window._game = new TypingGame();
});
