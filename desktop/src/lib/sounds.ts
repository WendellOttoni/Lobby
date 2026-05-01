const SOUND_KEY = "lobby_sound_enabled";

export function isSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_KEY) !== "false";
}

export function setSoundEnabled(enabled: boolean) {
  localStorage.setItem(SOUND_KEY, enabled ? "true" : "false");
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function playTone(freq: number, duration: number, startGain = 0.15) {
  try {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.frequency.setValueAtTime(freq, ac.currentTime);
    gain.gain.setValueAtTime(startGain, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration);
  } catch {}
}

export function playMessageSound() {
  if (!isSoundEnabled()) return;
  try {
    const ac = getCtx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.frequency.setValueAtTime(880, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ac.currentTime + 0.08);
    gain.gain.setValueAtTime(0.18, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.18);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.18);
  } catch {}
}

export function playJoinSound() {
  if (!isSoundEnabled()) return;
  // two ascending tones: 440 → 660
  playTone(440, 0.09);
  setTimeout(() => playTone(660, 0.12), 100);
}

export function playLeaveSound() {
  if (!isSoundEnabled()) return;
  // two descending tones: 660 → 440
  playTone(660, 0.09);
  setTimeout(() => playTone(440, 0.12), 100);
}
