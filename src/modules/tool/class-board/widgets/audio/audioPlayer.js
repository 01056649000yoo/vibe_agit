export const TIMER_SOUND_OPTIONS = Object.freeze([
  { id: 'chime', label: '맑은 차임' },
  { id: 'bell', label: '수업 종' },
  { id: 'digital', label: '전자 알림' },
]);

let audioContext = null;

const getAudioContext = () => {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
};

export const normalizeSoundVolume = (value, fallback = 0.7) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
};

export const prepareClassBoardAudio = () => {
  const context = getAudioContext();
  if (context?.state === 'suspended') void context.resume();
};

const playSequence = async (notes, volume) => {
  const context = getAudioContext();
  if (!context) return;
  try {
    if (context.state === 'suspended') await context.resume();
    const masterVolume = normalizeSoundVolume(volume);
    notes.forEach((note) => {
      const startAt = context.currentTime + note.delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = note.type || 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, masterVolume * (note.gain || 0.22)), startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + note.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + note.duration + 0.02);
    });
  } catch {
    // 브라우저가 소리 재생을 막아도 타이머와 뽑기 자체는 계속 동작한다.
  }
};

const TIMER_SEQUENCES = Object.freeze({
  chime: [
    { frequency: 523.25, delay: 0, duration: 0.45 },
    { frequency: 659.25, delay: 0.18, duration: 0.5 },
    { frequency: 783.99, delay: 0.36, duration: 0.7 },
  ],
  bell: [
    { frequency: 880, delay: 0, duration: 0.55, type: 'triangle' },
    { frequency: 659.25, delay: 0.42, duration: 0.55, type: 'triangle' },
    { frequency: 880, delay: 0.84, duration: 0.75, type: 'triangle' },
  ],
  digital: [
    { frequency: 740, delay: 0, duration: 0.13, type: 'square', gain: 0.12 },
    { frequency: 988, delay: 0.2, duration: 0.13, type: 'square', gain: 0.12 },
    { frequency: 740, delay: 0.4, duration: 0.13, type: 'square', gain: 0.12 },
    { frequency: 988, delay: 0.6, duration: 0.25, type: 'square', gain: 0.12 },
  ],
});

const getTimerSequence = (soundId) => {
  if (soundId === 'bell') return TIMER_SEQUENCES.bell;
  if (soundId === 'digital') return TIMER_SEQUENCES.digital;
  return TIMER_SEQUENCES.chime;
};

export const playTimerAlarm = (soundId, volume) => playSequence(getTimerSequence(soundId), volume);

export const playPickerTick = (progress, volume) => playSequence([{
  frequency: 420 + Math.round(Math.min(1, Math.max(0, progress)) * 180),
  delay: 0,
  duration: 0.045,
  type: 'triangle',
  gain: 0.09,
}], volume);

export const playPickerSelected = (volume) => playSequence([
  { frequency: 523.25, delay: 0, duration: 0.18, gain: 0.18 },
  { frequency: 659.25, delay: 0.14, duration: 0.2, gain: 0.18 },
  { frequency: 783.99, delay: 0.28, duration: 0.5, gain: 0.22 },
], volume);
