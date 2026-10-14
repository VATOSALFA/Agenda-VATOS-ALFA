// Utility for loud, crystal-clear notification sound and haptic vibration for VATOS ALFA
// Uses Web Audio API (zero external assets, instant, offline-capable) and Web Vibration API

export type SoundStyle = 'doble_campana' | 'doble_triada' | 'alerta_insistente';

export interface SoundStyleOption {
  id: SoundStyle;
  name: string;
  description: string;
  duration: string;
}

export const SOUND_STYLES: SoundStyleOption[] = [
  {
    id: 'alerta_insistente',
    name: 'Alerta Insistente (3 Pulsos)',
    description: 'Tres toques acústicos de llamada de atención de alta penetración (Predeterminado)',
    duration: '1.7 seg',
  },
  {
    id: 'doble_campana',
    name: 'Doble Campana (Ding-Dong x2)',
    description: 'Suena dos veces seguidas con resonancia profunda de mostrador',
    duration: '1.9 seg',
  },
  {
    id: 'doble_triada',
    name: 'Doble Tríada Ascendente',
    description: 'Dos acordes modernos y brillantes seguidos con armónicos dorados',
    duration: '1.8 seg',
  },
];

export type FontSizeScale = 'compacto' | 'normal' | 'grande' | 'extra_grande';

export interface FontSizeOption {
  id: FontSizeScale;
  label: string;
  description: string;
  px: number;
}

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { id: 'compacto', label: 'Compacto', description: 'Más contenido en pantalla (93%)', px: 15 },
  { id: 'normal', label: 'Normal', description: 'Tamaño estándar del sistema (100%)', px: 16 },
  { id: 'grande', label: 'Grande', description: 'Lectura más cómoda y clara (108%)', px: 17.25 },
  { id: 'extra_grande', label: 'Extra Grande', description: 'Máxima legibilidad en toda la plataforma (116%)', px: 18.5 },
];

export interface AudioNotificationSettings {
  notification_sound: SoundStyle;
  notification_volume: number; // 0.0 to 1.0
  vibration_enabled: boolean;
  agenda_click_sound_enabled: boolean;
  font_size_scale?: FontSizeScale;
}

export const DEFAULT_AUDIO_SETTINGS: AudioNotificationSettings = {
  notification_sound: 'alerta_insistente',
  notification_volume: 1.0,
  vibration_enabled: true,
  agenda_click_sound_enabled: true,
  font_size_scale: 'normal',
};

const STORAGE_SETTINGS_KEY = 'vatos_audio_settings';
const STORAGE_LEGACY_STYLE_KEY = 'vatos_notification_sound_style';

export function applyFontSizeScale(scale?: FontSizeScale) {
  if (typeof document === 'undefined') return;
  const option = FONT_SIZE_OPTIONS.find((o) => o.id === scale) || FONT_SIZE_OPTIONS[1];
  document.documentElement.style.fontSize = `${option.px}px`;
  document.documentElement.setAttribute('data-font-scale', option.id);
}

export function getAudioSettings(): AudioNotificationSettings {
  if (typeof window === 'undefined') return DEFAULT_AUDIO_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const rawVol = typeof parsed.notification_volume === 'number' ? parsed.notification_volume : 1.0;
      return {
        notification_sound: parsed.notification_sound || getPreferredSoundStyle(),
        notification_volume: Math.min(1, Math.max(0, rawVol)),
        vibration_enabled: parsed.vibration_enabled !== false,
        agenda_click_sound_enabled: parsed.agenda_click_sound_enabled !== false,
        font_size_scale: parsed.font_size_scale || 'normal',
      };
    }
  } catch (_) {}
  return {
    ...DEFAULT_AUDIO_SETTINGS,
    notification_sound: getPreferredSoundStyle(),
  };
}

export function setAudioSettings(settings: Partial<AudioNotificationSettings>) {
  if (typeof window === 'undefined') return;
  try {
    const current = getAudioSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(updated));
    if (settings.notification_sound) {
      setPreferredSoundStyle(settings.notification_sound);
    }
    if (updated.font_size_scale) {
      applyFontSizeScale(updated.font_size_scale);
    }
    window.dispatchEvent(new CustomEvent('vatos_audio_settings_changed', { detail: updated }));
  } catch (_) {}
}

export function getPreferredSoundStyle(): SoundStyle {
  if (typeof window === 'undefined') return 'alerta_insistente';
  try {
    const saved = localStorage.getItem(STORAGE_LEGACY_STYLE_KEY) as SoundStyle | null;
    if (saved && (saved === 'doble_campana' || saved === 'doble_triada' || saved === 'alerta_insistente')) {
      return saved;
    }
  } catch (_) {}
  return 'alerta_insistente';
}

export function setPreferredSoundStyle(style: SoundStyle) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_LEGACY_STYLE_KEY, style);
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    const current = raw ? JSON.parse(raw) : DEFAULT_AUDIO_SETTINGS;
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify({ ...current, notification_sound: style }));
  } catch (_) {}
}

let sharedAudioCtx: AudioContext | null = null;
let isAudioUnlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    return sharedAudioCtx;
  } catch (err) {
    console.warn('[AudioAlert] Web Audio API no soportado:', err);
    return null;
  }
}

// Desbloquear AudioContext en la primera interacción del usuario
export function initAudioUnlock() {
  if (typeof window === 'undefined' || isAudioUnlocked) return;

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        isAudioUnlocked = true;
      }).catch(() => {});
    } else if (ctx) {
      isAudioUnlocked = true;
    }

    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
}

// Disparar doble vibración háptica sincronizada con la alerta doble
export function triggerHapticAlert(pattern = [300, 100, 300, 250, 300, 100, 500]) {
  if (typeof window === 'undefined') return;
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch (_) {}
}

/**
 * Sonido de clic sutil y táctil (estilo iOS / pulsación mecánica) para cuando
 * el usuario hace clic en botones y elementos de la agenda.
 */
export function playAgendaClickSound(volume?: number) {
  if (typeof window === 'undefined') return;
  try {
    const settings = getAudioSettings();
    if (settings.agenda_click_sound_enabled === false) return;
    const savedVol = typeof settings.notification_volume === 'number' ? settings.notification_volume : 1.0;
    const effectiveVolume = volume !== undefined ? volume * savedVol : 0.28 * savedVol;
    if (effectiveVolume <= 0.001) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    const play = () => {
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // Frecuencia rápida con caída percusiva táctil nítida y agradable (38ms)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.038);

        gain.gain.setValueAtTime(effectiveVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.038);

        // Micro-vibración háptica de 12ms en dispositivos táctiles si la vibración está activa
        if (settings.vibration_enabled && 'vibrate' in navigator) {
          navigator.vibrate(12);
        }
      } catch (_) {}
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch (_) {}
}

interface NoteDef {
  time: number;
  freq: number;
  duration: number;
  weight: number;
  harmonic?: number;
}

/**
 * Reproduce una nota con ataque percusivo y cuerpo resonante
 */
function scheduleNote(ctx: AudioContext, destination: AudioNode, note: NoteDef, baseTime: number) {
  const noteStart = baseTime + note.time;
  const noteEnd = noteStart + note.duration;

  // 1. Oscilador fundamental (Seno puro)
  const oscMain = ctx.createOscillator();
  oscMain.type = 'sine';
  oscMain.frequency.setValueAtTime(note.freq, noteStart);

  // 2. Oscilador armónico de brillo (Octava superior)
  const oscOctave = ctx.createOscillator();
  oscOctave.type = 'sine';
  oscOctave.frequency.setValueAtTime(note.harmonic || (note.freq * 2), noteStart);

  // 3. Oscilador de cuerpo (Triangular para resonancia acústica que corta ruido de barbería)
  const oscBody = ctx.createOscillator();
  oscBody.type = 'triangle';
  oscBody.frequency.setValueAtTime(note.freq, noteStart);

  // Ganancias
  const mainGain = ctx.createGain();
  mainGain.gain.setValueAtTime(0.001, noteStart);
  mainGain.gain.linearRampToValueAtTime(0.55 * note.weight, noteStart + 0.006);
  mainGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

  const octaveGain = ctx.createGain();
  octaveGain.gain.setValueAtTime(0.001, noteStart);
  octaveGain.gain.linearRampToValueAtTime(0.25 * note.weight, noteStart + 0.006);
  octaveGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd * 0.9);

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.001, noteStart);
  bodyGain.gain.linearRampToValueAtTime(0.18 * note.weight, noteStart + 0.006);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

  oscMain.connect(mainGain);
  oscOctave.connect(octaveGain);
  oscBody.connect(bodyGain);

  mainGain.connect(destination);
  octaveGain.connect(destination);
  bodyGain.connect(destination);

  oscMain.start(noteStart);
  oscMain.stop(noteEnd);

  oscOctave.start(noteStart);
  oscOctave.stop(noteEnd);

  oscBody.start(noteStart);
  oscBody.stop(noteEnd);
}

/**
 * Reproduce la alerta con mayor duración y repetición doble para garantizar
 * que sea 100% percibida en la recepción de la barbería.
 */
export async function playStrongNotificationAlert(options?: {
  style?: SoundStyle;
  volume?: number;
  vibrate?: boolean;
}) {
  const currentSettings = getAudioSettings();
  const chosenStyle = options?.style || currentSettings.notification_sound || getPreferredSoundStyle();
  const shouldVibrate = options?.vibrate !== undefined ? options.vibrate : currentSettings.vibration_enabled;
  const savedVol = typeof currentSettings.notification_volume === 'number' ? currentSettings.notification_volume : 1.0;
  const effectiveVolume = options?.volume !== undefined ? options.volume : savedVol;

  // 1. Vibración sincronizada (si está habilitada en la configuración)
  if (shouldVibrate) {
    triggerHapticAlert();
  }

  if (effectiveVolume <= 0.001) return;

  // 2. Audio Web API
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;

    // Compresor dinámico master para maximizar la sonoridad percibida sin distorsionar
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-8, now);
    compressor.knee.setValueAtTime(6, now);
    compressor.ratio.setValueAtTime(10, now);
    compressor.attack.setValueAtTime(0.002, now);
    compressor.release.setValueAtTime(0.2, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.min(Math.max(effectiveVolume, 0.02), 1.0), now);

    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    let notes: NoteDef[] = [];

    if (chosenStyle === 'doble_campana') {
      // DOBLE CAMPANA DING-DONG (Repetición doble: Ding-Dong ... Ding-Dong)
      // Primer Ding-Dong (t=0.00s a t=0.75s)
      notes.push({ time: 0.00, freq: 880.00, duration: 0.30, weight: 1.0 }); // A5 (Ding)
      notes.push({ time: 0.22, freq: 659.25, duration: 0.55, weight: 1.0 }); // E5 (Dong)

      // Segundo Ding-Dong (t=0.85s a t=1.85s) con resonancia profunda prolongada
      notes.push({ time: 0.85, freq: 880.00, duration: 0.30, weight: 1.05 }); // A5 (Ding)
      notes.push({ time: 1.07, freq: 659.25, duration: 0.80, weight: 1.15, harmonic: 1318.5 }); // E5 (Dong largo)
    } else if (chosenStyle === 'doble_triada') {
      // DOBLE TRÍADA ASCENDENTE (Dos acordes ascendentes seguidos)
      // Ciclo 1 (t=0.00s)
      notes.push({ time: 0.00, freq: 659.25, duration: 0.20, weight: 0.85 }); // E5
      notes.push({ time: 0.12, freq: 830.61, duration: 0.22, weight: 0.95 }); // G#5
      notes.push({ time: 0.24, freq: 987.77, duration: 0.50, weight: 1.05 }); // B5

      // Ciclo 2 (t=0.85s) con mayor resonancia y brillo
      notes.push({ time: 0.85, freq: 659.25, duration: 0.20, weight: 0.90 }); // E5
      notes.push({ time: 0.97, freq: 830.61, duration: 0.22, weight: 1.00 }); // G#5
      notes.push({ time: 1.09, freq: 987.77, duration: 0.75, weight: 1.15, harmonic: 1975.53 }); // B5 + B6
    } else {
      // ALERTA INSISTENTE (3 toques dobles de llamada enérgica)
      notes.push({ time: 0.00, freq: 1046.50, duration: 0.16, weight: 0.9 }); // C6
      notes.push({ time: 0.12, freq: 1318.51, duration: 0.28, weight: 1.0 }); // E6

      notes.push({ time: 0.55, freq: 1046.50, duration: 0.16, weight: 0.95 }); // C6
      notes.push({ time: 0.67, freq: 1318.51, duration: 0.32, weight: 1.05 }); // E6

      notes.push({ time: 1.10, freq: 1046.50, duration: 0.18, weight: 1.0 }); // C6
      notes.push({ time: 1.22, freq: 1567.98, duration: 0.55, weight: 1.15, harmonic: 3135.96 }); // G6 brillante
    }

    notes.forEach((note) => {
      scheduleNote(ctx, compressor, note, now);
    });
  } catch (err) {
    console.warn('[AudioAlert] Error al reproducir alerta doble:', err);
  }
}
