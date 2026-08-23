const STORAGE_KEY = 'agit:classroom-arrangement:sfx';

function readSettings() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return { muted: value.muted === true, volume: Math.max(0, Math.min(1, Number(value.volume) || 0.45)) };
  } catch {
    return { muted: false, volume: 0.45 };
  }
}

class ArrangementSfx {
  settings = readSettings();
  context = null;

  setSettings(next) {
    this.settings = { ...this.settings, ...next };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
  }

  ensure() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) this.context = new AudioContextClass();
    }
    if (this.context?.state === 'suspended') void this.context.resume();
    return this.context;
  }

  tone(frequency, duration = 0.08, type = 'sine', strength = 0.13) {
    if (this.settings.muted) return;
    const context = this.ensure();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(Math.max(0.001, strength * this.settings.volume), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  tick() { this.tone(980 + Math.random() * 420, 0.045, 'square', 0.08); }
  pick() { this.tone(880, 0.35, 'sine', 0.2); }
  pop() { this.tone(380, 0.14, 'triangle', 0.25); }
  finish() {
    [523, 659, 784, 1046].forEach((frequency, index) => {
      window.setTimeout(() => this.tone(frequency, 0.45, 'triangle', 0.18), index * 95);
    });
  }
}

export const arrangementSfx = new ArrangementSfx();
